/**
 * OAuth 2.1 para MCP — rutas HTTP
 * ============================================================================
 *
 * MCP Authorization, revisión 2026-07-28. Guía: docs/agents/oauth.md.
 *
 *   GET  /.well-known/oauth-protected-resource[/api/mcp]   RFC 9728 (público)
 *   GET  /.well-known/oauth-authorization-server            RFC 8414 (público)
 *   POST /api/oauth/register                                RFC 7591 (público, limitado)
 *   GET  /api/oauth/authorize                               código + PKCE S256 → panel
 *   POST /api/oauth/token                                   código / refresco (público, limitado)
 *   POST /api/oauth/revoke                                  RFC 7009 (público)
 *
 *   Consentimiento y conexiones del panel: routes/oauth-panel.ts (SDK).
 *
 * Los endpoints públicos responden con CORS abierto y sin credenciales
 * (`corsDeOAuth`): los clientes MCP de navegador los llaman desde su origen.
 * `desafioDeMcp` añade `WWW-Authenticate` a los 401/403 de /api/mcp.
 */

import type { Context, MiddlewareHandler, Next } from "hono";
import { Hono } from "hono";

import { ipDelCliente } from "../lib/ip-del-cliente";
import { logger } from "../lib/logger";
import {
  SCOPES_BASICOS,
  dcrEncendido,
  cimdEncendido,
  issuer,
  limiteDeRegistro,
  limiteDeToken,
  oauthEncendido,
  recursoMcp,
  urlMetadatosDelRecurso,
} from "../lib/oauth/config";
import {
  ErrorOAuth,
  autenticarCliente,
  canjearCodigo,
  clientesPendientesRecientes,
  empezarAutorizacion,
  refrescar,
  registrarCliente,
  revocarToken,
} from "../lib/oauth/servicio";
import { rateLimit } from "../lib/rate-limiter";

export const oauthRoutes = new Hono();

const PUBLICOS = [
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-authorization-server",
  "/api/oauth/register",
  "/api/oauth/token",
  "/api/oauth/revoke",
];

const esPublico = (camino: string) => PUBLICOS.some((p) => camino === p || camino.startsWith(`${p}/`));

/**
 * CORS de los endpoints PÚBLICOS de OAuth: cualquier origen, sin cookies (no
 * las usan: el cliente se autentica en el cuerpo o con Basic). Va ANTES del
 * CORS global, que solo conoce los orígenes del panel y las webs.
 */
export function corsDeOAuth(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    if (!esPublico(c.req.path)) return next();
    if (c.req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
          "Access-Control-Max-Age": "86400",
        },
      });
    }
    await next();
    const cabeceras = new Headers(c.res.headers);
    cabeceras.set("Access-Control-Allow-Origin", "*");
    cabeceras.delete("Access-Control-Allow-Credentials");
    const res = c.res;
    c.res = undefined as unknown as Response;
    c.res = new Response(res.body, { status: res.status, statusText: res.statusText, headers: cabeceras });
  };
}

/**
 * `WWW-Authenticate` en los rechazos de /api/mcp (MCP 2026-07-28, RFC 9728
 * §5.1 y RFC 6750 §3): en 401 el `resource_metadata` y los scopes básicos
 * (`invalid_token` si se mandó un token); en un 403 por scopes,
 * `insufficient_scope`.
 */
export function desafioDeMcp(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    await next();
    if (!oauthEncendido()) return;
    const estado = c.res.status;
    if (estado !== 401 && estado !== 403) return;
    const conToken = /^bearer\s+\S/i.test(c.req.header("authorization") ?? "");
    let valor: string;
    if (estado === 401) {
      valor =
        `Bearer resource_metadata="${urlMetadatosDelRecurso()}", scope="${SCOPES_BASICOS.join(" ")}"` +
        (conToken ? `, error="invalid_token"` : "");
    } else {
      // Solo el 403 de «falta mcp:connect» es de scope; otros 403 no dicen nada nuevo.
      const texto = await c.res.clone().text().catch(() => "");
      if (!/mcp:connect/.test(texto)) return;
      valor = `Bearer error="insufficient_scope", scope="mcp:connect", resource_metadata="${urlMetadatosDelRecurso()}"`;
    }
    const cabeceras = new Headers(c.res.headers);
    cabeceras.set("WWW-Authenticate", valor);
    const res = c.res;
    c.res = undefined as unknown as Response;
    c.res = new Response(res.body, { status: res.status, statusText: res.statusText, headers: cabeceras });
  };
}

