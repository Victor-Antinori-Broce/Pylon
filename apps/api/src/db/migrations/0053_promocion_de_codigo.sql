-- 0053 — Promoción de código escrito por agentes (fase I, 2026-10-28)
-- ============================================================================
-- Idempotente: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / DO $$ … $$ en todo.
-- Guía: docs/agents/promotion.md. Código: apps/api/src/lib/promocion.ts.
--
-- 1. agent_identities.promotion_mode: cómo se promociona el código de ESE
--    agente: `suggestion` (de fábrica: siempre una propuesta para un humano) o
--    `turbo` (se activa solo si TODO pasa y nada amplía permisos; y solo si el
--    tope global `turboAllowed`, en approval_settings id='code_promotion', lo
--    permite). Lo cambia un admin humano.
--
-- 2. code_versions: cada borrador de código de una acción, versionado. La
--    versión activa NUNCA se edita: un cambio es otra fila. Guarda el código,
--    lo que DECLARA (scopes, hosts, límites), sus pruebas, los informes de las
--    pruebas y del escaneo, el diff de capacidades, la decisión y su motivo,
--    la propuesta de la bandeja (fase F), la activación y la vigilancia, y la
--    vuelta atrás (quién, cuándo, por qué). `origin = 'baseline'` es la foto
--    de la acción ANTES de su primera versión promocionada (para poder volver);
--    `origin = 'manual'`, una edición del código hecha a mano por una persona
--    (admin) en /api/actions, que también queda versionada y auditada.
--    RLS (rls-owned-tables.sql, «Code promotion»): un agente lee SOLO sus
--    filas; un admin humano y el sistema, todas; escribe solo el sistema (la
--    API) o un admin humano.

ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS promotion_mode text NOT NULL DEFAULT 'suggestion';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_identities_promotion_mode_chk') THEN
    ALTER TABLE agent_identities
      ADD CONSTRAINT agent_identities_promotion_mode_chk CHECK (promotion_mode IN ('suggestion', 'turbo'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS code_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind text NOT NULL DEFAULT 'action',
  target_id uuid REFERENCES actions(id) ON DELETE SET NULL,
  target_slug text NOT NULL,
  target_name text NOT NULL,
  version_number integer NOT NULL,
  origin text NOT NULL DEFAULT 'agent',
  agent_id text,
  key_id text,
  sponsor_user_id text,
  channel text NOT NULL DEFAULT 'rest',
  description text,
  code text NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  tests jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_hash text NOT NULL,
  base_hash text,
  parent_version_id uuid,
  mode text NOT NULL DEFAULT 'suggestion',
  status text NOT NULL,
  test_report jsonb,
  scan_report jsonb,
  capability_diff jsonb,
  decision jsonb,
  proposal_id uuid REFERENCES agent_proposals(id) ON DELETE SET NULL,
  previous_version_id uuid,
  activated_at timestamptz,
  activated_by text,
  watch_until timestamptz,
  watch jsonb,
  rolled_back_at timestamptz,
  rolled_back_by text,
  rollback_reason text,
  activation_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT code_versions_origin_chk CHECK (origin IN ('agent', 'baseline', 'manual')),
  CONSTRAINT code_versions_mode_chk CHECK (mode IN ('suggestion', 'turbo')),
  CONSTRAINT code_versions_status_chk CHECK (status IN (
    'awaiting_approval', 'approved', 'active', 'superseded', 'rolled_back', 'rejected', 'expired', 'failed'
  )),
  CONSTRAINT code_versions_agent_chk CHECK (origin <> 'agent' OR agent_id IS NOT NULL)
);

-- Una base que ya tenía la tabla con las comprobaciones de la primera versión
-- de esta migración (sin `manual`): se redefinen (idempotente).
DO $$
BEGIN
  ALTER TABLE code_versions DROP CONSTRAINT IF EXISTS code_versions_origin_chk;
  ALTER TABLE code_versions ADD CONSTRAINT code_versions_origin_chk CHECK (origin IN ('agent', 'baseline', 'manual'));
  ALTER TABLE code_versions DROP CONSTRAINT IF EXISTS code_versions_agent_chk;
  ALTER TABLE code_versions ADD CONSTRAINT code_versions_agent_chk CHECK (origin <> 'agent' OR agent_id IS NOT NULL);
END $$;

-- Reenviar el MISMO borrador no crea otro: (agente, acción, huella del contenido).
CREATE UNIQUE INDEX IF NOT EXISTS code_versions_dedupe_idx
  ON code_versions (agent_id, target_slug, content_hash) WHERE origin = 'agent';
CREATE UNIQUE INDEX IF NOT EXISTS code_versions_number_idx ON code_versions (target_slug, version_number);
-- Una sola versión activa por acción.
CREATE UNIQUE INDEX IF NOT EXISTS code_versions_one_active_idx
  ON code_versions (target_slug) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS code_versions_agent_idx ON code_versions (agent_id, created_at);
CREATE INDEX IF NOT EXISTS code_versions_status_idx ON code_versions (status, created_at);
CREATE INDEX IF NOT EXISTS code_versions_proposal_idx ON code_versions (proposal_id);
CREATE INDEX IF NOT EXISTS code_versions_watch_idx
  ON code_versions (watch_until) WHERE status = 'active' AND watch_until IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kitsuden_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON code_versions TO kitsuden_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON agent_identities TO kitsuden_app;
  END IF;
END $$;
