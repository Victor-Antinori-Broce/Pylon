/**
 * RLS de los datos personales de kon-members y kon-newsletter
 * ============================================================================
 *
 * Postgres de verdad (PGlite) y un rol SIN superusuario, como `kitsuden_app`
 * en producción: con superusuario las políticas no filtran nada y la prueba
 * sería decorativa (ver memoria rls-enforcement-caveats).
 *
 * El contexto se fija igual que `withTransactionalRLS()`: `set_config(…, true)`
 * dentro de una transacción, con `anonymous` para quien no tiene sesión.
 *
 * Revisión de seguridad del 2026-10-15.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

let pg: PGlite;

const leer = (ruta: string) =>
  readFileSync(resolve(__dirname, "../../packages/kons", ruta), "utf8");

/** Cuenta filas de `tabla` como lo haría una petición con ese contexto. */
async function contar(tabla: string, ctx: { id: string; role: string } | null): Promise<number> {
  await pg.exec("BEGIN; SET LOCAL ROLE app_prueba;");
  try {
    if (ctx) {
      await pg.query("SELECT set_config('app.current_user_id', $1, true)", [ctx.id]);
      await pg.query("SELECT set_config('app.current_user_role', $1, true)", [ctx.role]);
    }
    const r: any = await pg.query(`SELECT count(*)::int AS n FROM ${tabla}`);
    return r.rows[0].n;
  } finally {
    await pg.exec("ROLLBACK;");
  }
}

async function insertarComo(sqlTexto: string, ctx: { id: string; role: string }): Promise<boolean> {
  await pg.exec("BEGIN; SET LOCAL ROLE app_prueba;");
  try {
    await pg.query("SELECT set_config('app.current_user_id', $1, true)", [ctx.id]);
    await pg.query("SELECT set_config('app.current_user_role', $1, true)", [ctx.role]);
    await pg.exec(sqlTexto);
    return true;
  } catch {
    return false;
  } finally {
    await pg.exec("ROLLBACK;");
  }
}

const ANONIMO = { id: "", role: "anonymous" };
const USUARIO = { id: "u-cualquiera", role: "user" };
const EDITOR = { id: "u-editor", role: "editor" };
const ADMIN = { id: "u-admin", role: "admin" };

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(leer("kon-members/migrations/0001_members.sql"));
  await pg.exec(leer("kon-newsletter/migrations/0000_initial.sql"));

  // La política de PROPIEDAD que rls-owned-tables.sql pone en nl_members (por
  // user_id), tal cual: es la que dejaba pasar a un anónimo con contexto.
  await pg.exec(`
    ALTER TABLE nl_members ENABLE ROW LEVEL SECURITY;
    CREATE POLICY nl_members_owner_isolation ON nl_members FOR ALL TO PUBLIC
      USING (
        current_setting('app.current_user_id', true) = ''
        OR current_setting('app.current_user_id', true) IS NULL
        OR current_setting('app.current_user_role', true) = 'admin'
        OR user_id::text = current_setting('app.current_user_id', true)
      );
  `);

  await pg.exec(`
    INSERT INTO members (id, email) VALUES ('m1', 'lectora@example.com'), ('m2', 'otro@example.com');
    INSERT INTO member_sessions (id, member_id, token_hash, expires_at) VALUES ('s1', 'm1', 'h', now() + interval '1 day');
    INSERT INTO member_signins (id, member_id, token_hash, expires_at) VALUES ('g1', 'm1', 'h2', now() + interval '1 hour');
    INSERT INTO nl_members (email, status, unsub_token, user_id) VALUES ('sub@example.com', 'subscribed', 'tok', 'u-cualquiera');
    INSERT INTO nl_suppressions (email, reason) VALUES ('baja@example.com', 'unsubscribe');
  `);

  // Las migraciones nuevas, dos veces: tienen que ser idempotentes.
  for (let i = 0; i < 2; i++) {
    await pg.exec(leer("kon-members/migrations/0002_rls_datos_personales.sql"));
    await pg.exec(leer("kon-newsletter/migrations/0001_rls_datos_personales.sql"));
  }

  await pg.exec(`
    CREATE ROLE app_prueba NOLOGIN;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_prueba;
  `);
});

afterAll(async () => {
  await pg?.close();
});

describe("members: la base de correos", () => {
  test("el sistema (rutas del kon, sin contexto) lo ve todo", async () => {
    expect(await contar("members", null)).toBe(2);
    expect(await contar("member_sessions", null)).toBe(1);
  });

  test("una cuenta normal y un anónimo con contexto NO ven nada", async () => {
    expect(await contar("members", USUARIO)).toBe(0);
    expect(await contar("members", ANONIMO)).toBe(0);
    expect(await contar("member_access", USUARIO)).toBe(0);
  });

  test("el equipo ve los miembros pero NO las sesiones ni los enlaces", async () => {
    expect(await contar("members", EDITOR)).toBe(2);
    expect(await contar("members", ADMIN)).toBe(2);
    expect(await contar("member_sessions", ADMIN)).toBe(0);
    expect(await contar("member_signins", ADMIN)).toBe(0);
  });

  test("una cuenta normal no puede escribirse una sesión ni un acceso", async () => {
    expect(
      await insertarComo(
        "INSERT INTO member_sessions (id, member_id, token_hash, expires_at) VALUES ('s9', 'm2', 'x', now() + interval '1 day')",
        USUARIO
      )
    ).toBe(false);
    expect(
      await insertarComo(
        "INSERT INTO member_access (id, member_id, tier_id, source) VALUES ('a9', 'm2', 'tier_free', 'manual')",
        USUARIO
      )
    ).toBe(false);
  });
});

describe("newsletter: suscriptores, supresiones y tokens de baja", () => {
  test("el sistema lo ve todo", async () => {
    expect(await contar("nl_members", null)).toBe(1);
    expect(await contar("nl_suppressions", null)).toBe(1);
  });

  test("un anónimo con contexto ya NO atraviesa la política de propiedad", async () => {
    // Sin la restrictiva, `current_user_id = ''` abría nl_members entera.
    expect(await contar("nl_members", ANONIMO)).toBe(0);
    expect(await contar("nl_suppressions", ANONIMO)).toBe(0);
  });

  test("ni una cuenta normal (aunque la fila sea suya) ni el editor", async () => {
    expect(await contar("nl_members", USUARIO)).toBe(0);
    expect(await contar("nl_members", EDITOR)).toBe(0);
    expect(await contar("nl_deliveries", USUARIO)).toBe(0);
  });

  test("admin sí", async () => {
    expect(await contar("nl_members", ADMIN)).toBe(1);
  });
});
