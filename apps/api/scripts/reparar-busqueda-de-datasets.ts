/**
 * Repara el disparador de búsqueda de `data_entries`
 * ============================================================================
 *
 * ── EL PROBLEMA ────────────────────────────────────────────────────────────
 *
 * La función `data_entries_search_update()` construye el vector de búsqueda
 * así:
 *
 *     NEW.search_vector := to_tsvector('english',
 *       COALESCE(NEW.title, '')   || ' ' ||
 *       COALESCE(NEW.content, '') || ' ' ||     ← esta columna NO EXISTE
 *       COALESCE(NEW.data::text, '')
 *     );
 *
 * `data_entries` tiene `title`, `data_set_id`, `data`, `sort_order`… pero
 * ninguna `content`. Así que CUALQUIER inserción o actualización en la tabla
 * falla con:
 *
 *     ERROR 42703: record "new" has no field "content"
 *
 * Consecuencia: no se puede añadir ni una sola entrada a ningún dataset. Por
 * eso una instalación con este disparador tiene los datasets vacíos y ninguna
 * pista de por qué — el error solo sale al intentar escribir.
 *
 * ── AHORA HAY MIGRACIÓN ─────────────────────────────────────────────────────
 *
 * Este script se escribió creyendo que el disparador no estaba en el repo. Sí
 * está: lo crea `src/db/migrations/0022_critical_features.sql`, así que TODA
 * base migrada desde cero nacía sin poder guardar filas de datasets. Lo arregla
 * `0042_busqueda_de_datasets_sin_content.sql`, que aplica `scripts/migrate.ts`.
 * El script se conserva para bases que no pasan por el runner de migraciones.
 *
 * ── QUE HACE ───────────────────────────────────────────────────────────────
 *
 * Reescribe la función usando las columnas que SÍ existen (`title` y `data`).
 * El disparador y la columna `search_vector` se conservan: el objetivo es que
 * la búsqueda funcione, no quitarla.
 *
 *     bun scripts/reparar-busqueda-de-datasets.ts            (informa)
 *     bun scripts/reparar-busqueda-de-datasets.ts --aplicar  (escribe)
 *
 * ── HACE FALTA LA CONEXION DE ADMINISTRACION ───────────────────────────────
 *
 * Cambiar una función es DDL, y el rol de la aplicación no lo puede hacer — que
 * es justo lo que hace efectivas las políticas RLS. Sin ella sale un 42501:
 *
 *     DATABASE_URL=$DATABASE_ADMIN_URL bun scripts/reparar-busqueda-de-datasets.ts --aplicar
 */

import { sql } from "drizzle-orm";

import { db } from "../src/db";

const aplicar = process.argv.includes("--aplicar");

function filasDe<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  const c = r as { rows?: unknown };
  return Array.isArray(c?.rows) ? (c.rows as T[]) : [];
}

const [funcion] = filasDe<{ prosrc: string }>(
  await db.execute(sql`SELECT prosrc FROM pg_proc WHERE proname = 'data_entries_search_update'`)
);

if (!funcion) {
  console.log("\nNo existe `data_entries_search_update()`. Nada que reparar.\n");
  process.exit(0);
}

const columnas = filasDe<{ column_name: string }>(
  await db.execute(sql`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'data_entries'
  `)
).map((c) => c.column_name);

/** Campos que la función usa y la tabla no tiene. */
const ausentes = [...funcion.prosrc.matchAll(/NEW\.(\w+)/g)]
  .map((m) => m[1])
  .filter((campo, i, todos) => todos.indexOf(campo) === i)
  .filter((campo) => !columnas.includes(campo));

console.log(`\nColumnas de \`data_entries\`: ${columnas.length}`);
console.log(`Campos que la función usa y NO existen: ${ausentes.join(", ") || "ninguno"}\n`);

if (ausentes.length === 0) {
  console.log("El disparador ya es coherente con la tabla. Nada que hacer.\n");
  process.exit(0);
}

console.log("  reescribir  data_entries_search_update()  →  solo `title` y `data`");

if (!aplicar) {
  console.log("\nSimulacro. Vuelve a ejecutarlo con --aplicar para escribir.\n");
  process.exit(0);
}

await db.execute(sql`
  CREATE OR REPLACE FUNCTION data_entries_search_update() RETURNS trigger AS $$
  BEGIN
    NEW.search_vector := to_tsvector('english',
      COALESCE(NEW.title, '') || ' ' ||
      COALESCE(NEW.data::text, '')
    );
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
`);

// Se comprueba escribiendo de verdad: que la función compile no dice nada
// sobre si el INSERT pasa, que es lo que estaba roto.
const [ds] = filasDe<{ id: string }>(
  await db.execute(sql`
    INSERT INTO data_sets (name, slug, schema)
    VALUES ('__comprobacion__', ${"comprobacion-" + Date.now()}, '[]'::jsonb)
    RETURNING id
  `)
);

try {
  await db.execute(sql`
    INSERT INTO data_entries (title, data_set_id, data)
    VALUES ('prueba', ${ds.id}, '{"x":1}'::jsonb)
  `);
  console.log("\nAplicado. Comprobado: una entrada de dataset ya se puede insertar.\n");
} finally {
  await db.execute(sql`DELETE FROM data_entries WHERE data_set_id = ${ds.id}`);
  await db.execute(sql`DELETE FROM data_sets WHERE id = ${ds.id}`);
}

process.exit(0);
