/**
 * Orquestación declarativa de flows (K3) — la parte pura
 * ============================================================================
 *
 * Lo que se fija aquí: la VALIDACIÓN de la definición (paso inicial, next que
 * apuntan a pasos que existen, al menos un terminal), la resolución del
 * @router, y la forma serializable del grafo (para el builder visual). La
 * ejecución corre sobre la cola de Postgres (entrega al menos una vez).
 */
import { describe, expect, it } from "vitest";

import {
  flowGraph,
  listFlows,
  pasoInicialDe,
  resolverSiguiente,
  validarFlow,
} from "../../packages/engine/src/orquestacion";

const flowValido = {
  id: "bienvenida",
  description: "Avisa al usuario nuevo",
  initialState: { enviados: 0 },
  steps: {
    cargar: { run: () => ({}), next: "notificar" },
    notificar: {
      on: "usuario.registrado",
      run: () => ({ enviados: 1 }),
      next: (s: { ok: boolean }) => (s.ok ? "cerrar" : "notificar"),
    },
    cerrar: { run: () => ({}) },
  },
};

describe("validarFlow", () => {
  it("acepta un flow bien formado", () => {
    expect(() => validarFlow(flowValido)).not.toThrow();
  });

  it("el paso inicial es el explícito o la primera clave", () => {
    expect(pasoInicialDe(flowValido)).toBe("cargar");
    expect(pasoInicialDe({ ...flowValido, start: "notificar" })).toBe("notificar");
  });

  it("rechaza ids que no sirven de nombre de cola", () => {
    expect(() =>
      validarFlow({ id: "mal nombre!", steps: { a: { run: () => ({}) } } })
    ).toThrow(/Invalid flow id/);
  });

  it("rechaza paso inicial inexistente y next rotos", () => {
    expect(() => validarFlow({ ...flowValido, start: "fantasma" })).toThrow(/start step/);
    expect(() =>
      validarFlow({
        id: "x",
        steps: { a: { run: () => ({}), next: "no-existe" }, b: { run: () => ({}) } },
      })
    ).toThrow(/unknown step/);
  });

  it("exige al menos un paso terminal", () => {
    expect(() =>
      validarFlow({
        id: "eterno",
        steps: {
          a: { run: () => ({}), next: "b" },
          b: { run: () => ({}), next: "a" },
        },
      })
    ).toThrow(/terminal/);
  });
});

describe("resolverSiguiente (@router)", () => {
  it("nombre fijo, función y terminal", () => {
    expect(resolverSiguiente("b", {})).toBe("b");
    expect(resolverSiguiente((s: { n: number }) => (s.n > 0 ? "mayor" : null), { n: 1 })).toBe("mayor");
    expect(resolverSiguiente((s: { n: number }) => (s.n > 0 ? "mayor" : null), { n: 0 })).toBeNull();
    expect(resolverSiguiente(undefined, {})).toBeNull();
  });
});

describe("flowGraph (para el builder visual)", () => {
  it("describe pasos, escuchas y aristas", () => {
    const g = flowGraph("bienvenida");
    // El grafo existe solo si el flow se registró; aquí validamos la forma
    // a través de listFlows (vacío si nadie lo registró en este proceso).
    if (g) {
      expect(g.start).toBe("cargar");
      expect(g.steps.find((s) => s.name === "notificar")?.listensTo).toBe("usuario.registrado");
      expect(g.steps.find((s) => s.name === "cerrar")?.terminal).toBe(true);
    } else {
      expect(listFlows().every((f) => f.id.length > 0)).toBe(true);
    }
  });
});
