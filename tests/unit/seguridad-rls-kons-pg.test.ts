/**
 * RLS de kon-payments, kon-ecommerce y kon-academy-lms en Postgres DE VERDAD
 * ============================================================================
 *
 * PGlite corre como superusuario y se salta RLS, así que estas comprobaciones
 * solo valen contra un Postgres real con un rol SIN superusuario ni BYPASSRLS
 * (como `kitsuden_app` en producción). Se ejecutan si existen:
 *
 *   SEG_PG_ADMIN_URL  — superusuario, para sembrar datos
 *   SEG_PG_APP_URL    — rol de aplicación (NOSUPERUSER NOBYPASSRLS)
 *
 * sobre una base con TODAS las migraciones aplicadas
 * (`bun run scripts/migrate.ts --todos-los-kons`). Sin ellas, se omiten.
 *
 * Lo que demuestran:
 *   · Con el contexto de la petición (el que fija el anfitrión para todo kon
 *     desde 2026-10-23; antes, `comoUsuario` dentro de kon-payments) la BASE
 *     solo devuelve las filas del usuario aunque la consulta no filtre: el
 *     aislamiento no depende de acordarse del WHERE.
 *   · Los pedidos de la tienda (email, dirección) no los lee una cuenta
 *     corriente con contexto RLS; sí el equipo; y el alta anónima sigue
 *     funcionando sin contexto.
 *   · El progreso de la academia queda aislado por usuario con contexto.
 */

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";


const ADMIN_URL = process.env.SEG_PG_ADMIN_URL;
const APP_URL = process.env.SEG_PG_APP_URL;

describe.skipIf(!ADMIN_URL || !APP_URL)("RLS de los kons contra Postgres real", () => {
  let admin: pg.Pool;
  let appPool: pg.Pool;

  /** Una consulta como la app, con (o sin) contexto RLS de transacción. */
  async function comoApp<T = Record<string, unknown>>(
    consulta: string,
    contexto?: { id: string; role: string }
  ): Promise<T[]> {
    const c = await appPool.connect();
    try {
      await c.query("BEGIN");
      if (contexto) {
        await c.query(
          "SELECT set_config('app.current_user_id', $1, true), set_config('app.current_user_role', $2, true)",
          [contexto.id, contexto.role]
        );
      }
      const r = await c.query(consulta);
      await c.query("COMMIT");
      return r.rows as T[];
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL, max: 2 });
    appPool = new pg.Pool({ connectionString: APP_URL, max: 4 });

    // El rol de la app NO puede ser superusuario ni saltarse RLS: si lo fuera,
    // todo lo de abajo pasaría por casualidad.
    const [rol] = (
      await appPool.query(
        "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user"
      )
    ).rows;
    expect(rol).toEqual({ rolsuper: false, rolbypassrls: false });

    await admin.query(`
      DELETE FROM pay_subscriptions WHERE user_id IN ('rls-ana','rls-bea');
      INSERT INTO pay_subscriptions (user_id, provider, external_id, status) VALUES
        ('rls-ana', 'stripe', 'sub_rls_ana', 'active'),
        ('rls-bea', 'stripe', 'sub_rls_bea', 'active');

      DELETE FROM shop_order_items WHERE order_id = 'rls-pedido';
      DELETE FROM shop_orders WHERE id = 'rls-pedido';
      INSERT INTO shop_orders (id, number, fulfillment_type, customer_email, shipping_address)
        VALUES ('rls-pedido', 'RLS-000001', 'shipping', 'cliente@ejemplo.com', '{"line1":"Calle 1"}');

      DELETE FROM progreso_cursos WHERE user_id IN ('rls-ana','rls-bea');
      DELETE FROM cursos WHERE id = 'rls-curso';
      INSERT INTO cursos (id, titulo, descripcion) VALUES ('rls-curso', 'RLS', 'x');
      INSERT INTO progreso_cursos (id, user_id, curso_id) VALUES
        ('rls-pc1', 'rls-ana', 'rls-curso'), ('rls-pc2', 'rls-bea', 'rls-curso');
    `);
  });

  afterAll(async () => {
    await admin?.end();
    await appPool?.end();
  });

  it("payments: con el contexto de la petición la base solo devuelve lo del usuario, sin WHERE", async () => {
    const filas = await comoApp<{ user_id: string }>("SELECT user_id FROM pay_subscriptions", {
      id: "rls-bea",
      role: "user",
    });
    const deLasDos = filas.filter((f) => f.user_id === "rls-ana" || f.user_id === "rls-bea");
    expect(deLasDos.map((f) => f.user_id)).toEqual(["rls-bea"]);
  });

  it("payments: con contexto de otra cuenta no se puede escribir una fila ajena", async () => {
    await expect(
      comoApp(
        "INSERT INTO pay_subscriptions (user_id, provider, external_id, status) VALUES ('rls-ana','stripe','sub_rls_falsa','active')",
        { id: "rls-bea", role: "" }
      )
    ).rejects.toThrow(/row-level security/i);
  });

  it("tienda: una cuenta corriente con contexto no lee pedidos; el equipo sí", async () => {
    const q = "SELECT id FROM shop_orders WHERE id = 'rls-pedido'";
    expect(await comoApp(q, { id: "u-cualquiera", role: "user" })).toHaveLength(0);
    // El anónimo de una petición (id '', rol `anonymous`) NO es el sistema
    // (kon-ecommerce/0003).
    expect(await comoApp(q, { id: "", role: "anonymous" })).toHaveLength(0);
    expect(await comoApp(q, { id: "u-editora", role: "editor" })).toHaveLength(1);
    expect(await comoApp(q, { id: "u-admin", role: "admin" })).toHaveLength(1);
  });

  it("tienda: sin contexto (alta anónima del pedido, workers) sigue funcionando", async () => {
    expect(await comoApp("SELECT id FROM shop_orders WHERE id = 'rls-pedido'")).toHaveLength(1);
  });

  it("academia: el progreso de otra persona no se ve con contexto", async () => {
    const filas = await comoApp<{ user_id: string }>(
      "SELECT user_id FROM progreso_cursos WHERE curso_id = 'rls-curso'",
      { id: "rls-ana", role: "user" }
    );
    expect(filas.map((f) => f.user_id)).toEqual(["rls-ana"]);
  });

  it("academia: el índice que sostiene ON CONFLICT de certificados existe", async () => {
    const r = await admin.query(
      "SELECT 1 FROM pg_indexes WHERE indexname = 'certificados_usuario_curso'"
    );
    expect(r.rows).toHaveLength(1);
  });
});
