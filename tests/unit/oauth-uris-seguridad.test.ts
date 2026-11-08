/**
 * OAuth: `resource` sin retroceso cuadrático (F16) y sin redirector abierto
 * en los errores de /authorize (F68). Funciones puras de lib/oauth/uris.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  LONGITUD_MAXIMA_DE_RECURSO,
  errorSePuedeRedirigir,
  motivoDeRedireccionInvalida,
  recursoPedido,
  sinBarrasFinales,
} from "../../apps/api/src/lib/oauth/uris";

const ISSUER = "https://api.ejemplo.test";
let previo: string | undefined;

beforeAll(() => {
  previo = process.env.OAUTH_ISSUER_URL;
  process.env.OAUTH_ISSUER_URL = ISSUER;
});
afterAll(() => {
  if (previo === undefined) delete process.env.OAUTH_ISSUER_URL;
  else process.env.OAUTH_ISSUER_URL = previo;
});

describe("recursoPedido (F16)", () => {
  it("acepta el recurso con o sin barras finales y rechaza otro", () => {
    expect(recursoPedido(`${ISSUER}/api/mcp`)).toEqual({ ok: true, recurso: `${ISSUER}/api/mcp` });
    expect(recursoPedido(`${ISSUER}/api/mcp///`)).toMatchObject({ ok: true });
    expect(recursoPedido("HTTPS://API.EJEMPLO.TEST/api/mcp/")).toMatchObject({ ok: true });
    expect(recursoPedido("https://evil.example/api/mcp")).toEqual({ ok: false });
    expect(recursoPedido(undefined)).toBeNull();
  });

  it("miles de barras no cuestan nada y un recurso enorme se rechaza sin parsear", () => {
    const inicio = performance.now();
    expect(recursoPedido(`${ISSUER}/${"/".repeat(15_000)}x`)).toEqual({ ok: false });
    expect(recursoPedido(`${ISSUER}/${"/".repeat(1_900)}x`)).toEqual({ ok: false });
    expect(sinBarrasFinales(`/a${"/".repeat(100_000)}`)).toBe("/a");
    expect(performance.now() - inicio).toBeLessThan(50);
    expect(recursoPedido(`${ISSUER}/api/mcp?${"a".repeat(LONGITUD_MAXIMA_DE_RECURSO)}`)).toEqual({ ok: false });
  });

  it("sinBarrasFinales", () => {
    expect(sinBarrasFinales("/api/mcp")).toBe("/api/mcp");
    expect(sinBarrasFinales("/api/mcp//")).toBe("/api/mcp");
    expect(sinBarrasFinales("///")).toBe("");
    expect(sinBarrasFinales("")).toBe("");
  });
});

describe("errores de /authorize (F68)", () => {
  it("solo se devuelven con 302 a loopback o a un cliente ya aprobado", () => {
    expect(errorSePuedeRedirigir("http://127.0.0.1:5000/callback", false)).toBe(true);
    expect(errorSePuedeRedirigir("http://localhost/cb", false)).toBe(true);
    expect(errorSePuedeRedirigir("https://evil.example/login", false)).toBe(false);
    expect(errorSePuedeRedirigir("cursor://anysphere.cursor-mcp/oauth/callback", false)).toBe(false);
    expect(errorSePuedeRedirigir("https://cliente.example/cb", true)).toBe(true);
    expect(errorSePuedeRedirigir("no es una url", false)).toBe(false);
  });

  it("el registro rechaza los manejadores peligrosos del sistema y deja los de clientes MCP", () => {
    for (const mala of ["ms-msdt:/id PCWDiagnostic", "ms-officecmd:x", "search-ms:query=x", "shell:startup", "mailto:a@b.c"]) {
      expect(motivoDeRedireccionInvalida(mala), mala).not.toBeNull();
    }
    for (const buena of ["cursor://anysphere.cursor-mcp/oauth/callback", "vscode://vscode.github-authentication/did-authenticate", "com.example.app:/cb", "http://127.0.0.1/callback", "https://cliente.example/cb"]) {
      expect(motivoDeRedireccionInvalida(buena), buena).toBeNull();
    }
  });
});
