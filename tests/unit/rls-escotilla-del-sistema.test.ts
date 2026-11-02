/**
 * RLS del núcleo con Postgres de verdad (PGlite) y un rol SIN superusuario.
 * Auditoría 2026-10-15.
 *
 *  1. La escotilla «sin contexto = sistema» de `rls-owned-tables.sql` dejaba
 *     pasar al ANÓNIMO: `withTransactionalRLS()` le pone id '' (y rol
 *     'anonymous'), y la política solo miraba el id. Ahora exige rol vacío.
 *  2. `rls-solo-sistema.sql`: secretos, credenciales, auditoría y
 *     `auth_users` no se leen desde una transacción RLS sin ser admin (o la
 *     propia fila, en `auth_users`); los tokens de `auth_verifications`, ni
 *     siquiera admin.
 *
 * Se aplican los FICHEROS REALES, no una copia de la política.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

let pg: PGlite;
const leer = (f: string) => readFileSync(resolve(__dirname, "../../apps/api/src/db", f), "utf8");

type Ctx = { id: string; role: string } | null;
const ANONIMO: Ctx = { id: "", role: "anonymous" };
const ANA: Ctx = { id: "u-ana", role: "user" };
const ADMIN: Ctx = { id: "u-admin", role: "admin" };

async function contar(tabla: string, ctx: Ctx): Promise<number> {
  await pg.exec("BEGIN; SET LOCAL ROLE app_prueba;");
  try {
    if (ctx) {
      await pg.query("SELECT set_config('app.current_user_id', $1, true)", [ctx.id]);
      await pg.query("SELECT set_config('app.current_user_role', $1, true)", [ctx.role]);
    }
    const r = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${tabla}`);
    return r.rows[0]!.n;
  } finally {
    await pg.exec("ROLLBACK");
  }
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE builder_builds (id text PRIMARY KEY, owner_id text);
    CREATE TABLE auth_users (id text PRIMARY KEY, email text);
    CREATE TABLE auth_verifications (id text PRIMARY KEY, value text);
    CREATE TABLE data_sources (id text PRIMARY KEY, password text);
    CREATE TABLE kitsuden_secrets (id text PRIMARY KEY);
    INSERT INTO builder_builds VALUES ('b1', 'u-ana'), ('b2', 'u-otro');
    INSERT INTO auth_users VALUES ('u-ana', 'ana@example.com'), ('u-otro', 'otro@example.com');
    INSERT INTO auth_verifications VALUES ('v1', 'token-vivo');
    INSERT INTO data_sources VALUES ('d1', 'contraseña');
    INSERT INTO kitsuden_secrets VALUES ('s1');
  `);
  // Dos veces: idempotentes
  for (let i = 0; i < 2; i++) {
    await pg.exec(leer("rls-owned-tables.sql"));
    await pg.exec(leer("rls-solo-sistema.sql"));
  }
  await pg.exec(`
    CREATE ROLE app_prueba NOLOGIN;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_prueba;
  `);
});

afterAll(async () => {
  await pg?.close();
});

describe("escotilla de sistema (rls-owned-tables.sql)", () => {
  test("el anónimo con contexto NO ve filas ajenas (antes: todas)", async () => {
    expect(await contar("builder_builds", ANONIMO)).toBe(0);
  });

  test("sin contexto (sistema) sigue viéndolo todo; el dueño, lo suyo; admin, todo", async () => {
    expect(await contar("builder_builds", null)).toBe(2);
    expect(await contar("builder_builds", ANA)).toBe(1);
    expect(await contar("builder_builds", ADMIN)).toBe(2);
  });

  test("contexto limpiado a '' / '' (clearRLSContext) cuenta como sistema", async () => {
    expect(await contar("builder_builds", { id: "", role: "" })).toBe(2);
  });
});

describe("tablas del núcleo solo para sistema/admin (rls-solo-sistema.sql)", () => {
  test("un usuario o un anónimo no ven secretos ni credenciales", async () => {
    for (const ctx of [ANA, ANONIMO]) {
      expect(await contar("data_sources", ctx)).toBe(0);
      expect(await contar("kitsuden_secrets", ctx)).toBe(0);
    }
    expect(await contar("data_sources", ADMIN)).toBe(1);
    expect(await contar("data_sources", null)).toBe(1);
  });

  test("auth_users: la fila propia; admin y sistema, todas; anónimo, ninguna", async () => {
    expect(await contar("auth_users", ANA)).toBe(1);
    expect(await contar("auth_users", ADMIN)).toBe(2);
    expect(await contar("auth_users", null)).toBe(2);
    expect(await contar("auth_users", ANONIMO)).toBe(0);
  });

  test("auth_verifications: solo el sistema (ni admin)", async () => {
    expect(await contar("auth_verifications", ADMIN)).toBe(0);
    expect(await contar("auth_verifications", ANA)).toBe(0);
    expect(await contar("auth_verifications", null)).toBe(1);
  });
});
