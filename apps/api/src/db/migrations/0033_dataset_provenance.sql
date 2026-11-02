-- 0032 — Procedencia de los datasets
-- ============================================================================
-- Idempotente.
--
-- De donde salio un dataset, cuando, bajo que terminos y de que parche.
--
-- Todo NULLABLE: un dataset escrito a mano no tiene fuente, y obligar a
-- inventarse una seria peor que dejarla vacia. Importa cuando el dataset viene
-- de FUERA: un catalogo importado sin esto es un misterio a los tres meses.
ALTER TABLE data_sets ADD COLUMN IF NOT EXISTS source_name VARCHAR(300);
ALTER TABLE data_sets ADD COLUMN IF NOT EXISTS source_url TEXT;
-- Terminos en texto largo, no un identificador de licencia: "CC-BY-SA" no dice
-- si se puede republicar un volcado concreto.
ALTER TABLE data_sets ADD COLUMN IF NOT EXISTS source_license TEXT;
ALTER TABLE data_sets ADD COLUMN IF NOT EXISTS source_version VARCHAR(60);
-- Distinto de updated_at, que es cuando se toco AQUI.
ALTER TABLE data_sets ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ;
ALTER TABLE data_sets ADD COLUMN IF NOT EXISTS source_caveats JSONB DEFAULT '[]';

-- El indice que hace posible filtrar sin recorrer la tabla entera.
CREATE INDEX IF NOT EXISTS data_entries_set_status_idx
  ON data_entries (data_set_id, status);

-- El indice de busqueda por texto va APARTE, en 0034, y no por capricho:
-- pg_trgm es una extension y pg-mem —el Postgres en memoria de las pruebas— no
-- la entiende. Mezclarlas en un fichero hace que la migracion entera falle al
-- cargar el esquema de prueba, y con ella TODAS las tablas que vinieran detras.
--
-- Separadas, las pruebas cargan lo estructural y se saltan lo que su motor no
-- soporta; en Postgres de verdad se aplican las dos.
