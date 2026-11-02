/**
 * Academia: el supervisor solo ve a los alumnos de SUS grupos
 * ============================================================================
 *
 * Auditoría 2026-10-25: un supervisor tenía `FOR ALL` sobre los datos
 * personales de todos los alumnos. Migración 0004: solo los de los grupos que
 * supervisa (principal o adicional); el administrador, todos.
 *
 * Solo tiene sentido con un rol SIN privilegios (la RLS no se aplica a un
 * superusuario): si la conexión salta la RLS, la prueba no afirma nada.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";

import { db } from "../db";

import { isDatabaseAvailable, generateTestId } from "./setup";

let dbAvailable = false;
let rlsActiva = false;

const s = generateTestId().replace(/[^a-z0-9]/gi, "").slice(-10);
const ids = {
  admin: `adm${s}`,
  sup: `sup${s}`,
  alumnoSuyo: `al1${s}`,
  alumnoAjeno: `al2${s}`,
};

async function comoUsuario<T>(userId: string, fn: (tx: typeof db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_user_id', ${userId}, true), set_config('app.current_user_role', 'user', true)`
    );
    return fn(tx as unknown as typeof db);
  });
}

async function perfilesVisibles(userId: string): Promise<string[]> {
  return comoUsuario(userId, async (tx) => {
    const r = (await tx.execute(
      sql`SELECT user_id FROM perfil_usuario_capacitaciones WHERE user_id LIKE ${`%${s}`}`
    )) as unknown as { rows: { user_id: string }[] };
    return r.rows.map((x) => x.user_id).sort();
  });
}

describe("academia: alcance del supervisor", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) return;
    const r = (await db.execute(
      sql`SELECT rolsuper OR rolbypassrls AS salta FROM pg_roles WHERE rolname = current_user`
    )) as unknown as { rows: { salta: boolean }[] };
    rlsActiva = !r.rows[0]?.salta;

    // Fixtures con contexto vacío (sistema)
    await db.execute(sql`
      INSERT INTO perfil_usuario_capacitaciones (id, user_id, rol_capacitaciones, activo) VALUES
        (${`p-${ids.admin}`}, ${ids.admin}, 'administrador', true),
        (${`p-${ids.sup}`}, ${ids.sup}, 'supervisor', true),
        (${`p-${ids.alumnoSuyo}`}, ${ids.alumnoSuyo}, 'estudiante', true),
        (${`p-${ids.alumnoAjeno}`}, ${ids.alumnoAjeno}, 'estudiante', true)
    `);
    await db.execute(sql`
      INSERT INTO grupos_asignacion (id, nombre, supervisor_principal_id) VALUES
        (${`g1${s}`}, 'Suyo', ${`p-${ids.sup}`}),
        (${`g2${s}`}, 'Ajeno', NULL)
    `);
    await db.execute(sql`
      INSERT INTO grupo_usuarios (id, grupo_id, user_id) VALUES
        (${`gu1${s}`}, ${`g1${s}`}, ${ids.alumnoSuyo}),
        (${`gu2${s}`}, ${`g2${s}`}, ${ids.alumnoAjeno})
    `);
  });

  it("el supervisor ve su perfil y a sus alumnos, no a los de otros grupos", async () => {
    if (!dbAvailable || !rlsActiva) return;
    expect(await perfilesVisibles(ids.sup)).toEqual([ids.alumnoSuyo, ids.sup].sort());
  });

  it("el administrador de la academia ve a todos", async () => {
    if (!dbAvailable || !rlsActiva) return;
    expect(await perfilesVisibles(ids.admin)).toEqual(Object.values(ids).sort());
  });

  it("las funciones de alcance dicen lo mismo que la RLS", async () => {
    if (!dbAvailable) return;
    const r = await comoUsuario(ids.sup, async (tx) =>
      (await tx.execute(
        sql`SELECT academy_supervisa_usuario(${ids.alumnoSuyo}) AS suyo, academy_supervisa_usuario(${ids.alumnoAjeno}) AS ajeno`
      )) as unknown as { rows: { suyo: boolean; ajeno: boolean }[] }
    );
    expect(r.rows[0]).toEqual({ suyo: true, ajeno: false });
  });
});
