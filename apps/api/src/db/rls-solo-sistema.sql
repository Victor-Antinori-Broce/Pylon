-- ============================================================================
-- RLS — Tablas del NÚCLEO que solo leen el sistema y la administración
-- ============================================================================
--
-- POR QUÉ (auditoría 2026-10-15)
--
-- `rls-owned-tables.sql` aísla lo que ES de una persona. Quedaban fuera las
-- tablas del núcleo que no son de nadie pero guardan secretos o rastros
-- personales: credenciales (`data_sources.password`, `kitsuden_secrets`,
-- `api_keys`, `agent_api_keys`), tokens de verificación de better-auth,
-- registros con IP (`audit_logs`, `agent_audit_logs`), la configuración de las
-- acciones (secretos de webhooks) y el código de las funciones, y los emails
-- de `auth_users`.
--
-- Se demostró que una sola puerta de aplicación no basta: `/api/graph/<tabla>`
-- dejaba leer TODAS ellas a cualquier cuenta (corregido en
-- services/graphify.ts). Con estas políticas, cualquier superficie que corra
-- en la transacción RLS de una petición (Graphify, GraphQL, Vault, entries)
-- devuelve CERO filas a quien no es admin, aunque su puerta de aplicación
-- vuelva a fallar.
--
-- PATRÓN
--
--   USING / CHECK:  contexto vacío o NULL (sistema: better-auth, workers,
--                   migraciones, cualquier ruta que no abra transacción RLS)
--                   | rol admin
--                   (+ en `auth_users`, la fila propia)
--
-- `auth_verifications` NO admite ni a admin: sus filas son tokens vivos de
-- verificación y restablecimiento, y solo better-auth (contexto vacío) los
-- necesita.
--
-- FORCE es obligatorio: sin él, el dueño de la tabla queda exento.
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE. Solo actúa sobre
-- las tablas que existen.
-- ============================================================================

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('kitsuden_secrets'),
      ('data_sources'),
      ('api_keys'),
      ('agent_api_keys'),
      -- OAuth para MCP (0055): hashes de códigos, tokens y secretos de cliente
      ('oauth_clients'),
      ('oauth_authorization_requests'),
      ('oauth_grants'),
      ('oauth_codes'),
      ('oauth_tokens'),
      ('audit_logs'),
      ('agent_audit_logs'),
      ('actions'),
      ('action_executions'),
      ('kitsuden_functions')
    ) AS s(table_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t.table_name
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t.table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I',
        t.table_name || '_solo_sistema', t.table_name);
      EXECUTE format($POLICY$
        CREATE POLICY %I ON %I
          FOR ALL
          TO PUBLIC
          USING (
            ((current_setting('app.current_user_id', true) = ''
              OR current_setting('app.current_user_id', true) IS NULL)
             AND COALESCE(current_setting('app.current_user_role', true), '') = '')
            OR current_setting('app.current_user_role', true) = 'admin'
          )
          WITH CHECK (
            ((current_setting('app.current_user_id', true) = ''
              OR current_setting('app.current_user_id', true) IS NULL)
             AND COALESCE(current_setting('app.current_user_role', true), '') = '')
            OR current_setting('app.current_user_role', true) = 'admin'
          )
      $POLICY$, t.table_name || '_solo_sistema', t.table_name);
    END IF;
  END LOOP;
END $$;

-- auth_users: cada cual su fila; admin y sistema, todas.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'auth_users'
  ) THEN
    ALTER TABLE auth_users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE auth_users FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS auth_users_propia_o_sistema ON auth_users;
    CREATE POLICY auth_users_propia_o_sistema ON auth_users
      FOR ALL
      TO PUBLIC
      USING (
        ((current_setting('app.current_user_id', true) = ''
          OR current_setting('app.current_user_id', true) IS NULL)
         AND COALESCE(current_setting('app.current_user_role', true), '') = '')
        OR current_setting('app.current_user_role', true) = 'admin'
        OR id::text = current_setting('app.current_user_id', true)
      )
      WITH CHECK (
        ((current_setting('app.current_user_id', true) = ''
          OR current_setting('app.current_user_id', true) IS NULL)
         AND COALESCE(current_setting('app.current_user_role', true), '') = '')
        OR current_setting('app.current_user_role', true) = 'admin'
      );
  END IF;
END $$;

-- auth_verifications: solo el sistema (better-auth corre sin contexto).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'auth_verifications'
  ) THEN
    ALTER TABLE auth_verifications ENABLE ROW LEVEL SECURITY;
    ALTER TABLE auth_verifications FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS auth_verifications_solo_sistema ON auth_verifications;
    CREATE POLICY auth_verifications_solo_sistema ON auth_verifications
      FOR ALL
      TO PUBLIC
      USING (
        ((current_setting('app.current_user_id', true) = ''
          OR current_setting('app.current_user_id', true) IS NULL)
         AND COALESCE(current_setting('app.current_user_role', true), '') = '')
      )
      WITH CHECK (
        ((current_setting('app.current_user_id', true) = ''
          OR current_setting('app.current_user_id', true) IS NULL)
         AND COALESCE(current_setting('app.current_user_role', true), '') = '')
      );
  END IF;
END $$;
