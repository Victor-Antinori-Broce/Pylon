/**
 * Permisos, claves y cuotas de cada agente — lo que usa el panel (fase E)
 * ============================================================================
 *
 * Montado en `/api/v1` (solo admin: `RUTAS_SOLO_ADMIN` cubre `/api/v1`).
 *
 *   GET  /agent-access/catalog                  qué se puede conceder: presets,
 *                                               scopes amplios (y qué abre cada
 *                                               uno), operaciones del SDK por kon
 *                                               y datasets
 *   GET  /agents/:id/access                     lo que ESTE agente puede hacer,
 *                                               fusionado (amplio + fino − denegado)
 *   PUT  /agents/:id/scopes                     reemplaza la lista de scopes
 *   GET  /agents/:id/keys                       claves (sin secreto)
 *   POST /agents/:id/keys                       nueva clave (el secreto, una vez)
 *   POST /agents/:id/keys/:keyId/rotate         nueva clave; la vieja vale hasta
 *                                               que acabe la gracia (sin corte)
 *   POST /agents/:id/keys/:keyId/revoke         deja de valer YA
 *   GET  /agents/:id/quotas                     límites, consumo de hoy y
 *                                               ahorro del formato `auto`
 *   PUT  /agents/:id/quotas                     cambia los límites
 *   GET  /agents/:id/mcp-settings               toolset por defecto y envoltorio
 *                                               del contenido no confiable
 *   PUT  /agents/:id/mcp-settings               los cambia (auditado)
 *   GET  /agents/:id/sponsor                    su firmante humano (fase F) y
 *                                               las cuentas que pueden serlo
 *   PUT  /agents/:id/sponsor                    elige o quita el firmante
 *
 * Son operaciones del SDK de kons (OpenAPI 3.1 con esquemas; fuera de MCP con
 * su motivo) de un «kon» del núcleo, `kon-agentes`, que NO se registra entre
 * las operaciones montadas: así ningún scope fino (`kon:*`, `kon:agentes:*`)
 * abre la puerta de /api/v1 — un agente no puede darse permisos a sí mismo.
 * Además cada operación exige admin (`antes: [exigirAdmin]`).
 *
 * La regla de permisos es la de `@kitsuden/shared` (permisos-de-agente.ts):
 * unión de concesiones, una denegación `!patrón` gana. Ver
 * docs/agents/permissions.md.
 */

