/**
 * Better-Auth Configuration
 *
 * Initializes Better-Auth with the Drizzle adapter (PostgreSQL),
 * credentials provider, and session-based authentication.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "../db";
import { authUsers, authSessions, authAccounts, authVerifications } from "../db/schema";

// Build trusted origins dynamically from environment
function buildTrustedOrigins(): string[] {
  const origins = new Set<string>();

  // Always trust the API itself
  const authUrl = process.env.BETTER_AUTH_URL || "http://localhost:3001";
  origins.add(authUrl);

  // Admin panel
  const adminUrl = process.env.ADMIN_URL || "http://localhost:5173";
  origins.add(adminUrl);

  // Web frontend (if configured)
  const webUrl = process.env.WEB_URL || "http://localhost:4321";
  origins.add(webUrl);

  // ALLOWED_ORIGINS from config (comma-separated)
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  if (allowedOrigins) {
    allowedOrigins.split(",").forEach((o) => origins.add(o.trim()));
  }

  // Common dev ports as fallbacks
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://localhost:3001");
    origins.add("http://localhost:5173");
    origins.add("http://localhost:4321");
  }

  return Array.from(origins).filter(Boolean);
}

// Better-Auth plugin context types
interface AuthContext {
  path: string;
  response?: {
    user?: {
      id: string;
      email: string;
      name?: string;
    };
  };
}

/**
 * Encola un correo del sistema y deja rastro si NO se pudo.
 *
 * `emailQueue.add` devuelve `null` cuando Valkey no responde: descarta el
 * trabajo y solo escribe un aviso. Para una verificación o un reseteo eso es
 * un correo que nunca llega sin que nadie se entere, así que aquí se registra
 * como ERROR.
 *
 * No se lanza: better-auth ejecuta estos envíos después de responder, y un
 * rechazo sin capturar ahí no llega al usuario, solo tumba el proceso.
 *
 * Importaciones dinámicas por lo mismo que el hook de eventos de abajo: la
 * cola y el logger no pueden cargarse antes que la configuración de auth.
 *
 * El destinatario no va al log a propósito: es un dato personal, y el nombre
 * del correo basta para saber qué falló.
 */
