-- 0004 — Bloque nuevo que el editor ofrece: dex (índice con fichas)
-- ============================================================================
-- Idempotente.
--
-- Sale de la prueba de concepto de Aniimo (el «Aniidex»):
--
--   dex   las filas de un dataset como índice filtrable, y una ficha por fila
--         en `/<juego>/<segmento>/<fila>` compuesta con otros datasets
--         (facetas con icono, habilidades, rasgo, línea evolutiva).
--
-- Misma regla que 0002 y 0003: lo que el editor ofrece tiene que caber en el
-- enum. `ADD VALUE` no puede ir en una transacción; el runner ejecuta
-- sentencia a sentencia.

ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'dex';
