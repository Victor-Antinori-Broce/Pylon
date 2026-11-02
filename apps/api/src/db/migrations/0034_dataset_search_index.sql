-- 0034 — Indice de busqueda por texto en las entradas de dataset
-- ============================================================================
-- Idempotente. SEPARADO de 0033 a proposito.
--
-- pg_trgm es una extension de Postgres, y pg-mem —el motor en memoria que usan
-- las pruebas— no la soporta. Si esto viviera en el mismo fichero que las
-- columnas de procedencia, la migracion entera fallaria al montar el esquema de
-- prueba y se llevaria por delante las columnas, que si son estructurales.
--
-- Sin este indice la busqueda funciona igual: un ILIKE '%texto%' sin indice lee
-- la tabla entera, que en 500 entradas no se nota y en 50.000 si. Por eso es un
-- fichero aparte y no un requisito.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS data_entries_title_trgm_idx
  ON data_entries USING gin (title gin_trgm_ops);