import {
  ACCIONES_DE_DATASET,
  defineOperacion,
  PRESETS_DE_AGENTE,
  ROLES_DE_FIRMANTE,
  SCOPES_AMPLIOS_DEL_NUCLEO,
  accesoADataset,
  checkReadAccess,
  checkWriteAccess,
  concedePorScopes,
  costeDeOperacion,
  denegacionDeOperacion,
  esSensible,
  exclusionMcp,
  nombreCortoDeKon,
  nombreDeHerramienta,
  normalizarScopes,
  partirScopes,
  scopeCubre,
  scopeFinoDeOperacion,
  type AccionDeDataset,
  type PolicyJson,
} from "@kitsuden/shared";
import { and, count, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";

import {
  concedeOperacion,
  operacionesMontadas,
  routerDeOperaciones,
  type OperacionCualquiera,
} from "../../../../packages/engine/src/operaciones";
import { db } from "../db";
import {
  agentApiKeys,
  agentAuditLogs,
  agentIdentities,
  agentProposals,
  authUsers,
  dataSets,
} from "../db/schema";
import { usoDeAgente } from "../lib/cuotas-de-agente";
import { ahorroDeAgente } from "../lib/ahorro-de-formato";
import {
  EsquemaDeAjustesMcp,
  leerAjustesMcp,
  MODOS_DE_ENVOLTORIO,
  parsearToolset,
  TOOLSETS_FIJOS,
} from "../lib/ajustes-mcp";
import { informeDeFriccion } from "../lib/friccion-de-agentes";
import { logger } from "../lib/logger";
import { konsMontados } from "../lib/rutas-de-kons";
import { registrarOperacionesDelNucleo } from "../lib/operaciones-del-nucleo";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { exigirAdmin } from "../middleware/auth-guard";
import { logAgentAction } from "../services/agent-audit";
import { firmanteDeAgente, generateAgentApiKey } from "../services/agent-auth";

type Agente = typeof agentIdentities.$inferSelect;

async function agentePorId(id: string): Promise<Agente | null> {
  const [a] = await db.select().from(agentIdentities).where(eq(agentIdentities.id, id)).limit(1);
  return a ?? null;
}

const scopesDe = (a: Agente): string[] =>
  Array.isArray(a.scopes) ? (a.scopes as unknown[]).filter((s): s is string => typeof s === "string") : [];

function quien(c: Context): string | null {
  const u = (c.get as (k: string) => unknown)("user") as { id?: string } | null;
  return u?.id ?? null;
}

/** Deja rastro en la auditoría de agentes (quién cambió qué). */
function auditar(c: Context, agentId: string, que: string, detalles: Record<string, unknown>) {
  logAgentAction({
    agentId,
    action: "config_change",
    resource: que,
    details: { ...detalles, by: quien(c) },
    success: true,
  });
}

// ── Catálogo ────────────────────────────────────────────────────────────────

interface OperacionDelCatalogo {
  konId: string;
  kon: string;
  id: string;
  scope: string;
  method: string;
  path: string;
  summary: string;
  sensitive: boolean;
  cost: number;
  write: boolean;
  public: boolean;
}

function operacionesDelCatalogo(): OperacionDelCatalogo[] {
  const lista: OperacionDelCatalogo[] = [];
  for (const { konId, mountPath, operaciones } of operacionesMontadas()) {
    for (const op of operaciones) {
      lista.push({
        konId,
        kon: nombreCortoDeKon(konId),
        id: op.id,
        scope: scopeFinoDeOperacion(konId, op.id),
        method: op.metodo,
        path: op.ruta === "/" ? mountPath : `${mountPath}${op.ruta}`,
        summary: op.resumen,
        sensitive: esSensible(op),
        cost: costeDeOperacion(op),
        write: op.metodo !== "GET",
        public: !op.permiso && op.acceso !== "sesion",
      });
    }
  }
  return lista;
}

function opDe(konId: string, opId: string) {
  return operacionesMontadas()
    .find((k) => k.konId === konId)
    ?.operaciones.find((o) => o.id === opId);
}

/** Los scopes amplios que el panel ofrece: los del núcleo y `<kon>:*` de cada kon montado. */
function scopesAmplios(): string[] {
  const deKons = konsMontados()
    .map((k) => `${nombreCortoDeKon(k.konId)}:*`)
    .sort();
  return [...new Set([...SCOPES_AMPLIOS_DEL_NUCLEO, ...deKons])];
}

async function catalogo(c: Context): Promise<Response> {
  const ops = operacionesDelCatalogo();
  const datasets = await db
    .select({ slug: dataSets.slug, name: dataSets.name })
    .from(dataSets)
    .orderBy(dataSets.name);

  const broad = scopesAmplios().map((scope) => {
    const abre = ops
      .filter((o) => {
        const op = opDe(o.konId, o.id);
        return op ? concedePorScopes([scope], o.konId, op).concedido : false;
      })
      .map((o) => o.scope);
    const datasetsQueAbre = ACCIONES_DE_DATASET.flatMap((accion) =>
      datasets
        .filter((d) => accesoADataset([scope], d.slug, accion) === "concedido")
        .map((d) => `datasets:${d.slug}:${accion}`)
    );
    return { scope, operations: abre, datasets: datasetsQueAbre };
  });

  const sdk = new Set(operacionesMontadas().map((k) => k.konId));
  return c.json({
    presets: PRESETS_DE_AGENTE,
    broad,
    kons: [...new Set(ops.map((o) => o.konId))].map((konId) => ({
      konId,
      kon: nombreCortoDeKon(konId),
      operations: ops.filter((o) => o.konId === konId),
    })),
    legacyKons: konsMontados()
      .filter((k) => !sdk.has(k.konId))
      .map((k) => ({ konId: k.konId, kon: nombreCortoDeKon(k.konId), mountPath: k.mountPath })),
    datasets,
    datasetActions: ACCIONES_DE_DATASET,
  });
}

// ── Lo que un agente puede hacer ────────────────────────────────────────────

type Estado = "granted" | "denied" | "open" | "policy" | "none";

async function accesoDelAgente(a: Agente) {
  const scopes = scopesDe(a);
  const { concesiones, denegaciones } = partirScopes(scopes);
  const usuario = { id: a.id, role: "agent", scopes };

  const operations = [];
  for (const o of operacionesDelCatalogo()) {
    const op = opDe(o.konId, o.id);
    if (!op) continue;
    const denegada = denegacionDeOperacion(scopes, o.konId, op);
    const porScope = concedePorScopes(scopes, o.konId, op);
    let state: Estado;
    let by: string | null = null;
    if (denegada) {
      state = "denied";
      by = denegada;
    } else if (porScope.concedido) {
      state = "granted";
      by = porScope.por ?? null;
    } else if (!op.permiso) {
      state = "open";
    } else if (op.permiso.politica?.enHandler) {
      state = "policy";
    } else {
      state = (await concedeOperacion(o.konId, op, usuario)) ? "policy" : "none";
    }
    operations.push({ ...o, state, by });
  }

  const filas = await db
    .select({ slug: dataSets.slug, name: dataSets.name, policyJson: dataSets.policyJson })
    .from(dataSets)
    .orderBy(dataSets.name);
  const comoRls = { id: a.id, role: "agent" };
  const datasets = filas.map((d) => {
    const acciones = {} as Record<AccionDeDataset, { state: Estado; by: string | null }>;
    for (const accion of ACCIONES_DE_DATASET) {
      const acceso = accesoADataset(scopes, d.slug, accion);
      const requerido = `datasets:${d.slug}:${accion}`;
      if (acceso === "denegado") {
        acciones[accion] = {
          state: "denied",
          by: `!${denegaciones.find((x) => scopeCubre(x, requerido)) ?? ""}`,
        };
      } else if (acceso === "concedido") {
        acciones[accion] = { state: "granted", by: concesiones.find((x) => scopeCubre(x, requerido)) ?? null };
      } else {
        const politica = (d.policyJson ?? null) as PolicyJson | null;
        const porPolitica =
          accion === "read" ? checkReadAccess(politica, comoRls) : checkWriteAccess(politica, comoRls);
        acciones[accion] = { state: porPolitica ? "policy" : "none", by: null };
      }
    }
    return { slug: d.slug, name: d.name, ...acciones };
  });

  // Los amplios que tiene (para explicarlos) y los que no se reconocen.
  const conocidos = new Set(scopesAmplios());
  const broad = concesiones.filter(
    (s) => !s.startsWith("kon:") || s === "kon:*"
  ).filter((s) => !/^datasets:[^:*]+:/.test(s));
  return {
    agentId: a.id,
    scopes,
    grants: concesiones,
    denies: denegaciones.map((d) => `!${d}`),
    broad: broad.map((s) => ({ scope: s, known: conocidos.has(s) })),
    operations,
    datasets,
  };
}

async function acceso(c: Context): Promise<Response> {
  const a = await agentePorId(c.req.param("id") ?? "");
  if (!a) return c.json({ error: "Agent not found" }, 404);
  return c.json(await accesoDelAgente(a));
}

async function guardarScopes(c: Context): Promise<Response> {
  const a = await agentePorId(c.req.param("id") ?? "");
  if (!a) return c.json({ error: "Agent not found" }, 404);
  const body = (await c.req.json().catch(() => null)) as { scopes?: unknown } | null;
  let scopes: string[];
  try {
    scopes = normalizarScopes(body?.scopes);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 422);
  }
  const antes = scopesDe(a);
  const [actualizado] = await db
    .update(agentIdentities)
    .set({ scopes, updatedAt: new Date() })
    .where(eq(agentIdentities.id, a.id))
    .returning();
  auditar(c, a.id, "scopes", {
    added: scopes.filter((s) => !antes.includes(s)),
    removed: antes.filter((s) => !scopes.includes(s)),
  });
  logger.info({ agentId: a.id }, "[agentes] scopes actualizados");
  return c.json(await accesoDelAgente(actualizado!));
}

