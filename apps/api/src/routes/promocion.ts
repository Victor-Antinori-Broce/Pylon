/**
 * Promoción de código (fase I) — las rutas del agente y las del panel
 * ============================================================================
 *
 * `/api/promotion` — kon del núcleo `kon-promotion`, registrado entre las
 * operaciones MONTADAS (de ahí sus herramientas MCP `promotion_*`). Un agente
 * entra con `promotion:propose` (o `promotion:*`, `kon:promotion:<op>`,
 * `admin`); un admin humano, por la puerta de `RUTAS_SOLO_ADMIN`.
 *
 *   POST /drafts                 proponer un borrador: pruebas + escaneo +
 *                                decisión (turbo o propuesta), en la respuesta
 *   GET  /drafts                 los borradores del agente (un admin: todos)
 *   GET  /drafts/:id             uno, con su código, informes y propuesta
 *   POST /versions/:id/activate  la ACTIVACIÓN. Un agente solo llega aquí
 *                                desde la ejecución de SU propuesta aprobada
 *                                por un humano (la marca del proceso, que no
 *                                viaja por la red); por sí mismo, 403. Un admin
 *                                humano activa una versión `approved` que no
 *                                se pudo activar (ENABLE_CODE_ACTIONS apagado).
 *                                Fuera de MCP.
 *
 * `/api/approvals/promotion` — `kon-promotion-admin`, SOLO humanos admin
 * (`soloHumanos` + `exigirAdmin`; NO se registra entre las montadas: ningún
 * scope la abre y no es herramienta MCP). Configuración (tope de turbo,
 * ventana de vigilancia), modo de cada agente, versiones, aprobar, rechazar,
 * volver atrás y activar.
 *
 * Lo que lee un agente pasa por la transacción RLS de la petición (solo ve
 * sus filas, rls-owned-tables.sql) y además se filtra por su id.
 */

import {
  ESTADOS_DE_VERSION,
  MAX_BYTES_DE_CODIGO,
  MAX_PRUEBAS_POR_BORRADOR,
  MODOS_DE_PROMOCION,
  concedeScope,
  defineOperacion,
} from "@kitsuden/shared";
import { desc, eq, inArray } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

// Deep imports (no la fachada): la misma razón que brain-memoria/aprobaciones (ciclos del engine).
import { AppError } from "../../../../packages/engine/src/errors";
import { routerDeOperaciones, type OperacionCualquiera } from "../../../../packages/engine/src/operaciones";
import { resolveExecutor } from "../../../../packages/engine/src/request-scope";
import { db } from "../db";
import { agentAuditLogs, agentIdentities, codeVersions } from "../db/schema";
import {
  aprobarPropuesta,
  ejecucionInternaDe,
  humanoFresco,
  instantaneaDeAprobaciones,
  nombresDeUsuarios,
  propuestaPorId,
  rechazarPropuesta,
  type Humano,
} from "../lib/aprobaciones";
import { registrarOperacionesDelNucleo } from "../lib/operaciones-del-nucleo";
import {
  ErrorDePromocion,
  KON_DE_PROMOCION,
  OPERACION_DE_ACTIVAR,
  RUTA_DE_PROMOCION,
  SCOPE_PROMOCION,
  activarVersion,
  guardarConfigDePromocion,
  guardarModoDePromocion,
  leerConfigGuardada,
  listarVersiones,
  proponerBorrador,
  sincronizarConPropuesta,
  versionPorId,
  vistaDeVersion,
  volverAtras,
  type EntradaDeBorrador,
  type Version,
} from "../lib/promocion";
import { accionesDeCodigoHabilitadas } from "../lib/worker-sandbox";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { exigirAdmin } from "../middleware/auth-guard";
import type { AgentAuthContext } from "../services/agent-auth";

import { soloHumanos } from "./aprobaciones";

export { KON_DE_PROMOCION, RUTA_DE_PROMOCION };
export const KON_DE_PROMOCION_ADMIN = "kon-promotion-admin";
export const RUTA_DE_PROMOCION_ADMIN = "/api/approvals/promotion";

// ── Quién ───────────────────────────────────────────────────────────────────

function get(c: Context, k: string): unknown {
  return (c.get as (k: string) => unknown)(k);
}

function agenteDe(c: Context): AgentAuthContext | null {
  const a = get(c, "agent") as AgentAuthContext | undefined;
  return a?.agentId ? a : null;
}

