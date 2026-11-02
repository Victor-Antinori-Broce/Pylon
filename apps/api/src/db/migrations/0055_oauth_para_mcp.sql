-- 0055 — OAuth 2.1 para MCP (2026-10-28)
-- ============================================================================
-- Idempotente: IF NOT EXISTS en todo. Ver lib/oauth/ y docs/agents/oauth.md.
--
-- Spec: MCP Authorization 2026-07-28 (OAuth 2.1 + RFC 8414/9728/8707/7591/7009/
-- 9207 + Client ID Metadata Documents).
--
-- Lo que un cliente MCP (Claude, Cursor…) consigue con OAuth es lo MISMO que
-- con una clave estática: actuar como un AGENTE ya existente (o creado en la
-- pantalla de consentimiento). Por eso cada concesión cuelga de una fila de
-- `agent_api_keys` con algorithm = 'oauth' (su key_hash es un marcador que no
-- verifica nunca): scopes, denegaciones, aprobaciones, cuotas, RLS, firmante y
-- auditoría siguen leyendo esa fila y el agente, sin camino paralelo. Revocar
-- esa fila (pestaña «Claves» del agente) corta la conexión igual que revocar la
-- concesión.
--
-- Ningún secreto en claro: códigos, tokens y secretos de cliente se guardan
-- como SHA-256 del valor (todos son aleatorios de 256 bits; argon2 no añade
-- nada sobre un secreto que no se puede adivinar).
--
-- Sin RLS por dueño: solo las toca la API con contexto de sistema; quedan en
-- rls-solo-sistema.sql (sistema o admin), como agent_api_keys.

-- 1. Clientes: registrados por DCR (RFC 7591) o leídos de un Client ID
--    Metadata Document (client_id = URL https).
CREATE TABLE IF NOT EXISTS oauth_clients (
  id text PRIMARY KEY,                         -- el client_id
  kind text NOT NULL DEFAULT 'dcr',            -- 'dcr' | 'cimd'
  client_name text NOT NULL,
  client_uri text,
  logo_uri text,
  software_id text,
  software_version text,
  redirect_uris jsonb NOT NULL DEFAULT '[]'::jsonb,
  grant_types jsonb NOT NULL DEFAULT '["authorization_code","refresh_token"]'::jsonb,
  token_endpoint_auth_method text NOT NULL DEFAULT 'none',
  secret_hash text,                            -- solo clientes confidenciales
  registered_ip text,
  metadata_expires_at timestamptz,             -- CIMD: cuándo volver a leer el documento
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS oauth_clients_created_at_idx ON oauth_clients (created_at);

-- 2. Peticiones de autorización pendientes de consentimiento (10 min).
CREATE TABLE IF NOT EXISTS oauth_authorization_requests (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  state text,
  code_challenge text NOT NULL,
  requested_scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  resource text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  decided_at timestamptz
);
CREATE INDEX IF NOT EXISTS oauth_authorization_requests_expires_idx ON oauth_authorization_requests (expires_at);

-- 3. Concesiones: un humano dejó a un cliente actuar como un agente.
CREATE TABLE IF NOT EXISTS oauth_grants (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  agent_id text NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
  key_id text NOT NULL REFERENCES agent_api_keys(id) ON DELETE CASCADE,
  user_id text NOT NULL,                       -- el humano que consintió (firmante)
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  resource text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by text,
  revoked_reason text
);
CREATE INDEX IF NOT EXISTS oauth_grants_agent_idx ON oauth_grants (agent_id);
CREATE INDEX IF NOT EXISTS oauth_grants_client_idx ON oauth_grants (client_id);
CREATE INDEX IF NOT EXISTS oauth_grants_user_idx ON oauth_grants (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS oauth_grants_key_idx ON oauth_grants (key_id);

-- 4. Códigos de autorización (60 s, un solo uso).
CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash text PRIMARY KEY,
  grant_id text NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  resource text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  family_id text                               -- la familia que emitió (para revocarla si se reusa)
);
CREATE INDEX IF NOT EXISTS oauth_codes_expires_idx ON oauth_codes (expires_at);

-- 5. Tokens de acceso y de refresco. Una FAMILIA = todo lo que sale de un
--    código; reusar un refresco ya gastado revoca la familia entera.
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id text PRIMARY KEY,
  token_hash text NOT NULL,
  kind text NOT NULL,                          -- 'access' | 'refresh'
  grant_id text NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE,
  family_id text NOT NULL,
  client_id text NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  resource text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  family_expires_at timestamptz NOT NULL,
  used_at timestamptz,                         -- refresco ya canjeado
  revoked_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS oauth_tokens_hash_idx ON oauth_tokens (token_hash);
CREATE INDEX IF NOT EXISTS oauth_tokens_family_idx ON oauth_tokens (family_id);
CREATE INDEX IF NOT EXISTS oauth_tokens_grant_idx ON oauth_tokens (grant_id);
CREATE INDEX IF NOT EXISTS oauth_tokens_expires_idx ON oauth_tokens (expires_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kitsuden_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      oauth_clients, oauth_authorization_requests, oauth_grants, oauth_codes, oauth_tokens
      TO kitsuden_app;
  END IF;
END $$;
