/**
 * `salida.otrosEstados`: un upsert responde 201 al crear y 200 al reescribir
 * ============================================================================
 *
 * El SDK publicaba UN estado de éxito. `PUT /api/tierlist/templates` responde
 * los dos desde antes del SDK, y Schemathesis da por roto el que no figura en
 * el OpenAPI (`status_code_conformance`). `otrosEstados` lo publica con el
 * mismo cuerpo, sin cambiar lo que responde la ruta.
 */

import { defineOperacion } from "@kitsuden/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { operacionOpenApi } from "../../apps/api/src/lib/operaciones-openapi";

const base = {
  id: "guardar-cosa",
  metodo: "PUT" as const,
  ruta: "/cosas",
  resumen: "Upsert a thing",
  descripcion: "Creates (201) or rewrites (200) a thing by slug.",
  acceso: "sesion" as const,
  entrada: { cuerpo: z.object({ slug: z.string() }) },
  manejar: () => ({ id: "x" }),
};

const esquema = z.object({ id: z.string() });

describe("otrosEstados", () => {
  it("se publican en OpenAPI con el mismo cuerpo que el estado principal", () => {
    const op = defineOperacion({ ...base, salida: { esquema, otrosEstados: [201] } });
    const { operacion } = operacionOpenApi("kon-cosas", "/api/cosas", op);
    const respuestas = operacion.responses as Record<string, { content?: unknown }>;
    expect(respuestas["200"]?.content).toBeDefined();
    expect(respuestas["201"]?.content).toEqual(respuestas["200"]?.content);
  });

  it("sin declararlos, solo sale el principal", () => {
    const op = defineOperacion({ ...base, salida: { esquema } });
    const { operacion } = operacionOpenApi("kon-cosas", "/api/cosas", op);
    expect(Object.keys(operacion.responses as object)).not.toContain("201");
  });

  it("rechaza repetir el estado principal", () => {
    expect(() =>
      defineOperacion({ ...base, salida: { estado: 201, esquema, otrosEstados: [201] } })
    ).toThrow(/otrosEstados/);
  });

  it("rechaza combinarlos con un 204 (no hay cuerpo que compartir)", () => {
    expect(() =>
      defineOperacion({ ...base, salida: { estado: 204, otrosEstados: [200] } })
    ).toThrow(/otrosEstados/);
  });

  it("rechaza un estado que no es de éxito con cuerpo", () => {
    expect(() =>
      defineOperacion({
        ...base,
        salida: { esquema, otrosEstados: [204 as unknown as 200] },
      })
    ).toThrow(/otrosEstados/);
  });
});
