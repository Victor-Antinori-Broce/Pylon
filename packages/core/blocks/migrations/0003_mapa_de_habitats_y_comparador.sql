-- 0003 — Dos bloques nuevos que el editor ofrece: habitat-map y stat-compare
-- ============================================================================
-- Idempotente.
--
-- Salen de la prueba de concepto de Aniimo:
--
--   habitat-map   qué filas de un dataset hay en cada región. Es el «mapa» que
--                 se puede publicar sin coordenadas: no inventa marcadores.
--   stat-compare  hasta tres filas de un dataset, stat a stat.
--
-- Misma regla que 0002: lo que el editor ofrece tiene que caber en el enum, o
-- guardar una página con ese bloque falla con un valor de enum inválido.
-- `ADD VALUE` no puede ir en una transacción; el runner ejecuta sentencia a
-- sentencia.

ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'habitat-map';
ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'stat-compare';
