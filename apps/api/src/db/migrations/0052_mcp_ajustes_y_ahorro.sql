-- 0052 — MCP: ajustes por agente y ahorro de formato por día (2026-10-28)
-- ============================================================================
-- Idempotente: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS en todo.
--
-- 1. agent_identities.mcp_settings: lo que el panel fija para las sesiones MCP
--    del agente. Hoy dos claves (ver lib/ajustes-mcp.ts):
--      toolset        conjunto de herramientas por defecto (`read`, `kon:blog`…).
--                     Solo ESTRECHA lo que `allowedTools` y los scopes dejan;
--                     `?toolset=` al conectar estrecha más, nunca amplía.
--      untrustedWrap  cómo envolver el texto escrito por terceros en los
--                     resultados: `none` (por defecto, lo de siempre),
--                     `delimiters` o `object`. Ver docs/agents/untrusted-content.md.
--    `{}` = nada fijado = el comportamiento de antes de esta migración.
--
-- 2. agent_format_savings: lo que el formato `auto` ahorró frente a JSON
--    compacto, por agente, día UTC y canal (`mcp` | `rest`). Solo contadores:
--    ni argumentos, ni respuestas, ni quién era el usuario. Sin RLS a propósito
--    (igual que agent_quota_usage): solo lo escribe la API y lo lee el panel de
--    admin; la clave es el agente, no una persona.

ALTER TABLE agent_identities ADD COLUMN IF NOT EXISTS mcp_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS agent_format_savings (
  agent_id text NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
  day date NOT NULL,
  channel text NOT NULL DEFAULT 'mcp',
  responses integer NOT NULL DEFAULT 0,
  -- respuestas en las que `auto` eligió algo que no era JSON
  compacted integer NOT NULL DEFAULT 0,
  json_bytes bigint NOT NULL DEFAULT 0,
  sent_bytes bigint NOT NULL DEFAULT 0,
  json_tokens_est bigint NOT NULL DEFAULT 0,
  sent_tokens_est bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, day, channel)
);

CREATE INDEX IF NOT EXISTS agent_format_savings_day_idx ON agent_format_savings (day);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kitsuden_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON agent_format_savings TO kitsuden_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON agent_identities TO kitsuden_app;
  END IF;
END $$;
