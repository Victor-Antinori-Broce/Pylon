/**
 * Promoción de código escrito por agentes (fase I) — el CONTRATO puro
 * ============================================================================
 *
 * Un agente escribe código para una acción `code` (el sandbox de QuickJS) y ese
 * código solo llega a estar ACTIVO por este camino:
 *
 *   1. BORRADOR   versionado: la versión activa nunca se edita en su sitio;
 *   2. PRUEBAS    en el sandbox, con la API y `fetch` SIMULADOS (las del
 *                 borrador más las que declara la acción);
 *   3. ESCANEO    local y determinista (`escaneo-de-codigo.ts`) + el diff de
 *                 lo DECLARADO (scopes, hosts, límites) frente a la activa;
 *   4. DECISIÓN   `suggestion` → siempre una propuesta para un humano (la
 *                 bandeja de la fase F); `turbo` → se activa sola SOLO si todo
 *                 pasa y nada de `MOTIVOS_DE_RESPALDO` aplica; si no, propuesta
 *                 con el motivo. Turbo no puede ampliar permisos nunca;
 *   5. VIGILANCIA tras activar, una ventana que cuenta errores y tiempos
 *                 agotados de la versión nueva; por encima del umbral vuelve
 *                 sola a la anterior, lo deja escrito y lo audita.
 *
 * Aquí vive lo que comparten la API, el panel y los tests: tipos, la
 * configuración de fábrica (turbo APAGADO), el diff de capacidades, la
 * clasificación de lo que toca secretos/usuarios/seguridad y la TABLA DE
 * DECISIÓN. La ejecución está en `apps/api/src/lib/promocion.ts`; la guía
 * pública en `docs/agents/promotion.md`.
 */

import { concedeScope, partirScopes } from "./permisos-de-agente";

// ── Modos y configuración ───────────────────────────────────────────────────

/** Cómo se promociona el código de UN agente (lo fija un admin; de fábrica, `suggestion`). */
export type ModoDePromocion = "suggestion" | "turbo";

export const MODOS_DE_PROMOCION: readonly ModoDePromocion[] = ["suggestion", "turbo"];

export function esModoDePromocion(v: unknown): v is ModoDePromocion {
  return typeof v === "string" && (MODOS_DE_PROMOCION as readonly string[]).includes(v);
}

export interface ConfigDePromocion {
  /** El TOPE global: sin esto, ningún agente en `turbo` activa nada solo. De fábrica: no. */
  turboAllowed: boolean;
  /** Minutos que se vigila una versión recién activada. */
  watchMinutes: number;
  /** Ejecuciones mínimas antes de juzgar la tasa de errores. */
  minExecutions: number;
  /** Tasa de error (errores + tiempos agotados / ejecuciones) que provoca la vuelta atrás. */
  maxErrorRate: number;
}

export const CONFIG_DE_PROMOCION_POR_DEFECTO: ConfigDePromocion = {
  turboAllowed: false,
  watchMinutes: 30,
  minExecutions: 3,
  maxErrorRate: 0.5,
};

export const LIMITES_DE_CONFIG_DE_PROMOCION = {
  watchMinutes: { min: 1, max: 24 * 60 },
  minExecutions: { min: 1, max: 1000 },
  maxErrorRate: { min: 0.01, max: 1 },
} as const;

/** Valida y fusiona un cambio parcial. Lanza `Error` con el motivo (la API → 422). */
export function fusionarConfigDePromocion(
  base: ConfigDePromocion,
  cambio: Partial<Record<keyof ConfigDePromocion, unknown>>
): ConfigDePromocion {
  const salida: ConfigDePromocion = { ...base };
  if (cambio.turboAllowed !== undefined) {
    if (typeof cambio.turboAllowed !== "boolean") throw new Error("turboAllowed must be true or false");
    salida.turboAllowed = cambio.turboAllowed;
  }
  for (const campo of ["watchMinutes", "minExecutions"] as const) {
    const v = cambio[campo];
    if (v === undefined) continue;
    const { min, max } = LIMITES_DE_CONFIG_DE_PROMOCION[campo];
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
      throw new Error(`${campo} must be an integer between ${min} and ${max}`);
    }
    salida[campo] = v;
  }
  if (cambio.maxErrorRate !== undefined) {
    const v = cambio.maxErrorRate;
    const { min, max } = LIMITES_DE_CONFIG_DE_PROMOCION.maxErrorRate;
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
      throw new Error(`maxErrorRate must be a number between ${min} and ${max}`);
    }
    salida.maxErrorRate = v;
  }
  return salida;
}

