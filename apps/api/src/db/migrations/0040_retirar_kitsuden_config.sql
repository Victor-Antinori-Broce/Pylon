-- Retirar `kitsuden_config`: los ajustes de kon viven en `modules.settings`
-- ============================================================================
--
-- `kitsuden_config` era un SEGUNDO almacen de ajustes de kon en paralelo al que
-- ya existia —la columna `settings` de `modules`, donde escribe el panel y de
-- donde lee `PATCH /api/modules/:key`—. Solo la usaba kon-media.
--
-- Dos almacenes para lo mismo se separan en cuanto alguien edite uno, y aqui el
-- riesgo era concreto: el panel podia guardar ajustes de kon-media en
-- `modules.settings` mientras el kon leia de la otra tabla y no los veia nunca.
--
-- ── POR QUE SE PUEDE BORRAR SIN MIGRAR DATOS ───────────────────────────────
--
-- Porque nunca llego a tener ninguno. El codigo la creaba en caliente con
-- `CREATE TABLE IF NOT EXISTS` desde la aplicacion, y la API se conecta con un
-- rol SIN privilegio CREATE sobre el esquema, asi que el CREATE fallaba, el
-- INSERT de despues tambien, y `POST /api/media/config` devolvia 500 en todo
-- servidor. La tabla solo existio en la migracion 0039, que la creo ayer para
-- que ese codigo pudiera funcionar; hoy sobra.
--
-- Aun asi se copia lo que hubiera antes de borrar: en una base donde alguien la
-- creara a mano, esos ajustes son reales y perderlos en silencio seria
-- exactamente la clase de fallo que este repo lleva dias corrigiendo.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'kitsuden_config'
  ) THEN
    -- Rescatar ajustes que existieran, sin pisar los que ya haya en `modules`.
    INSERT INTO modules (key, name, category, enabled, settings)
    SELECT c.key,
           c.key,
           'optional',
           false,
           CASE WHEN jsonb_typeof(c.value) = 'object' THEN c.value ELSE '{}'::jsonb END
      FROM kitsuden_config c
     ON CONFLICT (key) DO UPDATE
        SET settings = CASE
              WHEN modules.settings IS NULL OR modules.settings = '{}'::jsonb
                THEN EXCLUDED.settings
              ELSE modules.settings
            END;

    DROP TABLE kitsuden_config;
  END IF;
END $$;
