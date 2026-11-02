-- ═══════════════════════════════════════════════════════════════════════════
-- Las dos tablas de autenticación que nunca creó ninguna migración
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `auth_users` y `auth_sessions` las crea la migración base
-- (drizzle/0000_amusing_lethal_legion.sql). `auth_accounts` y
-- `auth_verifications` las declara `src/db/schema-core.ts` y **no las creaba
-- nadie**.
--
-- Consecuencia: sobre una base limpia era IMPOSIBLE crear el primer
-- administrador. La pantalla «System Init» devolvía 500 y el log decía
--
--     relation "auth_accounts" does not exist
--
-- better-auth guarda el usuario en `auth_users` y la CREDENCIAL en
-- `auth_accounts` (provider_id = 'credential'), así que la inserción fallaba a
-- mitad: el usuario se creaba y la contraseña no. Con el usuario ya presente,
-- reintentar tampoco arreglaba nada.
--
-- No se había detectado porque nadie había arrancado nunca contra una base
-- vacía: las instalaciones existentes tenían esas tablas de antes de que el
-- esquema se llevara a migraciones.
--
-- Las columnas se copian de `schema-core.ts`, que es lo que la aplicación
-- consulta. Si divergen, `tests/unit/core-schema-drift.test.ts` lo detecta
-- ejecutando un SELECT real contra el esquema migrado.

CREATE TABLE IF NOT EXISTS auth_accounts (
  id                       text PRIMARY KEY,
  account_id               text NOT NULL,
  provider_id              text NOT NULL,
  user_id                  text NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  access_token             text,
  refresh_token            text,
  id_token                 text,
  access_token_expires_at  timestamptz,
  refresh_token_expires_at timestamptz,
  scope                    text,
  -- Hash de la contraseña para el proveedor 'credential'. Nunca en claro.
  password                 text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- better-auth busca la credencial por (user_id, provider_id) en cada inicio de
-- sesión; sin índice eso es un recorrido completo en cada intento.
CREATE INDEX IF NOT EXISTS auth_accounts_user_id_idx ON auth_accounts(user_id);
CREATE INDEX IF NOT EXISTS auth_accounts_provider_idx ON auth_accounts(provider_id, account_id);

CREATE TABLE IF NOT EXISTS auth_verifications (
  id         text PRIMARY KEY,
  identifier text NOT NULL,
  value      text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Las verificaciones se buscan siempre por `identifier` (correo o token) y se
-- purgan por `expires_at`.
CREATE INDEX IF NOT EXISTS auth_verifications_identifier_idx ON auth_verifications(identifier);
CREATE INDEX IF NOT EXISTS auth_verifications_expires_idx ON auth_verifications(expires_at);
