-- 0007 — Tres bloques nuevos que el editor ofrece: juegos de cartas
-- ============================================================================
-- Idempotente.
--
-- Salen de Cardback Collector, pero ninguno es de un juego concreto: los tres
-- leen kon-cardsim y kon-deckshow, así que valen para cualquier TCG cargado.
--
--   card-browser    el catálogo de cartas de un juego, con buscador y filtros
--                   por las propiedades que trae cada carta (coste, tipo,
--                   color, rareza…)
--   deck-builder    construir un mazo contra las reglas del juego —tamaño,
--                   copias, banlist, límites por grupo— con la validación en
--                   vivo y la mano de prueba
--   deck-showcase   el escaparate: los mazos publicados de ese juego, con su
--                   autor y sus «me gusta»
--
-- Misma regla que 0002-0006: lo que el editor ofrece tiene que caber en el
-- enum. `ADD VALUE` no puede ir en una transacción; el runner ejecuta
-- sentencia a sentencia.

ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'card-browser';
ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'deck-builder';
ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'deck-showcase';
