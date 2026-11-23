-- 0060 — kitsuden_links: la puerta del SISTEMA exige id Y rol vacíos
-- ============================================================================
-- La política de 0032 trataba como sistema cualquier contexto con el id
-- vacío. El anónimo de una petición lleva id '' y rol `anonymous`, así que
-- atravesaba la política como si fuera una migración o un worker, igual que
-- pasó con data_entries (2026-10-23). Además una fila sin dueño
-- (`owner_id IS NULL`) la leía y la escribía cualquiera, anónimo incluido.
--
-- Ahora, con el mismo criterio que data_entries_owner_isolation:
--   · sistema = id Y rol vacíos (o sin fijar);
--   · `admin` lo ve y lo cambia todo;
--   · el dueño, lo suyo;
--   · una fila sin dueño la LEE cualquier usuario con sesión (id no vacío),
--     pero solo la escriben el sistema y `admin`.
--
-- DROP + CREATE: un CREATE POLICY no reemplaza una política existente.

DROP POLICY IF EXISTS kitsuden_links_owner_isolation ON kitsuden_links;
CREATE POLICY kitsuden_links_owner_isolation ON kitsuden_links
  FOR ALL
  TO PUBLIC
  USING (
    (COALESCE(current_setting('app.current_user_id', true), '') = ''
     AND COALESCE(current_setting('app.current_user_role', true), '') = '')
    OR current_setting('app.current_user_role', true) = 'admin'
    OR owner_id = current_setting('app.current_user_id', true)
    OR (owner_id IS NULL AND COALESCE(current_setting('app.current_user_id', true), '') <> '')
  )
  WITH CHECK (
    (COALESCE(current_setting('app.current_user_id', true), '') = ''
     AND COALESCE(current_setting('app.current_user_role', true), '') = '')
    OR current_setting('app.current_user_role', true) = 'admin'
    OR owner_id = current_setting('app.current_user_id', true)
  );
