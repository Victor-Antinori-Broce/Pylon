-- ═══════════════════════════════════════════════════════════════════════════
-- auth_sessions: poner la tabla en la forma que el código espera
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La migración base (drizzle/0000_amusing_lethal_legion.sql) creó una versión
-- ANTIGUA de la tabla:
--
--     id, value, expires_at, created_at, updated_at
--
-- El código (`schema-core.ts`) declara la actual de better-auth:
--
--     id, expires_at, token, ip_address, user_agent, user_id, created_at, updated_at
--
-- `value` pasó a llamarse `token`, y se añadieron `user_id`, `ip_address` y
-- `user_agent`. Nadie escribió la migración correspondiente.
--
-- ── POR QUÉ COSTÓ TANTO VERLO ──────────────────────────────────────────────
--
-- Porque la tabla EXISTÍA. Una comprobación que solo mire nombres de tabla da
-- el esquema por bueno y sigue adelante; el fallo aparece en la primera
-- consulta que use una de las columnas nuevas. Aquí eso era iniciar sesión —
-- justo el paso final del alta del primer administrador, después de haber
-- creado usuario y credencial correctamente:
--
--     column "token" of relation "auth_sessions" does not exist
--
-- Por eso `scripts/verificar-esquema.ts` compara ahora columna a columna, y no
-- solo la lista de tablas.
--
-- ── SOBRE BORRAR LAS SESIONES ──────────────────────────────────────────────
--
-- `token` y `user_id` son NOT NULL, y no hay valor razonable que inventar para
-- las filas viejas: `value` es un token del formato antiguo y `user_id` no
-- existe en ninguna parte de esa fila. Como una sesión es efímera por
-- definición, se vacía la tabla: quien estuviera dentro vuelve a entrar. El
-- coste es un inicio de sesión; la alternativa sería adivinar a qué usuario
-- pertenece cada sesión.

DELETE FROM auth_sessions;

ALTER TABLE auth_sessions DROP COLUMN IF EXISTS value;

ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS token text;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS user_id text;

-- Las restricciones se ponen DESPUÉS de crear las columnas y con la tabla ya
-- vacía, que es cuando NOT NULL puede aplicarse sin inventar valores.
ALTER TABLE auth_sessions ALTER COLUMN token SET NOT NULL;
ALTER TABLE auth_sessions ALTER COLUMN user_id SET NOT NULL;

-- El token identifica la sesión: dos iguales harían que cuál se valida
-- dependiera del orden de lectura.
CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_token_unique ON auth_sessions(token);

-- Al borrar un usuario, sus sesiones tienen que morir con él; si no, quedan
-- credenciales válidas apuntando a una cuenta que ya no existe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_sessions_user_id_fkey'
  ) THEN
    ALTER TABLE auth_sessions
      ADD CONSTRAINT auth_sessions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;
  END IF;
END
$$;

-- Cada petición autenticada busca la sesión por su token, y el cierre de sesión
-- de un usuario las busca todas por user_id.
CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id);