// ── Claves ──────────────────────────────────────────────────────────────────

const GRACIA_MAX_HORAS = 24 * 30;

function estadoDeClave(k: typeof agentApiKeys.$inferSelect, ahora = Date.now()) {
  if (k.revokedAt) return "revoked";
  if (k.expiresAt && k.expiresAt.getTime() <= ahora) return "expired";
  if (k.expiresAt && k.expiresAt.getTime() - ahora < 7 * 86_400_000) return "expiring";
  return "active";
}

const vistaDeClave = (k: typeof agentApiKeys.$inferSelect) => ({
  id: k.id,
  name: k.name,
  prefix: k.keyPrefix,
  createdAt: k.createdAt,
  lastUsedAt: k.lastUsedAt,
  expiresAt: k.expiresAt,
  revokedAt: k.revokedAt,
  revokedBy: k.revokedBy,
  rotatedFrom: k.rotatedFrom,
  status: estadoDeClave(k),
  // OAuth para MCP (0055): la fila de una conexión OAuth (no tiene secreto propio)
  kind: k.algorithm === "oauth" ? "oauth" : "static",
});

async function listarClaves(c: Context): Promise<Response> {
  const a = await agentePorId(c.req.param("id") ?? "");
  if (!a) return c.json({ error: "Agent not found" }, 404);
  const claves = await db
    .select()
    .from(agentApiKeys)
    .where(eq(agentApiKeys.agentId, a.id))
    .orderBy(desc(agentApiKeys.createdAt));
  return c.json({ keys: claves.map(vistaDeClave) });
}

const NuevaClave = z
  .object({
    name: z.string().trim().max(100).optional(),
    expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
  })
  .strict();

