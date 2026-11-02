/**
 * El código de una acción solo cambia por la promoción (fase I, decisión 2 del
 * propietario, 2026-10-28)
 * ============================================================================
 *
 * Un AGENTE (cualquier identidad de agente, también con el scope `admin`) no
 * cambia el código de una acción por ninguna vía que no sea la promoción de
 * código (`POST /api/promotion/drafts`, MCP `promotion_propose`). Ni
 * `/api/actions`, ni `/api/functions`, ni la herramienta MCP
 * `kitsuden_define_action`, ni las rejillas genéricas.
 *
 * Una PERSONA (admin) sigue editando a mano por `/api/actions`, y cada
 * edición del código queda como versión `manual` en `code_versions`
 * (lib/promocion.ts, `registrarEdicionManual`). Para que eso sea verdad, las
 * rejillas genéricas (`/api/items`, el explorador, GraphQL, las herramientas
 * MCP de tablas) no escriben NINGUNA de las tablas de `TABLAS_SOLO_POR_SU_RUTA`,
 * con ningún rol: cada una tiene su ruta, con su versión y su auditoría.
 *
 * Sin dependencias del resto de la API a propósito: lo importan las rutas
 * genéricas y las herramientas MCP sin arrastrar ciclos.
 */

import { buildProblem, type ProblemDetails } from "@kitsuden/shared";

/** Lo de `config` que ES el código (lo que versiona la promoción). Lo demás es configuración. */
export const CLAVES_DE_CODIGO = [
  "code",
  "scopes",
  "fetchAllow",
  "timeoutMs",
  "memoryLimitMb",
  "maxCalls",
  "tests",
  "promotion",
] as const;

/**
 * Tablas que ninguna vía genérica escribe: el código de las acciones y su
 * historial, sus ejecuciones (de ellas vive la vigilancia de una versión
 * nueva) y la configuración de las aprobaciones (el tope de turbo).
 */
export const TABLAS_SOLO_POR_SU_RUTA: ReadonlySet<string> = new Set([
  "actions",
  "kitsuden_functions",
  "code_versions",
  "action_executions",
  "function_executions",
  "approval_settings",
  // Who an agent is and what it may do, and what a human reviews before approving:
  // `PATCH /api/items/agentIdentities/<self>` turned approvals off for that agent,
  // and a pending proposal could be rewritten after its review (audit 2026-10-31).
  "agent_identities",
  "agent_proposals",
  "agent_proposal_files",
  "agent_audit_logs",
]);

function canon(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
    .join(",")}}`;
}

/** ¿Cambia `despues` el código respecto a `antes`? (`config` completas de la acción) */
export function cambiaElCodigo(antes: unknown, despues: unknown): boolean {
  const a = (antes && typeof antes === "object" ? antes : {}) as Record<string, unknown>;
  const d = (despues && typeof despues === "object" ? despues : {}) as Record<string, unknown>;
  return CLAVES_DE_CODIGO.some((k) => canon(a[k]) !== canon(d[k]));
}

/** ¿Trae esta `config` algo de código? (para el alta) */
export function traeCodigo(config: unknown): boolean {
  const c = (config && typeof config === "object" ? config : {}) as Record<string, unknown>;
  return CLAVES_DE_CODIGO.some((k) => c[k] !== undefined && c[k] !== null);
}

export const MENSAJE_SOLO_POR_PROMOCION =
  "Agents cannot create or change an action's code outside the code promotion pipeline. Submit a draft with tests instead: MCP tool promotion_propose, or POST /api/promotion/drafts (see docs/agents/promotion.md).";

/** El 403 problem+json para un agente que intenta cambiar código por otra vía. */
export function problemaDeCodigoFueraDePromocion(instance: string, requestId?: string | null): ProblemDetails {
  return buildProblem({
    code: "KITSUDEN_E_FORBIDDEN",
    detail: MENSAJE_SOLO_POR_PROMOCION,
    instance,
    requestId,
    hint: "Use promotion_propose (POST /api/promotion/drafts). A human approves it, or turbo mode activates it when nothing widens permissions.",
    extensions: { reason: "use_promotion_pipeline", tool: "promotion_propose", route: "POST /api/promotion/drafts" },
  });
}

/** El 403 problem+json de una rejilla genérica sobre una tabla con ruta propia. */
export function problemaDeTablaSoloPorSuRuta(tabla: string, instance: string, requestId?: string | null): ProblemDetails {
  return buildProblem({
    code: "KITSUDEN_E_FORBIDDEN",
    detail: `'${tabla}' is not written through generic routes. Use its own route: actions through /api/actions (humans) or the code promotion pipeline (agents: promotion_propose); approval settings and proposals through /api/approvals; agents through /api/admin/agents.`,
    instance,
    requestId,
    extensions: { reason: "table_has_its_own_route", table: tabla, tool: "promotion_propose" },
  });
}

/** Lo que lanzan las herramientas MCP: `status` 403 → KITSUDEN_E_FORBIDDEN (lib/problemas-mcp.ts). */
export class CodigoFueraDePromocion extends Error {
  readonly status = 403;
  constructor(message = MENSAJE_SOLO_POR_PROMOCION) {
    super(message);
    this.name = "CodigoFueraDePromocion";
  }
}

/** Responde un problem+json con Hono sin depender de su tipo de contexto. */
export function responderProblema(
  c: { body: (b: string, s: never, h: Record<string, string>) => Response },
  p: ProblemDetails,
  estado = 403
): Response {
  return c.body(JSON.stringify(p), estado as never, { "Content-Type": "application/problem+json" });
}
