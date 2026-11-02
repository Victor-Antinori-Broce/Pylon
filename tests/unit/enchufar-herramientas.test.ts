import { describe, expect, it } from "vitest";

import {
  conBuilders,
  conCamposDeCasilla,
  ENCHUFES,
  sinProximamente,
} from "../../apps/api/scripts/lib/enchufar-herramientas";

const BUILDERS = [{ slug: "cd-build", etiqueta: "Planificador de equipo" }];

describe("enchufar herramientas", () => {
  it("añade el builder detrás de las tier lists y renumera", () => {
    const bloques = [
      { id: "a", type: "tier-list", order: 0 },
      { id: "b", type: "smart-grid", order: 1 },
    ];
    const r = conBuilders(bloques, "crimson-desert", BUILDERS);
    expect(r.map((b) => b.type)).toEqual(["tier-list", "character-builder", "smart-grid"]);
    expect(r.map((b) => b.order)).toEqual([0, 1, 2]);
    expect(r[1].data).toEqual({ definitionSlug: "cd-build", etiqueta: "Planificador de equipo" });
  });

  it("ejecutarlo dos veces no cambia nada la segunda", () => {
    const una = conBuilders([], "crimson-desert", BUILDERS);
    expect(conBuilders(una, "crimson-desert", BUILDERS)).toBe(una);
  });

  it("corrige solo el idField de las casillas que se le piden", () => {
    const fila = { datasetId: "d", idField: "fila_id", statFields: {} };
    const definicion = {
      slots: [
        { id: "clase", optionsFrom: fila },
        { id: "arma", optionsFrom: { ...fila, idField: "arma_id" } },
      ],
    };
    const r = conCamposDeCasilla(definicion, { clase: "clase_id" });
    expect(r.slots[0].optionsFrom).toEqual({ ...fila, idField: "clase_id" });
    expect(r.slots[1].optionsFrom.idField).toBe("arma_id");
    expect(conCamposDeCasilla(r, { clase: "clase_id" })).toBe(r);
  });

  it("quita de próximamente solo lo que ya existe", () => {
    const specs = { proximamente: [{ etiqueta: "Mapa" }, { etiqueta: "Creador de personajes" }] };
    expect(sinProximamente(specs, ["Creador de personajes"]).proximamente).toEqual([{ etiqueta: "Mapa" }]);
    expect(sinProximamente(specs, ["Otra"])).toBe(specs);
  });

  it("no enchufa builders sin opciones ni repite juego", () => {
    const slugs = ENCHUFES.flatMap((e) => e.builders.map((b) => b.slug));
    expect(slugs).not.toContain("build-dragonsdogma2");
    expect(new Set(ENCHUFES.map((e) => e.juego)).size).toBe(ENCHUFES.length);
  });
});
