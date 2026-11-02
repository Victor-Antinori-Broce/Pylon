/**
 * Catálogo de errores de la API de Kitsuden (RFC 9457, `application/problem+json`)
 * ============================================================================
 *
 * Un agente no puede leer «HTTP 409» y adivinar si reintentar, esperar o
 * cambiar la petición. Por eso cada respuesta de error de `/api/*` lleva:
 *
 *   - `code`        — estable, de este catálogo (`KITSUDEN_E_*`). Es el
 *                     contrato: no se renombra ni se reutiliza para otra cosa.
 *   - `retryable`   — si repetir la MISMA petición puede salir bien.
 *   - `retry_after` — segundos a esperar antes de reintentar (o `null`).
 *   - `hint`        — qué hacer, en una frase.
 *   - `docs` y `type` — la URL de la entrada de este código en la guía pública.
 *
 * Y los campos de RFC 9457: `type`, `title`, `status`, `detail`, `instance`.
 *
 * El campo `error` se conserva tal y como lo mandaba cada ruta (texto u objeto
 * `{ code, message, details }`): el panel, las webs, Inti y el SDK lo leen.
 *
 * Aquí solo vive el catálogo y la construcción del cuerpo (puro, sin Hono):
 * lo comparten la API (middleware de salida), el servidor MCP y los clientes.
 * La guía pública es `docs/install/errors-and-retries.md`; un test comprueba
 * que cada código tiene su entrada allí.
 */

/** Dónde vive la guía de errores (cada código es un ancla de esa página). */
export const DOCS_DE_ERRORES =
  "https://github.com/Victor-Antinori-Broce/kitsuden/blob/main/docs/install/errors-and-retries.md";

export interface ErrorCatalogEntry {
  /** Estado HTTP con el que sale normalmente. */
  status: number;
  /** Título corto, estable (RFC 9457 `title`). */
  title: string;
  /** ¿Repetir la misma petición puede salir bien? */
  retryable: boolean;
  /** Espera sugerida en segundos si la respuesta no trae `Retry-After`. */
  retryAfter?: number;
  /** Qué hacer, en una frase. */
  hint: string;
}

/**
 * El catálogo. Añadir es compatible; renombrar o quitar un código NO lo es
 * (hay agentes que ramifican por él).
 */