/** Lo guardado, leído con defensas (una fila vieja o rota = lo de fábrica). */
export function leerConfigDePromocion(guardada: unknown): ConfigDePromocion {
  if (!guardada || typeof guardada !== "object") return { ...CONFIG_DE_PROMOCION_POR_DEFECTO };
  try {
    return fusionarConfigDePromocion(
      CONFIG_DE_PROMOCION_POR_DEFECTO,
      guardada as Partial<Record<keyof ConfigDePromocion, unknown>>
    );
  } catch {
    return { ...CONFIG_DE_PROMOCION_POR_DEFECTO };
  }
}

// ── Versiones ───────────────────────────────────────────────────────────────

/**
 *   awaiting_approval  propuesta pendiente en la bandeja
 *   approved           un humano (o turbo) la aprobó pero no se pudo activar
 *                      (`ENABLE_CODE_ACTIONS` apagado): un admin la activa luego
 *   active             la que corre (una por acción)
 *   superseded         fue la activa y la sustituyó otra
 *   rolled_back        se volvió atrás desde ella (sola o a mano)
 *   rejected | expired la propuesta se rechazó o caducó
 *   failed             no se pudo activar (la base cambió por debajo, el agente
 *                      perdió el permiso…): ver `activationError`
 */
export type EstadoDeVersion =
  | "awaiting_approval"
  | "approved"
  | "active"
  | "superseded"
  | "rolled_back"
  | "rejected"
  | "expired"
  | "failed";

export const ESTADOS_DE_VERSION: readonly EstadoDeVersion[] = [
  "awaiting_approval",
  "approved",
  "active",
  "superseded",
  "rolled_back",
  "rejected",
  "expired",
  "failed",
];

// ── Capacidades declaradas ──────────────────────────────────────────────────

/** Lo que el código DECLARA que necesita (lo único que turbo compara). */
export interface CapacidadesDeCodigo {
  scopes: string[];
  fetchAllow: string[];
  timeoutMs: number;
  memoryLimitMb: number;
  maxCalls: number;
}

/** Los mismos valores por defecto que el sandbox (`lib/worker-sandbox.ts`, `code-handler.ts`). */
export const LIMITES_DE_CODIGO_POR_DEFECTO = { timeoutMs: 5000, memoryLimitMb: 64, maxCalls: 50 } as const;

function listaDeTextos(v: unknown, minusculas = false): string[] {
  if (!Array.isArray(v)) return [];
  const limpios = v
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .map((x) => (minusculas ? x.trim().toLowerCase() : x.trim()));
  return [...new Set(limpios)].sort();
}

function entero(v: unknown, porDefecto: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : porDefecto;
}

/** De la `config` de una acción (o de un borrador) a sus capacidades, normalizadas y ordenadas. */
export function capacidadesDe(config: unknown): CapacidadesDeCodigo {
  const c = (config && typeof config === "object" ? config : {}) as Record<string, unknown>;
  return {
    scopes: listaDeTextos(c.scopes),
    fetchAllow: listaDeTextos(c.fetchAllow, true),
    timeoutMs: entero(c.timeoutMs, LIMITES_DE_CODIGO_POR_DEFECTO.timeoutMs),
    memoryLimitMb: entero(c.memoryLimitMb, LIMITES_DE_CODIGO_POR_DEFECTO.memoryLimitMb),
    maxCalls: entero(c.maxCalls, LIMITES_DE_CODIGO_POR_DEFECTO.maxCalls),
  };
}

/**
 * ¿Cubre el patrón de host `p` todo lo que cubre `q`? Misma semántica que la
 * lista blanca del sandbox (`a.com` exacto, `*.a.com` = cualquier subdominio).
 */
