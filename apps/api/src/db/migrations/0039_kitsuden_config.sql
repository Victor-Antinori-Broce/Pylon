-- kitsuden_config: la tabla que kon-media creaba en caliente
-- ============================================================================
--
-- `packages/core/media/media.routes.ts` guardaba su configuracion en una tabla
-- `kitsuden_config` que creaba el mismo en cada guardado:
--
--     await ctx.db.instance.execute(sql`
--       CREATE TABLE IF NOT EXISTS kitsuden_config (...)
--     `);
--
-- Y ninguna migracion la creaba, asi que en produccion la tabla NO EXISTE: la
-- API se conecta con un rol sin privilegio CREATE, el CREATE falla, el INSERT
-- de despues tambien, y `POST /api/media/config` devuelve 500. Guardar la
-- configuracion de kon-media no ha funcionado nunca en un servidor.
--
-- La lectura, ademas, se tragaba el error con un `catch {}` comentado
-- «Table might not exist yet», asi que devolvia la configuracion por defecto y
-- parecia que no habia nada guardado — en vez de que no se pudiera guardar.
--
-- ── DEUDA QUE ESTO NO RESUELVE ─────────────────────────────────────────────
--
-- Los ajustes de kon ya viven en `modules.settings`, que es donde escribe el
-- panel. `kitsuden_config` es un SEGUNDO almacen para lo mismo. Se crea aqui
-- para que el codigo existente funcione, pero unificarlo es una decision de
-- diseno pendiente, no algo que deba colarse en una migracion.

CREATE TABLE IF NOT EXISTS kitsuden_config (
  key        VARCHAR(100) PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
