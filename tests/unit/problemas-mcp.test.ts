/**
 * Errores del MCP con los mismos campos que la API REST
 * ============================================================================
 *
 * El MCP es JSON-RPC: el problema va en `error.data` (errores de protocolo) o
 * en `structuredContent` + el texto (herramienta que falla). La prueba contra
 * la ruta real `/api/mcp` (con base y sesión SSE) está en
 * apps/api/src/tests/mcp.test.ts.
 */

import { KITSUDEN_ERRORS } from "@kitsuden/shared";
import { describe, expect, it } from "vitest";

import {
  conProblema,
  errorJsonRpc,
  problemaDeExcepcion,
  resultadoDeError,
} from "../../apps/api/src/lib/problemas-mcp";

const CAMPOS = ["type", "title", "status", "detail", "code", "retryable", "retry_after", "hint", "docs", "error"];

describe("errores JSON-RPC", () => {
  it("error.code y error.message no cambian; el problema va en error.data", () => {
    const r = errorJsonRpc(-32601, "Method not found: x", 7);
    expect(r).toMatchObject({ jsonrpc: "2.0", id: 7, error: { code: -32601, message: "Method not found: x" } });
    for (const c of CAMPOS) expect(r.error.data, c).toHaveProperty(c);
    expect(r.error.data.code).toBe("KITSUDEN_E_NOT_FOUND");
    expect(r.error.data.instance).toBe("/api/mcp");
  });

  it("cada código JSON-RPC estándar tiene su código del catálogo", () => {
    expect(errorJsonRpc(-32602, "x", 1).error.data.code).toBe("KITSUDEN_E_VALIDATION");
    expect(errorJsonRpc(-32603, "x", 1).error.data.code).toBe("KITSUDEN_E_INTERNAL");
    expect(errorJsonRpc(-32700, "x", null).error.data.code).toBe("KITSUDEN_E_BAD_REQUEST");
    expect(errorJsonRpc(-32002, "x", 1).error.data.code).toBe("KITSUDEN_E_NOT_FOUND");
    expect(errorJsonRpc(-32000, "x", null, "KITSUDEN_E_FORBIDDEN").error.data).toMatchObject({
      code: "KITSUDEN_E_FORBIDDEN",
      status: 403,
    });
  });
});

describe("herramientas que fallan (isError)", () => {
  it("una excepción: structuredContent con el problema y el texto con code/retryable", () => {
    const r = resultadoDeError(problemaDeExcepcion(new Error("Unknown hardcoded MCP tool: foo"), "Unknown hardcoded MCP tool: foo"));
    expect(r.isError).toBe(true);
    expect(r.structuredContent.code).toBe("KITSUDEN_E_NOT_FOUND");
    expect(r.content[0]!.text).toMatch(/^Error: Unknown hardcoded MCP tool: foo\n\{/);
    const resumen = JSON.parse(r.content[0]!.text.split("\n")[1]!);
    expect(resumen).toMatchObject({ code: "KITSUDEN_E_NOT_FOUND", retryable: false, retry_after: null });
  });

  it("los mensajes fijos de las herramientas del núcleo no salen como INTERNAL", () => {
    const de = (m: string) => problemaDeExcepcion(new Error(m), m).code;
    expect(de("Argumentos inválidos para 'x' — limit: Expected number")).toBe("KITSUDEN_E_VALIDATION");
    expect(de("Agent lacks required scope 'admin' to execute tool 'x'")).toBe("KITSUDEN_E_FORBIDDEN");
    expect(de("algo raro")).toBe("KITSUDEN_E_INTERNAL");
    // Un AppError (o cualquier cosa con status/código) manda sobre el mensaje
    expect(problemaDeExcepcion({ status: 429, code: "RATE_LIMITED", message: "x" }, "x")).toMatchObject({
      code: "KITSUDEN_E_RATE_LIMITED",
      retryable: true,
      retry_after: KITSUDEN_ERRORS.KITSUDEN_E_RATE_LIMITED.retryAfter,
    });
  });

  it("un resultado de acción con isError recibe el problema sin perder su texto", () => {
    const r = conProblema({ content: [{ type: "text", text: "Error: sin stock" }], isError: true });
    expect(r.content[0]).toEqual({ type: "text", text: "Error: sin stock" });
    expect((r as unknown as { structuredContent: { detail: string } }).structuredContent.detail).toBe("sin stock");
    // Un resultado correcto no se toca
    const ok = { content: [{ type: "text", text: "{}" }], isError: false };
    expect(conProblema(ok)).toBe(ok);
  });
});
