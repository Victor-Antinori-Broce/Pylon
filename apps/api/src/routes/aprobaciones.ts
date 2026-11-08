/**
 * Aprobación humana (fase F) — las rutas del panel y la del agente
 * ============================================================================
 *
 * `/api/approvals` — SOLO HUMANOS del equipo (admin o editor). Un agente no
 * entra NUNCA, ni con `admin`: no puede aprobar sus propuestas ni tocar la
 * configuración (`soloHumanos`, además de la puerta de `RUTAS_SOLO_ADMIN`).
 *
 *   GET  /proposals                 bandeja (filtros: status, agentId)
 *   GET  /proposals/count           pendientes (el contador del panel)
 *   GET  /proposals/:id             detalle con el diff y si TÚ puedes decidir
 *   POST /proposals/:id/approve     aprueba y ejecuta (una vez); comentario
 *   POST /proposals/:id/reject      rechaza (no se ejecuta nunca); comentario
 *   GET  /proposals/:id/files/:fileId  la imagen retenida de una subida (la
 *                                   miniatura del panel; privada, sin caché)
 *   GET  /settings                  configuración + catálogo de operaciones
 *   PUT  /settings                  SOLO ADMIN: interruptor, vida, operaciones,
 *                                   reglas legadas
 *   PUT  /agents/:id/mode           SOLO ADMIN: inherit / propose / direct
 *   GET  /audit                     quién encendió qué, propuso, aprobó…
 *
 * `/api/proposals` — el AGENTE consulta lo suyo (las de otro agente: 404);
 * el equipo, cualquiera.
 *
 *   GET  /                          sus propuestas
 *   GET  /:id                       estado y, si se ejecutó, el resultado
 *
 * Son operaciones del SDK (OpenAPI con esquemas; fuera de MCP con su motivo)
 * de un «kon» del núcleo, `kon-aprobaciones`, que NO se registra entre las
 * operaciones montadas: ningún scope fino (`kon:*`) abre estas rutas. El
 * agente consulta sus propuestas por MCP con la herramienta
 * `kitsuden_proposal_status` (routes/mcp.ts).
 */

import {
  ESTADOS_DE_PROPUESTA,
  MODOS_DE_APROBACION,
  RETENCIONES_DE_PROPUESTA,
  claveDeHerramientaMcp,
  defineOperacion,
  esSoloLectura,
  herramientaMcpSensiblePorDefecto,
  nombreCortoDeKon,
} from "@kitsuden/shared";
import { listMCPTools } from "@kitsuden/engine";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";

import {
  operacionesMontadas,
  routerDeOperaciones,
  type OperacionCualquiera,
} from "../../../../packages/engine/src/operaciones";
import { db } from "../db";
import { agentAuditLogs, agentIdentities } from "../db/schema";
import {
  aprobarPropuesta,
  caducarPropuestas,
  contarPendientes,
  ficheroDePropuesta,
  ficherosDePropuesta,
  guardarConfigDeAprobaciones,
  guardarModoDeAgente,
  humanoFresco,
  instantaneaDeAprobaciones,
  listarPropuestas,
  motivoParaNoAprobar,
  nombresDeUsuarios,
  propuestaPorId,
  rechazarPropuesta,
  sensibilidadDeOperacion,
  vistaParaAgente,
  type Humano,
  type Propuesta,
} from "../lib/aprobaciones";
import { canalDePropuesta, type VistaDePropuesta } from "../lib/avisos-de-propuestas";
import { registrarOperacionesDelNucleo } from "../lib/operaciones-del-nucleo";
import { subscribe } from "../lib/valkey";
import { detectarTipoReal } from "../../../../packages/core/media/tipo-real";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { exigirAdmin, exigirStaff } from "../middleware/auth-guard";
import { herramientaQueEscribe, listHardcodedMCPTools } from "../services/mcp-tools";

// ── Quién ───────────────────────────────────────────────────────────────────