export function hostCubre(p: string, q: string): boolean {
  const a = p.toLowerCase();
  const b = q.toLowerCase();
  if (a === b) return true;
  if (!a.startsWith("*.")) return false;
  const sufijo = a.slice(1); // ".a.com"
  const resto = b.startsWith("*.") ? b.slice(1) : `.${b}`;
  return resto.endsWith(sufijo) && resto.length > sufijo.length;
}

export interface DiffDeCapacidades {
  /** No hay versión activa: el borrador crea la acción (o es la primera que pasa por aquí). */
  newTarget: boolean;
  /** Scopes del borrador que la activa NO concedía (contando sus comodines). */
  scopesAdded: string[];
  scopesRemoved: string[];
  /** Denegaciones (`!x`) de la activa que el borrador quita: también amplía. */
  denialsRemoved: string[];
  denialsAdded: string[];
  /** Hosts del borrador que la lista de la activa no cubría. */
  hostsAdded: string[];
  hostsRemoved: string[];
  /** Límites que suben (tiempo, memoria, llamadas al host). */
  limitsIncreased: { field: "timeoutMs" | "memoryLimitMb" | "maxCalls"; before: number; after: number }[];
}

/** El diff de lo DECLARADO. Sin versión activa, todo lo del borrador es nuevo. */
export function diffDeCapacidades(
  activa: CapacidadesDeCodigo | null,
  borrador: CapacidadesDeCodigo
): DiffDeCapacidades {
  const antes = activa ?? { scopes: [], fetchAllow: [], ...LIMITES_DE_CODIGO_POR_DEFECTO };
  const a = partirScopes(antes.scopes);
  const b = partirScopes(borrador.scopes);
  const scopesAdded = b.concesiones.filter((s) => !concedeScope(a.concesiones, s));
  const scopesRemoved = a.concesiones.filter((s) => !concedeScope(b.concesiones, s));
  const denialsRemoved = a.denegaciones.filter((d) => !b.denegaciones.includes(d)).map((d) => `!${d}`);
  const denialsAdded = b.denegaciones.filter((d) => !a.denegaciones.includes(d)).map((d) => `!${d}`);
  const hostsAdded = borrador.fetchAllow.filter((h) => !antes.fetchAllow.some((p) => hostCubre(p, h)));
  const hostsRemoved = antes.fetchAllow.filter((h) => !borrador.fetchAllow.some((p) => hostCubre(p, h)));
  const limitsIncreased: DiffDeCapacidades["limitsIncreased"] = [];
  for (const field of ["timeoutMs", "memoryLimitMb", "maxCalls"] as const) {
    if (borrador[field] > antes[field]) limitsIncreased.push({ field, before: antes[field], after: borrador[field] });
  }
  return {
    newTarget: activa === null,
    scopesAdded,
    scopesRemoved,
    denialsRemoved,
    denialsAdded,
    hostsAdded,
    hostsRemoved,
    limitsIncreased,
  };
}

// ── Lo que toca secretos, usuarios y roles, o la seguridad ─────────────────

export type ToqueSensible = "secrets" | "users_roles" | "security_config";

/** Prefijos de la API (camino) y lo que tocan. El primero que casa gana. */
const CAMINOS_SENSIBLES: { prefijo: string; toque: ToqueSensible }[] = [
  { prefijo: "/api/admin/secrets", toque: "secrets" },
  { prefijo: "/api/admin/vault", toque: "secrets" },
  { prefijo: "/api/secrets", toque: "secrets" },
  { prefijo: "/api/vault", toque: "secrets" },
  { prefijo: "/api/keys", toque: "secrets" },
  { prefijo: "/api/auth", toque: "users_roles" },
  { prefijo: "/api/users", toque: "users_roles" },
  { prefijo: "/api/admin/users", toque: "users_roles" },
  { prefijo: "/api/admin/agents", toque: "users_roles" },
  { prefijo: "/api/v1", toque: "users_roles" },
  { prefijo: "/api/items/authUsers", toque: "users_roles" },
  { prefijo: "/api/items/authSessions", toque: "users_roles" },
  { prefijo: "/api/items/authAccounts", toque: "users_roles" },
  { prefijo: "/api/approvals", toque: "security_config" },
  { prefijo: "/api/proposals", toque: "security_config" },
  { prefijo: "/api/promotion", toque: "security_config" },
  { prefijo: "/api/settings", toque: "security_config" },
  { prefijo: "/api/modules", toque: "security_config" },
  { prefijo: "/api/system", toque: "security_config" },
  { prefijo: "/api/sistema", toque: "security_config" },
  { prefijo: "/api/admin", toque: "security_config" },
  { prefijo: "/api/actions", toque: "security_config" },
  { prefijo: "/api/functions", toque: "security_config" },
  { prefijo: "/api/mcp", toque: "security_config" },
];

