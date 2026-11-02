-- 0006 — Dos bloques nuevos que el editor ofrece
-- ============================================================================
-- Idempotente.
--
-- Salen de las herramientas de Umamusume, pero ninguno es de ese juego:
--
--   event-search   busca en un dataset de eventos y enseña qué da cada opción
--                  (eventos de entrenamiento, diálogos, decisiones…)
--   race-planner   un dataset con fechas propias del juego (turno: año, mes y
--                  mitad) puesto en calendario y filtrable
--
-- Misma regla que 0002-0005: lo que el editor ofrece tiene que caber en el
-- enum. `ADD VALUE` no puede ir en una transacción; el runner ejecuta
-- sentencia a sentencia.

ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'event-search';
ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'race-planner';