function get(c: Context, k: string): unknown {
  return (c.get as (k: string) => unknown)(k);
}

/**
 * Un agente NUNCA decide ni configura aprobaciones, traiga los scopes que
 * traiga (`admin` incluido). Tampoco las claves heredadas `kitsuden_sk_*`
 * (un «admin» sintético, ya retiradas).
 */
export const soloHumanos: MiddlewareHandler = async (c, next) => {
  const usuario = get(c, "user") as { id?: string; role?: string } | null;
  if (get(c, "agent") || usuario?.role === "agent" || usuario?.id?.startsWith("machine-")) {
    return c.json(
      { error: "Forbidden", message: "Agents cannot decide proposals or change approval settings" },
      403
    );
  }
  await next();
};

/** El agente (lo suyo) o el equipo (todo). */
const agenteOEquipo: MiddlewareHandler = async (c, next) => {
  if (get(c, "agent")) return next();
  return (exigirStaff as unknown as MiddlewareHandler)(c, next);
};

/** El humano de la petición, con el rol de AHORA (no el de la cookie). */
async function humanoDe(c: Context): Promise<Humano | null> {
  const u = get(c, "user") as { id?: string } | null;
  return u?.id ? humanoFresco(u.id) : null;
}

// ── Vistas ──────────────────────────────────────────────────────────────────

/**
 * Lo que sustituye al cuerpo, al diff y al resultado para quien NO podría
 * aprobar la propuesta (F79): un editor ve que hay una petición a una ruta de
 * admin (método, camino, agente, estado), no lo que lleva.
 */
export const CUERPO_RESERVADO = { redacted: true, reason: "viewer_cannot_approve" } as const;

/** ¿Puede este humano ver el contenido? Solo quien podría aprobarla (en cualquier estado). */
async function puedeVerContenido(humano: Humano | null | undefined, p: Propuesta): Promise<boolean> {
  if (!humano) return false;
  return (await motivoParaNoAprobar(humano, p)) === null;
}

async function vistaParaEquipo(p: Propuesta & { agentName?: string | null }, humano?: Humano | null) {
  const nombres = await nombresDeUsuarios([p.decidedBy, p.sponsorUserId]);
  // Tras decidir, la fila llega del UPDATE sin el nombre del agente: se busca.
  if (p.agentName === undefined) {
    const [a] = await db
      .select({ name: agentIdentities.name })
      .from(agentIdentities)
      .where(eq(agentIdentities.id, p.agentId))
      .limit(1);
    p = { ...p, agentName: a?.name ?? null };
  }
  const verContenido = await puedeVerContenido(humano, p);
  const motivo = humano && p.status === "pending" ? await motivoParaNoAprobar(humano, p) : null;
  return {
    ...vistaParaAgente(p),
    agentId: p.agentId,
    agentName: p.agentName ?? null,
    keyId: p.keyId,
    body: verContenido ? p.body : p.body === null ? null : CUERPO_RESERVADO,
    bodyRedacted: !verContenido && p.body !== null,
    contentType: p.contentType,
    idempotencyKey: p.idempotencyKey,
    scopes: p.scopes,
    diff: verContenido ? p.diff : p.diff === null ? null : CUERPO_RESERVADO,
    injectionCheck: p.injectionCheck ?? null,
    konId: p.konId,
    operationId: p.operationId,
    decidedBy: p.decidedBy,
    decidedByName: p.decidedBy ? (nombres[p.decidedBy] ?? p.decidedBy) : null,
    // Fase F: el firmante humano del agente (al proponer y, ya ejecutada, el usado).
    sponsorUserId: p.sponsorUserId ?? null,
    sponsorName: p.sponsorUserId ? (nombres[p.sponsorUserId] ?? p.sponsorUserId) : null,
    // Las imágenes retenidas de una subida (vacío si no es una, o si ya se borraron).
    files: await ficherosDePropuesta(p.id),
    result:
      p.status === "executed" || p.status === "failed"
        ? {
            status: p.resultStatus,
            contentType: p.resultContentType,
            body: verContenido || p.resultBody === null ? p.resultBody : CUERPO_RESERVADO,
            error: p.resultError,
          }
        : null,
    ...(humano
      ? {
          canDecide: p.status === "pending" ? motivo === null : false,
          cannotDecideReason: p.status === "pending" ? motivo : null,
        }
      : {}),
  };
}

