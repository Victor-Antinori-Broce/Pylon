-- ============================================================================
-- 0043 — Entradas de un dataset, en orden, sin recorrer la tabla entera
-- ============================================================================
--
-- `GET /api/data-sets/:id/entries` es la ruta más pedida de la API (el sitio
-- público lee así cada tabla, tier list y ficha) y pide
--
--     WHERE data_set_id = $1 ORDER BY sort_order, id LIMIT n OFFSET m
--
-- Ningún índice servía a las dos cosas a la vez. Para los datasets grandes
-- (39 pasan de 1.000 filas, el mayor ronda las 45.000) el planificador elegía
-- `entries_sort_idx` —sort_order de TODA la tabla— y descartaba fila a fila
-- las de otros datasets. Medido en una copia de producción: 1,6–1,9 s para la
-- tercera página de 1.000 del dataset mayor, 118.000 filas leídas y tiradas.
-- Con este índice la misma consulta lee solo las suyas, ya ordenadas.
--
-- `entries_dataset_idx` (data_set_id) sobra: es prefijo exacto de este y de
-- otros dos (`data_entries_set_status_idx`, `idx_data_entries_dataset_owner`).
-- Mantenerlo solo cuesta escrituras.
--
-- Sin CONCURRENTLY a propósito: el runner aplica cada fichero dentro de una
-- transacción y CONCURRENTLY no puede ir en una. Con ~200.000 filas el CREATE
-- tarda alrededor de un segundo y solo bloquea ESCRITURAS en data_entries
-- (las lecturas siguen); hazlo fuera de una carga de datos.

CREATE INDEX IF NOT EXISTS data_entries_set_orden_idx
  ON data_entries (data_set_id, sort_order, id);

DROP INDEX IF EXISTS entries_dataset_idx;
