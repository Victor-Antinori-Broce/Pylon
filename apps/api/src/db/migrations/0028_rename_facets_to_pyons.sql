-- 0028 — Rebrand: facet → pyon
-- ============================================================================
-- El concepto "facet" pasa a llamarse "pyon". Bases de datos NUEVAS crean ya
-- installed_pyons / pyon_source (las migraciones anteriores fueron
-- actualizadas); las EXISTENTES necesitan estos renames.
--
-- Cubre: tabla, columna, tipo enum, índice y valores de enum.
-- Idempotente: cada paso comprueba el estado antes de actuar.

-- ── 1. Tabla installed_facets → installed_pyons ──────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'installed_facets'
  ) AND NOT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'installed_pyons'
  ) THEN
    ALTER TABLE public.installed_facets RENAME TO installed_pyons;
    RAISE NOTICE 'renamed table installed_facets -> installed_pyons';
  END IF;
END $$;

-- ── 2. Columna facet_id → pyon_id ────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'installed_pyons'
      AND column_name = 'facet_id'
  ) AND NOT EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'installed_pyons'
      AND column_name = 'pyon_id'
  ) THEN
    ALTER TABLE public.installed_pyons RENAME COLUMN facet_id TO pyon_id;
    RAISE NOTICE 'renamed column installed_pyons.facet_id -> pyon_id';
  END IF;
END $$;

-- ── 3. Tipo enum facet_source → pyon_source ──────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'facet_source'
  ) AND NOT EXISTS (
    SELECT FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'pyon_source'
  ) THEN
    ALTER TYPE public.facet_source RENAME TO pyon_source;
    RAISE NOTICE 'renamed type facet_source -> pyon_source';
  END IF;
END $$;

-- ── 4. Índice installed_facet_id_idx → installed_pyon_id_idx ─────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'installed_facet_id_idx' AND c.relkind = 'i'
  ) AND NOT EXISTS (
    SELECT FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'installed_pyon_id_idx' AND c.relkind = 'i'
  ) THEN
    ALTER INDEX public.installed_facet_id_idx RENAME TO installed_pyon_id_idx;
    RAISE NOTICE 'renamed index installed_facet_id_idx -> installed_pyon_id_idx';
  END IF;
END $$;

-- ── 5. Valor de enum brain_note_category: 'facet' → 'pyon' ───────────────────
-- ALTER TYPE ... RENAME VALUE es transaccional y no requiere reescribir filas.
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'brain_note_category' AND e.enumlabel = 'facet'
  ) AND NOT EXISTS (
    SELECT FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'brain_note_category' AND e.enumlabel = 'pyon'
  ) THEN
    ALTER TYPE public.brain_note_category RENAME VALUE 'facet' TO 'pyon';
    RAISE NOTICE 'renamed enum value brain_note_category.facet -> pyon';
  END IF;
END $$;

-- ── 6. Datos: módulos y manifiestos que guardan el tipo "facet" ──────────────
UPDATE public.modules
SET settings = jsonb_set(settings, '{type}', '"pyon"')
WHERE settings ->> 'type' = 'facet';

-- La tabla puede no llamarse así: en una base creada DESDE CERO tras el
-- rebrand a kon, la 0009 crea directamente `installed_kons` y esta tabla no
-- existe nunca. Sin la guarda, esta migración falla en toda instalación nueva
-- — y no se detectó durante años porque nadie ejecutaba la cadena completa.
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'installed_pyons'
  ) THEN
    UPDATE public.installed_pyons
    SET manifest = jsonb_set(manifest, '{type}', '"pyon"')
    WHERE manifest ->> 'type' = 'facet';
  END IF;
END $$;
