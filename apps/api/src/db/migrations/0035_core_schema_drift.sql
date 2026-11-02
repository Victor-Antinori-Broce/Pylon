-- 0035 — Deriva de esquema en packages/core
-- ============================================================================
-- Idempotente.
--
-- Tres tablas de `packages/core` declaraban columnas —y una tabla entera— que
-- ninguna migracion creaba nunca. No es un detalle de tipos: un `.select()` de
-- Drizzle sin argumentos enumera TODAS las columnas declaradas, asi que una sola
-- que falte tumba la consulta ENTERA, no la columna.
--
-- Se encontro EJECUTANDO las consultas contra el esquema migrado, no leyendo los
-- .sql: un primer intento comparando listas con expresiones regulares dio tres
-- falsos positivos (`active` y `published` son valores por defecto, no columnas)
-- y se dejo fuera lo de media_folders.
--
-- La prueba que lo fija: tests/unit/core-schema-drift.test.ts

-- ═══════════════════════════════════════════════════════════════════════════
-- data_sets: falta updated_at
-- ═══════════════════════════════════════════════════════════════════════════
-- La declara packages/core/datasets/datasets.schema.ts desde siempre. Sin ella,
-- CUALQUIER lectura de datasets por ese modulo falla contra Postgres de verdad.
ALTER TABLE data_sets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ═══════════════════════════════════════════════════════════════════════════
-- data_entries: faltan las columnas de auditoria
-- ═══════════════════════════════════════════════════════════════════════════
-- La tabla ya tiene `owner_id` (quien es dueno de la fila, que es lo que usa
-- RLS). Estas dos son otra cosa: QUIEN la creo y quien la toco por ultima vez.
-- Sin FK a auth_users a proposito: una entrada no debe desaparecer porque se
-- borre la cuenta de quien la escribio.
ALTER TABLE data_entries ADD COLUMN IF NOT EXISTS created_by_id TEXT;
ALTER TABLE data_entries ADD COLUMN IF NOT EXISTS updated_by_id TEXT;

-- ═══════════════════════════════════════════════════════════════════════════
-- media_folders: la TABLA no existia
-- ═══════════════════════════════════════════════════════════════════════════
-- packages/core/media la declara y apps/api/src/db/schema-kons.generated.ts la
-- reexporta, asi que la aplicacion la monta. Nunca se creo.
--
-- `media.folder_id` (que si existe, la anadio 0031) apuntaba al vacio.
CREATE TABLE IF NOT EXISTS media_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(200) NOT NULL,

  -- Jerarquia. Auto-referencia sin ON DELETE CASCADE: borrar una carpeta padre
  -- no debe llevarse las hijas y, con ellas, la referencia de sus ficheros.
  parent_id UUID REFERENCES media_folders(id) ON DELETE SET NULL,

  -- Ruta completa para buscar sin recorrer la jerarquia: "/images/products".
  path TEXT NOT NULL,
  description TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_folders_parent_idx ON media_folders (parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS media_folders_path_idx ON media_folders (path);