export const KITSUDEN_ERRORS = {
  KITSUDEN_E_BAD_REQUEST: {
    status: 400,
    title: "Bad request",
    retryable: false,
    hint: "Fix the request (syntax, parameters or headers) before sending it again.",
  },
  KITSUDEN_E_VALIDATION: {
    status: 422,
    title: "Validation failed",
    retryable: false,
    hint: "Correct the fields listed in `error.details` and send the request again.",
  },
  KITSUDEN_E_UNAUTHENTICATED: {
    status: 401,
    title: "Authentication required",
    retryable: false,
    hint: "Send a valid session cookie or an `Authorization: Bearer kitsuden_agent_…` key.",
  },
  KITSUDEN_E_LEGACY_KEY_RETIRED: {
    status: 401,
    title: "Legacy API key retired",
    retryable: false,
    hint: "`kitsuden_sk_*` keys no longer work. Create an agent identity and use its `kitsuden_agent_*` key.",
  },
  KITSUDEN_E_FORBIDDEN: {
    status: 403,
    title: "Forbidden",
    retryable: false,
    hint: "The caller is authenticated but lacks the role or scope this operation needs.",
  },
  KITSUDEN_E_NOT_FOUND: {
    status: 404,
    title: "Not found",
    retryable: false,
    hint: "Check the identifier or path. Every route is listed in GET /api/docs/openapi.json.",
  },
  KITSUDEN_E_METHOD_NOT_ALLOWED: {
    status: 405,
    title: "Method not allowed",
    retryable: false,
    hint: "The path exists; use one of the methods in the `Allow` header.",
  },
  KITSUDEN_E_CONFLICT: {
    status: 409,
    title: "Conflict",
    retryable: false,
    hint: "The current state of the resource does not allow this change. Read it again and decide.",
  },
  KITSUDEN_E_PAYLOAD_TOO_LARGE: {
    status: 413,
    title: "Payload too large",
    retryable: false,
    hint: "Send a smaller body (the limit is in `maxBytes` when known).",
  },
  KITSUDEN_E_UNSUPPORTED_MEDIA_TYPE: {
    status: 415,
    title: "Unsupported media type",
    retryable: false,
    hint: "Send the body with a supported `Content-Type` (usually `application/json`).",
  },
  KITSUDEN_E_RATE_LIMITED: {
    status: 429,
    title: "Too many requests",
    retryable: true,
    retryAfter: 60,
    hint: "Wait `retry_after` seconds before sending more requests.",
  },
  KITSUDEN_E_QUOTA_EXCEEDED: {
    status: 429,
    title: "Agent quota exceeded",
    retryable: true,
    retryAfter: 3600,
    hint: "This agent used up its daily writes or budget units. Wait `retry_after` seconds (until 00:00 UTC) or ask an admin to raise the quota.",
  },
  KITSUDEN_E_APPROVAL_REQUIRED: {
    status: 202,
    title: "Pending human approval",
    retryable: false,
    hint: "Nothing was executed yet: the request was stored as a proposal for a human to approve. Do not resend it; poll `proposal.statusUrl` (or the MCP tool `kitsuden_proposal_status`) until it is executed, rejected or expired.",
  },
  KITSUDEN_E_APPROVAL_UNSUPPORTED: {
    status: 403,
    title: "Request cannot be held for approval",
    retryable: false,
    hint: "This agent needs human approval for this request, but it cannot be stored as a proposal (it carries a secret, a file that is not an image, or a body that is too large). Ask a human to do it, or ask an admin to change the agent's approval mode.",
  },
  KITSUDEN_E_AGENT_SPONSOR_INVALID: {
    status: 403,
    title: "Agent signer no longer valid",
    retryable: false,
    hint: "This agent signs what it creates with a human signer that no longer exists or is no longer an admin or editor. An admin must assign a new signer in the panel (Agents → agent → Signer).",
  },
  KITSUDEN_E_IDEMPOTENCY_KEY_INVALID: {
    status: 422,
    title: "Invalid Idempotency-Key",
    retryable: false,
    hint: "Use 8-128 characters from [A-Za-z0-9_.:-]; a UUID works.",
  },
  KITSUDEN_E_IDEMPOTENCY_KEY_REUSED: {
    status: 422,
    title: "Idempotency-Key reused with a different request",
    retryable: false,
    hint: "This key was already used for a different method, path or body. Generate a new key for a new operation.",
  },
  KITSUDEN_E_IDEMPOTENCY_IN_PROGRESS: {
    status: 409,
    title: "Request with this Idempotency-Key still in progress",
    retryable: true,
    retryAfter: 1,
    hint: "Another request with the same key is running. Retry with the same key after `retry_after` seconds to get its result.",
  },
  KITSUDEN_E_IDEMPOTENCY_NOT_REPLAYABLE: {
    status: 409,
    title: "Original response cannot be replayed",
    retryable: false,
    hint: "The original request with this key already succeeded, but its response carried a secret or was too large to store. Read the resource instead of repeating the write.",
  },
  KITSUDEN_E_IDEMPOTENCY_UNAVAILABLE: {
    status: 503,
    title: "Idempotency store unavailable",
    retryable: true,
    retryAfter: 5,
    hint: "The request was NOT executed. Retry later with the same Idempotency-Key.",
  },
  KITSUDEN_E_INTERNAL: {
    status: 500,
    title: "Internal server error",
    retryable: false,
    hint: "Not caused by the request. Report the `requestId`; retry only if the operation is idempotent or carries an Idempotency-Key.",
  },
  KITSUDEN_E_BAD_GATEWAY: {
    status: 502,
    title: "Bad gateway",
    retryable: true,
    retryAfter: 5,
    hint: "An upstream service failed. Retry after `retry_after` seconds.",
  },
  KITSUDEN_E_UNAVAILABLE: {
    status: 503,
    title: "Service unavailable",
    retryable: true,
    retryAfter: 5,
    hint: "Temporary. Retry after `retry_after` seconds.",
  },
  KITSUDEN_E_DB_POOL_EXHAUSTED: {
    status: 503,
    title: "Database busy",
    retryable: true,
    retryAfter: 5,
    hint: "All database connections are in use. Retry after `retry_after` seconds.",
  },
  KITSUDEN_E_TIMEOUT: {
    status: 504,
    title: "Gateway timeout",
    retryable: true,
    retryAfter: 5,
    hint: "The operation took too long. Retry after `retry_after` seconds (with an Idempotency-Key for writes).",
  },
} as const satisfies Record<string, ErrorCatalogEntry>;

