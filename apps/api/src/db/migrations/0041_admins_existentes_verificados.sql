-- Los administradores que ya existen no se quedan fuera al exigir verificación
-- ============================================================================
--
-- ── POR QUE HACE FALTA ─────────────────────────────────────────────────────
--
-- `better-auth` pasa a exigir email verificado para entrar con contraseña
-- (`emailAndPassword.requireEmailVerification: true`). Hasta ahora nada
-- verificaba nada: el alta del primer administrador en `/api/system/setup`
-- creaba la cuenta con `email_verified = false`, y así se quedó.
--
-- Medido en la instalación real antes de este cambio:
--
--     admin | verificado=false | con_password=true | usuarios=1
--
-- Desplegar la verificación sin esto deja a ese administrador FUERA de su
-- propia instancia: su contraseña es correcta y la respuesta es «Email not
-- verified», con un correo que en ese momento quizá ni siquiera hay forma de
-- enviar.
--
-- ── POR QUE SOLO ADMINISTRADORES ───────────────────────────────────────────
--
-- Porque son los únicos cuya propiedad del email está implícita: la única vía
-- de crear un administrador es el alta inicial, que solo funciona con CERO
-- usuarios, así que quien lo creó es quien montó la instalación. El resto de
-- usuarios con contraseña pasa por la verificación normal la próxima vez que
-- entre, con un botón para reenviar el enlace.
--
-- Marcar como verificado a cualquiera sería justo lo que la verificación viene
-- a impedir.
--
-- ── IDEMPOTENTE ────────────────────────────────────────────────────────────
--
-- Solo toca filas sin verificar. En una instalación nueva no hay usuarios y no
-- hace nada; el alta del primer administrador ya lo deja verificado desde hoy.

UPDATE auth_users
SET email_verified = true
WHERE role = 'admin'
  AND email_verified = false;