/** Todo apagado con KITSUDEN_OAUTH_ENABLED=false (o https ausente en producción). */
// Por camino, NO con "*": este router se monta en "/" y un "*" pararía la API entera.
const siEncendido: MiddlewareHandler = async (c, next) => {
  if (!oauthEncendido()) return c.json({ error: "not_found", error_description: "OAuth is disabled" }, 404);
  return next();
};
oauthRoutes.use("/api/oauth/*", siEncendido);
oauthRoutes.use("/.well-known/oauth-protected-resource", siEncendido);
oauthRoutes.use("/.well-known/oauth-protected-resource/*", siEncendido);
oauthRoutes.use("/.well-known/oauth-authorization-server", siEncendido);

// ── Metadatos ────────────────────────────────────────────────────────────────

function metadatosDelRecurso() {
  return {
    resource: recursoMcp(),
    authorization_servers: [issuer()],
    scopes_supported: [...SCOPES_BASICOS],
    bearer_methods_supported: ["header"],
    resource_name: "Kitsuden MCP",
    resource_documentation: `${issuer()}/llms.txt`,
  };
}

const sinCache = (c: Context) => c.header("Cache-Control", "public, max-age=300");

oauthRoutes.get("/.well-known/oauth-protected-resource", (c) => {
  sinCache(c);
  return c.json(metadatosDelRecurso());
});
oauthRoutes.get("/.well-known/oauth-protected-resource/api/mcp", (c) => {
  sinCache(c);
  return c.json(metadatosDelRecurso());
});

