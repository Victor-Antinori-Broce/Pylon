/**
 * Huella del contexto de decisión — qué vio exactamente quien firmó
 * ============================================================================
 *
 * `canonizar` da una forma estable (claves ordenadas, sin `undefined`) y
 * `huellaDeContextoDeDecision` la fija con sha-256: el mismo contexto, la
 * misma huella; un byte distinto, huella distinta.
 */
import { canonizar, huellaDeContextoDeDecision } from "@kitsuden/shared";
import { describe, expect, it } from "vitest";

describe("canonizar", () => {
  it("ordena las claves y omite los undefined", () => {
    expect(canonizar({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonizar({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it("los números no finitos van a null", () => {
    expect(canonizar({ x: NaN, y: Infinity })).toBe('{"x":null,"y":null}');
  });

  it("los arrays conservan el orden (importa) y anida objetos", () => {
    expect(canonizar([{ b: 1, a: 2 }, 3])).toBe('[{"a":2,"b":1},3]');
    expect(canonizar([1, 2])).not.toBe(canonizar([2, 1]));
  });
});

describe("huellaDeContextoDeDecision", () => {
  const contexto = {
    method: "PATCH",
    path: "/api/kons/blog/entradas/1",
    tool: null,
    operationKey: "kon:blog:editar-entrada",
    body: { titulo: "Nuevo título" },
    diff: { kind: "update", changes: [{ field: "titulo", before: "Viejo", after: "Nuevo" }] },
    files: [{ field: "cover", filename: "foto.png", sha256: "abc123", size: 42 }],
    scopes: ["mcp:connect", "kon:blog:*"],
  };

  it("es estable para el mismo contexto y distinta para uno distinto", async () => {
    const h1 = await huellaDeContextoDeDecision(contexto);
    const h2 = await huellaDeContextoDeDecision({ ...contexto, body: { titulo: "Otro" } });
    const h3 = await huellaDeContextoDeDecision({
      ...contexto,
      // El ORDEN de las claves del cuerpo no cambia la huella.
      body: { titulo: "Nuevo título" },
      diff: {
        kind: "update",
        changes: [{ after: "Nuevo", before: "Viejo", field: "titulo" }],
      },
    });
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(h3);
    expect(h1).not.toBe(h2);
  });

  it("los ficheros forman parte del contexto (tamper-evident)", async () => {
    const h1 = await huellaDeContextoDeDecision(contexto);
    const h2 = await huellaDeContextoDeDecision({
      ...contexto,
      files: [{ field: "cover", filename: "foto.png", sha256: "OTRO", size: 42 }],
    });
    expect(h1).not.toBe(h2);
  });
});
