-- 0047 — Permisos finos, claves y cuotas de agentes (fase E, 2026-10-23)
-- ============================================================================
-- Idempotente: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS en todo. Correrla dos
-- veces no cambia nada.
--
-- 1. agent_api_keys: nombre, revocación (la fila se QUEDA para auditar: antes
--    revocar era DELETE y el rastro de la clave desaparecía) y de qué clave
--    viene al rotar. La caducidad (`expires_at`) y el último uso
--    (`last_used_at`) ya existían.
-- 2. agent_identities: cuotas por día UTC. NULL = sin límite. `rate_limit`
--    (peticiones por minuto) ya existía.
-- 3. agent_quota_usage: el contador diario cuando Valkey no está (la reserva;
--    con Valkey arriba se cuenta allí). Sin RLS a propósito: solo lo toca el
--    middleware de cuotas, y la clave es el agente, no un usuario.
--
-- Los scopes siguen en `agent_identities.scopes` (jsonb): los finos
-- (`kon:<kon>:<op>`, `datasets:<slug>:<acción>`) y las denegaciones
-- (`!patrón`) son texto en la misma lista. No hace falta columna nueva.

ALTER TABLE agent_api_keys ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE agent_api_keys ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE agent_api_keys ADD COLUMN IF NOT EXISTS revoked_by text;
ALTER TABLE agent_api_keys ADD COLUMN IF NOT EXISTS rotated_from text;

CREATE INDEX IF NOT EXISTS agent_api_keys_revoked_at_idx ON agent_api_keys (revoked_at);

ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS writes_per_day integer;
ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS budget_units_per_day integer;

CREATE TABLE IF NOT EXISTS agent_quota_usage (
  agent_id text NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
  day date NOT NULL,
  writes integer NOT NULL DEFAULT 0,
  units integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, day)
);

-- Permisos del rol de aplicación (igual que 0046): `start-with-check.sh`
-- concede lo mismo en cada arranque; esto cubre migrar con el runner a mano.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kitsuden_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON agent_quota_usage TO kitsuden_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON agent_api_keys TO kitsuden_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON agent_identities TO kitsuden_app;
  END IF;
END $$;