async function humanoDe(c: Context): Promise<Humano | null> {
  const u = get(c, "user") as { id?: string; role?: string } | null;
  if (!u?.id || u.role === "agent" || u.id.startsWith("machine-")) return null;
  return humanoFresco(u.id);
}

/** El ejecutor de la petición: la transacción RLS (el agente solo ve lo suyo). */
function ex(): typeof db {
  return resolveExecutor(db) as typeof db;
}

/** Del error del pipeline al problem+json (con la versión como quedó, si la hay). */
function traducir(err: unknown): never {
  if (err instanceof ErrorDePromocion) {
    const details = { reason: err.motivo, ...(err.version ? { version: vistaDeVersion(err.version) } : {}) };
    if (err.estado === 404) throw AppError.notFound(err.message, details);
    if (err.estado === 403) throw AppError.forbidden(err.message, details);
    if (err.estado === 422) throw AppError.validation(err.message, details);
    throw AppError.conflict(err.message, details);
  }
  throw err;
}

// ── Esquemas ────────────────────────────────────────────────────────────────

const Objeto = z.record(z.string(), z.unknown());
const ParamId = z.object({ id: z.guid() });
const Respuesta = z.object({
  status: z.number().int().min(100).max(599).optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});
const CasoDePrueba = z.object({
  name: z.string().min(1).max(200),
  event: z.record(z.string(), z.unknown()).optional(),
  env: z.record(z.string(), z.string().max(4000)).optional(),
  api: z.record(z.string().max(2100), Respuesta).optional(),
  fetch: z.record(z.string().max(2100), Respuesta).optional(),
  expect: z.object({
    success: z.boolean().optional(),
    result: z.unknown().optional(),
    resultContains: z.string().max(2000).optional(),
    errorContains: z.string().max(2000).optional(),
    logsContain: z.string().max(2000).optional(),
  }),
  timeoutMs: z.number().int().min(50).max(10_000).optional(),
});
const Host = z
  .string()
  .min(1)
  .max(253)
  .regex(/^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i, "a hostname (a.com) or *.a.com");
