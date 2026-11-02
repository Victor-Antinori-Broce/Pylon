/**
 * GraphQL — Seguridad de rutas (regresión del hueco de auth)
 * ============================================================================
 * Antes de este fix, POST /api/graphql no tenía NINGÚN middleware de auth y
 * los resolvers usaban la db global (saltándose RLS).
 *
 * Guardias ESTÁTICAS sobre el código fuente: deterministas e inmunes al
 * leakage de mock.module entre archivos de la suite de bun (los checks
 * runtime de 401 viven en src/tests/graphql-security-http.test.ts, que
 * requiere servidor + DB reales).
 */

import { describe, expect, test } from "bun:test";

const source = await Bun.file(`${import.meta.dir}/../routes/graphql.ts`).text();

describe("GraphQL route security (guardias estáticas)", () => {
  test("POST / lleva protectRoute + withTransactionalRLS", () => {
    expect(source).toMatch(
      /graphqlRoutes\.post\(\s*"\/",\s*protectRoute,\s*withTransactionalRLS\(\)/
    );
  });

  test("GET /schema lleva protectRoute", () => {
    expect(source).toMatch(/graphqlRoutes\.get\("\/schema",\s*protectRoute/);
  });

  test("POST /invalidate lleva protectRoute + requireAdmin", () => {
    expect(source).toMatch(/graphqlRoutes\.post\("\/invalidate",\s*protectRoute,\s*requireAdmin/);
  });

  test("resolvers no referencian la db global directamente", () => {
    // Todo acceso a datos en resolvers debe pasar por exec() (request-scope →
    // tx RLS). Solo el build de schema (listado de dataSets para generar
    // tipos) puede usar `db.` global, marcado con el comentario.
    const rawDbUses = source
      .split("\n")
      .filter((line) =>
        /\bawait db\.|^\s+db\s*$|^\s+db\.(select|insert|update|delete)\(/.test(line)
      )
      .filter((line) => !line.includes("build de schema"));
    expect(rawDbUses).toEqual([]);
  });

  test("el helper exec() usa resolveExecutor (RLS por request-scope)", () => {
    expect(source).toContain("resolveExecutor(db)");
  });
});