/** ¿Qué toca una llamada a este camino de la API? `null` = nada de eso. */
export function toqueDeCamino(camino: string): ToqueSensible | null {
  const limpio = camino.split("?")[0]!.replace(/\/{2,}/g, "/");
  for (const { prefijo, toque } of CAMINOS_SENSIBLES) {
    if (limpio === prefijo || limpio.startsWith(`${prefijo}/`)) return toque;
  }
  return null;
}

/** Primer segmento de un scope (sin `!`) y lo que toca. */
const SCOPES_SENSIBLES: Record<string, ToqueSensible> = {
  admin: "security_config",
  secrets: "secrets",
  secret: "secrets",
  vault: "secrets",
  keys: "secrets",
  auth: "users_roles",
  users: "users_roles",
  user: "users_roles",
  roles: "users_roles",
  agents: "users_roles",
  usuario: "users_roles",
  approvals: "security_config",
  promotion: "security_config",
  settings: "security_config",
  modules: "security_config",
  system: "security_config",
  security: "security_config",
};

/** ¿Qué toca un scope? `mcp:admin` y `admin:*` cuentan como configuración de seguridad. */
export function toqueDeScope(scope: string): ToqueSensible | null {
  const s = scope.startsWith("!") ? scope.slice(1) : scope;
  if (s === "mcp:admin" || s === "kon:*" || s === "admin:*") return "security_config";
  const primero = s.split(":")[0] ?? "";
  if (primero === "kon") {
    const kon = s.split(":")[1] ?? "";
    return SCOPES_SENSIBLES[kon] ?? (kon === "vault" ? "secrets" : null);
  }
  return SCOPES_SENSIBLES[primero] ?? null;
}

/** Un nombre de variable de entorno con pinta de secreto (`STRIPE_KEY`, `apiToken`…). */
export function nombreDeSecreto(nombre: string): boolean {
  return /(secret|token|passw|pwd|api[_-]?key|private|credential|auth|_key$|^key$)/i.test(nombre);
}

// ── La decisión ─────────────────────────────────────────────────────────────

/**
 * Por qué un borrador NO se activó solo (o, en `suggestion`, lo que el humano
 * debe mirar). Son contrato: el agente y el panel los leen.
 */
export type MotivoDeRespaldo =
  | "suggestion_mode"
  | "turbo_disabled_globally"
  | "agent_held_for_approval"
  | "new_target"
  | "no_tests"
  | "tests_failed"
  | "tests_errored"
  | "scan_failed"
  | "scope_escalation"
  | "new_outbound_hosts"
  | "limits_increased"
  | "touches_secrets"
  | "target_has_env_vars"
  | "touches_users_or_roles"
  | "touches_security_config"
  | "sensitive_operation"
  | "unclassifiable_api_call";

export const MOTIVOS_DE_RESPALDO: readonly MotivoDeRespaldo[] = [
  "suggestion_mode",
  "turbo_disabled_globally",
  "agent_held_for_approval",
  "new_target",
  "no_tests",
  "tests_failed",
  "tests_errored",
  "scan_failed",
  "scope_escalation",
  "new_outbound_hosts",
  "limits_increased",
  "touches_secrets",
  "target_has_env_vars",
  "touches_users_or_roles",
  "touches_security_config",
  "sensitive_operation",
  "unclassifiable_api_call",
];

export interface ResumenDePruebas {
  total: number;
  passed: number;
  failed: number;
  errored: number;
}