async function emitirClave(
  a: Agente,
  opciones: { name?: string | null; expiresInDays?: number | null; rotatedFrom?: string | null }
) {
  const { plainKey, keyHash, keyPrefix, keyId, algorithm } = await generateAgentApiKey(a.type ?? undefined);
  const expiresAt = opciones.expiresInDays ? new Date(Date.now() + opciones.expiresInDays * 86_400_000) : null;
  const [fila] = await db
    .insert(agentApiKeys)
    .values({
      agentId: a.id,
      keyId,
      keyHash,
      keyPrefix,
      algorithm,
      expiresAt,
      name: opciones.name || null,
      rotatedFrom: opciones.rotatedFrom ?? null,
    })
    .returning();
  return { fila: fila!, plainKey };
}

async function crearClave(c: Context): Promise<Response> {
  const a = await agentePorId(c.req.param("id") ?? "");
  if (!a) return c.json({ error: "Agent not found" }, 404);
  const r = NuevaClave.safeParse(await c.req.json().catch(() => ({})));
  if (!r.success) return c.json({ error: "Validation failed", issues: r.error.issues }, 422);
  const { fila, plainKey } = await emitirClave(a, r.data);
  auditar(c, a.id, "key_created", { keyId: fila.id, expiresAt: fila.expiresAt });
  // El secreto sale UNA vez, aquí. Nunca se guarda en claro.
  return c.json({ key: vistaDeClave(fila), apiKey: plainKey }, 201);
}

const Rotacion = z
  .object({
    /** Cuánto sigue valiendo la clave vieja. 0 = deja de valer ya. */
    graceHours: z.number().int().min(0).max(GRACIA_MAX_HORAS).default(24),
    expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
    name: z.string().trim().max(100).optional(),
  })
  .strict();

async function claveDelAgente(agentId: string, keyId: string) {
  const [k] = await db
    .select()
    .from(agentApiKeys)
    .where(and(eq(agentApiKeys.id, keyId), eq(agentApiKeys.agentId, agentId)))
    .limit(1);
  return k ?? null;
}

async function rotarClave(c: Context): Promise<Response> {
  const a = await agentePorId(c.req.param("id") ?? "");
  if (!a) return c.json({ error: "Agent not found" }, 404);
  const vieja = await claveDelAgente(a.id, c.req.param("keyId") ?? "");
  if (!vieja) return c.json({ error: "Key not found" }, 404);
  const estado = estadoDeClave(vieja);
  if (estado === "revoked" || estado === "expired") {
    return c.json({ error: `Cannot rotate a ${estado} key: create a new one instead` }, 409);
  }
  // Una conexión OAuth no se rota: sus tokens ya rotan solos. Se revoca y el
  // cliente vuelve a pedir permiso (docs/agents/oauth.md).
  if (vieja.algorithm === "oauth") {
    return c.json({ error: "OAuth connections cannot be rotated: revoke it and reconnect the client" }, 409);
  }
  const r = Rotacion.safeParse(await c.req.json().catch(() => ({})));
  if (!r.success) return c.json({ error: "Validation failed", issues: r.error.issues }, 422);

  // Primero la nueva (si algo falla, la vieja sigue intacta), luego se acorta la vieja.
  const { fila, plainKey } = await emitirClave(a, {
    name: r.data.name ?? vieja.name,
    expiresInDays: r.data.expiresInDays ?? null,
    rotatedFrom: vieja.id,
  });
  const finDeGracia = new Date(Date.now() + r.data.graceHours * 3_600_000);
  const nuevaCaducidad =
    vieja.expiresAt && vieja.expiresAt < finDeGracia ? vieja.expiresAt : finDeGracia;
  const [viejaActualizada] = await db
    .update(agentApiKeys)
    .set({ expiresAt: nuevaCaducidad })
    .where(eq(agentApiKeys.id, vieja.id))
    .returning();
  auditar(c, a.id, "key_rotated", {
    oldKeyId: vieja.id,
    newKeyId: fila.id,
    oldKeyValidUntil: nuevaCaducidad,
  });
  return c.json(
    { key: vistaDeClave(fila), apiKey: plainKey, previous: vistaDeClave(viejaActualizada!) },
    201
  );
}

async function revocarClave(c: Context): Promise<Response> {
  const a = await agentePorId(c.req.param("id") ?? "");
  if (!a) return c.json({ error: "Agent not found" }, 404);
  const k = await claveDelAgente(a.id, c.req.param("keyId") ?? "");
  if (!k) return c.json({ error: "Key not found" }, 404);
  if (k.revokedAt) return c.json({ key: vistaDeClave(k) });
  const [revocada] = await db
    .update(agentApiKeys)
    .set({ revokedAt: new Date(), revokedBy: quien(c) })
    .where(eq(agentApiKeys.id, k.id))
    .returning();
  auditar(c, a.id, "key_revoked", { keyId: k.id });
  return c.json({ key: vistaDeClave(revocada!) });
}

// ── Cuotas ──────────────────────────────────────────────────────────────────