async function encolarCorreo(
  nombre: string,
  datos: { to: string } & Record<string, unknown>
): Promise<void> {
  const { emailQueue } = await import("./queue");
  const trabajo = await emailQueue.add(nombre, datos as never);
  if (!trabajo) {
    const { logger } = await import("./logger");
    logger.error(
      { correo: nombre },
      `[auth] no se pudo encolar «${nombre}»: el destinatario no lo recibirá`
    );
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: authUsers,
      session: authSessions,
      account: authAccounts,
      verification: authVerifications,
    },
  }),

  // Base path matches the Hono mount point
  basePath: "/api/auth",

  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },

  // Auth providers
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,

    /**
     * No se entra con contraseña hasta confirmar el email.
     *
     * Antes cualquiera podía registrarse con la dirección de otra persona y
     * entrar con ella. OJO: esto NO es lo que cierra la toma de cuentas por
     * vinculación OAuth (GHSA-g38m-r43w-p2q7). Ese aviso dice expresamente
     * que exigir verificación no la mitiga; la cierra la versión ≥1.6.11 de
     * better-auth. Esto es higiene aparte.
     *
     * El primer administrador sale ya verificado del alta de
     * `/api/system/setup`: si no, quien instala se quedaría fuera.
     */
    requireEmailVerification: true,

    /**
     * Restablecer la contraseña cierra todas las sesiones abiertas.
     *
     * Quien resetea una contraseña suele hacerlo porque sospecha que otra
     * persona la conoce. Dejar vivas sus sesiones es dejarle dentro.
     */
    revokeSessionsOnPasswordReset: true,

    /**
     * La plantilla `system.password-recovery` existía y nada la enviaba: la
     * recuperación de contraseña estaba escrita y desconectada.
     */
    sendResetPassword: async ({ user, url }) => {
      await encolarCorreo("system.password-recovery", {
        to: user.email,
        resetUrl: url,
        expiresIn: 60,
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    // Tras pulsar el enlace, dentro: pedir la contraseña otra vez justo
    // después de demostrar que el correo es tuyo solo añade un paso.
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await encolarCorreo("system.email-verification", {
        to: user.email,
        verifyUrl: url,
        name: user.name ?? undefined,
        expiresIn: 60,
      });
    },
  },

  /**
   * Vinculación de cuentas.
   *
   * Se deja activa —entrar con Google en una cuenta creada con email es lo
   * que la gente espera— y sin proveedores de confianza. Un proveedor de
   * confianza vincula aunque NO haya verificado el email, y Discord entrega
   * direcciones sin verificar (ver su bloque arriba).
   *
   * La otra mitad del cierre es la versión: desde 1.6.11 better-auth exige
   * además que el usuario LOCAL tenga el email verificado antes de vincular
   * (`requireLocalEmailVerified`, activo por defecto). No se escribe aquí
   * porque esa opción ya está marcada como obsoleta: en la próxima menor la
   * comprobación pasa a ser incondicional. Hay una prueba que falla si
   * alguien la pone a `false`.
   */
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: [],
    },
  },

  // Social & Enterprise OAuth Providers (conditional)
  socialProviders: {
    ...(process.env.GITHUB_CLIENT_ID &&
      process.env.GITHUB_CLIENT_SECRET && {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
        },
      }),
    ...(process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET && {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }),
    ...(process.env.AZURE_AD_CLIENT_ID &&
      process.env.AZURE_AD_CLIENT_SECRET && {
        microsoft: {
          clientId: process.env.AZURE_AD_CLIENT_ID,
          clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
          tenantId: process.env.AZURE_AD_TENANT_ID || "common",
        },
      }),
    /**
     * Discord — la identidad real del público de esports.
     *
     * Un torneo se organiza en un servidor de Discord, no en un formulario: si
     * inscribirse exige crear otra cuenta con contraseña, la mitad de la gente
     * abandona ahí. Con esto el flujo es un botón, y lo que llega ya trae el
     * nombre por el que se le conoce en el bracket.
     *
     * `identify` da id, usuario y avatar; `email` es lo que permite reconocer a
     * quien ya estaba registrado por otra vía. Se piden los dos porque sin
     * email no hay forma de enlazar cuentas ni de avisar de un cambio de
     * horario — y Discord solo lo entrega si se pide explícitamente.
     *
     * OJO: Discord entrega el email SIN VERIFICAR cuando la cuenta no lo tiene
     * confirmada. Better-Auth lo refleja en `emailVerified`; no lo trates como
     * prueba de identidad para enlazar cuentas automáticamente.
     */
    ...(process.env.DISCORD_CLIENT_ID &&
      process.env.DISCORD_CLIENT_SECRET && {
        discord: {
          clientId: process.env.DISCORD_CLIENT_ID,
          clientSecret: process.env.DISCORD_CLIENT_SECRET,
          scope: ["identify", "email"],
        },
      }),
  },

  // User fields
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
      },
    },
  },

  // Trusted origins — built dynamically from environment
  trustedOrigins: buildTrustedOrigins(),

  // Lifecycle Hooks — Emit events for Workers/Functions to react to
  plugins: [
    {
      id: "kitsuden-hooks",
      hooks: {
        after: [
          {
            matcher: (context: AuthContext) => context.path === "/sign-up/email",
            handler: async (ctx: AuthContext) => {
              try {
                if (ctx.response?.user) {
                  const { hooks } = await import("./events");
                  hooks.emit("auth:register", ctx.response.user);
                }
              } catch {
                // Emitir el evento es accesorio: que falle no puede tumbar el alta.
              }

              // Devolver un objeto NO es opcional, aunque no aportemos nada.
              //
              // `runAfterHooks` de better-auth hace `if (result.headers)` sobre
              // lo que devuelva el handler, sin comprobar antes que exista. Con
              // `undefined` eso revienta con
              //
              //     undefined is not an object (evaluating 'result.headers')
              //
              // y como este hook solo se dispara en `/sign-up/email`, el efecto
              // era que TODA alta devolvia 500 — incluida la del primer
              // administrador, que es la que deja usable la instalacion. Y lo
              // hacia despues de escribir en la base: usuario, credencial y
              // sesion creados correctamente, y aun asi error.
              //
              // El objeto vacio deja `result.headers` en undefined, que es
              // falsy, y better-auth sigue su camino sin tocar cabeceras.
              return {};
            },
          } as unknown as {
            matcher: (context: unknown) => boolean;
            handler: (ctx: unknown) => Promise<Record<string, never>>;
          },
        ],
      },
    },
  ],
});

export type Session = typeof auth.$Infer.Session;