// ── Bandeja ─────────────────────────────────────────────────────────────────

const FiltroDeBandeja = z
  .object({
    status: z.enum(ESTADOS_DE_PROPUESTA as [string, ...string[]]).optional(),
    agentId: z.string().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

async function bandeja(c: Context, filtro: z.infer<typeof FiltroDeBandeja>) {
  await caducarPropuestas();
  const { proposals, total } = await listarPropuestas(filtro);
  const nombres = await nombresDeUsuarios(proposals.map((p) => p.decidedBy));
  const humano = await humanoDe(c);
  const vistas = [];
  for (const p of proposals) {
    const vista = vistaParaAgente(p);
    // El resultado de una ruta que este humano no podría aprobar, tampoco (F79).
    if ("result" in vista && vista.result && vista.result.body !== null && !(await puedeVerContenido(humano, p))) {
      vista.result = { ...vista.result, body: CUERPO_RESERVADO as never };
    }
    vistas.push({
      ...vista,
      agentId: p.agentId,
      agentName: p.agentName,
      decidedBy: p.decidedBy,
      decidedByName: p.decidedBy ? (nombres[p.decidedBy] ?? p.decidedBy) : null,
    });
  }
  return c.json({ total, proposals: vistas });
}

async function detalle(c: Context, id: string) {
  await caducarPropuestas();
  const p = await propuestaPorId(id);
  if (!p) return c.json({ error: "Proposal not found" }, 404);
  const [a] = await db
    .select({ name: agentIdentities.name })
    .from(agentIdentities)
    .where(eq(agentIdentities.id, p.agentId))
    .limit(1);
  return c.json(await vistaParaEquipo({ ...p, agentName: a?.name ?? null }, await humanoDe(c)));
}

const Decision = z.object({ comment: z.string().max(2000).optional() }).strict();

async function decidir(c: Context, id: string, comentario: string | undefined, aprobar: boolean) {
  const humano = await humanoDe(c);
  if (!humano) return c.json({ error: "Unauthorized" }, 401);
  const r = aprobar
    ? await aprobarPropuesta(id, humano, comentario)
    : await rechazarPropuesta(id, humano, comentario);
  if (!r.ok) {
    return c.json(
      {
        error: r.estado === 404 ? "Not found" : r.estado === 403 ? "Forbidden" : "Conflict",
        message: r.motivo,
        ...(r.propuesta ? { proposal: await vistaParaEquipo(r.propuesta, humano) } : {}),
      },
      r.estado
    );
  }
  return c.json({ proposal: await vistaParaEquipo(r.propuesta, humano) });
}

/**
 * La imagen retenida de una subida, para la miniatura del panel. Solo personal
 * humano (las puertas de la operación). Se sirve con su tipo REAL, revisado
 * otra vez contra los bytes, sin caché compartida y sin que el navegador
 * pueda tratarla como otra cosa (`nosniff`, CSP vacía, `inline`).
 */
async function ficheroRetenido(c: Context, id: string, fileId: string) {
  const f = await ficheroDePropuesta(id, fileId);
  if (!f) return c.json({ error: "File not found" }, 404);
  const bytes = new Uint8Array(f.content);
  const real = detectarTipoReal(bytes);
  if (!real || real.mime !== f.mimeType || !real.mime.startsWith("image/")) {
    return c.json({ error: "File not found" }, 404);
  }
  const nombre = f.filename.replace(/[^\w.-]+/g, "_").slice(0, 120) || `imagen.${real.extension}`;
  return c.body(bytes, 200, {
    "Content-Type": real.mime,
    "Content-Length": String(bytes.byteLength),
    "Content-Disposition": `inline; filename="${nombre}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "same-site",
  });
}

// ── Configuración ───────────────────────────────────────────────────────────

async function configuracion(c: Context) {
  const i = await instantaneaDeAprobaciones();
  const operaciones = [];
  for (const { konId, mountPath, operaciones: ops } of operacionesMontadas()) {
    for (const op of ops) {
      const s = sensibilidadDeOperacion(i.config, konId, op);
      operaciones.push({
        key: s.clave,
        konId,
        kon: nombreCortoDeKon(konId),
        id: op.id,
        method: op.metodo,
        path: op.ruta === "/" ? mountPath : `${mountPath}${op.ruta}`,
        summary: op.resumen,
        default: s.porDefecto,
        override: s.cambiada ? i.config.operations[s.clave] : null,
        sensitive: s.sensible,
        readOnly: esSoloLectura(op),
      });
    }
  }
  const dinamicas = new Set(listMCPTools().map((t) => t.name));
  const herramientas = [
    ...listHardcodedMCPTools().map((t) => t.function.name),
    ...dinamicas,
  ].map((nombre) => {
    const key = claveDeHerramientaMcp(nombre);
    const cambiada = Object.prototype.hasOwnProperty.call(i.config.operations, key);
    const porDefecto = herramientaMcpSensiblePorDefecto(nombre);
    return {
      key,
      name: nombre,
      write: dinamicas.has(nombre) || herramientaQueEscribe(nombre),
      default: porDefecto,
      override: cambiada ? i.config.operations[key] : null,
      sensitive: cambiada ? i.config.operations[key] : porDefecto,
    };
  });
  const agentes = await db
    .select({ id: agentIdentities.id, name: agentIdentities.name, mode: agentIdentities.approvalMode, isActive: agentIdentities.isActive })
    .from(agentIdentities)
    .orderBy(agentIdentities.name);
  const nombres = await nombresDeUsuarios([i.actualizadaPor]);
  return c.json({
    config: i.config,
    updatedBy: i.actualizadaPor,
    updatedByName: i.actualizadaPor ? (nombres[i.actualizadaPor] ?? i.actualizadaPor) : null,
    updatedAt: i.actualizadaEn,
    modes: MODOS_DE_APROBACION,
    retentions: RETENCIONES_DE_PROPUESTA,
    operations: operaciones,
    mcpTools: herramientas,
    agents: agentes,
  });
}

const CambioDeConfig = z
  .object({
    enabled: z.boolean().optional(),
    proposeRetention: z.enum(RETENCIONES_DE_PROPUESTA as [string, ...string[]]).optional(),
    ttlHours: z.number().int().optional(),
    operations: z.record(z.string(), z.union([z.boolean(), z.null()])).optional(),
    legacyRules: z.array(z.object({ method: z.string(), path: z.string() }).strict()).optional(),
  })
  .strict();

async function guardarConfig(c: Context, cambio: z.infer<typeof CambioDeConfig>) {
  const humano = await humanoDe(c);
  if (!humano) return c.json({ error: "Unauthorized" }, 401);
  try {
    await guardarConfigDeAprobaciones(cambio, humano.id);
  } catch (err) {
    return c.json({ error: "Validation failed", message: (err as Error).message }, 422);
  }
  return configuracion(c);
}

async function guardarModo(c: Context, agentId: string, modo: string) {
  const humano = await humanoDe(c);
  if (!humano) return c.json({ error: "Unauthorized" }, 401);
  const r = await guardarModoDeAgente(agentId, modo as never, humano.id);
  if (!r) return c.json({ error: "Agent not found" }, 404);
  return c.json({ agentId, mode: r.despues, previous: r.antes });
}

// ── Auditoría ───────────────────────────────────────────────────────────────

const ACCIONES_DE_AUDITORIA = [
  "approval_settings_changed",
  "approval_mode_changed",
  "proposal_created",
  "proposal_approved",
  "proposal_rejected",
  "proposal_executed",
  "proposal_failed",
  "proposal_expired",
  // Fase I: la promoción de código (lib/promocion.ts) también se audita aquí.
  "promotion_submitted",
  "promotion_activated",
  "promotion_activation_blocked",
  "promotion_activation_failed",
  "promotion_rejected",
  "promotion_rolled_back",
  "promotion_manual_edit",
  "promotion_watch_passed",
  "promotion_settings_changed",
  "promotion_mode_changed",
];

const FiltroDeAuditoria = z
  .object({
    agentId: z.string().min(1).max(100).optional(),
    proposalId: z.guid().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

async function auditoria(c: Context, f: z.infer<typeof FiltroDeAuditoria>) {
  const condiciones = [inArray(agentAuditLogs.action, ACCIONES_DE_AUDITORIA)];
  if (f.agentId) condiciones.push(eq(agentAuditLogs.agentId, f.agentId));
  if (f.proposalId) condiciones.push(eq(agentAuditLogs.resourceId, f.proposalId));
  const donde = and(...condiciones);
  const filas = await db
    .select({ log: agentAuditLogs, agentName: agentIdentities.name })
    .from(agentAuditLogs)
    .leftJoin(agentIdentities, eq(agentAuditLogs.agentId, agentIdentities.id))
    .where(donde)
    .orderBy(desc(agentAuditLogs.createdAt))
    .limit(f.limit ?? 100)
    .offset(f.offset ?? 0);
  const [total] = await db.select({ n: sql<number>`count(*)::int` }).from(agentAuditLogs).where(donde);
  const por = (d: unknown) => ((d as { by?: unknown } | null)?.by as string | undefined) ?? null;
  const nombres = await nombresDeUsuarios(filas.map((r) => por(r.log.details)));
  return c.json({
    total: total?.n ?? 0,
    events: filas.map(({ log, agentName }) => ({
      id: log.id,
      at: log.createdAt,
      action: log.action,
      agentId: log.agentId,
      agentName,
      proposalId: log.resourceId,
      resource: log.resource,
      by: por(log.details),
      byName: por(log.details) ? (nombres[por(log.details)!] ?? por(log.details)) : null,
      success: log.success,
      details: log.details,
    })),
  });
}

// ── Lo del agente ───────────────────────────────────────────────────────────

const FiltroDelAgente = z
  .object({
    status: z.enum(ESTADOS_DE_PROPUESTA as [string, ...string[]]).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

async function propiasDelAgente(c: Context, f: z.infer<typeof FiltroDelAgente>) {
  const agente = get(c, "agent") as { agentId: string } | undefined;
  await caducarPropuestas();
  const { proposals, total } = await listarPropuestas({ ...f, agentId: agente?.agentId ?? null });
  return c.json({ total, proposals: proposals.map((p) => vistaParaAgente(p)) });
}

async function estadoParaAgente(c: Context, id: string) {
  const agente = get(c, "agent") as { agentId: string } | undefined;
  await caducarPropuestas();
  const p = await propuestaPorId(id);
  // La de otro agente no existe para este (404, no 403: no se confirma nada).
  if (!p || (agente && p.agentId !== agente.agentId)) return c.json({ error: "Proposal not found" }, 404);
  return c.json(vistaParaAgente(p));
}

/** Estados en los que una propuesta ya no cambia. */
const RESUELTA = new Set(["executed", "failed", "rejected", "expired"]);
/** Un flujo de eventos se cierra a los 15 minutos sin resolución (el agente reconecta). */
const VIDA_DEL_FLUJO_MS = 15 * 60_000;

/**
 * B3: los cambios de UNA propuesta, como flujo. Primero cómo está ahora; luego
 * cada cambio que publique `avisarResolucion` en el bus (con o sin Valkey), y
 * se cierra al resolverse. Cada 30 s sin noticias se relee de la base, por si
 * el aviso se perdió (otra réplica, un corte del bus).
 */
async function* eventosDePropuesta(id: string, inicial: VistaDePropuesta): AsyncGenerator<VistaDePropuesta> {
  yield inicial;
  if (RESUELTA.has(inicial.status)) return;
  const llegados: VistaDePropuesta[] = [];
  let despertar: (() => void) | null = null;
  const dejar = await subscribe(canalDePropuesta(id), (_canal, mensaje) => {
    try {
      llegados.push(JSON.parse(mensaje) as VistaDePropuesta);
    } catch {
      return;
    }
    despertar?.();
  });
  let ultimo = inicial.status;
  const hasta = Date.now() + VIDA_DEL_FLUJO_MS;
  try {
    while (Date.now() < hasta) {
      if (llegados.length === 0) {
        await new Promise<void>((ok) => {
          despertar = ok;
          setTimeout(ok, 30_000).unref?.();
        });
        despertar = null;
      }
      let vista = llegados.shift();
      if (!vista) {
        const p = await propuestaPorId(id);
        if (!p) return;
        vista = vistaParaAgente(p);
      }
      if (vista.status === ultimo) continue;
      ultimo = vista.status;
      yield vista;
      if (RESUELTA.has(vista.status)) return;
    }
  } finally {
    await dejar();
  }
}

// ── Las operaciones (SDK de kons) ───────────────────────────────────────────

const Objeto = z.record(z.string(), z.unknown());
const ParamId = z.object({ id: z.guid() });
const SIN_MCP = {
  excluir:
    "Human approval of agent proposals: a human decides in the admin panel; no agent may approve, reject or reconfigure approvals. Agents read their own proposals with the MCP tool kitsuden_proposal_status.",
};
const EQUIPO: MiddlewareHandler[] = [soloHumanos, exigirStaff as unknown as MiddlewareHandler];
const ADMIN: MiddlewareHandler[] = [soloHumanos, exigirAdmin as unknown as MiddlewareHandler];

const delEquipo = {
  acceso: "sesion" as const,
  permiso: { roles: ["admin", "editor"] },
  antes: EQUIPO,
  mcp: SIN_MCP,
  etiquetas: ["approvals"],
};
const deAdmin = { ...delEquipo, permiso: { roles: ["admin"] }, antes: ADMIN };

export const operacionesDeAprobaciones: OperacionCualquiera[] = [
  defineOperacion({
    ...delEquipo,
    id: "listar-propuestas",
    metodo: "GET",
    ruta: "/proposals",
    resumen: "Approval inbox",
    descripcion:
      "Agent proposals, newest first, with their status (pending, executing, executed, failed, rejected, expired). Pending ones past their expiry are marked expired first.",
    entrada: { query: FiltroDeBandeja },
    salida: { esquema: Objeto },
    manejar: (e, { c }) => bandeja(c, e.query as z.infer<typeof FiltroDeBandeja>),
  }),
  defineOperacion({
    ...delEquipo,
    id: "contar-pendientes",
    metodo: "GET",
    ruta: "/proposals/count",
    resumen: "Pending proposals",
    descripcion: "How many proposals are waiting for a human (the panel's counter).",
    salida: { esquema: z.object({ pending: z.number() }) },
    manejar: async (_e, { c }) => {
      await caducarPropuestas();
      return c.json({ pending: await contarPendientes() });
    },
  }),
  defineOperacion({
    ...delEquipo,
    id: "detalle-de-propuesta",
    metodo: "GET",
    ruta: "/proposals/:id",
    resumen: "A proposal in detail",
    descripcion:
      "The stored request (method, path, body without secrets), the expected diff, the agent and key, the decision and the real result. `canDecide` says whether the caller may approve it.",
    entrada: { params: ParamId },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: (e, { c }) => detalle(c, (e.params as { id: string }).id),
  }),
  defineOperacion({
    ...delEquipo,
    id: "aprobar-propuesta",
    metodo: "POST",
    ruta: "/proposals/:id/approve",
    resumen: "Approve and execute a proposal",
    descripcion:
      "Executes the stored request once, with the agent's CURRENT identity and permissions, and records the approver. A second approval gets 409. If the agent was deactivated, its key revoked or expired, or its permission removed, the proposal ends as failed without executing.",
    entrada: { params: ParamId, cuerpo: Decision },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_CONFLICT"],
    manejar: (e, { c }) =>
      decidir(c, (e.params as { id: string }).id, (e.cuerpo as { comment?: string } | undefined)?.comment, true),
  }),
  defineOperacion({
    ...delEquipo,
    id: "rechazar-propuesta",
    metodo: "POST",
    ruta: "/proposals/:id/reject",
    resumen: "Reject a proposal",
    descripcion: "The request is never executed. The comment is shown to the agent.",
    entrada: { params: ParamId, cuerpo: Decision },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_CONFLICT"],
    manejar: (e, { c }) =>
      decidir(c, (e.params as { id: string }).id, (e.cuerpo as { comment?: string } | undefined)?.comment, false),
  }),
  defineOperacion({
    ...delEquipo,
    id: "imagen-de-propuesta",
    metodo: "GET",
    ruta: "/proposals/:id/files/:fileId",
    resumen: "An image held in a proposal",
    descripcion:
      "The bytes of an image an agent uploaded while waiting for approval (a held multipart upload), for the panel's thumbnail. Team members only; never public and never cached. Deleted when the proposal is rejected, expires or is executed, after which this answers 404.",
    entrada: { params: z.object({ id: z.guid(), fileId: z.guid() }) },
    salida: { tipo: "image/*", descripcion: "The image bytes (JPEG, PNG, GIF, WebP or AVIF)" },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: (e, { c }) => {
      const p = e.params as { id: string; fileId: string };
      return ficheroRetenido(c, p.id, p.fileId);
    },
  }),
  defineOperacion({
    ...delEquipo,
    id: "configuracion-de-aprobaciones",
    metodo: "GET",
    ruta: "/settings",
    resumen: "Approval settings",
    descripcion:
      "The global switch, proposal lifetime, legacy route rules, every SDK operation and core MCP tool with its default and overridden sensitivity, and each agent's mode.",
    salida: { esquema: Objeto },
    manejar: (_e, { c }) => configuracion(c),
  }),
  defineOperacion({
    ...deAdmin,
    id: "guardar-configuracion-de-aprobaciones",
    metodo: "PUT",
    ruta: "/settings",
    resumen: "Change approval settings (admin)",
    descripcion:
      "Partial update: enabled (the MASTER switch: off, no agent asks for approval, not even those in propose), proposeRetention (selective: propose does not hold POSTs declared read-only; strict: it holds every write), ttlHours (1-720), operations { key: true | false | null } and legacyRules [{ method, path }]. Takes effect without a restart and is audited.",
    entrada: { cuerpo: CambioDeConfig },
    salida: { esquema: Objeto },
    manejar: (e, { c }) => guardarConfig(c, e.cuerpo as z.infer<typeof CambioDeConfig>),
  }),
  defineOperacion({
    ...deAdmin,
    id: "modo-de-agente",
    metodo: "PUT",
    ruta: "/agents/:id/mode",
    resumen: "Set an agent's approval mode (admin)",
    descripcion:
      "inherit (only sensitive operations wait), propose (its writes become proposals too, per proposeRetention) or direct (never asks). With the master switch off nobody asks, whatever the mode. Audited.",
    entrada: {
      params: z.object({ id: z.string().min(1) }),
      cuerpo: z.object({ mode: z.enum(MODOS_DE_APROBACION as [string, ...string[]]) }).strict(),
    },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: (e, { c }) =>
      guardarModo(c, (e.params as { id: string }).id, (e.cuerpo as { mode: string }).mode),
  }),
  defineOperacion({
    ...delEquipo,
    id: "auditoria-de-aprobaciones",
    metodo: "GET",
    ruta: "/audit",
    resumen: "Approval audit trail",
    descripcion:
      "Who changed each switch and when, who proposed, who approved or rejected, and the result of each execution.",
    entrada: { query: FiltroDeAuditoria },
    salida: { esquema: Objeto },
    manejar: (e, { c }) => auditoria(c, e.query as z.infer<typeof FiltroDeAuditoria>),
  }),
];

const delAgente = {
  acceso: "sesion" as const,
  antes: [agenteOEquipo],
  mcp: SIN_MCP,
  etiquetas: ["approvals"],
};

export const operacionesDePropuestas: OperacionCualquiera[] = [
  defineOperacion({
    ...delAgente,
    id: "mis-propuestas",
    metodo: "GET",
    ruta: "/",
    resumen: "My proposals (agent)",
    descripcion:
      "An agent's own proposals with their status and, once executed, the real result. A staff member sees every proposal.",
    entrada: { query: FiltroDelAgente },
    salida: { esquema: Objeto },
    manejar: (e, { c }) => propiasDelAgente(c, e.query as z.infer<typeof FiltroDelAgente>),
  }),
  defineOperacion({
    ...delAgente,
    id: "estado-de-propuesta",
    metodo: "GET",
    ruta: "/:id",
    resumen: "Proposal status (agent)",
    descripcion:
      "pending, executing, executed, failed, rejected or expired; the reviewer's comment; and, once executed, `result` with the real status and body. Another agent's proposal is 404.",
    entrada: { params: ParamId },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: (e, { c }) => estadoParaAgente(c, (e.params as { id: string }).id),
  }),
  defineOperacion({
    ...delAgente,
    id: "eventos-de-propuesta",
    metodo: "GET",
    ruta: "/:id/events",
    resumen: "Proposal events (agent, Server-Sent Events)",
    descripcion:
      "The proposal as its agent sees it, now and on every change, until it is executed, failed, rejected or expired; then `event: end`. Instead of polling `/api/proposals/:id`. Closes after 15 minutes without a resolution (reconnect). For a push to your own server instead, an admin sets the agent's notify URL (signed webhook).",
    entrada: { params: ParamId },
    salida: { flujo: true, esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    async manejar(e, { c }) {
      const id = (e.params as { id: string }).id;
      // Un 404 normal ANTES de abrir el flujo (la de otro agente tampoco existe).
      const res = await estadoParaAgente(c, id);
      if (res.status !== 200) return res;
      return eventosDePropuesta(id, (await res.json()) as VistaDePropuesta);
    },
  }),
];

/** Para el inventario (OpenAPI, cobertura): no se registra entre las montadas. */
export const konDeAprobaciones = {
  id: "kon-aprobaciones",
  name: "Human approval",
  version: "1.0.0",
  mountPath: "/api/approvals",
  operaciones: operacionesDeAprobaciones,
};
export const konDePropuestas = {
  id: "kon-propuestas",
  name: "Agent proposals",
  version: "1.0.0",
  mountPath: "/api/proposals",
  operaciones: operacionesDePropuestas,
};

registrarOperacionesDelNucleo({
  konId: "kon-aprobaciones",
  mountPath: "/api/approvals",
  descripcion: "Human approval of agent proposals (team members only; never an agent).",
  operaciones: operacionesDeAprobaciones,
});
registrarOperacionesDelNucleo({
  konId: "kon-propuestas",
  mountPath: "/api/proposals",
  descripcion: "An agent reads the status and result of its own proposals.",
  operaciones: operacionesDePropuestas,
});

const contexto = { auth: { requireAuth, optionalAuth } } as never;
export const aprobacionesRoutes = routerDeOperaciones("kon-aprobaciones", operacionesDeAprobaciones, contexto);
export const propuestasRoutes = routerDeOperaciones("kon-propuestas", operacionesDePropuestas, contexto);

