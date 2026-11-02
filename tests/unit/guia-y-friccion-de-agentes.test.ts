/**
 * Guía por operación y fricción de agentes (ideas de Harness², del lado backend)
 * ============================================================================
 *
 *   · `guia` en `defineOperacion`: un ejemplo que no valida contra los
 *     esquemas de la operación se rechaza AL DECLARARLA (una guía que enseña a
 *     fallar es peor que ninguna).
 *   · La herramienta MCP lleva lo corto de la guía en su descripción y apunta
 *     al recurso `kitsuden://guia/<herramienta>`; OpenAPI la publica en
 *     `x-kitsuden-guia`.
 *   · `resumirLlamada` guarda los NOMBRES de los argumentos, nunca sus valores.
 *   · `informeDeFriccion` agrega por herramienta y dice qué cambiar.
 */

import { defineOperacion } from "@kitsuden/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { informeDeFriccion, resumirLlamada } from "../../apps/api/src/lib/friccion-de-agentes";
import { herramientaMcp, operacionOpenApi } from "../../apps/api/src/lib/operaciones-openapi";

const base = {
  id: "crear-cosa",
  metodo: "POST" as const,
  ruta: "/:grupo/cosas",
  resumen: "Create a thing",
  descripcion: "Creates a thing in a group.",
  acceso: "sesion" as const,
  entrada: {
    params: z.object({ grupo: z.guid() }),
    cuerpo: z.object({ nombre: z.string().min(1), cuando: z.string().datetime().optional() }),
  },
  salida: { estado: 201 as const, esquema: z.object({ id: z.string() }) },
  manejar: () => ({ id: "x" }),
};

const GRUPO = "3f2a8c1e-8b7d-4c1e-9a2b-1c2d3e4f5a6b";

describe("guia en defineOperacion", () => {
  it("acepta ejemplos que validan", () => {
    expect(() =>
      defineOperacion({
        ...base,
        guia: {
          cuandoUsar: "To create one.",
          ejemplos: [
            { titulo: "mínimo", argumentos: { grupo: GRUPO, body: { nombre: "a" }, idempotency_key: "clave-0001" } },
          ],
        },
      })
    ).not.toThrow();
  });

  it("rechaza un ejemplo con el cuerpo mal", () => {
    expect(() =>
      defineOperacion({
        ...base,
        guia: { ejemplos: [{ titulo: "malo", argumentos: { grupo: GRUPO, body: { name: "a" } } }] },
      })
    ).toThrow(/ejemplo «malo» no valida: nombre/);
  });

  it("rechaza un ejemplo sin el parámetro del camino", () => {
    expect(() =>
      defineOperacion({ ...base, guia: { ejemplos: [{ titulo: "sin grupo", argumentos: { body: { nombre: "a" } } }] } })
    ).toThrow(/falta 'grupo'/);
  });

  it("rechaza claves de query en una operación sin query", () => {
    expect(() =>
      defineOperacion({
        ...base,
        guia: { ejemplos: [{ titulo: "query", argumentos: { grupo: GRUPO, body: { nombre: "a" }, limite: 3 } }] },
      })
    ).toThrow(/no tiene query/);
  });

  it("rechaza idempotency_key en una operación ya idempotente", () => {
    expect(() =>
      defineOperacion({
        ...base,
        metodo: "PUT",
        guia: {
          ejemplos: [{ titulo: "put", argumentos: { grupo: GRUPO, body: { nombre: "a" }, idempotency_key: "clave-0001" } }],
        },
      })
    ).toThrow(/sobra idempotency_key/);
  });

  it("rechaza trampas vacías", () => {
    expect(() => defineOperacion({ ...base, guia: { trampas: [{ si: " ", entonces: "x" }] } })).toThrow(/vacía/);
  });
});

describe("la guía llega a MCP y a OpenAPI", () => {
  const op = defineOperacion({
    ...base,
    guia: {
      cuandoUsar: "To create one; to rename use cosas__editar-cosa.",
      antes: ["grupo comes from cosas__listar-grupos."],
      trampas: [{ si: "you send `name`", entonces: "send `nombre`." }],
    },
  });

  it("descripción de la herramienta: lo corto y la URI del recurso", () => {
    const h = herramientaMcp("kon-cosas", "/api/cosas", op)!;
    expect(h.description).toContain("When to use: To create one; to rename use cosas__editar-cosa.");
    expect(h.description).toContain("Before: grupo comes from cosas__listar-grupos.");
    expect(h.description).toContain("kitsuden://guia/cosas__crear-cosa");
    // Las trampas no inflan tools/list: van en el recurso
    expect(h.description).not.toContain("you send `name`");
  });

  it("sin guía, la descripción no cambia de forma", () => {
    const h = herramientaMcp("kon-cosas", "/api/cosas", defineOperacion(base))!;
    expect(h.description).not.toContain("When to use");
    expect(h.description).not.toContain("kitsuden://guia/");
  });

  it("OpenAPI: x-kitsuden-guia", () => {
    const { operacion } = operacionOpenApi("kon-cosas", "/api/cosas", op);
    expect(operacion["x-kitsuden-guia"]).toEqual(op.guia);
  });
});

