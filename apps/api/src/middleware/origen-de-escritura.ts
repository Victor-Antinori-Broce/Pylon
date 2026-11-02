/**
 * CSRF: una escritura con la cookie de sesión tiene que venir de un origen
 * nuestro.
 * ============================================================================
 *
 * ── EL HUECO (auditoría 2026-10-15) ────────────────────────────────────────
 *
 * Las rutas de la API autentican con la cookie de better-auth. CORS no
 * protege una escritura: una página cualquiera puede mandar un `<form
 * method=post>` o un `fetch(..., {mode: "no-cors", credentials: "include"})`
 * con `Content-Type: text/plain`, y el navegador lo envía SIN preflight. No
 * podrá leer la respuesta, pero el efecto ya ocurrió. Lo que lo frena hoy es
 * `SameSite=Lax` de la cookie, que no cubre:
 *
 *   - un sitio HERMANO del mismo dominio registrable (wikis, webs en
 *     subdominios, cualquier subdominio con un XSS): para el navegador es
 *     «same-site» y manda la cookie;
 *   - navegadores o configuraciones que no aplican Lax por defecto.
 *
 * better-auth ya comprueba el `Origin` en SUS rutas (`trustedOrigins`); el
 * resto de la API no lo hacía.
 *
 * ── LA REGLA ───────────────────────────────────────────────────────────────
 *
 * Solo en métodos que escriben y solo si la petición trae la cookie de sesión
 * de better-auth (it runs before the session middleware, so it reads the cookie
 * itself; un agente con `Bearer` no lleva cookie y no es CSRF-able):
 *
 *   - `Origin` (o, si falta, el origen del `Referer`) tiene que estar en la
 *     lista (ALLOWED_ORIGINS + trustedOrigins de better-auth) o ser el MISMO
 *     host al que va la petición (el panel servido detrás de su nginx);
 *   - `Origin: null` (iframes sandbox, redirecciones raras) se rechaza;
 *   - sin `Origin` ni `Referer` se deja pasar: los navegadores mandan
 *     `Origin` en toda petición que no sea GET/HEAD, así que su ausencia es
 *     un cliente que no es navegador (SSR, scripts), que no es CSRF.
 */
import { createMiddleware } from "hono/factory";

const SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

function origenDe(valor: string | undefined | null): string | null {
  if (!valor) return null;
  if (valor === "null") return "null";
  try {
    return new URL(valor).origin;
  } catch {
    return "null";
  }
}

/** Decide sin contexto de Hono (lo prueba `tests/unit/origen-de-escritura.test.ts`). */
export function origenDeEscrituraPermitido(params: {
  metodo: string;
  conCookie: boolean;
  origin?: string | null;
  referer?: string | null;
  host?: string | null;
  permitidos: readonly string[];
}): boolean {
  if (SEGUROS.has(params.metodo.toUpperCase())) return true;
  if (!params.conCookie) return true;

  const origen = origenDe(params.origin) ?? origenDe(params.referer);
  if (origen === null) return true; // ni Origin ni Referer: no es un navegador
  if (origen === "null") return false;
  if (params.permitidos.includes(origen)) return true;

  // Mismo host que la petición: el panel detrás de su proxy (nginx reenvía
  // `Host`), donde el origen del navegador ES el de la API.
  if (params.host) {
    try {
      if (new URL(origen).host === params.host) return true;
    } catch {
      return false;
    }
  }
  return false;
}

const COOKIE_DE_SESION = /(^|;\s*)(__Secure-)?better-auth\.session_token=/;

/** Does this `Cookie` header carry a better-auth session? */
export function traeCookieDeSesion(cookie: string | undefined | null): boolean {
  return !!cookie && COOKIE_DE_SESION.test(cookie);
}

export function exigirOrigenEnEscrituras(permitidos: () => readonly string[]) {
  return createMiddleware(async (c, next) => {
    const conCookie =
      Boolean((c.get as (k: string) => unknown)("session")) || traeCookieDeSesion(c.req.header("cookie"));
    const ok = origenDeEscrituraPermitido({
      metodo: c.req.method,
      conCookie,
      origin: c.req.header("origin"),
      referer: c.req.header("referer"),
      host: c.req.header("x-forwarded-host")?.split(",")[0]?.trim() || c.req.header("host"),
      permitidos: permitidos(),
    });
    if (!ok) {
      return c.json(
        { error: "Forbidden", message: "Origin not allowed for a cookie-authenticated write" },
        403
      );
    }
    await next();
  });
}
