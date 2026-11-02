/**
 * Redirecciones en `salida.estado` / `otrosEstados`
 * ============================================================================
 *
 * La descarga de dms (302), el código corto (307), el slug viejo (308) y el
 * clic del boletín (302) respondían una redirección que el OpenAPI no
 * publicaba: la salida decía 200 `text/plain`. Una redirección no es un
 * error (no lleva código del catálogo); se declara como estado de salida, sin
 * cuerpo y con su `Location`.
 */

import { defineOperacion, type KonContext } from "@kitsuden/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { operacionOpenApi } from "../../apps/api/src/lib/operaciones-openapi";
import { routerDeOperaciones } from "../../packages/engine/src/operaciones";

const base = {
  id: "abrir-cosa",
  metodo: "GET" as const,
  ruta: "/cosas/:id",
  resumen: "Open a thing",
  descripcion: "Redirects to where the thing lives.",
  acceso: "publico" as const,
  entrada: { params: z.object({ id: z.string() }) },
};

type Respuestas = Record<string, { content?: unknown; headers?: Record<string, unknown> }>;

describe("redirecciones", () => {
  it("un 302 se publica sin cuerpo y con Location", () => {
    const op = defineOperacion({
      ...base,
      salida: { estado: 302, descripcion: "Redirect to the file" },
      manejar: () => new Response(null, { status: 302, headers: { Location: "/x" } }),
    });
    const r = operacionOpenApi("kon-cosas", "/api/cosas", op).operacion.responses as Respuestas;
    expect(r["302"]?.content).toBeUndefined();
    expect(r["302"]?.headers?.Location).toBeDefined();
    expect(r["200"]).toBeUndefined();
  });

  it("un 308 en otrosEstados convive con el 200 de la lectura", () => {
    const op = defineOperacion({
      ...base,
      salida: { esquema: z.object({ id: z.string() }), otrosEstados: [308] },
      manejar: () => ({ id: "x" }),
    });
    const r = operacionOpenApi("kon-cosas", "/api/cosas", op).operacion.responses as Respuestas;
    expect(r["200"]?.content).toBeDefined();
    expect(r["308"]?.content).toBeUndefined();
    expect(r["308"]?.headers?.Location).toBeDefined();
  });

  it("rechaza un esquema en una redirección", () => {
    expect(() =>
      defineOperacion({
        ...base,
        salida: { estado: 307, esquema: z.object({}) },
        manejar: () => ({}),
      })
    ).toThrow(/redirección/);
  });

  it("el handler que devuelve la Response la sirve tal cual", async () => {
    const op = defineOperacion({
      ...base,
      salida: { estado: 307 },
      manejar: () => new Response(null, { status: 307, headers: { Location: "/y" } }),
    });
    const app = routerDeOperaciones("kon-cosas", [op], { auth: {} } as unknown as KonContext);
    const res = await app.request("/cosas/1");
    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe("/y");
  });

  it("un handler que devuelve datos en una redirección es un fallo del kon, no un 200", async () => {
    const op = defineOperacion({
      ...base,
      salida: { estado: 302 },
      manejar: () => ({ url: "/z" }) as never,
    });
    const app = routerDeOperaciones("kon-cosas", [op], { auth: {} } as unknown as KonContext);
    const res = await app.request("/cosas/1");
    expect(res.status).toBe(500);
  });
});
