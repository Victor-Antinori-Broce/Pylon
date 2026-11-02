-- 0058 — Avisar al agente cuando se resuelve su propuesta (kitsuden2.md B3, 2026-10-28)
-- ============================================================================
-- Hasta ahora el agente solo tenía la URL `/api/proposals/<id>` y consultaba.
-- Ahora, al ejecutarse, fallar, rechazarse o caducar una propuesta:
--
--   · Webhook FIRMADO a la URL que un admin configure para ese agente
--     (`X-Kitsuden-Signature: t=<unix>,v1=<HMAC-SHA256>`), entregado por la
--     cola de Postgres: reintentos con espera y «dead letter» en el panel.
--   · Evento SSE en `GET /api/proposals/<id>/events` (sin configurar nada).
--
-- Tabla aparte (y no columnas en agent_identities) a propósito: las rutas de
-- agentes hacen `SELECT *` y devuelven la fila entera; el secreto de firma no
-- debe viajar nunca, ni cifrado. Se guarda cifrado (AES-256-GCM, la misma
-- clave que el gestor de secretos) y solo se enseña al crearlo o rotarlo.

CREATE TABLE IF NOT EXISTS agent_notify_settings (
  agent_id text PRIMARY KEY REFERENCES agent_identities(id) ON DELETE CASCADE,
  url text,
  secret jsonb,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kitsuden_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON agent_notify_settings TO kitsuden_app;
  END IF;
END $$;
