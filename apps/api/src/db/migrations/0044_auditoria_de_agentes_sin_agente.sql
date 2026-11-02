-- ============================================================================
-- 0044 — Auditar los intentos de autenticación de agentes que no existen
-- ============================================================================
--
-- Cuando un agente fallaba al autenticarse con una clave inexistente o mal
-- formada, `authenticateAgent` escribía en `agent_audit_logs` con
-- `agent_id = 'unknown'`. Esa fila viola la FK a `agent_identities`
-- (23503): el INSERT fallaba, el log decía "Failed to write agent audit log"
-- y el intento NO quedaba registrado. Es decir: justo los intentos que más
-- interesa auditar —alguien probando claves— eran los únicos que se perdían.
--
-- Se permite NULL en `agent_id` en vez de crear otra tabla: un fallo de
-- autenticación es una entrada más de la misma auditoría (mismas columnas,
-- mismas consultas en el panel y en /metrics), y NULL es exactamente «no hay
-- agente». La FK se mantiene para las filas que sí lo tienen: NULL no la
-- comprueba, y un id que no existe sigue siendo un error.
--
-- La tabla es de sistema (`rls-solo-sistema.sql`): no cambia su RLS.
-- Idempotente: DROP NOT NULL sobre una columna que ya admite NULL no hace nada.

ALTER TABLE agent_audit_logs ALTER COLUMN agent_id DROP NOT NULL;

-- Las filas de fallos sin agente se consultan por fecha y acción (índices que
-- ya existen); no hace falta índice nuevo.
