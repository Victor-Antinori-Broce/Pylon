/**
 * `GET /api/page-builder/pages/:id` acepta uuid O slug (lo usa Inti con
 * `@inti/adapter-kitsuden`). Comparar un slug («home») con la columna uuid
 * hacía fallar el cast en Postgres y la ruta respondía 500 en vez de 404.
 * Visto contra la API de producción el 2026-10-13.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const RUTAS = readFileSync(
  resolve(__dirname, "../../packages/core/blocks/blocks.routes.ts"),
  "utf8"
);
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("una página se pide por uuid o por slug", () => {
  it("solo un uuid se compara con la columna `id`", () => {
    // Sin espacios: Prettier parte la expresión en varias líneas según su largo
    const compacto = RUTAS.replace(/\s+/g, "");
    expect(compacto).toContain(
      "ES_UUID.test(id)?sql`${pages.id}=${id}OR${pages.slug}=${id}`:sql`${pages.slug}=${id}`"
    );
    expect(compacto).not.toContain(".where(sql`${pages.id}=${id}OR${pages.slug}=${id}`)");
  });

  it("la expresión distingue un uuid de un slug", () => {
    expect(ES_UUID.test("11111111-2222-3333-4444-555555555555")).toBe(true);
    for (const slug of ["home", "inicio", "11111111-2222-3333-4444", "x".repeat(36)]) {
      expect(ES_UUID.test(slug)).toBe(false);
    }
  });
});

describe("crear una página exige título", () => {
  it("sin `title` responde 400 en vez de reventar con 500", () => {
    expect(RUTAS).toContain('return c.json({ error: "Falta `title`" }, 400);');
  });
});
