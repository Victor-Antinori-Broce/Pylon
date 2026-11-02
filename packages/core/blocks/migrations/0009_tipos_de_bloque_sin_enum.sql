-- 0009 — El tipo de bloque deja de ser un enum de Postgres
-- ============================================================================
-- Idempotente.
--
-- ── POR QUÉ ────────────────────────────────────────────────────────────────
--
-- De 0002 a 0008, SIETE migraciones seguidas no hicieron otra cosa que añadir
-- valores a `block_content_type`. Cada bloque nuevo del editor costaba una
-- migración contra la base de PRODUCCIÓN, y `deck` se quedó sin poder
-- guardarse en una página esperando precisamente eso.
--
-- Y por ese precio el enum protegía a medias: los bloques de un ARTÍCULO van
-- en `blog_posts.blocks`, un jsonb sin restricción. Solo las páginas del
-- constructor pasaban por el enum.
--
-- ── QUÉ PASA A PARTIR DE AQUÍ ──────────────────────────────────────────────
--
-- La columna es texto. La autoridad sobre qué tipos valen es `TIPOS_DE_BLOQUE`
-- en `blocks.schema.ts`: la ruta que publica valida contra esa lista y
-- `tests/unit/bloques-que-no-caben.test.ts` comprueba que contiene todo lo que
-- el editor ofrece. Añadir un bloque vuelve a ser añadir una línea de código.
--
-- Se pierde la red de la base de datos. Se acepta a sabiendas: solo cubría la
-- mitad de las puertas y la otra mitad llevaba años abierta sin incidentes.
--
-- Esta migración NO toca ningún dato: los valores guardados son los mismos,
-- solo cambia el tipo de la columna.

ALTER TABLE IF EXISTS block_contents  ALTER COLUMN type TYPE varchar(64) USING type::text;
ALTER TABLE IF EXISTS block_templates ALTER COLUMN type TYPE varchar(64) USING type::text;

-- El tipo ya no lo usa nadie. Si alguna instalación tuviera otra columna
-- colgando de él, el DROP fallaría y se llevaría por delante la migración
-- entera por limpiar algo que no hace daño: se avisa y se sigue.
DO $$
BEGIN
  DROP TYPE IF EXISTS block_content_type;
EXCEPTION
  WHEN dependent_objects_still_exist THEN
    RAISE NOTICE 'block_content_type sigue en uso por otra columna: se deja estar.';
END $$;
