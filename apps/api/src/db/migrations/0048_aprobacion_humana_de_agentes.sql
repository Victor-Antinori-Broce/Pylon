-- 0048 — Aprobación humana de lo que piden los agentes (fase F, 2026-10-24)
-- ============================================================================
-- Idempotente: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS en todo. Correrla dos
-- veces no cambia nada.
--
-- 1. agent_identities.approval_mode: `inherit` (de fábrica: decide el
--    interruptor global), `propose` (todo lo que escribe queda como propuesta)
--    o `direct` (nunca pide aprobación). Lo valida la API; sin CHECK para que
--    añadir un modo no exija otra migración.
-- 2. approval_settings: la configuración (una fila, `id = 'global'`): el
--    interruptor, la vida de una propuesta, lo sensible por operación y las
--    reglas de rutas legadas. Sin fila = la configuración de fábrica (APAGADA).
-- 3. agent_proposals: cada petición retenida. El cuerpo se guarda SIN
--    secretos (una petición con secretos no puede quedar como propuesta: la
--    API la rechaza con KITSUDEN_E_APPROVAL_UNSUPPORTED). El resultado real de
--    la ejecución se queda aquí para que el agente lo lea.
--
-- Sin RLS a propósito (como agent_quota_usage): solo las tocan la API y sus
-- rutas de aprobación (personal humano) y estado (el agente, solo lo suyo,
-- filtrado en el código). No se exponen en el explorador de datos (`/api/items`
-- es solo admin).
--
-- La auditoría (quién encendió qué, quién propuso, aprobó o rechazó, y el
-- resultado) va a agent_audit_logs, con acciones `approval_*` / `proposal_*`.

ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS approval_mode text NOT NULL DEFAULT 'inherit';

CREATE TABLE IF NOT EXISTS approval_settings (
  id text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
  key_id text,
  channel text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  kon_id text,
  operation_id text,
  operation_key text,
  tool text,
  body jsonb,
  content_type text,
  fingerprint text NOT NULL,
  idempotency_key text,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text NOT NULL,
  diff jsonb,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by text,
  decided_at timestamptz,
  decision_comment text,
  executed_at timestamptz,
  result_status integer,
  result_content_type text,
  result_body jsonb,
  result_error text
);

CREATE INDEX IF NOT EXISTS agent_proposals_status_idx ON agent_proposals (status, created_at);
CREATE INDEX IF NOT EXISTS agent_proposals_agent_idx ON agent_proposals (agent_id, created_at);
CREATE INDEX IF NOT EXISTS agent_proposals_fingerprint_idx ON agent_proposals (agent_id, fingerprint);
-- Una clave de idempotencia es de UN agente y de UNA propuesta (NULL no choca).
CREATE UNIQUE INDEX IF NOT EXISTS agent_proposals_idempotency_idx
  ON agent_proposals (agent_id, idempotency_key);

-- Permisos del rol de aplicación (igual que 0046/0047).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kitsuden_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON approval_settings TO kitsuden_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON agent_proposals TO kitsuden_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON agent_identities TO kitsuden_app;
  END IF;
END $$;