const limitesDe = (a: Agente) => ({
  requestsPerMinute: a.rateLimit ?? null,
  writesPerDay: a.writesPerDay ?? null,
  budgetUnitsPerDay: a.budgetUnitsPerDay ?? null,
});

async function leerCuotas(c: Context): Promise<Response> {
  const a = await agentePorId(c.req.param("id") ?? "");
  if (!a) return c.json({ error: "Agent not found" }, 404);
  return c.json({ limits: limitesDe(a), usage: await usoDeAgente(a.id), formatSavings: await ahorroSinRomper(a.id) });
}

/**
 * Lo que el formato `auto` le ahorró (lib/ahorro-de-formato.ts). Si la tabla
 * aún no existe (migración 0052 sin aplicar), las cuotas se siguen viendo.
 */
async function ahorroSinRomper(agentId: string) {
  try {
    return await ahorroDeAgente(agentId);
  } catch (err) {
    logger.warn({ err, agentId }, "[agentes] no se pudo leer el ahorro de formato");
    return null;
  }
}

const Limite = (max: number) => z.number().int().min(1).max(max).nullable().optional();
const Cuotas = z
  .object({
    // Por minuto siempre hay límite (sin él, un bucle de un agente tumba la API).
    requestsPerMinute: z.number().int().min(1).max(100_000).optional(),
    writesPerDay: Limite(10_000_000),
    budgetUnitsPerDay: Limite(100_000_000),
  })
  .strict();

async function guardarCuotas(c: Context): Promise<Response> {
  const a = await agentePorId(c.req.param("id") ?? "");
  if (!a) return c.json({ error: "Agent not found" }, 404);
  const r = Cuotas.safeParse(await c.req.json().catch(() => ({})));
  if (!r.success) return c.json({ error: "Validation failed", issues: r.error.issues }, 422);
  const cambios: Partial<typeof agentIdentities.$inferInsert> = { updatedAt: new Date() };
  if (r.data.requestsPerMinute !== undefined) cambios.rateLimit = r.data.requestsPerMinute;
  if (r.data.writesPerDay !== undefined) cambios.writesPerDay = r.data.writesPerDay;
  if (r.data.budgetUnitsPerDay !== undefined) cambios.budgetUnitsPerDay = r.data.budgetUnitsPerDay;
  const [actualizado] = await db
    .update(agentIdentities)
    .set(cambios)
    .where(eq(agentIdentities.id, a.id))
    .returning();
  auditar(c, a.id, "quotas", { before: limitesDe(a), after: limitesDe(actualizado!) });
  return c.json({
    limits: limitesDe(actualizado!),
    usage: await usoDeAgente(a.id),
    formatSavings: await ahorroSinRomper(a.id),
  });
}

// ── Ajustes MCP (toolset y envoltorio) ─────────────────────────────────────

/** Lo que el panel enseña: lo fijado y qué se puede elegir. */
function vistaDeAjustesMcp(a: Agente) {
  const ajustes = leerAjustesMcp(a.mcpSettings);
  return {
    settings: { toolset: ajustes.toolset ?? null, untrustedWrap: ajustes.untrustedWrap ?? "none" },
    options: {
      toolsets: [...TOOLSETS_FIJOS],
      // Los kons con operaciones del SDK: son los que tienen herramientas
      kons: [...new Set(operacionesMontadas().map((o) => `kon:${o.konId.replace(/^kon-/, "")}`))].sort(),
      untrustedWrap: [...MODOS_DE_ENVOLTORIO],
    },
  };
}

async function leerAjustesMcpDeAgente(c: Context): Promise<Response> {
  const a = await agentePorId(c.req.param("id") ?? "");
  if (!a) return c.json({ error: "Agent not found" }, 404);
  return c.json(vistaDeAjustesMcp(a));
}

async function guardarAjustesMcpDeAgente(c: Context): Promise<Response> {
  const a = await agentePorId(c.req.param("id") ?? "");
  if (!a) return c.json({ error: "Agent not found" }, 404);
  const r = EsquemaDeAjustesMcp.safeParse(await c.req.json().catch(() => ({})));
  if (!r.success) return c.json({ error: "Validation failed", issues: r.error.issues }, 422);
  const actual = leerAjustesMcp(a.mcpSettings);
  const nuevo: Record<string, unknown> = { ...actual };
  if (r.data.toolset !== undefined) {
    const texto = (r.data.toolset ?? "").trim();
    const t = parsearToolset(texto);
    if (!t.ok) return c.json({ error: "Validation failed", message: t.error }, 422);
    if (texto === "" || texto === "all") delete nuevo.toolset;
    else nuevo.toolset = texto;
  }
  if (r.data.untrustedWrap !== undefined) {
    if (r.data.untrustedWrap === "none") delete nuevo.untrustedWrap;
    else nuevo.untrustedWrap = r.data.untrustedWrap;
  }
  const [actualizado] = await db
    .update(agentIdentities)
    .set({ mcpSettings: nuevo, updatedAt: new Date() })
    .where(eq(agentIdentities.id, a.id))
    .returning();
  auditar(c, a.id, "mcp_settings", { before: actual, after: nuevo });
  return c.json(vistaDeAjustesMcp(actualizado!));
}


