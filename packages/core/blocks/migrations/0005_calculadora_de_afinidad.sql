-- 0005 — Bloque nuevo que el editor ofrece: affinity (calculadora de afinidad)
-- ============================================================================
-- Idempotente.
--
-- Sale de la carga de Umamusume: el juego guarda tablas de PARENTESCO entre
-- personajes (`succession_relations`), y con ellas se puede calcular cuánta
-- afinidad hay entre la entrenada y la pareja de progenitores que se elija.
--
--   affinity   dos o más filas de un dataset y los puntos de parentesco que
--              comparten, sumados por parejas del árbol de herencia
--
-- Misma regla que 0002, 0003 y 0004: lo que el editor ofrece tiene que caber
-- en el enum. `ADD VALUE` no puede ir en una transacción; el runner ejecuta
-- sentencia a sentencia.

ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'affinity';
