/**
 * RLS Adversarial Tests — "El Muro de Titanio" bajo ataque
 * ============================================================================
 *
 * A diferencia de `rls.test.ts` (que solo verifica que set_config/current_setting
 * hacen round-trip) y de `rls-ownerId.test.ts` (que hace string-matching del
 * código fuente), esta suite ATACA la política RLS a nivel de PostgreSQL y
 * exige que el motor de base de datos filtre físicamente las filas.
 *
 * Modelo de amenaza cubierto:
 *   1. Usuario B intenta LEER datos del Usuario A (cross-tenant read).
 *   2. Usuario B intenta MODIFICAR / BORRAR filas del Usuario A.
 *   3. Usuario B intenta INSERTAR una fila spoofeando owner_id = A.
 *   4. Un query sin contexto RLS (owner_id vacío) ve TODO — la trampa que
 *      hace que la protección dependa por completo del middleware.
 *   5. Inyección SQL en el valor de app.current_user_id no rompe el aislamiento.
 *   6. La política public_read no filtra de más (no expone filas privadas).
 *   7. El rol admin ve todo (escape hatch intencional).
 *   8. El rol de conexión debe ser NON-SUPERUSER, o RLS queda anulado.
 *
 * PUNTO CRÍTICO (superusuarios):
 *   PostgreSQL IGNORA las políticas RLS para roles superuser o con BYPASSRLS,
 *   incluso con FORCE ROW LEVEL SECURITY. La imagen oficial de Postgres crea
 *   POSTGRES_USER como superusuario, así que si la app se conecta con ese rol
 *   el "Muro de Titanio" no filtra NADA. Para que estos tests midan la política
 *   real, ejecutamos las queries protegidas bajo un rol dedicado sin privilegios
 *   (`kitsuden_rls_test`) vía `SET LOCAL ROLE`. Esto además DOCUMENTA el requisito de
 *   producción: la app debe conectarse con un rol no-superusuario.
 *
 * Requiere PostgreSQL real (se salta con pg-mem). Levantar con:
 *   pnpm test:db:up  &&  KITSUDEN_TEST_DB=postgres bun test src/tests/rls-adversarial.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { sql, type SQL } from "drizzle-orm";

import { db } from "../db";

import { isDatabaseAvailable } from "./setup";

let dbAvailable = false;

// Rol sin privilegios bajo el que corren las queries "de aplicación".
const APP_ROLE = "kitsuden_rls_test";

// Identificadores únicos por corrida para no chocar con datos existentes.
const RUN = `adv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const USER_A = `${RUN}-user-a`;
const USER_B = `${RUN}-user-b`;
const OUTSIDER = `${RUN}-user-c`;
const DATASET_ID = crypto.randomUUID();

let entryAId = "";
let entryBId = "";
let entryPublicId = "";
let entryLegacyAId = ""; // owner_id NULL, data.ownerId = USER_A (registro legacy)

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Ejecuta `fn` dentro de una transacción, bajo el rol sin privilegios
 * `kitsuden_rls_test` y con el contexto RLS (`app.current_user_id` / `_role`)
 * inyectado. Refleja lo que hace `withTransactionalRLS()` pero garantizando
 * que RLS realmente aplica (rol no-superusuario).
 */
async function runAs<T>(
  userId: string | null,
  role: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE ${sql.raw(APP_ROLE)}`);
    await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId ?? ""}, true)`);
    await tx.execute(sql`SELECT set_config('app.current_user_role', ${role}, true)`);
    return fn(tx);
  });
}

/** SELECT de ids visibles en el dataset de prueba, bajo el contexto dado. */
async function visibleIdsAs(userId: string | null, role: string): Promise<string[]> {
  return runAs(userId, role, async (tx) => {
    const res = await tx.execute<{ id: string }>(
      sql`SELECT id FROM data_entries WHERE data_set_id = ${DATASET_ID}`
    );
    return (res.rows ?? []).map((r) => r.id);
  });
}