// ── Firmante humano (fase F, decisión del propietario) ─────────────────────

/** Lo que el panel enseña del firmante de un agente y a quién puede elegir. */
async function vistaDeFirmante(a: Agente) {
  const firmante = await firmanteDeAgente(a.sponsorUserId);
  const candidatos = await db
    .select({ id: authUsers.id, name: authUsers.name, email: authUsers.email, role: authUsers.role })
    .from(authUsers)
    .where(inArray(authUsers.role, [...ROLES_DE_FIRMANTE]))
    .orderBy(authUsers.name)
    .limit(500);
  const cuenta = firmante
    ? (
        await db
          .select({ id: authUsers.id, name: authUsers.name, email: authUsers.email, role: authUsers.role })
          .from(authUsers)
          .where(eq(authUsers.id, firmante.userId))
          .limit(1)
      )[0]
    : undefined;
  return {
    sponsor: firmante
      ? {
          userId: firmante.userId,
          valid: firmante.valido,
          reason: firmante.motivo ?? null,
          name: cuenta?.name ?? null,
          email: cuenta?.email ?? null,
          role: cuenta?.role ?? null,
        }
      : null,
    candidates: candidatos,
  };
}

async function leerFirmante(c: Context): Promise<Response> {
  const a = await agentePorId(c.req.param("id") ?? "");
  if (!a) return c.json({ error: "Agent not found" }, 404);
  return c.json(await vistaDeFirmante(a));
}

const Firmante = z.object({ userId: z.string().min(1).max(200).nullable() }).strict();

async function guardarFirmante(c: Context): Promise<Response> {
  const a = await agentePorId(c.req.param("id") ?? "");
  if (!a) return c.json({ error: "Agent not found" }, 404);
  const r = Firmante.safeParse(await c.req.json().catch(() => ({})));
  if (!r.success) return c.json({ error: "Validation failed", issues: r.error.issues }, 422);
  const userId = r.data.userId;
  if (userId) {
    const f = await firmanteDeAgente(userId);
    if (!f?.valido) {
      return c.json(
        {
          error: "Validation failed",
          message: "The signer must be an existing admin or editor account.",
          reason: f?.motivo ?? null,
        },
        422
      );
    }
  }
  const [actualizado] = await db
    .update(agentIdentities)
    .set({ sponsorUserId: userId, updatedAt: new Date() })
    .where(eq(agentIdentities.id, a.id))
    .returning();
  auditar(c, a.id, "sponsor", { before: a.sponsorUserId ?? null, after: userId });
  return c.json(await vistaDeFirmante(actualizado!));
}

// ── Fricción: dónde se atascan los agentes con las herramientas MCP ─────────

/** Llamadas como mucho que lee el informe (las más recientes). */
const MAXIMO_DE_LLAMADAS_EN_INFORME = 50_000;

/**
 * Fallos por código, claves inventadas y propuestas rechazadas por
 * herramienta, con qué cambiar en la guía de cada operación (ver
 * lib/friccion-de-agentes.ts). Lee `tool_call` de `agent_audit_logs` (las de
 * MCP, `details.origen = 'mcp'`) y las propuestas rechazadas.
 */
async function friccion(dias: number, agentId: string | undefined) {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const filas = await db
    .select({
      herramienta: agentAuditLogs.resource,
      agentId: agentAuditLogs.agentId,
      exito: agentAuditLogs.success,
      details: agentAuditLogs.details,
    })
    .from(agentAuditLogs)
    .where(
      and(
        eq(agentAuditLogs.action, "tool_call"),
        gte(agentAuditLogs.createdAt, desde),
        sql`${agentAuditLogs.details}->>'origen' = 'mcp'`,
        agentId ? eq(agentAuditLogs.agentId, agentId) : undefined
      )
    )
    .orderBy(desc(agentAuditLogs.createdAt))
    .limit(MAXIMO_DE_LLAMADAS_EN_INFORME);

  const rechazos = await db
    .select({ herramienta: agentProposals.tool, n: count() })
    .from(agentProposals)
    .where(
      and(
        eq(agentProposals.status, "rejected"),
        isNotNull(agentProposals.tool),
        gte(agentProposals.createdAt, desde),
        agentId ? eq(agentProposals.agentId, agentId) : undefined
      )
    )
    .groupBy(agentProposals.tool);

  return {
    dias,
    agentId: agentId ?? null,
    llamadas: filas.length,
    truncado: filas.length === MAXIMO_DE_LLAMADAS_EN_INFORME,
    herramientas: informeDeFriccion(
      filas.map((f) => ({ ...f, herramienta: f.herramienta ?? "(sin nombre)" })),
      new Map(rechazos.map((r) => [r.herramienta!, Number(r.n)])),
      { conGuia: herramientasConGuia() }
    ),
  };
}

