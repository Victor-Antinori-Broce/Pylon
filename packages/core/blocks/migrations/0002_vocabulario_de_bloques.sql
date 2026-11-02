-- 0002 — El almacen de paginas acepta los bloques que el editor ofrece
-- ============================================================================
-- Idempotente.
--
-- ── EL FALLO, QUE ES GRANDE ────────────────────────────────────────────────
--
-- Habia TRES vocabularios de bloques y no coincidian:
--
--   1. El enum `block_content_type`, que es lo que `block_contents` puede
--      guardar:   hero, text, image, video, grid, cards, quote, cta, embed,
--                 divider, spacer, custom
--   2. El registro del panel, que es lo que el editor OFRECE:
--                 hero, richtext, image-gallery, game-map, tier-list,
--                 character-builder, comments, streamer-widget, embed,
--                 callout, divider, dynamic-carousel, smart-filter,
--                 comparison-slider, smart-grid
--   3. El renderizador, que es lo que se sabe PINTAR: el mismo conjunto que 2.
--
-- La interseccion de 1 y 2 son TRES tipos: hero, embed y divider. Es decir:
-- de los quince bloques que el constructor ofrece, doce **no se pueden
-- guardar** en una pagina. El INSERT falla con un valor de enum invalido.
--
-- ── POR QUE NO SE HABIA NOTADO ─────────────────────────────────────────────
--
-- Porque los bloques de un ARTICULO no pasan por aqui: `blog_posts.blocks` es
-- jsonb sin restriccion, asi que ahi los quince funcionan. Solo las paginas
-- del constructor tienen el enum, y no habia ninguna creada (0 paginas, 0
-- bloques al aplicar esto). El fallo esperaba a la primera pagina.
--
-- ── QUE MANDA ──────────────────────────────────────────────────────────────
--
-- El registro y el renderizador COINCIDEN entre si; el enum es el que se quedo
-- atras, con nombres de otra epoca (`text`, `cards`, `cta`, `spacer`). Se anaden
-- los que faltan y no se quita ninguno: borrar valores de un enum en Postgres
-- es caro y los legacy no molestan a nadie.
--
-- `IF NOT EXISTS` requiere Postgres 12+; aqui corre 16. Y `ADD VALUE` no puede
-- ir dentro de una transaccion: el runner ejecuta sentencia a sentencia sin
-- envolver, que es justo lo que hace falta.

ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'richtext';
ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'image-gallery';
ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'game-map';
ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'tier-list';
ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'character-builder';
ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'comments';
ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'streamer-widget';
ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'callout';
ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'dynamic-carousel';
ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'smart-filter';
ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'comparison-slider';
ALTER TYPE block_content_type ADD VALUE IF NOT EXISTS 'smart-grid';
