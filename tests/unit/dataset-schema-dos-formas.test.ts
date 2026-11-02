/**
 * Un dataset sirve a todos sus lectores, tenga el `schema` que tenga
 * ============================================================================
 *
 * ── LO QUE HABÍA ───────────────────────────────────────────────────────────
 *
 * `data_sets.schema` se escribía con dos formas —una lista de campos y un
 * objeto `{fields}`— y cada lector esperaba solo una. Con una lista, la
 * importación masiva reventaba en `schema.fields.map` y la rejilla pública
 * pintaba cero columnas; con `{fields}`, la validación y los catálogos de los
 * kons no veían ningún campo. Ningún dataset servía para todo.
 *
 * Y un campo `image` solo validaba un uuid de la mediateca, mientras que todos
 * los que lo pintan (tier lists, catálogos, la rejilla) solo sabían pintar
 * URLs: un catálogo con imágenes externas no podía ni guardarse.
 */

import { buildFieldValidator } from "@kitsuden/engine";
import { camposDelSchema, readDatasetCatalog } from "@kitsuden/shared";
import { describe, expect, it } from "vitest";

const CAMPOS = [
  { key: "nombre", type: "text", isRequired: true },
  { key: "vida", type: "number" },
  { key: "retrato", type: "image" },
];

describe("las dos formas de `schema`", () => {
  it("una lista y un `{fields}` dan los mismos campos", () => {
    expect(camposDelSchema(CAMPOS)).toEqual(CAMPOS);
    expect(camposDelSchema({ fields: CAMPOS })).toEqual(CAMPOS);
  });

  it("lo que no es un schema da cero campos, no una excepción", () => {
    for (const raro of [null, undefined, "texto", 42, {}, { fields: "no" }]) {
      expect(camposDelSchema(raro)).toEqual([]);
    }
    expect(camposDelSchema([null, "x", { key: "ok" }])).toEqual([{ key: "ok" }]);
  });

  it("la validación exige lo mismo con cualquiera de las dos", () => {
    for (const schema of [CAMPOS, { fields: CAMPOS }]) {
      const v = buildFieldValidator(schema);
      expect(v.safeParse({ nombre: "Ignis", vida: 90 }).success).toBe(true);
      // Si `{fields}` no se desenvolviera, el requerido no se exigiría
      expect(v.safeParse({ vida: 90 }).success).toBe(false);
      expect(v.safeParse({ nombre: "Ignis", vida: "90" }).success).toBe(false);
    }
  });

  it("el catálogo de los kons encuentra el campo de imagen con `{fields}`", async () => {
    const filas = [
      [
        {
          id: "ds",
          name: "Aniidex",
          schema: { fields: CAMPOS },
          policy_json: { readAccess: "public" },
        },
      ],
      [{ id: "e1", title: "Ignis", data: { retrato: "https://cdn.example/ignis.png" } }],
    ];
    const db = { execute: async () => filas.shift() };

    const catalogo = await readDatasetCatalog(db, "ds", null as never);

    expect(catalogo?.fields.map((f) => f.key)).toEqual(["nombre", "vida", "retrato"]);
    expect(catalogo?.imageField).toBe("retrato");
    expect(catalogo?.fieldOfType("number")).toBe("vida");
  });
});

describe("un campo de imagen acepta un medio o una URL", () => {
  const v = buildFieldValidator([{ key: "retrato", type: "image" }]);
  const acepta = (valor: unknown) => v.safeParse({ retrato: valor }).success;

  it("el id de la mediateca sigue valiendo", () => {
    expect(acepta("3f1c1d7e-2b8a-4c55-9d0e-6a7b8c9d0e1f")).toBe(true);
  });

  it("una URL http(s) también", () => {
    expect(acepta("https://worldx-website-cdn.aniimo.com/a/ignis.png")).toBe(true);
    expect(acepta("http://localhost:3000/api/media/x")).toBe(true);
  });

  it("pero no cualquier cosa que parezca una URL", () => {
    // Este valor acaba en un `src` o un `href`
    expect(acepta("javascript:alert(1)")).toBe(false);
    expect(acepta("data:image/svg+xml,<svg onload=alert(1)>")).toBe(false);
    expect(acepta("ignis.png")).toBe(false);
    expect(acepta(42)).toBe(false);
  });

  it("`media` sigue la misma regla", () => {
    const m = buildFieldValidator([{ key: "ficha", type: "media" }]);
    expect(m.safeParse({ ficha: "https://example.com/ficha.pdf" }).success).toBe(true);
    expect(m.safeParse({ ficha: "javascript:alert(1)" }).success).toBe(false);
  });

  it("un campo `url` tampoco acepta `javascript:`", () => {
    // Se pinta como enlace en la rejilla pública
    const u = buildFieldValidator([{ key: "web", type: "url" }]);
    expect(u.safeParse({ web: "https://wiki.aniimo.com" }).success).toBe(true);
    expect(u.safeParse({ web: "javascript:alert(1)" }).success).toBe(false);
  });

  it("una relación sigue exigiendo un uuid", () => {
    // `mediaRef` es una familia NUEVA justamente para no relajar `uuid`
    const r = buildFieldValidator([{ key: "padre", type: "relation" }]);
    expect(r.safeParse({ padre: "https://example.com" }).success).toBe(false);
  });
});