/** Las herramientas MCP de las operaciones montadas que declaran `guia`. */
function herramientasConGuia(): Set<string> {
  const nombres = new Set<string>();
  for (const { konId, operaciones } of operacionesMontadas()) {
    for (const op of operaciones) {
      if (op.guia && exclusionMcp(op) === null) nombres.add(nombreDeHerramienta(konId, op));
    }
  }
  return nombres;
}

// ── Las operaciones (SDK de kons) ───────────────────────────────────────────

const ParamAgente = z.object({ id: z.string().min(1) });
const ParamClave = z.object({ id: z.string().min(1), keyId: z.string().min(1) });
const Objeto = z.record(z.string(), z.unknown());
const SIN_MCP = {
  excluir:
    "Admin configuration of agents (permissions, keys, quotas): kept out of MCP so no agent can change agent permissions; use the admin panel or REST with an admin session.",
};
const SOLO_ADMIN: MiddlewareHandler[] = [exigirAdmin as unknown as MiddlewareHandler];
const PERMISO = { roles: ["admin"] };

const comun = {
  acceso: "sesion" as const,
  permiso: PERMISO,
  antes: SOLO_ADMIN,
  mcp: SIN_MCP,
  etiquetas: ["agents"],
};

export const operacionesDeAgentes: OperacionCualquiera[] = [
  defineOperacion({
    ...comun,
    id: "catalogo-de-permisos",
    metodo: "GET",
    ruta: "/agent-access/catalog",
    resumen: "What can be granted to an agent",
    descripcion:
      "Presets, broad scopes (with the SDK operations and dataset permissions each one opens), SDK operations by kon, legacy kons and datasets.",
    salida: { esquema: Objeto },
    manejar: (_e, { c }) => catalogo(c),
  }),
  defineOperacion({
    ...comun,
    id: "friccion-de-agentes",
    metodo: "GET",
    ruta: "/agent-friction",
    resumen: "Where agents get stuck with the MCP tools",
    descripcion:
      "Per tool, over the last `days` (1-90, default 7): calls, failures by error code, keys agents invent, rejected proposals, and what to change in the operation's `guia`. Reads the audited MCP tool calls; argument values are never stored, only their names.",
    entrada: {
      query: z.object({
        days: z.coerce.number().int().min(1).max(90).default(7),
        agentId: z.string().min(1).optional(),
      }),
    },
    salida: { esquema: Objeto },
    manejar: (e) => friccion(e.query.days, e.query.agentId),
  }),
  defineOperacion({
    ...comun,
    id: "acceso-de-agente",
    metodo: "GET",
    ruta: "/agents/:id/access",
    resumen: "What an agent can do",
    descripcion:
      "The merged view (broad ∪ fine-grained − denied) of the agent's saved scopes: every SDK operation and every dataset action with its state and the scope that decided it.",
    entrada: { params: ParamAgente },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: (_e, { c }) => acceso(c),
  }),
  defineOperacion({
    ...comun,
    id: "guardar-scopes",
    metodo: "PUT",
    ruta: "/agents/:id/scopes",
    resumen: "Replace an agent's scopes",
    descripcion:
      "Replaces the whole scope list (broad, fine-grained, wildcards and !denies). Invalid scopes are rejected with the reason. Returns the merged view.",
    entrada: { params: ParamAgente, cuerpo: z.object({ scopes: z.array(z.string()) }), validaElHandler: true },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: (_e, { c }) => guardarScopes(c),
  }),
  defineOperacion({
    ...comun,
    id: "listar-claves",
    metodo: "GET",
    ruta: "/agents/:id/keys",
    resumen: "List an agent's API keys",
    descripcion: "Keys without secrets: name, prefix, status, created, last used, expiry, revocation and rotation origin.",
    entrada: { params: ParamAgente },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: (_e, { c }) => listarClaves(c),
  }),
  defineOperacion({
    ...comun,
    id: "crear-clave",
    metodo: "POST",
    ruta: "/agents/:id/keys",
    resumen: "Create an API key",
    descripcion: "Creates a key with an optional name and expiry. The secret is returned once.",
    entrada: { params: ParamAgente, cuerpo: NuevaClave, validaElHandler: true },
    salida: { estado: 201, esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: (_e, { c }) => crearClave(c),
  }),
  defineOperacion({
    ...comun,
    id: "rotar-clave",
    metodo: "POST",
    ruta: "/agents/:id/keys/:keyId/rotate",
    resumen: "Rotate an API key without downtime",
    descripcion:
      "Creates a new key and shortens the old one to now + graceHours, so both work during the grace period. The new secret is returned once.",
    entrada: { params: ParamClave, cuerpo: Rotacion, validaElHandler: true },
    salida: { estado: 201, esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_CONFLICT"],
    manejar: (_e, { c }) => rotarClave(c),
  }),
  defineOperacion({
    ...comun,
    id: "revocar-clave",
    metodo: "POST",
    ruta: "/agents/:id/keys/:keyId/revoke",
    resumen: "Revoke an API key",
    descripcion: "The key stops working on its next request. The record stays for auditing.",
    idempotente: true,
    entrada: { params: ParamClave },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: (_e, { c }) => revocarClave(c),
  }),
  defineOperacion({
    ...comun,
    id: "leer-cuotas",
    metodo: "GET",
    ruta: "/agents/:id/quotas",
    resumen: "An agent's quotas and today's usage",
    descripcion:
      "Requests per minute, writes and budget units per day (UTC), what was spent today, and formatSavings: bytes and estimated tokens the 'auto' format saved against compact JSON (per day, no personal data).",
    entrada: { params: ParamAgente },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: (_e, { c }) => leerCuotas(c),
  }),
  defineOperacion({
    ...comun,
    id: "guardar-cuotas",
    metodo: "PUT",
    ruta: "/agents/:id/quotas",
    resumen: "Change an agent's quotas",
    descripcion: "requestsPerMinute (≥ 1), writesPerDay and budgetUnitsPerDay (null = no daily limit).",
    entrada: { params: ParamAgente, cuerpo: Cuotas, validaElHandler: true },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: (_e, { c }) => guardarCuotas(c),
  }),
  defineOperacion({
    ...comun,
    id: "leer-ajustes-mcp",
    metodo: "GET",
    ruta: "/agents/:id/mcp-settings",
    resumen: "An agent's MCP settings",
    descripcion:
      "Default toolset for its MCP sessions (narrows tools/list; never grants anything) and how text written by others is wrapped in results (none | delimiters | object).",
    entrada: { params: ParamAgente },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: (_e, { c }) => leerAjustesMcpDeAgente(c),
  }),
  defineOperacion({
    ...comun,
    id: "guardar-ajustes-mcp",
    metodo: "PUT",
    ruta: "/agents/:id/mcp-settings",
    resumen: "Change an agent's MCP settings",
    descripcion:
      "{ toolset } (comma-separated: all, read, data, core, actions, kons, kon:<id>; null or 'all' = no restriction) and { untrustedWrap } (none | delimiters | object). Audited; takes effect on the agent's next MCP message.",
    entrada: { params: ParamAgente, cuerpo: EsquemaDeAjustesMcp, validaElHandler: true },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: (_e, { c }) => guardarAjustesMcpDeAgente(c),
  }),
  defineOperacion({
    ...comun,
    id: "leer-firmante",
    metodo: "GET",
    ruta: "/agents/:id/sponsor",
    resumen: "An agent's human signer",
    descripcion:
      "The admin or editor account that signs what the agent creates (blog post author, dataset entry owner), whether it is still valid, and the accounts that can be chosen.",
    entrada: { params: ParamAgente },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: (_e, { c }) => leerFirmante(c),
  }),
  defineOperacion({
    ...comun,
    id: "guardar-firmante",
    metodo: "PUT",
    ruta: "/agents/:id/sponsor",
    resumen: "Set or remove an agent's human signer",
    descripcion:
      "{ userId } sets the signer (an existing admin or editor); { userId: null } removes it (the agent goes back to the behaviour without a signer). Audited.",
    entrada: { params: ParamAgente, cuerpo: Firmante, validaElHandler: true },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: (_e, { c }) => guardarFirmante(c),
  }),
];

/**
 * Como un kon del SDK para el inventario (OpenAPI, cobertura), pero el núcleo
 * lo monta él mismo en /api/v1 y NO lo registra entre las operaciones
 * montadas (ver la cabecera).
 */
export const konDeAgentes = {
  id: "kon-agentes",
  name: "Agent access",
  version: "1.0.0",
  mountPath: "/api/v1",
  operaciones: operacionesDeAgentes,
};

registrarOperacionesDelNucleo({
  konId: "kon-agentes",
  mountPath: "/api/v1",
  descripcion: "Agent permissions, keys and quotas (admin only).",
  operaciones: operacionesDeAgentes,
});

export const permisosDeAgentesRoutes = routerDeOperaciones("kon-agentes", operacionesDeAgentes, {
  auth: { requireAuth, optionalAuth },
} as never);
