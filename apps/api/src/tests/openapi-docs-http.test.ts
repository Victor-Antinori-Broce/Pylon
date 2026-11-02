/**
 * GET /api/docs/openapi.json y /api/docs.
 *
 * Un dataset con `schema = {}` (o con la forma `{fields: [...]}`) tumbaba el
 * documento entero: el agregador hacía `for (const field of ds.schema || [])`
 * y respondía 500 «{} is not iterable». Ahora lee los campos con
 * `camposDelSchema`, y el documento tiene que salir completo y coherente.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";

import { db } from "../db";

import { isDatabaseAvailable, generateTestId } from "./setup";

let dbAvailable = false;
let app: { request: (r: Request | string) => Promise<Response> };
const sufijo = generateTestId().toLowerCase().replace(/[^a-z0-9]/g, "");
const slugs = {
  vacio: `openapi-vacio-${sufijo}`,
  fields: `openapi-fields-${sufijo}`,
  lista: `openapi-lista-${sufijo}`,
};

/** Todas las `$ref` locales del documento apuntan a algo que existe. */
function refsRotas(doc: Record<string, any>): string[] {
  const rotas: string[] = [];
  const visitar = (nodo: unknown) => {
    if (!nodo || typeof nodo !== "object") return;
    if (Array.isArray(nodo)) return nodo.forEach(visitar);
    for (const [k, v] of Object.entries(nodo)) {
      if (k === "$ref" && typeof v === "string" && v.startsWith("#/")) {
        let destino: any = doc;
        for (const parte of v.slice(2).split("/")) destino = destino?.[parte];
        if (destino === undefined) rotas.push(v);
      } else visitar(v);
    }
  };
  visitar(doc);
  return rotas;
}

describe("OpenAPI", () => {
  beforeAll(async () => {
    app = (await import("../index")).app as never;
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) return;
    await db.execute(sql`
      INSERT INTO data_sets (name, slug, schema) VALUES
        (${"OpenAPI vacío"}, ${slugs.vacio}, '{}'::jsonb),
        (${"OpenAPI fields"}, ${slugs.fields},
          '{"fields":[{"name":"titulo","type":"text","required":true}]}'::jsonb),
        (${"OpenAPI lista"}, ${slugs.lista}, '[{"fieldName":"precio","fieldType":"number"}]'::jsonb)
    `);
    // Montar la app con todos los kons tarda más que el límite por defecto.
  }, 60_000);

  afterAll(async () => {
    if (!dbAvailable) return;
    await db.execute(
      sql`DELETE FROM data_sets WHERE slug IN (${slugs.vacio}, ${slugs.fields}, ${slugs.lista})`
    );
  });

  it("GET /api/docs/openapi.json devuelve un documento OpenAPI 3 válido", async () => {
    const res = await app.request("http://localhost:3000/api/docs/openapi.json");
    expect(res.status).toBe(200);
    const doc = (await res.json()) as Record<string, any>;

    expect(doc.openapi).toMatch(/^3\.\d+\.\d+$/);
    expect(typeof doc.info?.title).toBe("string");
    expect(typeof doc.info?.version).toBe("string");
    expect(doc.paths && typeof doc.paths).toBe("object");

    for (const [camino, item] of Object.entries(doc.paths as Record<string, any>)) {
      expect(camino.startsWith("/")).toBe(true);
      for (const [metodo, op] of Object.entries(item as Record<string, any>)) {
        if (!["get", "post", "put", "patch", "delete"].includes(metodo)) continue;
        expect(op.responses && Object.keys(op.responses).length > 0).toBe(true);
      }
    }
    expect(refsRotas(doc)).toEqual([]);

    if (!dbAvailable) return;
    const esquemas = doc.components.schemas as Record<string, any>;
    expect(esquemas[`Dataset_${slugs.vacio}`]?.required).toEqual(["id"]);
    expect(esquemas[`Dataset_${slugs.fields}`]?.properties?.titulo).toEqual({ type: "string" });
    expect(esquemas[`Dataset_${slugs.fields}`]?.required).toContain("titulo");
    expect(esquemas[`Dataset_${slugs.lista}`]?.properties?.precio).toEqual({ type: "number" });
  });

  it("GET /api/docs sirve la interfaz HTML", async () => {
    const res = await app.request("http://localhost:3000/api/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("/api/docs/openapi.json");
  });
});
