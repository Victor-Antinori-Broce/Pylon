-- ═══════════════════════════════════════════════════════════════════════════
-- Cambiar las direcciones de medios de `http://localhost:3000/media/` al dominio
-- real, en TODAS las columnas donde la base las tiene escritas.
--
-- POR QUÉ HACE FALTA. Los cargadores escribieron las imágenes con la dirección
-- absoluta de la API local (`http://localhost:3000/media/...`). En el VPS esa
-- dirección apunta al ordenador de quien visita la web: todas las portadas,
-- iconos, cartas y vídeos saldrían rotos, sin ningún error en el servidor.
-- Recuento del 2026-10-12 sobre una restauración de la copia de esa noche:
--
--   data_entries.data       120.802 filas (333.515 URLs)
--   wiki_revisions.content      471      blog_posts.source   144
--   blog_posts.blocks           131      tier_lists.items    103
--   games.specs                  50      games.blocks         13
--   blog_posts.content            3      site_settings.site_url  1 (http://localhost:4321)
--
-- Todas eran `http://localhost:3000/media`; no había otro host ni puerto.
--
-- USO (en el VPS, DESPUÉS de restaurar la base y ANTES de abrir la web):
--
--   docker exec -i kitsuden_db_prod sh -c \
--     'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v dominio=https://ejemplo.com' \
--     < docker/sql/cambiar-dominio-de-medios.sql
--
-- `dominio` es el ORIGEN de la web pública (esquema + host, sin barra final):
-- Caddy sirve `/media/*` de ese dominio desde la API (ver docker/Caddyfile).
--
-- Es una sola transacción: o cambia todo o nada. Se puede repetir (la segunda
-- vez no encuentra nada que cambiar). Probado el 2026-10-12 sobre una copia
-- restaurada en un Postgres temporal: ver docs/instalacion/servidor.md.
--
-- Haz una copia antes (`pg_dump -Fc`, ver docs/instalacion/copias.md).
-- ═══════════════════════════════════════════════════════════════════════════

\if :{?dominio}
\else
  \echo 'Falta -v dominio=https://tu-dominio (sin barra final)'
  \quit
\endif

BEGIN;
SELECT set_config('kitsuden.dominio', :'dominio', true);

DO $$
DECLARE
  dominio text := current_setting('kitsuden.dominio');
  viejo   text := 'http://localhost:3000/media/';
  nuevo   text;
  r       record;
  n       bigint;
BEGIN
  IF dominio !~ '^https?://[^/]+$' THEN
    RAISE EXCEPTION 'dominio debe ser un origen sin barra final (https://ejemplo.com), no «%»', dominio;
  END IF;
  nuevo := dominio || '/media/';

  FOR r IN
    SELECT c.table_name, c.column_name, c.data_type
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND (c.table_name, c.column_name) IN (
             ('data_entries','data'), ('wiki_revisions','content'), ('tier_lists','items'),
             ('blog_posts','content'), ('blog_posts','blocks'), ('blog_posts','source'),
             ('games','specs'), ('games','blocks'))
  LOOP
    IF r.data_type IN ('jsonb', 'json') THEN
      EXECUTE format(
        'UPDATE %I SET %I = replace(%I::text, $1, $2)::%s WHERE %I::text LIKE $3',
        r.table_name, r.column_name, r.column_name, r.data_type, r.column_name)
        USING viejo, nuevo, '%' || viejo || '%';
    ELSE
      EXECUTE format(
        'UPDATE %I SET %I = replace(%I, $1, $2) WHERE %I LIKE $3',
        r.table_name, r.column_name, r.column_name, r.column_name)
        USING viejo, nuevo, '%' || viejo || '%';
    END IF;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '%.%: % filas', r.table_name, r.column_name, n;
  END LOOP;

  -- La URL pública del panel MANDA sobre SITE_URL (lib/sitio.ts: «panel
  -- primero»): si se queda en localhost, canónicas, mapa y datos estructurados
  -- salen con localhost aunque todo lo demás esté bien.
  UPDATE site_settings SET site_url = dominio
   WHERE site_url ~ '^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?/?$';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'site_settings.site_url: % filas', n;
END $$;
COMMIT;

-- Lo que quede con localhost en cualquier columna de texto (debería ser 0).
DO $$
DECLARE r record; n bigint; total bigint := 0;
BEGIN
  FOR r IN SELECT table_name, column_name FROM information_schema.columns
            WHERE table_schema = 'public'
              AND data_type IN ('jsonb','json','text','character varying')
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE %I::text ~ %L',
                   r.table_name, r.column_name, 'https?://(localhost|127\.0\.0\.1):')
       INTO n;
    IF n > 0 THEN
      RAISE WARNING 'sigue con localhost: %.% (% filas)', r.table_name, r.column_name, n;
      total := total + n;
    END IF;
  END LOOP;
  RAISE NOTICE 'filas con localhost tras el cambio: %', total;
END $$;
