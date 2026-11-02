/**
 * Standard Schema from the API's JSON Schemas (kitsuden2.md G3): a client can
 * validate a body before sending it with any Standard Schema consumer.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { operationSchemas, toStandardSchema } from "../src/index";

const SPEC = JSON.parse(readFileSync(join(__dirname, "../openapi/kitsuden.openapi.json"), "utf8"));

async function validar(s: ReturnType<typeof toStandardSchema>, v: unknown) {
  return s["~standard"].validate(v);
}

describe("toStandardSchema", () => {
  const s = toStandardSchema({
    type: "object",
    properties: {
      name: { type: "string", minLength: 2, maxLength: 5 },
      n: { type: "integer", minimum: 1 },
      tags: { type: "array", items: { type: "string", enum: ["a", "b"] }, maxItems: 2 },
      mode: { anyOf: [{ const: "x" }, { type: "null" }] },
    },
    required: ["name"],
    additionalProperties: false,
  });

  it("implements the Standard Schema v1 contract", () => {
    expect(s["~standard"].version).toBe(1);
    expect(s["~standard"].vendor).toBe("kitsuden");
  });

  it("accepts a valid value and returns it", async () => {
    const r = await validar(s, { name: "ana", n: 3, tags: ["a"], mode: null });
    expect(r.issues).toBeUndefined();
    expect((r as { value: unknown }).value).toEqual({ name: "ana", n: 3, tags: ["a"], mode: null });
  });

  it("reports every issue with its path", async () => {
    const r = await validar(s, { n: 0.5, tags: ["a", "z", "b"], extra: 1, mode: "y" });
    const porRuta = Object.fromEntries((r.issues ?? []).map((i) => [(i.path ?? []).join("."), i.message]));
    expect(porRuta.name).toBe("is required");
    expect(porRuta.n).toMatch(/integer/);
    expect(porRuta["tags.1"]).toMatch(/one of/);
    expect(porRuta.tags).toMatch(/at most 2/);
    expect(porRuta.extra).toBe("is not allowed");
    expect(porRuta.mode).toMatch(/any/);
  });
});

describe("operationSchemas (the real OpenAPI)", () => {
  it("gives the body schema of an operation and validates with it", async () => {
    const { body } = operationSchemas(SPEC, "blog.crear-categoria");
    expect(body).not.toBeNull();
    expect((await validar(body!, { name: "News", slug: "news" })).issues).toBeUndefined();
    const mal = await validar(body!, { slug: 3 });
    expect((mal.issues ?? []).map((i) => (i.path ?? []).join("."))).toEqual(expect.arrayContaining(["name", "slug"]));
  });

  it("for a stream, the response schema is the one of each event", () => {
    const { response } = operationSchemas(SPEC, "propuestas.eventos-de-propuesta");
    expect(response).not.toBeNull();
  });

  it("an unknown operation throws", () => {
    expect(() => operationSchemas(SPEC, "nada.de-nada")).toThrow(/no operation/);
  });
});
