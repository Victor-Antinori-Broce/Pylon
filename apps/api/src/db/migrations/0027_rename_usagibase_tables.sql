-- 0027 — Rebrand: renombra tablas legacy vek_* / varco_* a usagibase_*
-- ============================================================================
-- Cadena histórica de marcas: vek → varco → usagibase.
-- Bases de datos NUEVAS crean usagibase_* directamente (las migraciones
-- anteriores fueron actualizadas); las EXISTENTES necesitan este rename.
-- Idempotente: si la tabla vieja no existe, o la nueva ya existe, no hace nada.

DO $$
DECLARE
  legacy TEXT;
  target TEXT;
BEGIN
  FOREACH legacy IN ARRAY ARRAY[
    'vek_functions', 'varco_functions',
    'vek_secrets',   'varco_secrets'
  ] LOOP
    target := 'usagibase_' || split_part(legacy, '_', 2);

    IF EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = legacy
    ) AND NOT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = target
    ) THEN
      EXECUTE format('ALTER TABLE public.%I RENAME TO %I', legacy, target);
      RAISE NOTICE 'renamed table % -> %', legacy, target;
    END IF;
  END LOOP;
END $$;

-- Índices asociados (el rename de tabla no renombra sus índices).
DO $$
DECLARE
  legacy TEXT;
  target TEXT;
BEGIN
  FOREACH legacy IN ARRAY ARRAY[
    'vek_secrets_key_unique', 'varco_secrets_key_unique'
  ] LOOP
    target := 'usagibase_secrets_key_unique';

    IF EXISTS (
      SELECT FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = legacy AND c.relkind = 'i'
    ) AND NOT EXISTS (
      SELECT FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = target AND c.relkind = 'i'
    ) THEN
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', legacy, target);
      RAISE NOTICE 'renamed index % -> %', legacy, target;
    END IF;
  END LOOP;
END $$;
