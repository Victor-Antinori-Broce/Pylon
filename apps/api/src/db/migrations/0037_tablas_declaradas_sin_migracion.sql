-- ═══════════════════════════════════════════════════════════════════════════
-- Tablas declaradas en schema-core.ts que ninguna migración creaba
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Las encontró `scripts/verificar-esquema.ts` al comparar contra un Postgres
-- REAL recién inicializado. La comprobación equivalente con pg-mem no valía:
-- no entiende parte del SQL de las migraciones y daba por ausentes tablas que
-- en Postgres sí existen.
--
-- `kitsuden_secrets` merece explicación aparte. El servicio de secretos hacía
-- un `CREATE TABLE IF NOT EXISTS` en caliente al arrancar, y cuando fallaba
-- registraba «[Secrets] Boot injection skipped (DB unavailable?)». La base
-- estaba perfectamente disponible: lo que faltaba era la tabla, y el mensaje
-- culpaba a la conexión.
--
-- Ese apaño además ya no puede funcionar: desde que la API se conecta con un
-- rol sin privilegios —para que RLS se aplique de verdad— no tiene CREATE sobre
-- el esquema. Y está bien que así sea: crear tablas es trabajo de una migración,
-- no de un servicio arrancando.

-- ── Auditoría de agentes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      text NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
  key_id        text,
  action        text NOT NULL,
  resource      text,
  resource_id   text,
  details       jsonb DEFAULT '{}'::jsonb,
  ip_address    text,
  user_agent    text,
  duration_ms   integer,
  success       boolean NOT NULL DEFAULT true,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_audit_agent_id_idx   ON agent_audit_logs(agent_id);
CREATE INDEX IF NOT EXISTS agent_audit_created_at_idx ON agent_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS agent_audit_action_idx     ON agent_audit_logs(action);

-- ── Conexiones a fuentes externas ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'data_source_type') THEN
    CREATE TYPE data_source_type AS ENUM
      ('postgresql', 'mysql', 'mongodb', 'redis', 'api', 'webhook');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS data_sources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  type         data_source_type NOT NULL,
  host         text,
  port         integer,
  database     text,
  username     text,
  -- Credencial de la fuente externa. Conviene guardarla como secreto y dejar
  -- aquí solo la referencia; hoy el esquema la admite en claro.
  password     text,
  url          text,
  headers      jsonb DEFAULT '{}'::jsonb,
  is_active    boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS data_sources_type_idx       ON data_sources(type);
CREATE INDEX IF NOT EXISTS data_sources_is_active_idx  ON data_sources(is_active);
CREATE INDEX IF NOT EXISTS data_sources_created_at_idx ON data_sources(created_at);

-- ── Gestor de secretos (AES-256-GCM) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kitsuden_secrets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key              varchar(200) NOT NULL,
  -- Valor cifrado en hexadecimal. Nunca en claro, ni en logs.
  value_encrypted  text NOT NULL,
  iv               varchar(32) NOT NULL,
  auth_tag         varchar(32) NOT NULL,
  description      text,
  category         varchar(100) NOT NULL DEFAULT 'general',
  auto_inject      boolean NOT NULL DEFAULT true,
  last_rotated_at  timestamptz,
  last_injected_at timestamptz,
  created_by_id    text REFERENCES auth_users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- La clave identifica el secreto: dos filas con la misma harían que cuál se
-- inyecta dependiera del orden de lectura.
CREATE UNIQUE INDEX IF NOT EXISTS kitsuden_secrets_key_unique ON kitsuden_secrets(key);
