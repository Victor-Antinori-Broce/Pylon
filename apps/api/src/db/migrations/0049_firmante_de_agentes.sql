-- 0049 — El firmante humano de cada agente (fase F, decisión del propietario, 2026-10-24)
-- ============================================================================
-- Idempotente: ADD COLUMN IF NOT EXISTS.
--
-- 1. agent_identities.sponsor_user_id: la cuenta humana que FIRMA lo que el
--    agente crea (autor de una entrada del blog, dueño de una entrada de
--    dataset). NULL = sin firmante (lo de antes). La elige un admin.
--
--    SIN clave foránea a propósito: si la cuenta se borra, el id se queda y la
--    API sabe que el agente TENÍA firmante y ya no vale (403
--    KITSUDEN_E_AGENT_SPONSOR_INVALID hasta que un admin lo reasigne). Con
--    `ON DELETE SET NULL` el agente volvería en silencio a «sin firmante».
--
-- 2. agent_proposals.sponsor_user_id: el firmante con el que se propuso y,
--    tras aprobarla, con el que se ejecutó (agente + firmante + aprobador).

ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS sponsor_user_id text;
ALTER TABLE agent_proposals ADD COLUMN IF NOT EXISTS sponsor_user_id text;
CREATE INDEX IF NOT EXISTS agent_identities_sponsor_idx ON agent_identities (sponsor_user_id);
