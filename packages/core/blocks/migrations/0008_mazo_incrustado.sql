-- 0008 — El bloque «deck»: un mazo incrustado en un artículo o una página
-- ============================================================================
-- Idempotente.
--
-- El editor lo ofrece desde que Cardback Collector enseña mazos dentro de sus
-- artículos, y 0007 se quedó sin él: añadía `card-browser`, `deck-builder` y
-- `deck-showcase`, pero no `deck`. En un ARTÍCULO no se notaba
-- —`blog_posts.blocks` es jsonb sin restricción—; en una PÁGINA del
-- constructor, el INSERT en `block_contents` fallaba con un valor de enum
-- inválido.
--
-- Misma regla que 0002-0007: lo que el editor ofrece tiene que caber en el
-- enum. `ADD VALUE` no puede ir en una transacción; el runner ejecuta
-- sentencia a sentencia.

ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'deck';