const Borrador = z.object({
  target: z.object({
    actionId: z.guid().optional(),
    slug: z.string().min(1).max(200).optional(),
    name: z.string().min(1).max(200).optional(),
  }),
  code: z.string().min(1).max(MAX_BYTES_DE_CODIGO),
  scopes: z.array(z.string().min(1).max(200)).max(50).optional(),
  fetchAllow: z.array(Host).max(50).optional(),
  timeoutMs: z.number().int().min(50).max(60_000).optional(),
  memoryLimitMb: z.number().int().min(8).max(256).optional(),
  maxCalls: z.number().int().min(0).max(500).optional(),
  tests: z.array(CasoDePrueba).max(MAX_PRUEBAS_POR_BORRADOR).optional(),
  description: z.string().max(2000).optional(),
});
const Version = z.record(z.string(), z.unknown());
const FiltroDeVersiones = z.object({
  status: z.enum(ESTADOS_DE_VERSION as [string, ...string[]]).optional(),
  slug: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ── Lo del agente (kon-promotion) ───────────────────────────────────────────

const delAgente = {
  acceso: "sesion" as const,
  etiquetas: ["promotion"],
};

async function proponer(c: Context, cuerpo: z.infer<typeof Borrador>) {
  const agente = agenteDe(c);
  if (!agente) {
    throw AppError.forbidden("Drafts are submitted by agents (a human edits the action directly or approves drafts in the panel)");
  }
  const canal = c.env && typeof c.env === "object" && "agente" in (c.env as object) ? "mcp" : "rest";
  try {
    const r = await proponerBorrador(agente, cuerpo as EntradaDeBorrador, canal);
    return c.json({ version: vistaDeVersion(r.version, true), duplicate: r.duplicado }, r.duplicado ? 200 : 201);
  } catch (err) {
    traducir(err);
  }
}

async function listarDelAgente(c: Context, f: z.infer<typeof FiltroDeVersiones>) {
  const agente = agenteDe(c);
  // Un agente: SUS borradores (RLS y, además, el filtro). Un admin humano: todos.
  const filas = await listarVersiones(agente ? ex() : db, {
    agentId: agente?.agentId ?? null,
    status: f.status,
    slug: f.slug,
    limit: f.limit,
    offset: f.offset,
  });
  return { versions: filas.filter((v) => v.origin === "agent").map((v) => vistaDeVersion(v)) };
}

async function leerDelAgente(c: Context, id: string) {
  const agente = agenteDe(c);
  const [fila] = await (agente ? ex() : db)
    .select()
    .from(codeVersions)
    .where(eq(codeVersions.id, id))
    .limit(1);
  if (!fila || (agente && fila.agentId !== agente.agentId)) throw AppError.notFound("Draft not found");
  const v = await sincronizarConPropuesta(fila);
  const propuesta = v.proposalId ? await propuestaPorId(v.proposalId) : null;
  return {
    version: vistaDeVersion(v, true),
    proposal: propuesta
      ? { id: propuesta.id, status: propuesta.status, comment: propuesta.decisionComment, expiresAt: propuesta.expiresAt }
      : null,
  };
}

async function activarDesdeLaRuta(c: Context, id: string, hash: string | undefined) {
  const agente = agenteDe(c);
  try {
    if (agente) {
      // SOLO la ejecución de una propuesta aprobada por un humano trae esta
      // marca (la pone el proceso; no llega desde la red). Ni con `admin`.
      const aprobacion = ejecucionInternaDe(c)?.aprobacion;
      if (!aprobacion) {
        throw AppError.forbidden(
          "Agents cannot activate code: a human approves the draft's proposal (or turbo mode activates it when every check passes)"
        );
      }
      const v = await versionPorId(id);
      if (!v || v.agentId !== agente.agentId) throw AppError.notFound("Version not found");
      if (hash && hash !== v.contentHash) throw AppError.conflict("contentHash does not match the version", { reason: "hash_mismatch" });
      const activa = await activarVersion(id, {
        tipo: "aprobacion",
        proposalId: aprobacion.proposalId,
        approvedBy: aprobacion.approvedBy,
        agentId: agente.agentId,
      });
      return { version: vistaDeVersion(activa) };
    }
    const humano = await humanoDe(c);
    if (!humano || humano.role !== "admin") throw AppError.forbidden("Only an admin can activate a version");
    const v = await versionPorId(id);
    if (!v) throw AppError.notFound("Version not found");
    if (hash && hash !== v.contentHash) throw AppError.conflict("contentHash does not match the version", { reason: "hash_mismatch" });
    return { version: vistaDeVersion(await activarVersion(id, { tipo: "humano", userId: humano.id })) };
  } catch (err) {
    traducir(err);
  }
}

const GUIA_PROPONER = {
  cuandoUsar:
    "To change (or create) the code of a code action. Never edit an action's code directly: submit a draft with tests; it is tested in the sandbox, scanned and then either activated automatically (turbo mode, only when nothing widens permissions) or held for a human (suggestion mode).",
  antes: ["target.actionId: from the actions list, or target.slug + target.name for a new action"],
  ejemplos: [
    {
      titulo: "Change an action's code with one test",
      argumentos: {
        body: {
          target: { slug: "suma" },
          code: "return { total: (event.a ?? 0) + (event.b ?? 0) };",
          tests: [{ name: "adds", event: { a: 2, b: 3 }, expect: { result: { total: 5 } } }],
        },
      },
    },
  ],
  trampas: [
    {
      si: "status is awaiting_approval",
      entonces: "a human must approve it: poll promotion_status (or kitsuden_proposal_status with proposal.id); do not resubmit",
    },
    {
      si: "decision.motivos lists scope_escalation or new_outbound_hosts",
      entonces: "turbo never widens permissions: a human decides. Drop the new scope/host if you do not need it",
    },
    {
      si: "a test calls kitsuden.api and gets 404",
      entonces: "tests never reach the real API: add the response under `api` (\"GET /api/...\") in that test",
    },
  ],
};

export const operacionesDePromocion: OperacionCualquiera[] = [
  defineOperacion({
    ...delAgente,
    id: "proponer-borrador",
    metodo: "POST",
    ruta: "/drafts",
    resumen: "Submit a code draft for an action",
    descripcion:
      "Submits a new VERSION of a code action's code (the active version is never edited). The draft's tests (plus the tests the action declares) run in the sandbox with simulated `kitsuden.api` and `fetch`; a local security scan checks the code and the DECLARED capabilities (scopes, outbound hosts, limits) are compared with the active version. Then: suggestion mode → a proposal for a human (status awaiting_approval, proposal id in the response); turbo mode → activated at once ONLY if every test and check passes and nothing widens permissions or touches secrets, users, roles, security config or sensitive operations; otherwise a proposal with the reasons (`decision.motivos`). Resubmitting the same content returns the same version (200, duplicate: true). Agents only; never approves anything.",
    permiso: { scopes: [SCOPE_PROMOCION] },
    coste: 5,
    antes: [bodyLimit({ maxSize: 2 * 1024 * 1024 })],
    entrada: { cuerpo: Borrador },
    salida: { esquema: z.object({ version: Version, duplicate: z.boolean() }), estado: 201, otrosEstados: [200] },
    errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_CONFLICT"],
    mcp: { nombre: "promotion_propose" },
    guia: GUIA_PROPONER,
    manejar: (e, { c }) => proponer(c, e.cuerpo as z.infer<typeof Borrador>),
  }),
  defineOperacion({
    ...delAgente,
    id: "listar-borradores",
    metodo: "GET",
    ruta: "/drafts",
    resumen: "List code drafts",
    descripcion:
      "Your drafts (an admin sees every agent's), newest first, with status (awaiting_approval, approved, active, superseded, rolled_back, rejected, expired, failed), test and scan summaries and the decision.",
    permiso: { scopes: [SCOPE_PROMOCION], roles: ["admin"] },
    entrada: { query: FiltroDeVersiones },
    salida: { esquema: z.object({ versions: z.array(Version) }) },
    mcp: { nombre: "promotion_list" },
    manejar: (e, { c }) => listarDelAgente(c, e.query as z.infer<typeof FiltroDeVersiones>),
  }),
  defineOperacion({
    ...delAgente,
    id: "leer-borrador",
    metodo: "GET",
    ruta: "/drafts/:id",
    resumen: "A code draft in detail",
    descripcion:
      "One of your drafts with its code, test cases, the full test report, the scan report, the capability diff, the decision and reasons, its proposal (status, reviewer comment) and, once active, the watch window and any rollback. Another agent's draft is 404.",
    permiso: { scopes: [SCOPE_PROMOCION], roles: ["admin"] },
    entrada: { params: ParamId },
    salida: { esquema: z.object({ version: Version, proposal: Objeto.nullable() }) },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    mcp: { nombre: "promotion_status" },
    manejar: (e, { c }) => leerDelAgente(c, (e.params as { id: string }).id),
  }),
  defineOperacion({
    ...delAgente,
    id: OPERACION_DE_ACTIVAR,
    metodo: "POST",
    ruta: "/versions/:id/activate",
    resumen: "Activate an approved version",
    descripcion:
      "Makes the version the action's active code, with a watch window that rolls back automatically on errors. An agent can NOT call this by itself (403, even with `admin`): it only runs as the execution of the agent's proposal after a human approved it. An admin can activate a version that was approved but could not be activated (code actions were disabled). 409 if the action changed since the draft was tested (stale_base) or code actions are disabled (code_actions_disabled: the version stays approved).",
    permiso: { scopes: [SCOPE_PROMOCION], roles: ["admin"] },
    sensible: true,
    entrada: { params: ParamId, cuerpo: z.object({ contentHash: z.string().max(100).optional() }).optional() },
    salida: { esquema: z.object({ version: Version }) },
    errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_CONFLICT"],
    mcp: {
      excluir:
        "Activation is the execution of a proposal a human approved (or turbo's automatic activation); an agent never calls it as a tool.",
    },
    manejar: (e, { c }) =>
      activarDesdeLaRuta(c, (e.params as { id: string }).id, (e.cuerpo as { contentHash?: string } | undefined)?.contentHash),
  }),
];

// ── Lo del panel (kon-promotion-admin) ──────────────────────────────────────

const SIN_MCP = {
  excluir:
    "Code promotion is decided by humans in the admin panel: no agent may approve, reject, roll back, activate or reconfigure it.",
};
const ADMIN: MiddlewareHandler[] = [soloHumanos, exigirAdmin as unknown as MiddlewareHandler];
const deAdmin = {
  acceso: "sesion" as const,
  permiso: { roles: ["admin"] },
  antes: ADMIN,
  mcp: SIN_MCP,
  etiquetas: ["promotion"],
};

async function nombresDeAgentes(ids: (string | null)[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unicos.length) return {};
  const filas = await db
    .select({ id: agentIdentities.id, name: agentIdentities.name })
    .from(agentIdentities)
    .where(inArray(agentIdentities.id, unicos));
  return Object.fromEntries(filas.map((f) => [f.id, f.name]));
}

async function vistaParaElPanel(lista: Version[]) {
  const agentes = await nombresDeAgentes(lista.map((v) => v.agentId));
  const personas = await nombresDeUsuarios(lista.flatMap((v) => [v.sponsorUserId, v.activatedBy, v.rolledBackBy]));
  return lista.map((v) => ({
    ...vistaDeVersion(v),
    agentName: v.agentId ? (agentes[v.agentId] ?? null) : null,
    sponsorName: v.sponsorUserId ? (personas[v.sponsorUserId] ?? null) : null,
    activatedByName: v.activatedBy ? (personas[v.activatedBy] ?? v.activatedBy) : null,
    rolledBackByName: v.rolledBackBy ? (personas[v.rolledBackBy] ?? v.rolledBackBy) : null,
  }));
}

async function configuracion() {
  const guardada = await leerConfigGuardada();
  const aprob = await instantaneaDeAprobaciones();
  const agentes = await db
    .select({
      id: agentIdentities.id,
      name: agentIdentities.name,
      isActive: agentIdentities.isActive,
      mode: agentIdentities.promotionMode,
      approvalMode: agentIdentities.approvalMode,
      scopes: agentIdentities.scopes,
    })
    .from(agentIdentities)
    .orderBy(agentIdentities.name);
  return {
    config: guardada.config,
    updatedBy: guardada.updatedBy,
    updatedAt: guardada.updatedAt,
    approvalsEnabled: aprob.config.enabled,
    codeActionsEnabled: accionesDeCodigoHabilitadas(),
    agents: agentes.map((a) => ({
      id: a.id,
      name: a.name,
      isActive: a.isActive,
      mode: a.mode,
      approvalMode: a.approvalMode,
      canPropose: Array.isArray(a.scopes) && concedeScope(a.scopes as string[], SCOPE_PROMOCION),
    })),
  };
}

async function detalleParaElPanel(id: string) {
  const fila = await versionPorId(id);
  if (!fila) throw AppError.notFound("Version not found");
  const v = await sincronizarConPropuesta(fila);
  const [vista] = await vistaParaElPanel([v]);
  const propuesta = v.proposalId ? await propuestaPorId(v.proposalId) : null;
  const anterior = v.previousVersionId ? await versionPorId(v.previousVersionId) : v.parentVersionId ? await versionPorId(v.parentVersionId) : null;
  const ids = [v.id, ...(v.proposalId ? [v.proposalId] : [])];
  const eventos = await db
    .select()
    .from(agentAuditLogs)
    .where(inArray(agentAuditLogs.resourceId, ids))
    .orderBy(desc(agentAuditLogs.createdAt))
    .limit(100);
  const quien = (d: unknown) => ((d as { by?: unknown } | null)?.by as string | undefined) ?? null;
  const nombres = await nombresDeUsuarios(eventos.map((e) => quien(e.details)));
  return {
    version: { ...vista!, code: v.code, tests: v.tests },
    previous: anterior ? { ...vistaDeVersion(anterior), code: anterior.code } : null,
    proposal: propuesta
      ? {
          id: propuesta.id,
          status: propuesta.status,
          decidedBy: propuesta.decidedBy,
          decidedAt: propuesta.decidedAt,
          comment: propuesta.decisionComment,
          expiresAt: propuesta.expiresAt,
          resultStatus: propuesta.resultStatus,
          resultError: propuesta.resultError,
        }
      : null,
    events: eventos.map((e) => ({
      id: e.id,
      at: e.createdAt,
      action: e.action,
      by: quien(e.details),
      byName: quien(e.details) ? (nombres[quien(e.details)!] ?? quien(e.details)) : null,
      success: e.success,
      details: e.details,
    })),
  };
}

async function decidir(c: Context, id: string, comentario: string | undefined, aprobar: boolean) {
  const humano = await humanoDe(c);
  if (!humano) throw AppError.unauthenticated();
  const v = await versionPorId(id);
  if (!v) throw AppError.notFound("Version not found");
  if (v.status !== "awaiting_approval" || !v.proposalId) {
    throw AppError.conflict(`Version is ${v.status}`, { reason: "wrong_state", version: vistaDeVersion(v) });
  }
  const r = aprobar
    ? await aprobarPropuesta(v.proposalId, humano, comentario)
    : await rechazarPropuesta(v.proposalId, humano, comentario);
  if (!r.ok) {
    if (r.estado === 403) throw AppError.forbidden(r.motivo);
    if (r.estado === 404) throw AppError.notFound(r.motivo);
    throw AppError.conflict(r.motivo, { reason: "proposal_state" });
  }
  return detalleParaElPanel(id);
}

const CambioDeConfig = z
  .object({
    turboAllowed: z.boolean().optional(),
    watchMinutes: z.number().int().optional(),
    minExecutions: z.number().int().optional(),
    maxErrorRate: z.number().optional(),
  })
  .strict();
const Decision = z.object({ comment: z.string().max(2000).optional() }).strict();

export const operacionesDePromocionAdmin: OperacionCualquiera[] = [
  defineOperacion({
    ...deAdmin,
    id: "configuracion-de-promocion",
    metodo: "GET",
    ruta: "/settings",
    resumen: "Code promotion settings",
    descripcion:
      "The global turbo cap (turboAllowed), the watch window (minutes, minimum executions, error rate that triggers a rollback), whether code actions and the approvals master switch are on, and every agent's promotion mode.",
    salida: { esquema: Objeto },
    manejar: () => configuracion(),
  }),
  defineOperacion({
    ...deAdmin,
    id: "guardar-configuracion-de-promocion",
    metodo: "PUT",
    ruta: "/settings",
    resumen: "Change code promotion settings",
    descripcion:
      "Partial update: turboAllowed (the GLOBAL CAP: off, no agent in turbo activates anything by itself), watchMinutes (1-1440), minExecutions (1-1000), maxErrorRate (0.01-1). Audited.",
    entrada: { cuerpo: CambioDeConfig },
    salida: { esquema: Objeto },
    manejar: async (e, { c }) => {
      const humano = await humanoDe(c);
      if (!humano) throw AppError.unauthenticated();
      try {
        await guardarConfigDePromocion(e.cuerpo as Record<string, unknown>, humano.id);
      } catch (err) {
        throw AppError.validation(err instanceof Error ? err.message : String(err));
      }
      return configuracion();
    },
  }),
  defineOperacion({
    ...deAdmin,
    id: "modo-de-promocion",
    metodo: "PUT",
    ruta: "/agents/:id/mode",
    resumen: "Set an agent's promotion mode",
    descripcion:
      "suggestion (default: every draft is a proposal for a human) or turbo (activated automatically when every test and check passes and nothing widens permissions; needs turboAllowed). Audited.",
    entrada: {
      params: z.object({ id: z.string().min(1).max(100) }),
      cuerpo: z.object({ mode: z.enum(MODOS_DE_PROMOCION as [string, ...string[]]) }).strict(),
    },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: async (e, { c }) => {
      const humano = await humanoDe(c);
      if (!humano) throw AppError.unauthenticated();
      const { id } = e.params as { id: string };
      const r = await guardarModoDePromocion(id, (e.cuerpo as { mode: "suggestion" | "turbo" }).mode, humano.id);
      if (!r) throw AppError.notFound("Agent not found");
      return { agentId: id, mode: r.despues, previous: r.antes };
    },
  }),
  defineOperacion({
    ...deAdmin,
    id: "versiones",
    metodo: "GET",
    ruta: "/versions",
    resumen: "Code versions (pipeline)",
    descripcion: "Every agent's drafts and versions, newest first, with test, scan and decision summaries.",
    entrada: { query: FiltroDeVersiones.extend({ agentId: z.string().max(100).optional() }) },
    salida: { esquema: z.object({ versions: z.array(Version) }) },
    manejar: async (e) => {
      const q = e.query as z.infer<typeof FiltroDeVersiones> & { agentId?: string };
      const filas = await listarVersiones(db, { agentId: q.agentId, status: q.status, slug: q.slug, limit: q.limit, offset: q.offset });
      return { versions: await vistaParaElPanel(filas) };
    },
  }),
  defineOperacion({
    ...deAdmin,
    id: "version",
    metodo: "GET",
    ruta: "/versions/:id",
    resumen: "A code version in detail",
    descripcion:
      "The version with its code, the code it replaces, the full test and scan reports, the capability diff, the decision, its proposal and the audit trail.",
    entrada: { params: ParamId },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: (e) => detalleParaElPanel((e.params as { id: string }).id),
  }),
  defineOperacion({
    ...deAdmin,
    id: "aprobar-version",
    metodo: "POST",
    ruta: "/versions/:id/approve",
    resumen: "Approve a draft (activates it)",
    descripcion:
      "Approves the draft's proposal: it is executed once, as the agent, and activates the version (with its watch window). The same as approving it in the approvals inbox.",
    entrada: { params: ParamId, cuerpo: Decision },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_CONFLICT"],
    manejar: (e, { c }) =>
      decidir(c, (e.params as { id: string }).id, (e.cuerpo as { comment?: string } | undefined)?.comment, true),
  }),
  defineOperacion({
    ...deAdmin,
    id: "rechazar-version",
    metodo: "POST",
    ruta: "/versions/:id/reject",
    resumen: "Reject a draft",
    descripcion: "Rejects the draft's proposal: the version is never activated. The comment is shown to the agent.",
    entrada: { params: ParamId, cuerpo: Decision },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_CONFLICT"],
    manejar: (e, { c }) =>
      decidir(c, (e.params as { id: string }).id, (e.cuerpo as { comment?: string } | undefined)?.comment, false),
  }),
  defineOperacion({
    ...deAdmin,
    id: "volver-atras",
    metodo: "POST",
    ruta: "/versions/:id/rollback",
    resumen: "Roll back an active version",
    descripcion:
      "Restores the version that was active before this one (or pauses the action if this was its first version). Only from the active version. Audited and notified.",
    entrada: { params: ParamId, cuerpo: z.object({ reason: z.string().min(1).max(2000) }).strict() },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_CONFLICT"],
    manejar: async (e, { c }) => {
      const humano = await humanoDe(c);
      if (!humano) throw AppError.unauthenticated();
      const { id } = e.params as { id: string };
      try {
        await volverAtras(id, (e.cuerpo as { reason: string }).reason, { tipo: "humano", userId: humano.id });
      } catch (err) {
        traducir(err);
      }
      return detalleParaElPanel(id);
    },
  }),
  defineOperacion({
    ...deAdmin,
    id: "activar-aprobada",
    metodo: "POST",
    ruta: "/versions/:id/activate",
    resumen: "Activate an approved version",
    descripcion:
      "Activates a version that was approved but could not be activated (code actions were disabled). 409 if the action changed meanwhile (stale_base) or code actions are still disabled.",
    entrada: { params: ParamId },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_CONFLICT"],
    manejar: async (e, { c }) => {
      const humano = await humanoDe(c);
      if (!humano) throw AppError.unauthenticated();
      const { id } = e.params as { id: string };
      try {
        await activarVersion(id, { tipo: "humano", userId: humano.id });
      } catch (err) {
        traducir(err);
      }
      return detalleParaElPanel(id);
    },
  }),
];

// ── Inventario y routers ────────────────────────────────────────────────────

export const konDePromocion = {
  id: KON_DE_PROMOCION,
  name: "Code promotion (agents)",
  version: "1.0.0",
  mountPath: RUTA_DE_PROMOCION,
  operaciones: operacionesDePromocion,
};
export const konDePromocionAdmin = {
  id: KON_DE_PROMOCION_ADMIN,
  name: "Code promotion (panel)",
  version: "1.0.0",
  mountPath: RUTA_DE_PROMOCION_ADMIN,
  operaciones: operacionesDePromocionAdmin,
};

registrarOperacionesDelNucleo({
  konId: KON_DE_PROMOCION,
  mountPath: RUTA_DE_PROMOCION,
  descripcion:
    "Code promotion: an agent submits versioned drafts of a code action's code; they are tested in the sandbox, scanned and activated by a human approval (suggestion) or automatically when nothing widens permissions (turbo), with a watch window and automatic rollback.",
  operaciones: operacionesDePromocion,
});
registrarOperacionesDelNucleo({
  konId: KON_DE_PROMOCION_ADMIN,
  mountPath: RUTA_DE_PROMOCION_ADMIN,
  descripcion: "Code promotion for admins: settings, agents' modes, approve, reject, roll back and activate (humans only).",
  operaciones: operacionesDePromocionAdmin,
});

const contexto = { auth: { requireAuth, optionalAuth } } as never;
export const promocionRoutes = routerDeOperaciones(KON_DE_PROMOCION, operacionesDePromocion, contexto);
export const promocionAdminRoutes = routerDeOperaciones(KON_DE_PROMOCION_ADMIN, operacionesDePromocionAdmin, contexto);
