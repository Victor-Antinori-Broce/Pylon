/**
 * CSRF: escrituras con cookie solo desde un origen nuestro (auditoría 2026-10-15).
 *
 * Antes, cualquier página de un sitio hermano (mismo dominio registrable, así
 * que `SameSite=Lax` sí manda la cookie) podía hacer un POST «simple» —sin
 * preflight— a la API con la sesión del visitante.
 */
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import {
  exigirOrigenEnEscrituras,
  origenDeEscrituraPermitido,
} from "../../apps/api/src/middleware/origen-de-escritura";

const PERMITIDOS = ["https://sitio.example", "https://panel.sitio.example"];

function app(conSesion: boolean) {
  const a = new Hono();
  a.use("*", async (c, next) => {
    if (conSesion) (c as any).set("session", { id: "s1" });
    await next();
  });
  a.use(
    "*",
    exigirOrigenEnEscrituras(() => PERMITIDOS)
  );
  a.all("*", (c) => c.text("hecho"));
  return a;
}

describe("origenDeEscrituraPermitido", () => {
  const base = { conCookie: true, permitidos: PERMITIDOS, host: "api.sitio.example" };

  it("lecturas: siempre", () => {
    expect(
      origenDeEscrituraPermitido({ ...base, metodo: "GET", origin: "https://evil.example" })
    ).toBe(true);
  });

  it("escritura sin cookie (agente con Bearer, SSR): no es CSRF", () => {
    expect(
      origenDeEscrituraPermitido({
        ...base,
        conCookie: false,
        metodo: "POST",
        origin: "https://evil.example",
      })
    ).toBe(true);
  });

  it("escritura con cookie desde otro origen: NO", () => {
    expect(
      origenDeEscrituraPermitido({ ...base, metodo: "POST", origin: "https://evil.example" })
    ).toBe(false);
    // un sitio hermano que no está en la lista: same-site para el navegador
    expect(
      origenDeEscrituraPermitido({
        ...base,
        metodo: "DELETE",
        origin: "https://wiki.sitio.example",
      })
    ).toBe(false);
    expect(origenDeEscrituraPermitido({ ...base, metodo: "POST", origin: "null" })).toBe(false);
    // el Referer cuenta si falta Origin
    expect(
      origenDeEscrituraPermitido({ ...base, metodo: "PATCH", referer: "https://evil.example/x?y" })
    ).toBe(false);
  });

  it("escritura con cookie desde un origen de la lista o desde el mismo host: sí", () => {
    expect(
      origenDeEscrituraPermitido({ ...base, metodo: "POST", origin: "https://sitio.example" })
    ).toBe(true);
    expect(
      origenDeEscrituraPermitido({ ...base, metodo: "POST", origin: "https://api.sitio.example" })
    ).toBe(true);
    // sin Origin ni Referer: cliente que no es navegador
    expect(origenDeEscrituraPermitido({ ...base, metodo: "POST" })).toBe(true);
  });
});

describe("exigirOrigenEnEscrituras (middleware)", () => {
  it("403 a un POST con sesión desde otro origen; 200 desde el nuestro", async () => {
    const malo = await app(true).request("http://api.sitio.example/api/comments", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "text/plain" },
      body: "x",
    });
    expect(malo.status).toBe(403);

    const bueno = await app(true).request("http://api.sitio.example/api/comments", {
      method: "POST",
      headers: { origin: "https://sitio.example" },
    });
    expect(bueno.status).toBe(200);
  });

  it("sin sesión no interviene (lo decide la autorización de la ruta)", async () => {
    const r = await app(false).request("http://api.sitio.example/api/comments", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect(r.status).toBe(200);
  });
});
