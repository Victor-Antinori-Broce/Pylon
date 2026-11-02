import { describe, it, expect, beforeEach } from "bun:test";

import { parse as parseTron } from "@tron-format/tron";
import { Hono } from "hono";

import { olvidarFormas, UMBRAL_MINIMO } from "../lib/formatos";
import { decodeToon, toonMiddleware, TOON_MIME, TRON_MIME, AUTO_MIME } from "../lib/toon";

/**
 * Negociación de formato en /api/* con una app Hono de verdad (no un contexto
 * simulado): lo que importa es lo que recibe el cliente.
 */

const LISTA_PLANA = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, slug: `etiqueta-${i + 1}`, name: `Etiqueta ${i + 1}` }));
// Objetos repetidos con arrays dentro: TOON cae a la forma de lista, TRON los declara como clase.
const ANIDADA = {
  docs: Array.from({ length: 20 }, (_, i) => ({
    id: `e${i}`,
    title: `Entrada ${i}`,
    data: { skills: [`s${i}`, `t${i}`], stats: { atk: i, def: i * 2 } },
    tags: ["a", "b"],
  })),
  totalDocs: 20,
};

function app(cuerpo: unknown, estado = 200) {
  const a = new Hono();
  a.use("/api/*", async (c, next) => {
    await next();
    c.header("X-De-Fuera", "sigue"); // como CORS: puesta por otra capa
  });
  a.use("/api/*", toonMiddleware());
  a.get("/api/cosa", (c) => {
    c.header("Cache-Control", "public, max-age=60");
    return c.json(cuerpo as object, estado as 200);
  });
  return a;
}

async function pedir(cuerpo: unknown, opciones: { accept?: string; query?: string; estado?: number } = {}) {
  const res = await app(cuerpo, opciones.estado).request(`/api/cosa${opciones.query ?? ""}`, {
    headers: opciones.accept ? { accept: opciones.accept } : {},
  });
  return { res, texto: await res.text() };
}

beforeEach(() => olvidarFormas());

describe("sin pedir nada, o pidiendo JSON: la respuesta no cambia", () => {
  it("sin Accept ni ?format: JSON tal cual, sin cabecera de formato", async () => {
    const { res, texto } = await pedir(LISTA_PLANA);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("x-kitsuden-format")).toBeNull();
    expect(JSON.parse(texto)).toEqual(LISTA_PLANA);
  });

  it("Accept: application/json gana a ?format=toon / tron / auto (panel, Inti y webs)", async () => {
    for (const q of ["?format=toon", "?format=tron", "?format=auto"]) {
      const { res, texto } = await pedir(LISTA_PLANA, { accept: "application/json", query: q });
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(JSON.parse(texto)).toEqual(LISTA_PLANA);
    }
  });

  it("los errores no se codifican", async () => {
    const { res, texto } = await pedir({ error: "x" }, { accept: TOON_MIME, estado: 404 });
    expect(res.status).toBe(404);
    expect(JSON.parse(texto)).toEqual({ error: "x" });
  });
});

describe("TOON / TRON pedidos", () => {
  it("Accept: application/vnd.toon → TOON, y se lee de vuelta igual", async () => {
    const { res, texto } = await pedir(LISTA_PLANA, { accept: TOON_MIME });
    expect(res.headers.get("content-type")).toBe(TOON_MIME);
    expect(res.headers.get("x-kitsuden-format")).toBe("toon");
    expect(texto.startsWith("[30]{id,slug,name}:")).toBe(true);
    expect(decodeToon(texto)).toEqual(LISTA_PLANA);
  });

  it("no tira las claves hermanas de `data` (el `view` de una tier list, `profile`)", async () => {
    // Antes encodeTOON desenvolvía { data } y perdía todo lo demás.
    const cuerpo = { data: { slug: "aniimo", tiers: [{ id: "S" }, { id: "A" }] }, view: { filas: [["a", "b"]] }, profile: null };
    const { texto } = await pedir(cuerpo, { query: "?format=toon" });
    expect(decodeToon(texto)).toEqual(cuerpo);
  });

  it("Accept: application/vnd.tron → TRON", async () => {
    const { res, texto } = await pedir(ANIDADA, { accept: TRON_MIME });
    expect(res.headers.get("content-type")).toBe(TRON_MIME);
    expect(res.headers.get("x-kitsuden-format")).toBe("tron");
    expect(texto.startsWith("class A:")).toBe(true);
    expect(parseTron(texto)).toEqual(ANIDADA);
  });

  it("si TRON no puede representar los datos, responde JSON y lo dice", async () => {
    // TRON 0.1.3 escribe sin comillas una propiedad llamada `null` y luego no la sabe leer.
    const cuerpo = [{ null: 1, b: 2 }, { null: 3, b: 4 }];
    const { res, texto } = await pedir(cuerpo, { accept: TRON_MIME });
    expect(res.headers.get("x-kitsuden-format")).toBe("json");
    expect(JSON.parse(texto)).toEqual(cuerpo);
  });

  it("conserva las cabeceras de las otras capas y añade Vary: Accept", async () => {
    const { res } = await pedir(LISTA_PLANA, { accept: TOON_MIME });
    expect(res.headers.get("x-de-fuera")).toBe("sigue");
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    expect(res.headers.get("vary")).toContain("Accept");
  });
});

describe("auto: el más corto que no pierde nada", () => {
  it("lista plana → TOON", async () => {
    const { res, texto } = await pedir(LISTA_PLANA, { accept: AUTO_MIME });
    expect(res.headers.get("x-kitsuden-format")).toBe("toon");
    expect(decodeToon(texto)).toEqual(LISTA_PLANA);
  });

  it("objetos repetidos y anidados → TRON", async () => {
    const { res, texto } = await pedir(ANIDADA, { query: "?format=auto" });
    expect(res.headers.get("x-kitsuden-format")).toBe("tron");
    expect(parseTron(texto)).toEqual(ANIDADA);
  });

  it("respuesta pequeña → JSON", async () => {
    const cuerpo = { ok: true, id: "x" };
    expect(JSON.stringify(cuerpo).length).toBeLessThan(UMBRAL_MINIMO);
    const { res, texto } = await pedir(cuerpo, { accept: AUTO_MIME });
    expect(res.headers.get("x-kitsuden-format")).toBe("json");
    expect(JSON.parse(texto)).toEqual(cuerpo);
  });

  it("formats=\"json,toon\" limita los candidatos (un cliente sin TRON)", async () => {
    const { res } = await pedir(ANIDADA, { accept: `${AUTO_MIME}; formats="json,toon"` });
    expect(["json", "toon"]).toContain(res.headers.get("x-kitsuden-format")!);
  });
});