describe("resumirLlamada", () => {
  it("un error de validación MCP: código y claves inventadas, sin valores", () => {
    const r = resumirLlamada(
      {
        jsonrpc: "2.0",
        id: 1,
        result: {
          isError: true,
          structuredContent: { code: "KITSUDEN_E_VALIDATION", unknownKeys: ["tags"], validKeys: ["body"] },
        },
      },
      { tags: ["secreto"], body: { password: "no-guardar" } }
    );
    expect(r).toEqual({
      exito: false,
      codigo: "KITSUDEN_E_VALIDATION",
      repetida: false,
      propuesta: false,
      clavesDesconocidas: ["tags"],
      argumentos: ["body", "tags"],
    });
    expect(JSON.stringify(r)).not.toContain("no-guardar");
  });

  it("error JSON-RPC: el código va en error.data", () => {
    const r = resumirLlamada(
      { jsonrpc: "2.0", id: 1, error: { code: -32602, message: "x", data: { code: "KITSUDEN_E_FORBIDDEN" } } },
      {}
    );
    expect(r.exito).toBe(false);
    expect(r.codigo).toBe("KITSUDEN_E_FORBIDDEN");
  });

  it("éxito, repetición y propuesta", () => {
    expect(resumirLlamada({ result: { structuredContent: { status: 201, idempotentReplayed: true } } }, {})).toMatchObject({
      exito: true,
      repetida: true,
    });
    expect(
      resumirLlamada({ result: { structuredContent: { code: "KITSUDEN_E_APPROVAL_REQUIRED", status: 202 } } }, {})
    ).toMatchObject({ exito: true, propuesta: true });
  });
});

describe("informeDeFriccion", () => {
  const llamada = (herramienta: string, exito: boolean, details: Record<string, unknown> = {}, agentId = "a1") => ({
    herramienta,
    agentId,
    exito,
    details,
  });

  it("agrega por herramienta y ordena por fallos", () => {
    const filas = [
      llamada("blog__crear-entrada", false, { codigo: "KITSUDEN_E_VALIDATION", clavesDesconocidas: ["tags"] }),
      llamada("blog__crear-entrada", false, { codigo: "KITSUDEN_E_VALIDATION", clavesDesconocidas: ["tags"] }, "a2"),
      llamada("blog__crear-entrada", true),
      llamada("blog__listar-entradas", true),
    ];
    const [primera, segunda] = informeDeFriccion(filas, new Map(), { conGuia: new Set(["blog__listar-entradas"]) });
    expect(primera).toMatchObject({
      herramienta: "blog__crear-entrada",
      llamadas: 3,
      fallos: 2,
      agentes: 2,
      porCodigo: { KITSUDEN_E_VALIDATION: 2 },
      clavesInventadas: { tags: 2 },
      tieneGuia: false,
    });
    expect(primera!.senales.map((s) => s.tipo)).toEqual(["claves-inventadas", "sin-guia"]);
    expect(primera!.senales[0]!.mensaje).toContain("'tags' (2)");
    expect(segunda).toMatchObject({ herramienta: "blog__listar-entradas", fallos: 0, senales: [] });
  });

  it("no juzga tasas con pocas llamadas", () => {
    const filas = [llamada("x__y", false, { codigo: "KITSUDEN_E_NOT_FOUND" })];
    expect(informeDeFriccion(filas)[0]!.senales).toEqual([]);
  });

  it("señala ids que no existen y permisos con muestra suficiente", () => {
    const filas = [
      ...Array.from({ length: 3 }, () => llamada("x__y", false, { codigo: "KITSUDEN_E_NOT_FOUND" })),
      ...Array.from({ length: 2 }, () => llamada("x__y", false, { codigo: "KITSUDEN_E_FORBIDDEN" })),
      ...Array.from({ length: 5 }, () => llamada("x__y", true)),
    ];
    const tipos = informeDeFriccion(filas)[0]!.senales.map((s) => s.tipo);
    expect(tipos).toEqual(["permiso", "no-encontrado"]);
  });

  it("propuestas rechazadas, aunque la herramienta no tenga llamadas en el periodo", () => {
    const filas = [llamada("blog__borrar-entrada", true, { propuesta: true })];
    const [f] = informeDeFriccion(filas, new Map([["blog__borrar-entrada", 1]]));
    expect(f).toMatchObject({ propuestas: 1, propuestasRechazadas: 1 });
    expect(f!.senales.map((s) => s.tipo)).toEqual(["rechazos"]);
  });
});
