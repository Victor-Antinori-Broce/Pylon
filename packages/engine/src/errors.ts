/**
 * Kitsuden — Uniform Error Envelope
 * ============================================================================
 *
 * Cierra el gap "manejo de errores uniforme (envelope + códigos consistentes)".
 * Un solo tipo `AppError` con código estable + un formateador que produce SIEMPRE
 * la misma forma de respuesta. Lo consumen la validación (FormRequest), la capa
 * de Policies/Gates y el `onError` global.
 *
 * Forma de la respuesta de error (estable, correlada con la traza):
 *   {
 *     "error": { "code": "FORBIDDEN", "message": "...", "details"?: {...} },
 *     "requestId": "...", "traceId": "..."
 *   }
 */

import type { Context } from "hono";

// ── Catálogo de códigos (estables, machine-readable) ──────────────────────────

export const ErrorCode = {
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION: "VALIDATION",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

const CODE_STATUS: Record<ErrorCodeValue, number> = {
  BAD_REQUEST: 400,
  VALIDATION: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

// ── AppError ──────────────────────────────────────────────────────────────────

export class AppError extends Error {
  readonly code: ErrorCodeValue;
  readonly status: number;
  readonly details?: unknown;
  /** true = seguro exponer el message al cliente aunque sea 5xx (raro). */
  readonly expose: boolean;

  constructor(
    code: ErrorCodeValue,
    message: string,
    options: { details?: unknown; status?: number; expose?: boolean } = {}
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? CODE_STATUS[code];
    this.details = options.details;
    this.expose = options.expose ?? this.status < 500;
  }

  // Helpers ergonómicos (Laravel/Nestits-style abort helpers).
  static badRequest(message = "Bad request", details?: unknown) {
    return new AppError(ErrorCode.BAD_REQUEST, message, { details });
  }
  static validation(message = "Validation failed", details?: unknown) {
    return new AppError(ErrorCode.VALIDATION, message, { details });
  }
  static unauthenticated(message = "Authentication required") {
    return new AppError(ErrorCode.UNAUTHENTICATED, message);
  }
  static forbidden(message = "Forbidden", details?: unknown) {
    return new AppError(ErrorCode.FORBIDDEN, message, { details });
  }
  static notFound(message = "Not found", details?: unknown) {
    return new AppError(ErrorCode.NOT_FOUND, message, { details });
  }
  static conflict(message = "Conflict", details?: unknown) {
    return new AppError(ErrorCode.CONFLICT, message, { details });
  }
  static internal(message = "Internal server error") {
    return new AppError(ErrorCode.INTERNAL, message, { expose: false });
  }
}

// ── Serialización ─────────────────────────────────────────────────────────────

export interface ErrorEnvelope {
  error: { code: ErrorCodeValue; message: string; details?: unknown };
  requestId?: string;
  traceId?: string;
}

/**
 * Convierte cualquier error a un envelope uniforme. Errores desconocidos se
 * tratan como INTERNAL y NO exponen su message en producción.
 */
/**
 * Saca un mensaje legible de cualquier cosa que se haya lanzado.
 *
 * Existe para que los `catch` puedan tipar como `unknown` —que es lo correcto,
 * porque en JavaScript se puede lanzar un número— sin que cada uno tenga que
 * repetir la comprobación. La alternativa era `catch (e: any)`, que apaga el
 * comprobador justo en el camino de error, donde menos se prueba y más caro
 * sale equivocarse.
 *
 * Recorre `cause` porque los drivers envuelven: el error de Postgres suele
 * llegar con `message` vacío y el motivo real un nivel más abajo.
 */
export function messageOf(err: unknown, porDefecto = "Unknown error"): string {
  const visto = new Set<unknown>();

  for (let cur: unknown = err; cur && !visto.has(cur); cur = (cur as { cause?: unknown }).cause) {
    visto.add(cur);
    if (typeof cur === "string" && cur.trim()) return cur;
    const m = (cur as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }

  return porDefecto;
}

/**
 * ¿Es esto un `AppError`, venga de donde venga?
 *
 * ── POR QUE NO BASTA `instanceof` ──────────────────────────────────────────
 *
 * La API se sirve EMPAQUETADA (`dist/index.js`, con el engine dentro), y los
 * kons se importan en RUNTIME desde su propio fichero. Cada import carga el
 * engine otra vez, así que hay dos objetos `AppError` distintos en memoria: el
 * de dentro del bundle y el que ve el kon. `instanceof` compara identidad de
 * clase y da `false` entre ellos.
 *
 * Consecuencia medida en la instalación real: `validateRequest` de un kon
 * rechazaba una petición con `AppError(VALIDATION)` —que sabe que es un 422— y
 * el manejador global no lo reconocía, así que caía al camino genérico y
 * respondía **500**. La pantalla de MOBA enseñaba «HTTP 500» por un cuerpo mal
 * formado: un error del cliente disfrazado de servidor caído.
 *
 * Y es un fallo de PRODUCCION otra vez: en desarrollo todo se importa desde el
 * mismo sitio, hay una sola clase, y el `instanceof` acierta.
 *
 * Se comprueba por FORMA, no por identidad: un objeto con `code` conocido y
 * `status` numérico es un `AppError` a todos los efectos. `instanceof` se
 * mantiene primero porque es exacto cuando coincide.
 */
function esAppError(err: unknown): err is AppError {
  if (err instanceof AppError) return true;

  const e = err as { code?: unknown; status?: unknown; name?: unknown };
  return (
    typeof e?.status === "number" &&
    typeof e?.code === "string" &&
    Object.prototype.hasOwnProperty.call(CODE_STATUS, e.code)
  );
}

function codigoPorEstado(status: number): ErrorCodeValue {
  if (status >= 500) return ErrorCode.INTERNAL;
  switch (status) {
    case 401:
      return ErrorCode.UNAUTHENTICATED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 422:
      return ErrorCode.VALIDATION;
    case 429:
      return ErrorCode.RATE_LIMITED;
    default:
      return ErrorCode.BAD_REQUEST;
  }
}

/**
 * El SQLSTATE de un error de Postgres, buscándolo en la cadena de `cause`
 * (Drizzle lo envuelve en «Failed query: …» y deja el de `pg` dentro).
 */
export function sqlstateDe(err: unknown): string | null {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * Un error de Postgres que es culpa de la ENTRADA, no del servidor: el estado
 * y un mensaje sin la consulta. Schemathesis (2026-10-26) encontró una docena
 * de 500 que eran esto: texto con U+0000, un `0` donde va un uuid, un número
 * fuera de rango, un duplicado.
 */
export function errorDeEntradaDePostgres(
  err: unknown
): { status: number; code: ErrorCodeValue; message: string } | null {
  const estado = sqlstateDe(err);
  if (!estado) return null;
  if (estado.startsWith("22")) {
    return {
      status: 400,
      code: ErrorCode.BAD_REQUEST,
      message: "Un valor no tiene el formato o el rango que admite.",
    };
  }
  if (estado === "23505")
    return {
      status: 409,
      code: ErrorCode.CONFLICT,
      message: "Ya existe un registro con ese valor único.",
    };
  if (estado === "23503")
    return {
      status: 409,
      code: ErrorCode.CONFLICT,
      message: "Hace referencia a un registro que no existe.",
    };
  if (estado === "23502" || estado === "23514") {
    return {
      status: 422,
      code: ErrorCode.VALIDATION,
      message: "Falta un valor obligatorio o no cumple una restricción.",
    };
  }
  return null;
}

export function toErrorEnvelope(
  err: unknown,
  ctx: { requestId?: string; traceId?: string; isDev?: boolean }
): { envelope: ErrorEnvelope; status: number } {
  const deEntrada = esAppError(err) ? null : errorDeEntradaDePostgres(err);
  if (deEntrada) {
    return {
      status: deEntrada.status,
      envelope: {
        error: { code: deEntrada.code, message: deEntrada.message },
        requestId: ctx.requestId,
        traceId: ctx.traceId,
      },
    };
  }
  if (esAppError(err)) {
    return {
      status: err.status,
      envelope: {
        error: {
          code: err.code,
          message: err.expose ? err.message : "Internal server error",
          details: err.details,
        },
        requestId: ctx.requestId,
        traceId: ctx.traceId,
      },
    };
  }

  // Error con .status (p.ej. HTTPException de Hono) o .statusCode (`KonError`
  // de @kitsuden/shared: antes salía como 500 aunque dijera 404).
  const conEstado = err as { status?: unknown; statusCode?: unknown };
  const candidato =
    typeof conEstado?.status === "number"
      ? conEstado.status
      : typeof conEstado?.statusCode === "number"
        ? conEstado.statusCode
        : 500;
  const status = candidato >= 400 && candidato <= 599 ? candidato : 500;
  const message = err instanceof Error ? err.message : "Internal server error";

  return {
    status,
    envelope: {
      error: {
        // El código sale del estado: un 404 de HTTPException es NOT_FOUND, no
        // BAD_REQUEST (los clientes y el catálogo KITSUDEN_E_* ramifican por él).
        code: codigoPorEstado(status),
        message: status >= 500 && !ctx.isDev ? "Internal server error" : message,
      },
      requestId: ctx.requestId,
      traceId: ctx.traceId,
    },
  };
}

/** Escribe el envelope en la respuesta Hono. */
export function respondError(c: Context, err: unknown): Response {
  // La clave va en una variable a proposito: `bun build` sustituye la expresion
  // literal `process.env.NODE_ENV` por su valor AL COMPILAR, y en la imagen de
  // produccion eso la congelaba como "development" (mensajes de 500 al cliente).
  const clave = "NODE_ENV";
  const isDev = (process.env[clave] ?? "development") === "development";
  const { envelope, status } = toErrorEnvelope(err, {
    requestId: c.get("requestId"),
    traceId: c.get("traceId"),
    isDev,
  });
  return c.json(envelope, status as 400);
}
