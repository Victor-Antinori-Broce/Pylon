-- ═══════════════════════════════════════════════════════════════════════════════
-- 0042 — El disparador de búsqueda de data_entries deja de leer `content`
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 0022_critical_features.sql creó `data_entries_search_update()` con
--
--     COALESCE(NEW.content, '')
--
-- y `data_entries` NUNCA tuvo columna `content`. Resultado: en TODA base
-- migrada desde cero, cualquier INSERT o UPDATE de una fila de dataset falla
-- con `42703: record "new" has no field "content"`. Ningún dataset podía
-- recibir filas, ni desde el panel, ni desde la API, ni desde una importación.
--
-- Se creía un artefacto de una base concreta (ver el script
-- `scripts/reparar-busqueda-de-datasets.ts`); una base nueva migrada para la
-- prueba de Aniimo lo reprodujo, así que es de la cadena y se arregla en ella.
-- 0022 no se edita: ya está aplicada en bases existentes y el runner rechaza
-- una migración aplicada cuyo contenido cambia.
--
-- Mismo vector de búsqueda, con las columnas que existen: título y datos.
-- Idempotente: en una base ya reparada a mano deja la misma función.

CREATE OR REPLACE FUNCTION data_entries_search_update()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.title, '') || ' ' ||
    COALESCE(NEW.data::text, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