oauthRoutes.get("/.well-known/oauth-authorization-server", (c) => {
  sinCache(c);
  const base = issuer();
  return c.json({
    issuer: base,
    authorization_endpoint: `${base}/api/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    ...(dcrEncendido() ? { registration_endpoint: `${base}/api/oauth/register` } : {}),
    revocation_endpoint: `${base}/api/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: [...SCOPES_BASICOS],
    client_id_metadata_document_supported: cimdEncendido(),
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${base}/llms.txt`,
  });
});

// ── Errores con la forma de OAuth ───────────────────────────────────────────

function errorOAuth(c: Context, e: unknown): Response {
  c.header("Cache-Control", "no-store");
  if (e instanceof ErrorOAuth) {
    if (e.estado === 401 && /basic/i.test(c.req.header("authorization") ?? "")) {
      c.header("WWW-Authenticate", `Basic realm="${issuer()}"`);
    }
    return c.json({ error: e.error, error_description: e.descripcion }, e.estado as 400);
  }
  logger.error({ err: e, path: c.req.path }, "[oauth] error inesperado");
  return c.json({ error: "server_error", error_description: "Unexpected error" }, 500);
}

/** Los parámetros de un POST de OAuth: formulario (lo normal) o JSON. */
async function parametros(c: Context): Promise<Record<string, string>> {
  const tipo = (c.req.header("content-type") ?? "").toLowerCase();
  let crudo: Record<string, unknown> = {};
  if (tipo.includes("application/json")) {
    const j = await c.req.json().catch(() => null);
    if (j && typeof j === "object" && !Array.isArray(j)) crudo = j as Record<string, unknown>;
  } else if (tipo.includes("application/x-www-form-urlencoded") || tipo.includes("multipart/form-data")) {
    crudo = (await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>;
  } else {
    throw new ErrorOAuth("invalid_request", "Send the parameters as application/x-www-form-urlencoded");
  }
  const salida: Record<string, string> = {};
  for (const [k, v] of Object.entries(crudo)) if (typeof v === "string") salida[k] = v;
  return salida;
}

// ── Límites (por IP; fallan cerrados: sin contador, no se registra ni se emite) ──

const limitar = (espacio: string, limite: () => number, ventana: number): MiddlewareHandler =>
  ((c: Context, next: Next) =>
    rateLimit({
      limit: limite(),
      window: ventana,
      espacio,
      failClosed: true,
      message: "Too many OAuth requests. Try again later.",
    })(c as never, next)) as MiddlewareHandler;

// ── Registro dinámico (RFC 7591; MCP 2026-07-28 lo mantiene por compatibilidad) ──

/** Tope de clientes registrados sin consentir en 24 h, por red de origen (/24, /48). */
const MAX_PENDIENTES = () => Number(process.env.OAUTH_MAX_PENDING_CLIENTS) || 1000;

oauthRoutes.post("/api/oauth/register", limitar("oauth-register", limiteDeRegistro, 3600), async (c) => {
  if (!dcrEncendido()) return c.json({ error: "not_found", error_description: "Dynamic Client Registration is disabled" }, 404);
  c.header("Cache-Control", "no-store");
  try {
    if ((await clientesPendientesRecientes(ipDelCliente(c) ?? null)) >= MAX_PENDIENTES()) {
      c.header("Retry-After", "3600");
      return c.json({ error: "temporarily_unavailable", error_description: "Too many pending client registrations" }, 429);
    }
    const cuerpo = await c.req.json().catch(() => undefined);
    const registrado = await registrarCliente(cuerpo, ipDelCliente(c) ?? null);
    return c.json(registrado, 201);
  } catch (e) {
    return errorOAuth(c, e);
  }
});

// ── Autorización ─────────────────────────────────────────────────────────────

function pantallaDeError(c: Context, error: string, descripcion: string): Response {
  // No se redirige a una URI que no se pudo validar (MCP: open redirection).
  c.header("Cache-Control", "no-store");
  return c.json({ error, error_description: descripcion }, 400);
}

oauthRoutes.get("/api/oauth/authorize", limitar("oauth-authorize", limiteDeToken, 60), async (c) => {
  try {
    const r = await empezarAutorizacion(c.req.query());
    if (r.tipo === "pantalla") return pantallaDeError(c, r.error, r.descripcion);
    c.header("Cache-Control", "no-store");
    return c.redirect(r.url, 302);
  } catch (e) {
    return errorOAuth(c, e);
  }
});

// ── Token ────────────────────────────────────────────────────────────────────

oauthRoutes.post("/api/oauth/token", limitar("oauth-token", limiteDeToken, 60), async (c) => {
  c.header("Cache-Control", "no-store");
  c.header("Pragma", "no-cache");
  try {
    const p = await parametros(c);
    // Primero la forma de la petición (400), luego quién la hace (401)
    if (!p.grant_type) throw new ErrorOAuth("invalid_request", "grant_type is required");
    if (p.grant_type !== "authorization_code" && p.grant_type !== "refresh_token") {
      throw new ErrorOAuth(
        "unsupported_grant_type",
        "Only authorization_code and refresh_token are supported (no implicit, password or client_credentials)"
      );
    }
    const cliente = await autenticarCliente(c.req.header("authorization"), p);
    if (p.grant_type === "authorization_code") return c.json(await canjearCodigo(cliente, p));
    if (p.grant_type === "refresh_token") return c.json(await refrescar(cliente, p));
    throw new ErrorOAuth(
      "unsupported_grant_type",
      "Only authorization_code and refresh_token are supported (no implicit, password or client_credentials)"
    );
  } catch (e) {
    return errorOAuth(c, e);
  }
});

oauthRoutes.post("/api/oauth/revoke", limitar("oauth-revoke", limiteDeToken, 60), async (c) => {
  c.header("Cache-Control", "no-store");
  try {
    const p = await parametros(c);
    if (!p.token) throw new ErrorOAuth("invalid_request", "token is required");
    const cliente = await autenticarCliente(c.req.header("authorization"), p);
    await revocarToken(cliente, p.token);
    return c.body(null, 200);
  } catch (e) {
    return errorOAuth(c, e);
  }
});

// ── Panel: consentimiento y conexiones → routes/oauth-panel.ts (SDK) ─────────