export interface EntradaDeDecision {
  modo: ModoDePromocion;
  config: Pick<ConfigDePromocion, "turboAllowed">;
  /**
   * La aprobación humana (fase F) está encendida y el agente está en `propose`:
   * un admin quiere ver TODO lo que escribe, así que turbo no se salta eso.
   */
  agenteRetenido?: boolean;
  diff: DiffDeCapacidades;
  pruebas: ResumenDePruebas;
  escaneoAprobado: boolean;
  /** Lo que el código o sus scopes tocan (sin repetir). */
  toques: ToqueSensible[];
  /** Hay una llamada a una operación sensible (la clasificación de la fase F). */
  operacionSensible: boolean;
  /** Hay una llamada a la API que no se puede clasificar (camino dinámico, alias). */
  llamadaSinClasificar: boolean;
  /**
   * The target action has environment variables, and a new version receives
   * their real values on its next run. The scan is advice, not a proof that the
   * code leaves them alone, so these targets always wait for a human.
   */
  objetivoConVariables?: boolean;
}

export interface DecisionDePromocion {
  /** `turbo` = se activa ya; `proposal` = espera a un humano. */
  ruta: "turbo" | "proposal";
  /** TODOS los motivos que aplican, también en `suggestion` (lo que el humano debe mirar). */
  motivos: MotivoDeRespaldo[];
}

/**
 * LA TABLA. Turbo solo si el agente está en `turbo`, el tope global lo
 * permite y NINGÚN motivo aplica. Lo demás, propuesta con sus motivos.
 */
export function decidirPromocion(e: EntradaDeDecision): DecisionDePromocion {
  const m: MotivoDeRespaldo[] = [];
  if (e.modo !== "turbo") m.push("suggestion_mode");
  if (e.modo === "turbo" && !e.config.turboAllowed) m.push("turbo_disabled_globally");
  if (e.agenteRetenido) m.push("agent_held_for_approval");
  if (e.diff.newTarget) m.push("new_target");
  if (e.pruebas.total === 0) m.push("no_tests");
  if (e.pruebas.failed > 0) m.push("tests_failed");
  if (e.pruebas.errored > 0) m.push("tests_errored");
  if (!e.escaneoAprobado) m.push("scan_failed");
  if (e.diff.scopesAdded.length > 0 || e.diff.denialsRemoved.length > 0) m.push("scope_escalation");
  if (e.diff.hostsAdded.length > 0) m.push("new_outbound_hosts");
  if (e.diff.limitsIncreased.length > 0) m.push("limits_increased");
  if (e.toques.includes("secrets")) m.push("touches_secrets");
  if (e.objetivoConVariables) m.push("target_has_env_vars");
  if (e.toques.includes("users_roles")) m.push("touches_users_or_roles");
  if (e.toques.includes("security_config")) m.push("touches_security_config");
  if (e.operacionSensible) m.push("sensitive_operation");
  if (e.llamadaSinClasificar) m.push("unclassifiable_api_call");
  return { ruta: m.length === 0 ? "turbo" : "proposal", motivos: m };
}

// ── Casos de prueba ─────────────────────────────────────────────────────────

/** Una respuesta simulada para `kitsuden.api.*` o `fetch` dentro de una prueba. */
export interface RespuestaSimulada {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface CasoDePrueba {
  name: string;
  /**
   * Lo que el código recibe como `event` (en producción, `{ action, trigger,
   * event, request, timestamp }`).
   */
  event?: Record<string, unknown>;
  /** Lo que el código recibe como `env` (nunca los valores reales de la acción). */
  env?: Record<string, string>;
  /** `METODO /api/camino` → respuesta. Lo que no esté aquí responde 404 (y se anota). */
  api?: Record<string, RespuestaSimulada>;
  /** `METODO https://host/camino` (o solo la URL, = GET) → respuesta. */
  fetch?: Record<string, RespuestaSimulada>;
  expect: {
    /** Por defecto, `true`. */
    success?: boolean;
    /** Igualdad profunda con el valor devuelto. */
    result?: unknown;
    /** El JSON del resultado contiene este texto. */
    resultContains?: string;
    errorContains?: string;
    logsContain?: string;
  };
  timeoutMs?: number;
}

export const MAX_PRUEBAS_POR_BORRADOR = 20;
export const MAX_BYTES_DE_CODIGO = 256 * 1024;