/** Ejecuta una mutación bajo contexto y devuelve el número de filas afectadas. */
async function mutateAs(userId: string | null, role: string, query: SQL): Promise<number> {
  return runAs(userId, role, async (tx) => {
    const res = await tx.execute(query);
    return (res as unknown as { rowCount: number | null }).rowCount ?? 0;
  });
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

describe("RLS Adversarial — Muro de Titanio", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) return;

    // 1. Aplicar las políticas RLS *reales* que ship en el repo. Se pre-borran
    //    las policies para que el archivo pueda re-ejecutarse de forma idempotente.
    await db.execute(sql`ALTER TABLE data_entries ENABLE ROW LEVEL SECURITY`);
    await db.execute(sql`ALTER TABLE data_entries FORCE ROW LEVEL SECURITY`);
    await db.execute(sql`DROP POLICY IF EXISTS data_entries_owner_isolation ON data_entries`);
    await db.execute(sql`DROP POLICY IF EXISTS data_entries_public_read ON data_entries`);
    await db.execute(
      sql`DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_memories') THEN
          EXECUTE 'DROP POLICY IF EXISTS ai_memories_user_isolation ON ai_memories';
        END IF;
      END $$`
    );
    const policySql = await Bun.file("src/db/rls-policies.sql").text();
    await db.execute(sql.raw(policySql));

    // 2. Rol de aplicación SIN privilegios (RLS sí aplica sobre él).
    //
    // Un bloque `DO $$ … $$` no admite parámetros (`$1`): Postgres respondía
    // «bind message supplies 2 parameters, but prepared statement "" requires
    // 0» y la suite entera caía en el beforeAll. El nombre del rol es una
    // constante de este fichero, así que va como literal (con su guarda).
    if (!/^[a-z_]+$/.test(APP_ROLE)) throw new Error(`APP_ROLE inesperado: ${APP_ROLE}`);
    const rolLiteral = sql.raw(`'${APP_ROLE}'`);
    await db.execute(
      sql`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${rolLiteral}) THEN
          EXECUTE format('CREATE ROLE %I NOLOGIN', ${rolLiteral});
        END IF;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`
    );
    await db.execute(sql`GRANT USAGE ON SCHEMA public TO ${sql.raw(APP_ROLE)}`);
    await db.execute(
      sql`GRANT SELECT, INSERT, UPDATE, DELETE ON data_entries TO ${sql.raw(APP_ROLE)}`
    );
    // `data_entries_lectura_por_dataset` mira `data_sets.policy_json`: el rol
    // que consulta necesita leer `data_sets`, como el rol real de la app.
    await db.execute(sql`GRANT SELECT ON data_sets TO ${sql.raw(APP_ROLE)}`);
    // La conexión debe poder asumir el rol (si no es superusuario, necesita membresía).
    await db.execute(
      sql`DO $$ BEGIN
        EXECUTE format('GRANT %I TO %I', ${rolLiteral}, current_user);
      EXCEPTION WHEN OTHERS THEN NULL; END $$`
    );

    // 3. Fixtures: dos usuarios reales + un outsider, un dataset, y entradas.
    await db.execute(sql`
      INSERT INTO auth_users (id, name, email, role)
      VALUES
        (${USER_A}, 'RLS User A', ${`${USER_A}@example.com`}, 'user'),
        (${USER_B}, 'RLS User B', ${`${USER_B}@example.com`}, 'user'),
        (${OUTSIDER}, 'RLS Outsider', ${`${OUTSIDER}@example.com`}, 'user')
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO data_sets (id, name, slug, schema)
      VALUES (${DATASET_ID}, 'RLS Adversarial DS', ${`${RUN}-ds`}, '[]'::jsonb)
      ON CONFLICT (id) DO NOTHING
    `);

    entryAId = crypto.randomUUID();
    entryBId = crypto.randomUUID();
    entryPublicId = crypto.randomUUID();
    entryLegacyAId = crypto.randomUUID();

    await db.execute(sql`
      INSERT INTO data_entries (id, title, data_set_id, owner_id, data, status)
      VALUES
        (${entryAId}, 'Secret A', ${DATASET_ID}, ${USER_A},
          ${JSON.stringify({ secret: "user-a-data", ownerId: USER_A })}::jsonb, 'published'),
        (${entryBId}, 'Secret B', ${DATASET_ID}, ${USER_B},
          ${JSON.stringify({ secret: "user-b-data", ownerId: USER_B })}::jsonb, 'published'),
        (${entryPublicId}, 'Public Post', ${DATASET_ID}, NULL,
          ${JSON.stringify({ isPublic: true, body: "hello world" })}::jsonb, 'published'),
        (${entryLegacyAId}, 'Legacy A', ${DATASET_ID}, NULL,
          ${JSON.stringify({ ownerId: USER_A, secret: "legacy" })}::jsonb, 'published')
    `);
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await db.execute(sql`DELETE FROM data_entries WHERE data_set_id = ${DATASET_ID}`);
    await db.execute(sql`DELETE FROM data_sets WHERE id = ${DATASET_ID}`);
    await db.execute(sql`DELETE FROM auth_users WHERE id IN (${USER_A}, ${USER_B}, ${OUTSIDER})`);
  });

  // ── 0. Precondición: el rol de enforcement NO puede ser superusuario ──────

  describe("Precondición de seguridad", () => {
    it("el rol de aplicación no es superusuario ni tiene BYPASSRLS", async () => {
      if (!dbAvailable) return;
      const res = await db.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
        sql`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = ${APP_ROLE}`
      );
      const row = res.rows?.[0];
      expect(row).toBeDefined();
      // Si esto falla, RLS no protege NADA: PostgreSQL salta las políticas
      // para superusuarios y roles BYPASSRLS.
      expect(row!.rolsuper).toBe(false);
      expect(row!.rolbypassrls).toBe(false);
    });

    it("data_entries tiene RLS habilitado y forzado", async () => {
      if (!dbAvailable) return;
      const res = await db.execute<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        sql`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'data_entries'`
      );
      const row = res.rows?.[0];
      expect(row?.relrowsecurity).toBe(true);
      // FORCE es lo que hace que el dueño de la tabla también sea filtrado.
      expect(row?.relforcerowsecurity).toBe(true);
    });

    it("diagnóstico: reporta si el rol de CONEXIÓN salta RLS (riesgo en prod)", async () => {
      if (!dbAvailable) return;
      const res = await db.execute<{
        current_user: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
      }>(
        sql`SELECT current_user, rolsuper, rolbypassrls
            FROM pg_roles WHERE rolname = current_user`
      );
      const row = res.rows?.[0];
      if (row?.rolsuper || row?.rolbypassrls) {
        console.warn(
          `⚠️  [RLS] El rol de conexión '${row?.current_user}' es superuser/bypassrls: ` +
            `en producción RLS NO filtraría nada bajo este rol. La app debe conectarse ` +
            `con un rol sin privilegios. (Estos tests fuerzan '${APP_ROLE}' para medir la política real.)`
        );
      }
      // No es un fallo de la política en sí; solo garantizamos que la consulta corrió.
      expect(typeof row?.current_user).toBe("string");
    });
  });

  // ── 1. Aislamiento de lectura (cross-tenant read) ─────────────────────────

  describe("Aislamiento de lectura", () => {
    it("A ve su propia entrada pero NO la de B", async () => {
      if (!dbAvailable) return;
      const ids = await visibleIdsAs(USER_A, "user");
      expect(ids).toContain(entryAId);
      expect(ids).not.toContain(entryBId);
    });

    it("B NO puede leer la entrada de A (ataque cross-tenant)", async () => {
      if (!dbAvailable) return;
      const ids = await visibleIdsAs(USER_B, "user");
      expect(ids).not.toContain(entryAId);
      expect(ids).toContain(entryBId);
    });

    it("un outsider sin datos solo ve entradas públicas", async () => {
      if (!dbAvailable) return;
      const ids = await visibleIdsAs(OUTSIDER, "user");
      expect(ids).not.toContain(entryAId);
      expect(ids).not.toContain(entryBId);
      expect(ids).toContain(entryPublicId);
    });
  });

  // ── 2. Aislamiento de escritura (update / delete / insert) ────────────────

  describe("Aislamiento de escritura", () => {
    it("B NO puede hacer UPDATE de la fila de A (0 filas afectadas)", async () => {
      if (!dbAvailable) return;
      const affected = await mutateAs(
        USER_B,
        "user",
        sql`UPDATE data_entries SET title = 'hacked-by-b' WHERE id = ${entryAId}`
      );
      expect(affected).toBe(0);

      // La fila de A sigue intacta (leído como A).
      const stillThere = await runAs(USER_A, "user", async (tx) => {
        const r = await tx.execute<{ title: string }>(
          sql`SELECT title FROM data_entries WHERE id = ${entryAId}`
        );
        return r.rows?.[0]?.title;
      });
      expect(stillThere).toBe("Secret A");
    });

    it("B NO puede hacer DELETE de la fila de A (0 filas afectadas)", async () => {
      if (!dbAvailable) return;
      const affected = await mutateAs(
        USER_B,
        "user",
        sql`DELETE FROM data_entries WHERE id = ${entryAId}`
      );
      expect(affected).toBe(0);

      const exists = await db.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM data_entries WHERE id = ${entryAId}`
      );
      expect(exists.rows?.[0]?.n).toBe(1);
    });

    it("B NO puede INSERTAR una fila spoofeando owner_id = A (WITH CHECK)", async () => {
      if (!dbAvailable) return;
      const spoofId = crypto.randomUUID();
      const attempt = runAs(USER_B, "user", async (tx) => {
        await tx.execute(sql`
          INSERT INTO data_entries (id, title, data_set_id, owner_id, data, status)
          VALUES (${spoofId}, 'Spoofed', ${DATASET_ID}, ${USER_A}, '{}'::jsonb, 'published')
        `);
      });
      // La política WITH CHECK debe rechazar la inserción con owner ajeno.
      await expect(attempt).rejects.toThrow();

      // Y no debe haber quedado ninguna fila spoofeada.
      const leaked = await db.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM data_entries WHERE id = ${spoofId}`
      );
      expect(leaked.rows?.[0]?.n).toBe(0);
    });

    it("B SÍ puede insertar una fila propia (owner_id = B)", async () => {
      if (!dbAvailable) return;
      const ownId = crypto.randomUUID();
      await runAs(USER_B, "user", async (tx) => {
        await tx.execute(sql`
          INSERT INTO data_entries (id, title, data_set_id, owner_id, data, status)
          VALUES (${ownId}, 'B own row', ${DATASET_ID}, ${USER_B}, '{}'::jsonb, 'published')
        `);
      });
      const ids = await visibleIdsAs(USER_B, "user");
      expect(ids).toContain(ownId);
      // Limpieza local.
      await db.execute(sql`DELETE FROM data_entries WHERE id = ${ownId}`);
    });
  });

  // ── 3. La trampa del contexto vacío (defensa depende del middleware) ──────

  describe("Escape hatch: contexto RLS vacío ve TODO", () => {
    it("sin id NI rol (el sistema), un query ve filas de todos los usuarios", async () => {
      if (!dbAvailable) return;
      // Esta es la razón por la que el middleware RLS es OBLIGATORIO en cada
      // ruta que toca data_entries: si el contexto no se inyecta, la conexión
      // es la del sistema y la política le abre la puerta a TODO.
      const ids = await visibleIdsAs("", "");
      expect(ids).toContain(entryAId);
      expect(ids).toContain(entryBId);
    });

    it("el ANÓNIMO de una petición (id '' y rol anonymous) NO es el sistema", async () => {
      if (!dbAvailable) return;
      // Antes la escotilla miraba solo el id vacío, y el anónimo que fija
      // withTransactionalRLS() atravesaba la política como el sistema
      // (2026-10-23: cerrado también en data_entries).
      const ids = await visibleIdsAs("", "anonymous");
      expect(ids).not.toContain(entryAId);
      expect(ids).not.toContain(entryBId);
    });
  });

  // ── 4. Inyección SQL en el valor del contexto ─────────────────────────────

  describe("Inyección en el contexto RLS", () => {
    it("un user_id malicioso se trata como literal y no rompe el aislamiento", async () => {
      if (!dbAvailable) return;
      const malicious = "x' OR '1'='1";
      const ids = await visibleIdsAs(malicious, "user");
      // No matchea ningún owner real → solo públicas, nunca A ni B.
      expect(ids).not.toContain(entryAId);
      expect(ids).not.toContain(entryBId);
      expect(ids).toContain(entryPublicId);
    });

    it("un rol malicioso ('admin' spoofeado por string) igual pasa por parámetro", async () => {
      if (!dbAvailable) return;
      // Nota: quien controla el ROL controla el bypass admin. Este test documenta
      // que el rol proviene del contexto server-side, no del input del usuario.
      const ids = await visibleIdsAs(USER_B, "not-admin");
      expect(ids).not.toContain(entryAId);
    });
  });

  // ── 5. Política public_read no filtra de más ──────────────────────────────

  describe("Política public_read", () => {
    it("las filas públicas (owner NULL + isPublic) son visibles para cualquiera", async () => {
      if (!dbAvailable) return;
      const ids = await visibleIdsAs(USER_B, "user");
      expect(ids).toContain(entryPublicId);
    });

    it("public_read NO expone filas privadas con dueño (owner_id no nulo)", async () => {
      if (!dbAvailable) return;
      // entryA tiene owner_id = A: la política public_read exige owner_id IS NULL,
      // así que jamás debe filtrarse a B por esta vía.
      const ids = await visibleIdsAs(USER_B, "user");
      expect(ids).not.toContain(entryAId);
    });
  });

  // ── 6. Registros legacy (owner_id NULL + data->>'ownerId') ────────────────

  describe("Compatibilidad legacy (data.ownerId)", () => {
    it("A ve su registro legacy vía data->>'ownerId'", async () => {
      if (!dbAvailable) return;
      const ids = await visibleIdsAs(USER_A, "user");
      expect(ids).toContain(entryLegacyAId);
    });

    it("B NO ve el registro legacy de A", async () => {
      if (!dbAvailable) return;
      const ids = await visibleIdsAs(USER_B, "user");
      expect(ids).not.toContain(entryLegacyAId);
    });
  });

  // ── 7. Escape hatch admin (intencional) ───────────────────────────────────

  describe("Rol admin", () => {
    it("admin ve las entradas de TODOS los usuarios", async () => {
      if (!dbAvailable) return;
      const ids = await visibleIdsAs("some-admin-id", "admin");
      expect(ids).toContain(entryAId);
      expect(ids).toContain(entryBId);
      expect(ids).toContain(entryPublicId);
    });

    it("admin puede actualizar la fila de cualquier usuario", async () => {
      if (!dbAvailable) return;
      const affected = await mutateAs(
        "some-admin-id",
        "admin",
        sql`UPDATE data_entries SET title = 'touched-by-admin' WHERE id = ${entryBId}`
      );
      expect(affected).toBe(1);
      // Restaurar.
      await db.execute(sql`UPDATE data_entries SET title = 'Secret B' WHERE id = ${entryBId}`);
    });
  });
});
