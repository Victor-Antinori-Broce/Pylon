/**
 * Los errores del MCP (`/api/mcp`) con los mismos campos que la API REST
 * ============================================================================
 *
 * El MCP es JSON-RPC: sus errores no pueden ser `application/problem+json`
 * (el cliente MCP espera un objeto JSON-RPC). Pero un agente que usa las dos
 * vías tiene que poder ramificar igual. Así que el MISMO problema
 * (`code: KITSUDEN_E_*`, `retryable`, `retry_after`, `hint`, `docs`…) va:
 *
 *   - en un error JSON-RPC: en `error.data` (el sitio que JSON-RPC 2.0 reserva
 *     para información adicional). `error.code` y `error.message` no cambian;
 *   - en el resultado de una herramienta que falla (`isError: true`): en
 *     `structuredContent`, y resumido en el texto, que es lo que lee el modelo.
 *
 * Puro (sin base ni Hono) para poder probarlo aislado.
 */
import {
  buildProblem,
  errorCodeForStatus,
  errorCodeFromLegacy,
  type KitsudenErrorCode,
  type ProblemDetails,
} from "@kitsuden/shared";

const INSTANCIA = "/api/mcp";

/** Código JSON-RPC → código del catálogo cuando no se dice otro. */
function codigoDeJsonRpc(codigo: number): KitsudenErrorCode {
  switch (codigo) {
    case -32700: // parse error
    case -32600: // invalid request
      return "KITSUDEN_E_BAD_REQUEST";
    case -32601: // method not found
    case -32002: // resource not found (MCP)
      return "KITSUDEN_E_NOT_FOUND";
    case -32602: // invalid params
      return "KITSUDEN_E_VALIDATION";
    case -32603:
      return "KITSUDEN_E_INTERNAL";
    default:
      return "KITSUDEN_E_BAD_REQUEST";
  }
}

export function problemaMcp(
  code: KitsudenErrorCode,
  detail: string,
  extra: { requestId?: string | null; hint?: string } = {}
): ProblemDetails {
  return buildProblem({
    code,
    detail,
    instance: INSTANCIA,
    requestId: extra.requestId,
    hint: extra.hint,
  });
}

/** Error JSON-RPC con el problema en `error.data`. */
export function errorJsonRpc(
  codigoRpc: number,
  mensaje: string,
  id: string | number | null,
  code?: KitsudenErrorCode,
  extra: { requestId?: string | null; hint?: string } = {}
) {
  return {
    jsonrpc: "2.0" as const,
    error: {
      code: codigoRpc,
      message: mensaje,
      data: problemaMcp(code ?? codigoDeJsonRpc(codigoRpc), mensaje, extra),
    },
    id,
  };
}

/** Problema para una excepción lanzada dentro de una herramienta. */
export function problemaDeExcepcion(err: unknown, mensaje: string): ProblemDetails {
  const e = err as { code?: unknown; status?: unknown; statusCode?: unknown };
  const status =
    typeof e?.status === "number"
      ? e.status
      : typeof e?.statusCode === "number"
        ? e.statusCode
        : 500;
  const code =
    errorCodeFromLegacy(e?.code) ??
    (status === 500 ? codigoPorMensaje(mensaje) : null) ??
    errorCodeForStatus(status);
  return problemaMcp(code, mensaje);
}

/**
 * Las herramientas del núcleo (services/mcp-tools.ts) lanzan `Error` a secas
 * con mensajes fijos. Sin esto, «herramienta desconocida» o «te falta un
 * scope» saldrían como INTERNAL y un agente los reintentaría.
 */
function codigoPorMensaje(mensaje: string): KitsudenErrorCode | null {
  if (/^Unknown (hardcoded )?MCP tool|^Tool not found/i.test(mensaje)) return "KITSUDEN_E_NOT_FOUND";
  if (/^Argumentos inválidos|^Invalid arguments/i.test(mensaje)) return "KITSUDEN_E_VALIDATION";
  if (/lacks required scope/i.test(mensaje)) return "KITSUDEN_E_FORBIDDEN";
  return null;
}

/** Resultado de herramienta fallida (`isError: true`) con el problema. */
export function resultadoDeError(problema: ProblemDetails) {
  return {
    content: [{ type: "text" as const, text: textoDelProblema(problema) }],
    structuredContent: problema,
    isError: true as const,
  };
}

/**
 * Lo que lee el modelo: el motivo y, en una línea JSON, los campos para
 * decidir (reintentar o no, cuánto esperar, qué hacer).
 */
export function textoDelProblema(problema: ProblemDetails): string {
  const resumen = {
    code: problema.code,
    status: problema.status,
    retryable: problema.retryable,
    retry_after: problema.retry_after,
    hint: problema.hint,
    docs: problema.docs,
  };
  return `Error: ${problema.detail}\n${JSON.stringify(resumen)}`;
}

/**
 * Un resultado de herramienta que ya venía con `isError: true` (las acciones
 * del engine devuelven `Error: …` en texto): se le añade el problema sin
 * tocar el texto original.
 */
export function conProblema<T extends { isError?: boolean; content?: unknown[] }>(
  resultado: T,
  code: KitsudenErrorCode = "KITSUDEN_E_BAD_REQUEST"
): T {
  if (!resultado?.isError || (resultado as { structuredContent?: unknown }).structuredContent) {
    return resultado;
  }
  const primero = (resultado.content ?? [])[0] as { type?: string; text?: string } | undefined;
  const detalle = (primero?.text ?? "").replace(/^Error:\s*/, "") || "Tool failed";
  const problema = problemaMcp(code, detalle);
  return {
    ...resultado,
    content: [
      ...(resultado.content ?? []),
      { type: "text", text: textoDelProblema(problema).split("\n").slice(1).join("\n") },
    ],
    structuredContent: problema,
  };
}