export type KitsudenErrorCode = keyof typeof KITSUDEN_ERRORS;

export function isKitsudenErrorCode(code: unknown): code is KitsudenErrorCode {
  return (
    typeof code === "string" && Object.prototype.hasOwnProperty.call(KITSUDEN_ERRORS, code)
  );
}

/** URL de la entrada de un código en la guía (el ancla es el código en minúsculas). */
export function errorDocsUrl(code: KitsudenErrorCode): string {
  return `${DOCS_DE_ERRORES}#${code.toLowerCase()}`;
}

/** El código por defecto para un estado HTTP. */
export function errorCodeForStatus(status: number): KitsudenErrorCode {
  switch (status) {
    case 400:
      return "KITSUDEN_E_BAD_REQUEST";
    case 401:
      return "KITSUDEN_E_UNAUTHENTICATED";
    case 403:
      return "KITSUDEN_E_FORBIDDEN";
    case 404:
      return "KITSUDEN_E_NOT_FOUND";
    case 405:
      return "KITSUDEN_E_METHOD_NOT_ALLOWED";
    case 409:
      return "KITSUDEN_E_CONFLICT";
    case 413:
      return "KITSUDEN_E_PAYLOAD_TOO_LARGE";
    case 415:
      return "KITSUDEN_E_UNSUPPORTED_MEDIA_TYPE";
    case 422:
      return "KITSUDEN_E_VALIDATION";
    case 429:
      return "KITSUDEN_E_RATE_LIMITED";
    case 502:
      return "KITSUDEN_E_BAD_GATEWAY";
    case 503:
      return "KITSUDEN_E_UNAVAILABLE";
    case 504:
      return "KITSUDEN_E_TIMEOUT";
    default:
      if (status >= 500) return "KITSUDEN_E_INTERNAL";
      if (status === 408) return "KITSUDEN_E_TIMEOUT";
      return "KITSUDEN_E_BAD_REQUEST";
  }
}

/**
 * Códigos que ya existían en la API (el `ErrorCode` del engine, `KonErrors`,
 * la autenticación de agentes) → su código del catálogo. Lo que no está aquí
 * se decide por el estado HTTP.
 */
const LEGADO: Record<string, KitsudenErrorCode> = {
  BAD_REQUEST: "KITSUDEN_E_BAD_REQUEST",
  VALIDATION: "KITSUDEN_E_VALIDATION",
  VALIDATION_ERROR: "KITSUDEN_E_VALIDATION",
  UNAUTHENTICATED: "KITSUDEN_E_UNAUTHENTICATED",
  UNAUTHORIZED: "KITSUDEN_E_UNAUTHENTICATED",
  MISSING_AUTH: "KITSUDEN_E_UNAUTHENTICATED",
  INVALID_AUTH_FORMAT: "KITSUDEN_E_UNAUTHENTICATED",
  INVALID_KEY: "KITSUDEN_E_UNAUTHENTICATED",
  INVALID_KEY_FORMAT: "KITSUDEN_E_UNAUTHENTICATED",
  AGENT_NOT_FOUND: "KITSUDEN_E_UNAUTHENTICATED",
  AGENT_DEACTIVATED: "KITSUDEN_E_UNAUTHENTICATED",
  AUTH_ERROR: "KITSUDEN_E_UNAUTHENTICATED",
  LEGACY_KEY_RETIRED: "KITSUDEN_E_LEGACY_KEY_RETIRED",
  FORBIDDEN: "KITSUDEN_E_FORBIDDEN",
  NOT_FOUND: "KITSUDEN_E_NOT_FOUND",
  CONFLICT: "KITSUDEN_E_CONFLICT",
  RATE_LIMITED: "KITSUDEN_E_RATE_LIMITED",
  RATE_LIMIT_EXCEEDED: "KITSUDEN_E_RATE_LIMITED",
  INTERNAL: "KITSUDEN_E_INTERNAL",
};

/** Traduce un código antiguo (o ya del catálogo) al catálogo; `null` si no lo conoce. */
export function errorCodeFromLegacy(code: unknown): KitsudenErrorCode | null {
  if (isKitsudenErrorCode(code)) return code;
  if (typeof code !== "string") return null;
  return LEGADO[code] ?? null;
}

/** Cuerpo `application/problem+json` de Kitsuden. */
export interface ProblemDetails {
  /** RFC 9457: URI del tipo de problema (la entrada de la guía). */
  type: string;
  title: string;
  status: number;
  detail: string;
  /** Camino de la petición. */
  instance?: string;
  code: KitsudenErrorCode;
  retryable: boolean;
  /** Segundos; `null` si no hay espera sugerida. */
  retry_after: number | null;
  hint: string;
  docs: string;
  requestId?: string | null;
  traceId?: string | null;
  /**
   * Compatibilidad: lo que la ruta mandaba antes en `error` (texto u objeto
   * `{ code, message, details }`). Siempre presente.
   */
  error: unknown;
  [extension: string]: unknown;
}

export const PROBLEM_JSON = "application/problem+json";

/**
 * Construye el cuerpo de un problema.
 *
 * `retryAfter` (de la cabecera `Retry-After`, si la hubo) manda sobre la
 * espera por defecto del catálogo. `retryable` se puede forzar (p. ej. un 409
 * de negocio que se sabe transitorio), pero por defecto sale del catálogo.
 */
export function buildProblem(opts: {
  code: KitsudenErrorCode;
  status?: number;
  detail?: string;
  instance?: string;
  retryAfter?: number | null;
  retryable?: boolean;
  hint?: string;
  requestId?: string | null;
  traceId?: string | null;
  /** Valor de compatibilidad para `error`; por defecto, el `detail`. */
  error?: unknown;
  /** Campos de extensión (no pisan los de RFC 9457 ni los de Kitsuden). */
  extensions?: Record<string, unknown>;
}): ProblemDetails {
  const entrada: ErrorCatalogEntry = KITSUDEN_ERRORS[opts.code];
  const docs = errorDocsUrl(opts.code);
  const detail = opts.detail?.trim() || entrada.title;
  const retryAfter =
    opts.retryAfter !== undefined && opts.retryAfter !== null
      ? opts.retryAfter
      : (entrada.retryAfter ?? null);
  const retryable = opts.retryable ?? entrada.retryable;

  return {
    // Primero lo que la ruta mandaba: quien lee el cuerpo como texto (Inti
    // corta a 300 caracteres) sigue viendo el motivo al principio.
    ...(opts.extensions ?? {}),
    error: opts.error === undefined ? detail : opts.error,
    type: docs,
    title: entrada.title,
    status: opts.status ?? entrada.status,
    detail,
    ...(opts.instance ? { instance: opts.instance } : {}),
    code: opts.code,
    retryable,
    retry_after: retryable ? retryAfter : null,
    hint: opts.hint ?? entrada.hint,
    docs,
    ...(opts.requestId !== undefined ? { requestId: opts.requestId } : {}),
    ...(opts.traceId !== undefined && opts.traceId !== null ? { traceId: opts.traceId } : {}),
  };
}

/**
 * Segundos de una cabecera `Retry-After` (número o fecha HTTP). `null` si no
 * se entiende.
 */
export function parseRetryAfter(valor: string | null | undefined, ahora = Date.now()): number | null {
  if (!valor) return null;
  const limpio = valor.trim();
  if (/^\d+$/.test(limpio)) return Number(limpio);
  const fecha = Date.parse(limpio);
  if (Number.isNaN(fecha)) return null;
  return Math.max(0, Math.ceil((fecha - ahora) / 1000));
}
