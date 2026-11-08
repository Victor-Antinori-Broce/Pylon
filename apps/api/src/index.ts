/**
 * Kitsuden - Hono API Server v0.9.0-beta (Actions Unification)
 *
 * Runtime: Bun + Hono
 * Auth: Better-Auth (cookie sessions)
 * Queue: Postgres (transactional outbox + SKIP LOCKED; lib/queue.ts)
 * Real-time: WebSocket + Pub/Sub (Valkey opcional; sin él, LISTEN/NOTIFY)
 * Actions: Unified Workers + Webhooks + Agents engine
 *
 * 3-Tier Architecture:
 *   - ENGINE (Nivel 1): Auth, DB, Actions — always active (packages/engine/)
 *   - CORE   (Nivel 2): Data Sets, Media, Connectors — switchable (packages/core/)
 *   - KONS (Nivel 3): Business modules — loaded via module-loader (packages/kons/)
 *
 * Phase 3: Actions Unification Complete
 *   - actions table replaces kitsuden_functions + webhooks
 *   - ActionEngine handles all automation types
 *   - Legacy APIs maintained for backward compatibility
 */

import {
  initActions,
  initializeKons,
  defineAction,
  initKitsudenBrain,
  mail,
  messageOf,
} from "@kitsuden/engine";
import type { ServerWebSocket } from "bun";
import { eq, count, sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";

// ── Configuration ──
import { staticConfig as kitsudenConfig } from "../kitsuden.config";

import { db } from "./db";
import {
  BASE_URL_LOCAL,
  CSP_DE_MEDIOS,
  cacheDeMedio,
  comprobarAlmacen,
  rutaLocalDe,
  usaS3,
} from "./lib/almacen";
import { anchoPedido, esReescalable, garantizarDerivado } from "./lib/derivados";
import { verificarConexionRls } from "./lib/rls-connection-guard";
import {
  authUsers as user,
  siteSettings,
  apiKeys,
  media as mediaTable,
  dataSets as dataSetsTable,
} from "./db/schema-core";
import { initActionsEngine } from "./lib/actions";
import { auth } from "./lib/auth";
import { config, features, corsConfig } from "./lib/config";
import { urlPublicaDelSitio } from "./lib/ajustes-del-sitio";
import { avisoDeCorsIncompleto, origenPermitido } from "./lib/origenes-cors";
import { registerCriticalFeatures } from "./lib/critical-features";
import { initCronScheduler } from "./lib/cron-scheduler";
import { toErrorEnvelope } from "./lib/errors";
import { initFunctionDispatcher } from "./lib/function-dispatcher";
import { logger } from "./lib/logger";
import { hostDeEscucha } from "./lib/host-de-escucha";
import { poolAgotadoA503 } from "./lib/pool-agotado";
import { konDisponible } from "./lib/kons-diferidos";
import { loadModules, createKonContext, getInformeDeCarga, montarRlsDeKon } from "./lib/module-loader";
import { registrarOperacionesMontadas } from "../../../packages/engine/src/operaciones";
import { setupWorkers, emailQueue, estadoDeLaCola, shutdownQueues } from "./lib/queue";
import { colaRoutes } from "./routes/cola";
import { arrancarTrazas, pararTrazas, trazasDePeticion } from "./lib/trazas";
import { trazasRoutes } from "./routes/trazas";
import { avisosDeAgentesRoutes } from "./routes/avisos-de-agentes";
import { cuerpoDeFichero, fichero } from "./lib/fichero";
import { configurarEmbeddingsDeModelos } from "./lib/embeddings-de-modelos";
import { realtimeManager, type WSClientData } from "./lib/realtime";
import { wireRealtimeAuthorization, bridgeEventsToRealtime } from "./lib/realtime-wiring";
import { toonMiddleware } from "./lib/toon";
import { lineaDeAccesoSinSecretos } from "./lib/ruta-para-log";
import { toonProtocolMiddleware } from "./lib/toon-protocol";
import { closeValkey, valkeyConfigurado } from "./lib/valkey";
import { registerSystemMails } from "./mail/system-mails";
import { requestContextMiddleware, accessLogAndMetrics } from "./middleware/telemetry";
import { erroresSinDetalle } from "./middleware/errores-sin-detalle";
// ── A1: errores problem+json e Idempotency-Key (bloque propio) ──
import { almacenesPorDefecto } from "./lib/idempotencia-almacenes";
import { idempotencia } from "./middleware/idempotencia";
import { problemasHttp } from "./middleware/problemas-http";
import { limiteDeCuerpo } from "./lib/limite-de-cuerpo";

// ── Feature Flags ──

// ── Core Layer Routes (Nivel 2) — Imported through packages/core/ ──
// NOTE: media-library and data-sets have been migrated to kons
// Legacy core imports removed — now provided by kons

// ── Engine Routes (Nivel 1) — Always-on infrastructure ──
import { withTransactionalRLS } from "./middleware/transactional-rls";
import type { PgTable } from "drizzle-orm/pg-core";
import { ipDelCliente } from "./lib/ip-del-cliente";
import {
  exigirAdmin,
  exigirStaff,
  puertaDeAdmin,
  denegacionesDeAgente,
  RUTAS_SOLO_ADMIN,
  RUTAS_SOLO_ADMIN_TEMPRANAS,
} from "./middleware/auth-guard";
import { enrichUserContext } from "./middleware/user-context";
import { exigirOrigenEnEscrituras } from "./middleware/origen-de-escritura";
import {
  adminExists,
  announceSetupTokenAtBoot,
  createFirstAdmin,
  ensureSetupToken,
  setupTokenRequired,
  signUpRefused,
} from "./lib/first-run";
import { actionsRoutes } from "./routes/actions";
import { adminRegistryRoutes } from "./routes/admin-registry";
import agentMemoryRoutes from "./routes/agent-memory";
import agentPlansRoutes from "./routes/agent-plans";
import agentPlaygroundRoutes from "./routes/agent-playground";
import type { Context } from "hono";

import { generarGuiaParaAgentes } from "./lib/guia-para-agentes";
import { puedeSugerir, rutasDeKons, sugerirRutas } from "./lib/rutas-de-kons";
import agentRoutes from "./routes/agents";
import { apiKeysRoutes } from "./routes/api-keys";
import { brainRoutes } from "./routes/brain";
import {
  brainMemoriaRoutes,
  operacionesDeMemoria,
  KON_DE_MEMORIA,
  RUTA_DE_MEMORIA,
} from "./routes/brain-memoria";
import { codeGraphRoutes } from "./routes/code-graph";
import { codegenRoutes } from "./routes/codegen";
import { settingsRoutes, syncRoutes, dataSetsRoutes as dataSetsLiteRoutes } from "./routes/crud";
import { explorerRoutes } from "./routes/data-explorer";
import dataSourcesRoutes from "./routes/data-sources";
import { docsRoutes } from "./routes/docs";
import { dynamicDocsRouter } from "./routes/docs-dynamic";
import { mailRoutes } from "./routes/mail";
import { runsRoutes } from "./routes/runs";
import { systemMapRoutes } from "./routes/system-map";
import { functionsRoutes } from "./routes/functions";
import { graphqlRoutes, invalidateGraphQLCache } from "./routes/graphql";
import { rpcSurface } from "./rpc";
import { initAgentTelemetry } from "./services/agent-telemetry";
import { loadSecretsIntoEnv } from "./services/secrets";
import { inlineRelationsRoutes } from "./routes/inline-relations";
import { mcpRoutes } from "./routes/mcp";
import { arrancarBarridoDeOAuth } from "./lib/oauth/servicio";
import { corsDeOAuth, desafioDeMcp, oauthRoutes } from "./routes/oauth";
import { oauthPanelRoutes } from "./routes/oauth-panel";
import { modulesRoutes } from "./routes/modules";
import konAssetsRoutes from "./routes/kon-assets";
import { schemaIntrospectionRoutes } from "./routes/schema-introspection";
import { sistemaAdminRoutes } from "./routes/sistema-admin";
import { systemRoutes } from "./routes/system";
import { fijarDisponibilidadDeKons, versionRoutes } from "./routes/version";
import { activarPerfilDeMiddleware } from "./lib/perfil-middleware";

// ── Module Loader ──

// ── Actions Layer Integration (Nivel 1 DX) ──

// ── Typed Hono app ──
const app = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
    requestId: string;
    agent?: AgentAuthContext;
    userRoleIds?: string[];
    userDepartmentId?: string | null;
  };
}>();

// Solo para medir (scripts/bench): con KITSUDEN_PERFIL_MIDDLEWARE=<fichero>
// cada `app.use` se envuelve para anotar su tiempo propio. Apagado = nada.
activarPerfilDeMiddleware(app);

// ══════════════════════════════════════════════
// ⚙️ GLOBAL MIDDLEWARE
// ══════════════════════════════════════════════

// OAuth para MCP (docs/agents/oauth.md): los endpoints PÚBLICOS de OAuth
// (metadatos, registro, token, revocación) con CORS abierto y sin cookies, y
// `WWW-Authenticate` en los 401/403 de /api/mcp. Antes del CORS global y de la
// autenticación, para envolver sus respuestas.
app.use("*", corsDeOAuth());
app.use("/api/mcp", desafioDeMcp());
app.use("/api/mcp/*", desafioDeMcp());

// CORS — MUST be first middleware to handle OPTIONS preflight
// before rate limiter or any other middleware can reject the request
app.use(
  "*",
  cors({
    // Solo la lista fija: ya no hay subdominios de wiki ni de esports (ver origenes-cors)
    origin: origenPermitido(corsConfig.origins),
    allowMethods: corsConfig.methods,
    allowHeaders: corsConfig.headers,
    credentials: corsConfig.credentials,
  })
);

/**
 * Y se avisa al arrancar si falta el sitio público en la lista.
 *
 * Sin esto, el fallo se descubre cuando alguien intenta comentar: la web
 * carga, la API responde a todo lo público, y solo revientan las llamadas con
 * credenciales. Mejor una línea fea en el arranque.
 */
void urlPublicaDelSitio()
  .then((url) => {
    const aviso = avisoDeCorsIncompleto(corsConfig.origins, url);
    if (aviso) logger.warn({ origins: corsConfig.origins }, `⚠️  ${aviso}`);
  })
  .catch(() => {
    // Sin base de datos no se puede comprobar; el arranque sigue
  });

// Trace context (W3C) + requestId — debe ir ANTES de todo para que el
// AsyncLocalStorage esté disponible en el resto del pipeline (logs, métricas).
app.use("*", requestContextMiddleware());
// ── A1: todos los errores de /api/* en application/problem+json (RFC 9457) ──
// Por FUERA del pool agotado y de erroresSinDetalle: les da forma a sus
// respuestas sin cambiar qué se enseña. Ver middleware/problemas-http.ts.
app.use("*", problemasHttp());
// Pool de Postgres agotado → 503 + Retry-After (aunque un kon lo capture y
// responda 500 por su cuenta). Por fuera de erroresSinDetalle y de onError.
app.use("*", poolAgotadoA503());

// En producción, los 5xx no enseñan su detalle interno (SQL, rutas, pila) a
// quien no es admin. Ver middleware/errores-sin-detalle.ts.
app.use("*", erroresSinDetalle(enProduccion));

// Cuerpo de petición acotado (10 MB; las subidas de ficheros llevan el suyo).
// Ver lib/limite-de-cuerpo.ts.
app.use("/api/*", limiteDeCuerpo());

// ═══════════════════════════════════════════════
// CRITICAL FEATURES - Rate limiting, search & observability
// Global Valkey-based rate limiting, search engine and observability
// routes are mounted together by registerCriticalFeatures. This is placed
// before public routes so the global /api/* rate limiter runs before the
// auth/session middleware and protects all API routes registered later.
// ═══════════════════════════════════════════════
// CSRF: una escritura autenticada con la cookie tiene que venir de un origen
// nuestro (ALLOWED_ORIGINS + los de better-auth) o del mismo host. Ver
// middleware/origen-de-escritura.ts. Before everything that answers without
// calling `next()` (`/api/system`, `/api/sistema`, `/api/search`, the rate-limit
// admin): there is no session yet at this point, so it looks at the cookie itself.
const origenesDeEscritura = [
  ...new Set([
    ...corsConfig.origins,
    ...((auth.options as { trustedOrigins?: unknown }).trustedOrigins instanceof Array
      ? (auth.options as { trustedOrigins: string[] }).trustedOrigins
      : []),
  ]),
];
app.use(
  "*",
  exigirOrigenEnEscrituras(() => origenesDeEscritura)
);

// Rutas del panel que se montan ANTES del middleware global de sesión
// (observabilidad en `/admin/*`, límites, índice de búsqueda, `/api/system`):
// solo admin. Ver RUTAS_SOLO_ADMIN_TEMPRANAS en middleware/auth-guard.ts.
app.use("*", puertaDeAdmin(RUTAS_SOLO_ADMIN_TEMPRANAS));

registerCriticalFeatures(app);

// ═══════════════════════════════════════════════
// STRUCTURED ACCESS LOG + SLI METRICS
// Mide cada request (status + latencia → MetricsRegistry) y emite un access-log
// estructurado ya correlado con trace_id/span_id. Ver middleware/telemetry.ts.
// ═══════════════════════════════════════════════
app.use("*", accessLogAndMetrics());
// La «caja de cristal» (kitsuden2.md C7): una traza por petición en Postgres,
// en lotes y con las lecturas muestreadas. Ver lib/trazas.ts.
app.use("*", trazasDePeticion());
arrancarTrazas();

// ═══════════════════════════════════════════════
// CORS DINÁMICO - Configurable via env
// ═══════════════════════════════════════════════
// Sin tokens en el log: `GET /api/auth/reset-password/<token>` lleva el
// secreto en el camino (ver lib/ruta-para-log.ts).
app.use(
  "*",
  honoLogger((linea: string, ...resto: string[]) =>
    console.log(lineaDeAccesoSinSecretos(linea), ...resto)
  )
);
app.use("*", timing());
/**
 * Las cabeceras de seguridad, con UNA excepción: `/media`.
 *
 * `secureHeaders()` pone por defecto `Cross-Origin-Resource-Policy:
 * same-origin`, que es lo correcto para la API —sus respuestas no deben poder
 * leerse desde otra web— y lo INCORRECTO para `/media`, que es contenido
 * público pensado para que lo incrusten las webs públicas desde su propio
 * dominio. Con `same-origin`, el navegador descargaba la imagen, la recibía
 * entera con un 200… y se negaba a pintarla. No salía ningún error en la
 * página: solo un hueco.
 *
 * Pasó al alojar en casa las imágenes de las cartas: las cinco primeras webs de
 * juego que se pasaron a `/media` se quedaron sin una sola imagen visible. Y
 * de paso explica cualquier imagen subida desde el panel que no se viera en
 * las webs públicas.
 *
 * No basta con poner la cabecera en la ruta de `/media`: `secureHeaders`
 * escribe las suyas DESPUÉS del manejador y la pisaría. Por eso se elige la
 * configuración antes, por la ruta.
 */
const cabecerasSeguras = secureHeaders();
const cabecerasDeMedios = secureHeaders({ crossOriginResourcePolicy: "cross-origin" });
app.use("*", (c, next) =>
  (c.req.path.startsWith(`${BASE_URL_LOCAL}/`) ? cabecerasDeMedios : cabecerasSeguras)(c, next)
);
app.use("/api/*", toonMiddleware());
app.use("/api/*", toonProtocolMiddleware());
// NOTE: CORS is mounted ABOVE (before rate limiter) to handle OPTIONS preflight correctly

// ══════════════════════════════════════════════
// 🔓 PUBLIC ROUTES (BEFORE AUTH)
// ══════════════════════════════════════════════

app.get("/api/system/init-check", async (c) => {
  try {
    const initialized = await adminExists();
    // A token can go missing while the API is up (the last admin was deleted).
    if (!initialized && setupTokenRequired()) ensureSetupToken();
    return c.json({ initialized, setupTokenRequired: !initialized && setupTokenRequired() });
  } catch (error: unknown) {
    // El detalle va al log, no al cuerpo: esta ruta es PÚBLICA y previa a la
    // autenticación, y el mensaje de un fallo de Drizzle lleva el SQL entero
    // con nombres de tabla y columnas.
    logger.error({ err: error }, "[init-check] fallo comprobando usuarios");
    return c.json({ initialized: true, setupTokenRequired: false });
  }
});

app.post("/api/system/setup", async (c) => {
  try {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;

    /**
     * Admin Y verificado.
     *
     * Con la verificación de email obligatoria, SetupView hace `signIn` justo
     * después: sin marcar aquí `emailVerified`, quien instala la plataforma se
     * quedaría fuera de su propia instancia en el primer segundo, esperando un
     * correo que en una instalación recién hecha aún no hay forma de enviar.
     *
     * Marcarlo no amplía nada: quien llega aquí tiene el token del log y no hay
     * ningún administrador, así que es quien está montando la instalación.
     */
    const outcome = await createFirstAdmin(body, async (tx, userId) => {
      await tx
        .update(user)
        .set({ role: "admin", emailVerified: true })
        .where(eq(user.id, userId));
    });
    if (!outcome.ok) return c.json({ error: outcome.error, code: outcome.code }, outcome.status);
    const { name, email } = outcome.user;
    console.log(`[setup] User ${email} promoted to admin`);

    const [settings] = await db.select().from(siteSettings).limit(1);
    if (!settings) {
      await db.insert(siteSettings).values({ siteName: "Kitsuden CMS" });
    }

    try {
      await emailQueue.add("system.welcome", { to: email, name } as any);
    } catch {}

    return c.json({ success: true, user: outcome.user });
  } catch (e: unknown) {
    // Igual que init-check: pública y sin auth. Devolvía `e.message`, que en un
    // fallo de consulta es el SQL completo MÁS los parámetros — es decir, el
    // esquema y el email que se acababa de enviar, a quien sea que llame.
    logger.error({ err: e }, "[setup] fallo creando el primer administrador");
    return c.json({ error: "Setup failed" }, 500);
  }
});

app.route("/api/system", systemRoutes);

// ── Sistema: usuarios y estado del esquema ──────────────────────────────────
//
// Lo que administra la PLATAFORMA y no un kon. Ocupa el hueco que dejaba el
// visor generico de tablas al retirarse: usuarios y estado de migraciones no
// pertenecen a ningun kon y no tenian pantalla en ninguna parte.
//
// Todo exige rol `admin`. Ver `routes/sistema-admin.ts`.
app.use("/api/sistema", exigirAdmin);
app.use("/api/sistema/*", exigirAdmin);
app.route("/api/sistema", sistemaAdminRoutes);

// ══════════════════════════════════════════════
// 🔐 AUTH & SESSION (Including Agent NHI)
// ══════════════════════════════════════════════

import { createHash } from "crypto";

import { enProduccion } from "./lib/entorno";

/** Retirada de las claves `kitsuden_sk_*` (anunciada en la cabecera `Sunset`). */
const FIN_CLAVES_LEGACY = Date.UTC(2026, 7, 1);

import {
  arrancarBarridoDePropuestas,
  ejecucionInternaDe,
  ejecucionYaCobrada,
  fijarAppDeAprobaciones,
  puertaDeAprobacion,
  usuarioDeAgente,
} from "./lib/aprobaciones";
import { cuotasDeAgente } from "./lib/cuotas-de-agente";
import { aprobacionesRoutes, propuestasRoutes } from "./routes/aprobaciones";
import { modelosRoutes, RUTA_DE_MODELOS } from "./routes/modelos";
import { arrancarBarridoDeVigilancias } from "./lib/promocion";
import {
  KON_DE_PROMOCION,
  RUTA_DE_PROMOCION,
  RUTA_DE_PROMOCION_ADMIN,
  operacionesDePromocion,
  promocionAdminRoutes,
  promocionRoutes,
} from "./routes/promocion";
import { permisosDeAgentesRoutes } from "./routes/permisos-de-agentes";
import {
  authenticateAgent,
  esCredencialDeAgente,
  recordarAutenticacionDeLaPeticion,
} from "./services/agent-auth";
import type { AgentAuthContext } from "./services/agent-auth";

// Extend Hono context types - agent is now defined in app Variables type above

app.use("*", async (c, next) => {
  // Fase F: una propuesta APROBADA se ejecuta volviendo a entrar en la app con
  // la identidad del agente puesta por el propio proceso en el `env` (no hay
  // clave en claro que reenviar). Desde la red no se puede fabricar: Bun solo
  // pasa `{ ip }`. Ver lib/aprobaciones.ts.
  const interna = ejecucionInternaDe(c);
  if (interna) {
    c.set("agent", interna.agente);
    c.set("user", usuarioDeAgente(interna.agente) as never);
    c.set("session", null);
    return next();
  }

  // Skip session extraction for Better-Auth endpoints to avoid conflicts
  if (c.req.path.startsWith("/api/auth/")) {
    return next();
  }

  const authHeader = c.req.header("Authorization");

  // 1. AGENT AUTH (NHI - Non-Human Identity) - NEW SYSTEM
  // Format: Bearer kitsuden_agent_xxxxx (el legacy grm_agent_* ya no: ver
  // ACCEPTED_API_KEY_PREFIXES en services/agent-auth).
  // OAuth para MCP (0055): también `kitsuden_oat_*`, que solo vale en /api/mcp.
  if (authHeader?.startsWith("Bearer ") && esCredencialDeAgente(authHeader.slice(7).trim())) {
    const rawToken = authHeader.replace("Bearer ", "").trim();

    const result = await authenticateAgent(rawToken, {
      // La IP de verdad, no la cabecera cruda (falseable): auditoría 2026-10-25
      ipAddress: ipDelCliente(c),
      userAgent: c.req.header("user-agent") || undefined,
      // La audiencia de un token OAuth (RFC 8707): se comprueba contra el camino
      ruta: c.req.path,
    });

    if (result.success && result.context) {
      // `/api/mcp` lo reutiliza en vez de autenticar otra vez (ver agent-auth)
      recordarAutenticacionDeLaPeticion(c.req.raw, rawToken, result);
      // Set agent context
      c.set("agent", result.context);

      // Also set as user for compatibility with existing middleware
      c.set("user", {
        id: result.context.agentId,
        name: result.context.agentName,
        email: `agent@${result.context.agentId}.kitsuden.local`,
        image: null,
        role: "agent", // Not admin - granular permissions via scopes
        scopes: result.context.scopes,
        // Fase F: quién firma lo que crea (ver @kitsuden/shared firmante.ts)
        sponsor: result.context.sponsor ?? null,
      } as any);
      c.set("session", null);

      // Add rate limit headers
      c.header("X-Agent-Id", result.context.agentId);
      c.header("X-RateLimit-Limit", result.context.rateLimit.toString());

      return next();
    } else {
      // No se pudo COMPROBAR la clave (la base no contestó: pool agotado,
      // Postgres caído): sigue sin entrar, pero es un 503 que se reintenta, no
      // un 401 que le dice al agente que su clave no vale (medido con 200
      // conexiones, 2026-10-27).
      if (result.code === "AUTH_ERROR") {
        c.header("Retry-After", "5");
        return c.json({ error: "Authentication is temporarily unavailable", code: result.code }, 503);
      }
      return c.json(
        {
          error: result.error || "Agent authentication failed",
          code: result.code,
        },
        401
      );
    }
  }

  // 2. LEGACY Machine Auth (API Keys) - DEPRECATED
  // Migration: Use Agent NHI tokens (kitsuden_agent_*) instead.
  // Sunset date: 2026-08-01 — kitsuden_sk_* keys will stop working after this date.
  // La fecha de retirada ya pasó y el código seguía aceptándolas — como ADMIN
  // sintético. Ahora se cumple: 401 con el motivo.
  if (authHeader?.startsWith("Bearer kitsuden_sk_") && Date.now() >= FIN_CLAVES_LEGACY) {
    return c.json(
      {
        error: "Legacy API keys (kitsuden_sk_*) were retired on 2026-08-01",
        code: "LEGACY_KEY_RETIRED",
      },
      401
    );
  }
  if (authHeader?.startsWith("Bearer kitsuden_sk_")) {
    const rawToken = authHeader.replace("Bearer ", "").trim();
    const keyHash = createHash("sha256").update(rawToken).digest("hex");

    const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);

    if (apiKey) {
      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        return c.json({ error: "API Key expired" }, 401);
      }

      // Update lastUsedAt asynchronously (fire and forget)
      db.update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, apiKey.id))
        .execute()
        .catch(() => {});

      // Deprecation warnings
      logger.warn(
        { keyId: apiKey.id, path: c.req.path },
        "[DEPRECATION] Legacy API key (kitsuden_sk_*) used. Migrate to Agent NHI (kitsuden_agent_*)."
      );
      c.header("Deprecation", "kitsuden_sk_*; kitsuden_agent_*");
      c.header("Sunset", "2026-08-01");

      // Inject synthetic Admin user
      c.set("user", {
        id: "machine-" + apiKey.id,
        name: apiKey.name,
        email: "machine@kitsuden.local",
        image: null,
        role: "admin",
      } as any);
      c.set("session", null);
      return next();
    }
  }

  // 3. Human Auth (Better-Auth Cookies)
  let s = await auth.api.getSession({ headers: c.req.raw.headers });
  // The session cookie caches the role for 5 minutes: a demoted admin kept what
  // its role opens on every route that trusts `user` (`/api/runs`, `/api/graph`,
  // the lite datasets). A privileged role is always read from the database.
  const rolDeLaCookie = (s?.user as { role?: string } | undefined)?.role;
  if (rolDeLaCookie === "admin" || rolDeLaCookie === "editor") {
    s = await auth.api.getSession({ headers: c.req.raw.headers, query: { disableCookieCache: true } });
  }
  c.set("user", s?.user || null);
  c.set("session", s?.session || null);
  await next();
});

// Enrich user context with ACL fields (roles, department)
// Must run after auth middleware so that `user` is already populated
app.use("*", enrichUserContext);

// Superficie del panel (items, módulos, funciones, acciones, explorador,
// GraphQL…): solo admin. Antes bastaba cualquier cuenta —o ninguna—, y el alta
// es abierta. Ver RUTAS_SOLO_ADMIN en middleware/auth-guard.ts.
// Fase E: cuotas por agente (minuto, escrituras y presupuesto del día; 429
// problem+json) y sus denegaciones `!patrón`, ANTES de las puertas. Ver
// lib/cuotas-de-agente.ts y docs/agents/permissions.md.
// Lo que ejecuta una propuesta aprobada ya pagó su cuota al proponerse.
const cuotas = cuotasDeAgente();
// (Las llamadas del sandbox de acciones SÍ pagan: ver ejecucionYaCobrada.)
app.use("*", (c, next) => (ejecucionYaCobrada(c) ? next() : cuotas(c, next)));
app.use("*", denegacionesDeAgente);
app.use("*", puertaDeAdmin(RUTAS_SOLO_ADMIN));

// ── A1: Idempotency-Key en escrituras (POST/PUT/PATCH/DELETE de /api/*) ──
// Tras la autenticación (la clave es por actor) y las puertas; antes de las
// rutas y los kons. Valkey → tabla de respaldo → 503 (fail-closed). Ver
// middleware/idempotencia.ts.
app.use(
  "/api/*",
  idempotencia({
    almacenes: almacenesPorDefecto,
    avisar: (mensaje, datos) => logger.warn(datos, mensaje),
  })
);

// ── Fase F: aprobación humana ──
// Tras la idempotencia (un reintento con la misma clave recibe la MISMA
// propuesta, el 202 guardado) y antes de las rutas: la petición de un agente
// que necesita aprobación no se ejecuta; queda como propuesta (202). Con todo
// apagado (lo de fábrica) no consulta nada. Ver lib/aprobaciones.ts y
// docs/agents/approvals.md.
app.use("/api/*", puertaDeAprobacion());

// Without an administrator, an account created here would only lock the owner
// out of `/api/system/setup` or be taken for it. See lib/first-run.ts.
app.use("/api/auth/sign-up/*", async (c, next) => {
  if (await signUpRefused()) {
    return c.json(
      { error: "Create the first administrator before anyone signs up", code: "SETUP_REQUIRED" },
      403
    );
  }
  return next();
});

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Ficheros subidos en modo local.
//
// Se guardaban —cuando se guardaban— y no los servia nadie: `/uploads/...`
// devolvia 404, asi que la URL publica de cada fichero apuntaba a ninguna
// parte. Con S3 no hace falta, porque los sirve el bucket.
if (!usaS3) {
  // El prefijo sale de la configuracion, no escrito a mano: es la misma cadena
  // con la que se construyen las URLs que se guardan en la base.
  app.get(`${BASE_URL_LOCAL}/*`, async (c) => {
    const clave = c.req.path.slice(BASE_URL_LOCAL.length + 1);
    try {
      // `rutaLocalDe` rechaza cualquier clave que se salga del directorio: sin
      // eso, `/uploads/../../etc/passwd` seria una ruta valida para `join`.
      const ruta = rutaLocalDe(clave);
      const medio = fichero(ruta);
      if (!(await medio.exists())) return c.notFound();

      /**
       * `?w=<ancho>`: un derivado al vuelo, cacheado en disco
       * (`.derivados/<ancho>/<clave>`). Un icono de 32 px ya no descarga la
       * cabecera entera de Steam. Si no se puede derivar, cae al original.
       */
      const ancho = anchoPedido(c.req.query("w"));
      if (ancho && esReescalable(clave)) {
        const derivado = await garantizarDerivado(clave, ruta, ancho);
        if (derivado) {
          const { cuerpo, tipo } = cuerpoDeFichero(derivado);
          return new Response(cuerpo, {
            headers: {
              ...(tipo ? { "Content-Type": tipo } : {}),
              // El ancho va en la URL y la clave es hash: no cambia jamás
              "Cache-Control": "public, max-age=31536000, immutable",
              "Access-Control-Allow-Origin": "*",
              "Content-Security-Policy": CSP_DE_MEDIOS,
            },
          });
        }
      }

      // Bajo Bun, el BunFile (tipo y envío sin copia); bajo Node, un stream (G4).
      const { cuerpo, tipo } = cuerpoDeFichero(ruta);
      return new Response(cuerpo, {
        headers: {
          ...(tipo ? { "Content-Type": tipo } : {}),
          "Cache-Control": cacheDeMedio(clave),
          "Last-Modified": new Date(medio.lastModified).toUTCString(),
          /**
           * Que se puedan LEER, no solo pintar.
           *
           * `Cross-Origin-Resource-Policy: cross-origin` (arriba) deja que la
           * web incruste la imagen. No basta para que pueda leerla: sin
           * `Access-Control-Allow-Origin`, el navegador la pinta y se niega a
           * dejarla salir en un lienzo. Se vio al exportar una tier list como
           * imagen: la captura salia con los 38 retratos en blanco y sin un
           * solo error en la consola de la pagina.
           *
           * `*` y no un origen concreto porque son ficheros publicos y se
           * piden sin credenciales; con `*` vale para las cuatro webs y para
           * cualquiera que incruste una imagen nuestra, que es justo lo que
           * `cross-origin` ya permitia.
           */
          "Access-Control-Allow-Origin": "*",
          /**
           * Un fichero de `/media` nunca ejecuta nada en el origen de la API.
           *
           * Se sirven con el tipo de su extensión: un `.svg` o un `.html`
           * subido desde el panel (o desde cualquier kon que guarde ficheros)
           * abierto directamente sería JavaScript corriendo en el MISMO origen
           * que las cookies de sesión de la API. `sandbox` lo neutraliza sin
           * afectar a `<img>`/`<video>` en las webs, que no leen esta cabecera.
           */
          "Content-Security-Policy": CSP_DE_MEDIOS,
        },
      });
    } catch {
      return c.notFound();
    }
  });
}

// ══════════════════════════════════════════════
// 🛡️ PROTECTED ROUTES
// ══════════════════════════════════════════════

/**
 * Conteos del panel de inicio.
 *
 * El Dashboard pedia `/api/auth/users/count`, `/api/blog/posts/count`,
 * `/api/media/count` y `/api/datasets/count`, y NINGUNA existia: las tres
 * primeras daban 404 y la cuarta encajaba con `/api/datasets/:id` —con
 * id="count"— asi que reventaba con `invalid input syntax for type uuid` y
 * devolvia 500.
 *
 * El panel usa `Promise.allSettled` y pinta un guion cuando algo falla, de modo
 * que el usuario veia cuatro tarjetas vacias sin ninguna explicacion. Solo con
 * la consola abierta se descubria que las rutas no existian.
 *
 * Se agrupan aqui, sobre las tablas del nucleo, en vez de repartirlas por cada
 * kon: son las cifras de la portada del admin, no del dominio de nadie.
 *
 * Solo el equipo (`admin`/`editor`): revelan el tamano de la instalacion, y
 * «tener sesion» no es «ser del equipo» con el alta abierta (2026-10-15).
 */
// `PgTable` y no un tipo condicional con `any`: lo unico que necesita `count()`
// es una tabla, y decirlo directamente es mas corto Y mas preciso. La version
// anterior era `Parameters<typeof db.select>[0] extends never ? never : any`,
// que no restringia nada — solo disfrazaba el `any` de tipo elaborado.
const contar = async (tabla: PgTable) => {
  const [fila] = await db.select({ value: count() }).from(tabla);
  return fila?.value ?? 0;
};

/**
 * `/api/users/count`, NO `/api/auth/users/count`.
 *
 * Todo lo que cuelga de `/api/auth/*` lo atiende better-auth con un comodin
 * registrado mas arriba, asi que una ruta propia ahi dentro nunca llega a
 * ejecutarse: better-auth no la conoce y responde 404. Fue exactamente lo que
 * paso al primer intento.
 *
 * Y aunque se registrara antes, seguiria siendo mala idea: ese espacio de
 * nombres es de better-auth, y una version suya que anadiera `users/count`
 * chocaria en silencio. Contar usuarios no es una operacion de autenticacion.
 */
app.get("/api/users/count", exigirStaff, async (c) => c.json({ count: await contar(user) }));

app.get("/api/media/count", exigirStaff, async (c) => c.json({ count: await contar(mediaTable) }));

app.get("/api/datasets/count", exigirStaff, async (c) =>
  c.json({ count: await contar(dataSetsTable) })
);

app.get("/api/blog/posts/count", exigirStaff, async (c) => {
  // El blog es un kon: puede no estar instalado. Un panel de inicio no puede
  // fallar porque falte un kon opcional, asi que se devuelve 0.
  try {
    const filas = await db.execute(`SELECT count(*)::int AS value FROM blog_posts` as never);
    const lista = Array.isArray(filas)
      ? (filas as { value?: number }[])
      : ((filas as { rows?: { value?: number }[] }).rows ?? []);
    return c.json({ count: lista[0]?.value ?? 0 });
  } catch {
    return c.json({ count: 0 });
  }
});

/**
 * El motivo de un fallo en las comprobaciones de salud, que son PÚBLICAS.
 *
 * En producción solo «unavailable» (el detalle va al log): el mensaje de un
 * fallo de conexión trae host, usuario de la base o la consulta entera.
 */
function detalleDeSalud(err: unknown): string {
  if (!enProduccion()) return messageOf(err);
  logger.warn({ err }, "[health] comprobación fallida");
  return "unavailable";
}

/**
 * The storage check writes and deletes an object: the route is public, so
 * anonymous traffic must not drive storage writes. At most one per minute.
 */
let almacenComprobado: { hasta: number; estado: Awaited<ReturnType<typeof comprobarAlmacen>> } | null = null;

async function comprobarAlmacenConMemoria() {
  if (almacenComprobado && almacenComprobado.hasta > Date.now()) return almacenComprobado.estado;
  const estado = await comprobarAlmacen();
  almacenComprobado = { hasta: Date.now() + 60_000, estado };
  return estado;
}

app.route("/api/version", versionRoutes);
app.get("/api/health", async (c) => {
  const checks: Record<string, { status: string; details?: unknown; error?: string }> = {};
  let overallStatus = "ok";

  // Database check
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    checks.database = {
      status: "ok",
      details: { responseTime: `${Date.now() - start}ms` },
    };
  } catch (err: unknown) {
    checks.database = { status: "error", error: detalleDeSalud(err) };
    overallStatus = "degraded";
  }

  // Queue check (Postgres): pendientes, en curso y muertos de todas las colas.
  try {
    const cola = await estadoDeLaCola();
    const waiting = cola.totales.pending ?? 0;
    const active = cola.totales.running ?? 0;
    const dead = cola.totales.dead ?? 0;
    checks.queue = {
      // Un trabajo muerto no tumba la API, pero alguien debe mirarlo.
      status: dead > 0 ? "warning" : "ok",
      details: { worker: cola.worker, listen: cola.escucha, waiting, active, dead },
    };
  } catch (err: unknown) {
    checks.queue = { status: "error", error: detalleDeSalud(err) };
    overallStatus = "degraded";
  }

  // Realtime check
  try {
    const rtStats = realtimeManager.getStats();
    checks.realtime = { status: "ok", details: rtStats };
  } catch (err: unknown) {
    checks.realtime = { status: "error", error: detalleDeSalud(err) };
  }

  // Memory usage
  const memory = process.memoryUsage();
  // Almacenamiento. No se comprobaba, y ese es justo el fallo que se cuela: el
  // contenedor se declaraba sano mientras TODA subida fallaba. La comprobacion
  // escribe y borra un objeto de prueba, porque que el destino exista no dice
  // si se puede escribir en el.
  try {
    const almacen = await comprobarAlmacenConMemoria();
    checks.storage = {
      status: almacen.ok ? "ok" : "error",
      details: { proveedor: almacen.proveedor, detalle: almacen.detalle },
    };
    if (!almacen.ok) overallStatus = "degraded";
  } catch (err) {
    checks.storage = { status: "error", error: detalleDeSalud(err) };
    overallStatus = "degraded";
  }

  checks.memory = {
    status: memory.heapUsed > 500 * 1024 * 1024 ? "warning" : "ok",
    details: {
      heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memory.rss / 1024 / 1024)}MB`,
    },
  };

  // Uptime
  const uptime = process.uptime();

  c.status(overallStatus === "ok" ? 200 : 503);
  // In production, whoever is not an admin gets the verdict and nothing else:
  // storage paths, queue counts and memory are not for anonymous callers.
  const quien = c.get("user") as { role?: string } | null | undefined;
  const agente = c.get("agent") as { scopes?: string[] } | undefined;
  const conDetalle = !enProduccion() || quien?.role === "admin" || agente?.scopes?.includes("admin") === true;
  return c.json({
    status: overallStatus,
    service: "kitsuden-api",
    version: "0.9.0-beta",
    timestamp: new Date().toISOString(),
    ...(conDetalle
      ? {
          environment: config.NODE_ENV,
          uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
          checks,
        }
      : {
          checks: Object.fromEntries(
            Object.entries(checks).map(([nombre, chequeo]) => [nombre, { status: chequeo.status }])
          ),
        }),
  });
});

// pgvector health check endpoint
app.get("/api/health/pgvector", async (c) => {
  try {
    const result = await db.execute(
      sql`SELECT 1 as installed FROM pg_extension WHERE extname = 'vector'`
    );
    const installed = result.rows.length > 0;
    return c.json({
      pgvector: installed,
      requiredFor: ["ai-memories"],
      message: installed
        ? "pgvector is installed and ready"
        : "pgvector is NOT installed. AI features will not work.",
    });
  } catch (err: unknown) {
    return c.json(
      {
        pgvector: false,
        error: detalleDeSalud(err),
        message: "Could not check pgvector status. Database connection failed.",
      },
      500
    );
  }
});

// pg_trgm health check endpoint
app.get("/api/health/pgtrgm", async (c) => {
  try {
    const result = await db.execute(
      sql`SELECT 1 as installed FROM pg_extension WHERE extname = 'pg_trgm'`
    );
    const installed = result.rows.length > 0;
    return c.json({
      pgtrgm: installed,
      requiredFor: ["dataset-fulltext-search"],
      message: installed
        ? "pg_trgm is installed and ready"
        : "pg_trgm is NOT installed. Dataset full-text search will fall back to slow sequential scans.",
    });
  } catch (err: unknown) {
    return c.json(
      {
        pgtrgm: false,
        error: detalleDeSalud(err),
        message: "Could not check pg_trgm status. Database connection failed.",
      },
      500
    );
  }
});

// ══════════════════════════════════════════════
// 🎛️ HEADLESS MODE
// ══════════════════════════════════════════════

if (features.headless) {
  app.all("/api/admin/*", (c) => {
    return c.json(
      {
        error: "Headless mode",
        message: "Admin API is disabled. This Kitsuden instance is running in headless BaaS mode.",
      },
      503
    );
  });
  console.log("  👻 Headless Mode → Admin routes disabled");
}

// `exigirAdmin` relee el rol de la base (sin la caché de 5 min de la cookie):
// un admin degradado o con sesiones revocadas seguía siendo admin aquí hasta
// 5 minutos y podía crearse una clave de agente `admin` permanente
// (auditoría 2026-10-25). Lo mismo para /api/sistema y /api/keys.
app.use("/api/admin/*", exigirAdmin);

// ══════════════════════════════════════════════
// ⚡ CORE LAYER — Nivel 1: Infraestructura Apagable
// ══════════════════════════════════════════════

// Data Sets & Visualizer (ALWAYS ACTIVE — the foundation)
//
// RLS (Nivel 2, Muro de Titanio): se monta sobre TODAS las variantes de ruta de
// entries. Históricamente solo cubría `/api/datasets/*` (sin guion, el RPC
// surface) mientras que las rutas reales viven en `/api/data-sets` — un
// mismatch que dejaba las entries sin transacción RLS. Cubrimos ambas.
//
// OJO: el contexto RLS vacío (usuario anónimo) es escape hatch a acceso total
// en la política de Postgres, así que esto es defensa en profundidad — el
// filtrado por owner de Nivel 1 vive en los handlers (buildDatasetWhere).
app.use("/api/datasets/:id/entries", withTransactionalRLS());
app.use("/api/datasets/:slug/entries", withTransactionalRLS());
app.use("/api/data-sets/:id/entries", withTransactionalRLS());
app.use("/api/data-sets/:slug/entries", withTransactionalRLS());
app.use("/api/datasets/batch", withTransactionalRLS());
// Note: explorerRoutes are now provided by kon-datasets
// Only mount lite routes directly (as fallback if kon isn't loaded yet)
app.route("/api/data-sets", dataSetsLiteRoutes);
console.log("  📊 Core: Data Sets Lite Routes → ALWAYS ACTIVE");

// Query Engine & Batch Processor Routes (FASE 2: La Magia de los Datos)
// /api/datasets ahora se monta via rpcSurface (src/rpc.ts, Hono RPC)
// /api/items ahora se monta via rpcSurface (src/rpc.ts, Hono RPC)
app.route("/api/generate-code", codegenRoutes);
console.log("  🔍 Core: Query Engine (Kitsuden QL) → ALWAYS ACTIVE");
console.log("  📦 Core: Batch Processor (ACID) → ALWAYS ACTIVE");
console.log("  🎨 Core: Code Generation → /api/generate-code");

// Media Library (toggleable) - now as kon
const isKonEnabled = (id: string) =>
  kitsudenConfig.core.find((g: any) => g.id === id)?.enabled ?? false;

if (isKonEnabled("kon-media")) {
  console.log("  🖼️  Core: Media Library → ENABLED (routes mounted by kon)");
} else {
  console.log("  🖼️  Core: Media Library → DISABLED");
}

// Note: Page Builder, Blog, Formulas are now Nivel 3 Kons (Promote merged into Blog)
// loaded dynamically by the module-loader. Webhooks and Connectors are
// when their Kon / Core flags are enabled. See loadModules() below.

// Connectors (toggleable)
if (isKonEnabled("kon-connectors")) {
  console.log("  🔌 Core: Data Connectors → ENABLED");
} else {
  console.log("  🔌 Core: Data Connectors → DISABLED");
}

// ══════════════════════════════════════════════
// 🔧 ENGINE ROUTES
// ══════════════════════════════════════════════

app.route("/api/settings", settingsRoutes);
app.route("/api/modules", modulesRoutes);
// Artefactos de admin de los kons (vistas a medida agnósticas al framework).
app.route("/api/kons", konAssetsRoutes);
app.route("/api/sync", syncRoutes);
app.route("/api/graphql", graphqlRoutes);
app.use("/api/graph/*", withTransactionalRLS());
console.log("  🕸️  Engine Graphify → /api/graph (auto relational APIs)");
app.route("/api/functions", functionsRoutes);
app.route("/api/actions", actionsRoutes);
app.use("/api/keys", exigirAdmin);
app.use("/api/keys/*", exigirAdmin);
app.route("/api/keys", apiKeysRoutes);
// OAuth 2.1 para MCP: /.well-known/oauth-* y /api/oauth/* (lib/oauth, docs/agents/oauth.md)
app.route("/", oauthRoutes);
app.route("/api/oauth", oauthPanelRoutes);
arrancarBarridoDeOAuth();
if (features.mcpEnabled) {
  app.route("/api/mcp", mcpRoutes);
  console.log("  🤖 MCP Server → ENABLED (/api/mcp)");
} else {
  console.log("  🤖 MCP Server → DISABLED");
}
app.route("/api/admin/registry", adminRegistryRoutes);
// La cola de Postgres: recuento, «dead letter», reintentar y descartar.
app.route("/api/admin/queue", colaRoutes);
// Las peticiones registradas: actor, kon, operación, tiempo en la base, bloqueos.
app.route("/api/admin/requests", trazasRoutes);
// B3: la URL de aviso (webhook firmado) de cada agente.
app.route("/api/admin/agents", avisosDeAgentesRoutes);
console.log("  🔑 Secrets Manager (Prefect-style) → /api/admin/secrets");
app.use("/api/admin/vault/*", withTransactionalRLS());
// Superficie Hono RPC (chained): graphify + secrets + vault — ver src/rpc.ts
app.route("/", rpcSurface);
console.log(
  "  🗄️  KITSUDEN Vault →",
  process.env.KITSUDEN_VAULT_ENABLED === "true"
    ? "/api/admin/vault (ENABLED)"
    : "disabled (set KITSUDEN_VAULT_ENABLED=true)"
);
app.route("/api/admin/agents", agentRoutes);
// Fase E: permisos (amplios + finos + denegaciones), claves y cuotas de cada
// agente para el panel. Bajo /api/v1: solo admin (RUTAS_SOLO_ADMIN).
app.route("/api/v1", permisosDeAgentesRoutes);
// Fase F: bandeja y configuración de la aprobación humana (solo humanos del
// equipo) y el estado de sus propuestas para cada agente.
app.route("/api/approvals", aprobacionesRoutes);
app.route("/api/proposals", propuestasRoutes);
// Fase H3: los modelos (defineModelo) de los kons montados, para el panel.
app.route(RUTA_DE_MODELOS, modelosRoutes);
fijarAppDeAprobaciones((req, env) => app.fetch(req, env));
arrancarBarridoDePropuestas();
// Fase I: promoción de código de agentes. Las operaciones del agente
// (/api/promotion) van en la transacción RLS de la petición y se registran
// entre las MONTADAS (herramientas MCP promotion_*; la puerta de /api/promotion
// las abre a promotion:propose); las del panel (/api/approvals/promotion), solo
// humanos admin. Ver lib/promocion.ts y docs/agents/promotion.md.
montarRlsDeKon(app, RUTA_DE_PROMOCION);
app.route(RUTA_DE_PROMOCION, promocionRoutes);
registrarOperacionesMontadas(KON_DE_PROMOCION, RUTA_DE_PROMOCION, operacionesDePromocion, promocionRoutes);
app.route(RUTA_DE_PROMOCION_ADMIN, promocionAdminRoutes);
arrancarBarridoDeVigilancias();
// /api/v1 (agents/traces/identities) ahora se monta via rpcSurface (src/rpc.ts)
app.route("/api/admin/agents", agentPlaygroundRoutes);
app.route("/api/agent/memory", agentMemoryRoutes);
app.route("/api/agent/plans", agentPlansRoutes);
app.route("/api/admin/data-sources", dataSourcesRoutes);
app.route("/api/explorer", explorerRoutes);
// Memoria de agentes (2026-10-28): operaciones del SDK con dueño y RLS, en
// la transacción de la petición. Se registran entre las MONTADAS: de ahí salen
// sus herramientas MCP (brain_search, brain_read, brain_note_write…) y la
// puerta de /api/brain las abre a los agentes con brain:read / brain:write.
montarRlsDeKon(app, RUTA_DE_MEMORIA);
app.route(RUTA_DE_MEMORIA, brainMemoriaRoutes);
registrarOperacionesMontadas(KON_DE_MEMORIA, RUTA_DE_MEMORIA, operacionesDeMemoria, brainMemoriaRoutes);
app.route("/api/brain", brainRoutes);
console.log("  🧠 KITSUDEN Brain → /api/brain");
app.route("/api/map", systemMapRoutes);
console.log("  🗺️  System Map → /api/map");
app.route("/api/code-graph", codeGraphRoutes);
console.log("  🕸️  Code Graph → /api/code-graph");
app.route("/api/runs", runsRoutes);
console.log("  🔬 Run Inspector → /api/runs");
app.route("/api/mail", mailRoutes);
console.log("  ✉️  Mail → /api/mail");
app.route("/api/schema", schemaIntrospectionRoutes);
app.route("/api/relations", inlineRelationsRoutes);
console.log("  🎛️  Admin Registry → Auto-discovery enabled");
console.log("  🔍 Schema Introspection → DB reflection enabled");
console.log("  🔗 Inline Relations → Django-style inlines enabled");
// Note: platforms, tags, streamers, blog, formulas and other kons
// are loaded dynamically by loadModules() below. Do not add hardcoded routes here.

// ══════════════════════════════════════════════
// 📦 DYNAMIC MODULE ROUTES (Kons + Core modules)
// ══════════════════════════════════════════════

// Antes de servir una sola peticion: comprobar que la conexion de la API no es
// superusuario. Postgres ignora RLS para superusuarios, asi que con esa cuenta
// las politicas quedan decorativas y el aislamiento entre tenants no existe —
// sin ningun sintoma. En produccion esto PARA el arranque; fuera, avisa.
//
// Va aqui, despues de cargar los kons, porque para entonces ya estan aplicadas
// todas las politicas y la base responde.
await verificarConexionRls(db, { estricto: config.NODE_ENV === "production" });

// Fresh install: the one-time token for the first administrator, in the log.
await announceSetupTokenAtBoot();

// ── La configuración siembra la base, y a partir de ahí manda la base ──────
//
// `kitsuden.config.ts` dice qué kons vienen encendidos DE FÁBRICA; la tabla
// `modules` dice qué está encendido AHORA. Antes las dos cosas se leían como si
// fueran la misma, y el fichero acababa pisando lo que el usuario tocaba en el
// panel.
//
// Sembrar aquí —antes de cargar los kons— es lo que permite que `loadKons()`
// lea SOLO la base sin romper una instalación nueva: cuando llega, la base ya
// sabe lo que el fichero quería. Ver `lib/sembrar-modulos.ts`.
try {
  const { sembrarModulos } = await import("./lib/sembrar-modulos");
  const siembra = await sembrarModulos();
  if (siembra.sembrados.length > 0) {
    console.log(
      `  🌱 Sembrados en 'modules' desde la configuración: ${siembra.sembrados.join(", ")}`
    );
  }
} catch (err) {
  // Que la siembra falle NO puede impedir arrancar: la API sigue sirviendo con
  // lo que la base ya tenga. Pero se dice fuerte, porque en una instalación
  // NUEVA esto significa que no se cargará ningún kon, y un arranque sin kons
  // y sin explicación es exactamente el tipo de fallo silencioso que se está
  // persiguiendo en este repo.
  console.error(
    `  ✗ No se pudo sembrar 'modules' desde la configuración: ` +
      `${err instanceof Error ? err.message : err}
` +
      `    En una instalación nueva esto deja el sistema sin kons. ` +
      `Ejecuta: bun run scripts/sembrar-modulos.ts`
  );
}

await loadModules(app);

// `/api/version` solo anuncia los contratos cuyo kon responde de verdad
// (cargado al arrancar o activado después): ver routes/version.ts.
fijarDisponibilidadDeKons((konId) => konDisponible(konId, getInformeDeCarga().cargados));

// Invalidate GraphQL cache after kons are loaded so new tables appear
invalidateGraphQLCache();

// ══════════════════════════════════════════════
// 🏰 GRIMOIRE LIFECYCLE — Seed & Activation
// ══════════════════════════════════════════════

const activeGrimoire =
  process.env.KITSUDEN_ACTIVE_GRIMOIRE || process.env.KITSUDEN_ACTIVE_THEME || null;
if (activeGrimoire) {
  try {
    const { activateGrimoire } = await import("./lib/grimoire-lifecycle");
    await activateGrimoire(activeGrimoire);
  } catch (err: unknown) {
    console.warn(`[Grimoire] Activation failed for ${activeGrimoire}:`, messageOf(err));
  }
}

// ══════════════════════════════════════════════
// 🪄 INITIALIZE AUTO-KONS
// ══════════════════════════════════════════════

const autoMcpProxy = {
  addTool: (toolDef: any) => {
    // Convert generated MCP tools directly to the unified Action engine
    defineAction({
      trigger: `agent.tool:${toolDef.name}`,
      description: toolDef.description,
      inputSchema: toolDef.inputSchema,
      run: async (ctx: any) => {
        // Execute the native handler for this Auto-Kon tool
        return toolDef.handler(ctx.payload, {
          agentId: ctx.agent?.agentId,
          agentName: ctx.agent?.agentName,
          scopes: ctx.agent?.scopes || [],
          preferToon: ctx.agent?.preferToon || false,
        });
      },
    });
  },
};

initializeKons(createKonContext(), app as any, autoMcpProxy);

// ══════════════════════════════════════════════
// 🚨 ERROR HANDLING
// ══════════════════════════════════════════════

app.notFound((c) => {
  logger.warn(
    {
      method: c.req.method,
      path: c.req.path,
      status: 404,
    },
    "Route not found"
  );

  /**
   * ── UN 404 A SECAS NO LE DICE NADA A UN AGENTE ─────────────────────────
   *
   * No distingue «método equivocado» de «camino con una errata» de «esa ruta
   * no existe», y un agente reintenta a ciegas. Para lo que cuelga de `/api`
   * se responde a las tres: 405 con los métodos válidos si el camino existe,
   * y si no, las rutas más parecidas y dónde está el contrato completo.
   */
  if (c.req.path.startsWith("/api/")) {
    // Pasado su presupuesto por minuto, un cliente recibe el 404 sin sugerencias (F3/F8).
    const { allow, didYouMean } = puedeSugerir(ipDelCliente(c))
      ? sugerirRutas(c.req.method, c.req.path)
      : { allow: [] as string[], didYouMean: [] as { method: string; path: string }[] };

    if (allow.length > 0) {
      c.header("Allow", allow.join(", "));
      return c.json(
        {
          error: "Method not allowed",
          message: `${c.req.path} existe, pero no acepta ${c.req.method}. Métodos válidos: ${allow.join(", ")}.`,
          path: c.req.path,
          method: c.req.method,
          allow,
          requestId: c.get("requestId"),
        },
        405
      );
    }

    return c.json(
      {
        error: "Not found",
        path: c.req.path,
        method: c.req.method,
        didYouMean,
        hint: features.swaggerEnabled
          ? "Todas las rutas de los kons están en GET /api/docs/openapi.json, " +
            "y la guía para agentes en GET /llms.txt."
          : "Todas las rutas de los kons están en la guía para agentes: GET /llms.txt.",
        requestId: c.get("requestId"),
      },
      404
    );
  }

  return c.json(
    {
      error: "Not found",
      path: c.req.path,
      requestId: c.get("requestId"),
    },
    404
  );
});

app.onError((err, c) => {
  const isDevelopment = config.NODE_ENV === "development";
  const { envelope, status } = toErrorEnvelope(err, {
    requestId: c.get("requestId"),
    traceId: c.get("traceId"),
    isDev: isDevelopment,
  });

  // Log estructurado (5xx = error, 4xx = warn). Ya correlado por el mixin.
  const logFields = {
    method: c.req.method,
    path: c.req.path,
    status,
    code: envelope.error.code,
    error: err instanceof Error ? messageOf(err) : String(err),
    stack: isDevelopment && err instanceof Error ? err.stack : undefined,
  };
  if (status >= 500) logger.error(logFields, `Unhandled error: ${logFields.error}`);
  else logger.warn(logFields, `Handled error: ${envelope.error.code}`);

  return c.json(envelope, status as 500);
});

// ═══════════════════════════════════════════════════════════════════════════
// 📚 API DOCUMENTATION (Swagger + Scalar)
// ═══════════════════════════════════════════════════════════════════════════

// Mount docs routes (dynamic OpenAPI from kons)
// `ENABLE_SWAGGER=false` apaga la documentación (se leía en config y nadie la
// miraba: la documentación se montaba siempre).
if (features.swaggerEnabled) app.route("/api/docs", dynamicDocsRouter);

/**
 * Guía para agentes. En la raíz porque es donde un agente la busca por
 * convención, y bajo `/api` porque es donde el MCP standalone sabe llamar.
 * Se genera en cada petición: las rutas salen del router montado, así que no
 * puede quedarse atrás respecto de lo que la API sirve.
 */
const servirGuiaParaAgentes = (c: Context) =>
  c.text(
    generarGuiaParaAgentes({
      baseUrl: `${new URL(c.req.url).origin}/api`,
      rutas: rutasDeKons(),
      contratoPublicado: features.swaggerEnabled,
    }),
    200,
    { "content-type": "text/markdown; charset=utf-8" }
  );
app.get("/llms.txt", servirGuiaParaAgentes);
app.get("/api/llms.txt", servirGuiaParaAgentes);

// Also mount legacy docs for compatibility
if (features.swaggerEnabled) app.route("/api/docs-legacy", docsRoutes);

// Con la documentación apagada, estas redirecciones llevarían a un 404.
if (features.swaggerEnabled) {
  // Redirect legacy /api/swagger to new docs
  app.get("/api/swagger", (c) => c.redirect("/api/docs"));

  // Also redirect /api/doc (OpenAPI JSON spec) to new endpoint
  app.get("/api/doc", (c) => c.redirect("/api/docs/openapi.json"));

  console.log("  📚 API Documentation → /api/docs (Swagger UI)");
  console.log("  📚 API Reference (Modern) → /api/docs/modern (Scalar)");
  console.log("  📚 OpenAPI Spec → /api/docs/openapi.json");
} else {
  console.log("  📚 API Documentation → OFF (ENABLE_SWAGGER=false); agent guide at /llms.txt");
}

// ══════════════════════════════════════════════
// 🚀 SERVER START
// ══════════════════════════════════════════════

const port = Number(process.env.PORT) || 3001;
const hostname = hostDeEscucha();

// Búsqueda semántica de los modelos: el proveedor de embeddings (D5).
configurarEmbeddingsDeModelos();

// Initialize workers (non-blocking)
setupWorkers().catch((err) => {
  console.error("Worker startup failed (non-fatal):", messageOf(err));
});

// Initialize real-time manager
// Autorización por canal + filtrado por fila ANTES de aceptar suscripciones:
// sin esto el realtime queda deny-by-default (solo admin), nunca abierto.
// Correos del sistema + traducciones. Los kons registran los suyos en su
// hook de arranque (mail.register), sin tocar el host.
registerSystemMails(mail);

wireRealtimeAuthorization();
bridgeEventsToRealtime();
realtimeManager.initialize().catch((err) => {
  console.error("Real-time init failed (non-fatal):", messageOf(err));
});

// ══════════════════════════════════════════════
// 🌐 BUN SERVER WITH WEBSOCKET SUPPORT
// ══════════════════════════════════════════════

/**
 * Generate unique client ID.
 */
function generateClientId(): string {
  return `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Extract session from WebSocket upgrade request.
 *
 * Sin la caché de 5 minutos de la cookie: un socket vive mucho más que una
 * petición, y con la caché una cuenta recién degradada o revocada abría el
 * canal con el rol viejo (auditoría de seguridad, F15). Se guarda también el
 * id y la caducidad de la sesión: el gestor la revalida al suscribirse y cada
 * minuto, y cierra el socket si ya no vale (F82).
 */
async function getSessionFromRequest(req: Request): Promise<{
  userId: string | null;
  userRole: string | null;
  sessionId: string | null;
  sessionExpiresAt: number | null;
}> {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
      query: { disableCookieCache: true },
    });
    const userId = session?.user?.id || null;
    const expira = session?.session?.expiresAt ? new Date(session.session.expiresAt).getTime() : NaN;
    return {
      userId,
      userRole: ((session?.user as { role?: string } | undefined)?.role as string) || null,
      sessionId: userId ? session?.session?.id || null : null,
      sessionExpiresAt: userId && Number.isFinite(expira) ? expira : null,
    };
  } catch {
    return { userId: null, userRole: null, sessionId: null, sessionExpiresAt: null };
  }
}

// Initialize Kitsuden Workers dispatcher (event listeners)
initFunctionDispatcher();

// Initialize Actions Engine (unified workers + webhooks)
initActionsEngine();

// Initialize DX Actions Layer (Nivel 1)
initActions({
  hono: app as any,
  mcp: true,
});

// Initialize Agent Telemetry (Paso 2: Observability)
initAgentTelemetry();

// Initialize KITSUDEN Brain (self-aware knowledge layer)
const brainEnabled = process.env.KITSUDEN_BRAIN_ENABLED !== "false";
if (brainEnabled) {
  initKitsudenBrain(db, {
    watch: process.env.KITSUDEN_BRAIN_WATCH === "true",
    debounceMs: Number(process.env.KITSUDEN_BRAIN_DEBOUNCE_MS ?? 3000),
  });
  console.log(
    "  🧠 KITSUDEN Brain watcher →",
    process.env.KITSUDEN_BRAIN_WATCH === "true"
      ? "ENABLED"
      : "disabled (set KITSUDEN_BRAIN_WATCH=true to enable)"
  );
}

// Initialize Secrets Manager (Prefect-style hot injection into process.env)
loadSecretsIntoEnv()
  .then((n) => {
    if (n > 0) console.log(`  🔑 Secrets Manager → ${n} secret(s) hot-injected into process.env`);
  })
  .catch(() => {});

// Initialize Cron Scheduler (loads active cron jobs from DB)
initCronScheduler().catch((err) => {
  console.warn(`  ⏰ Cron Scheduler init warning: ${messageOf(err)}`);
});

console.log(`
╔══════════════════════════════════════════════════╗
║   ⚡ Kitsuden API v0.9.0-beta (Actions)       ║
║   Runtime: Bun + Hono                          ║
║   Auth: Better-Auth 🔐                         ║
║   Queue: Postgres (outbox) 🐘                  ║
║   Real-time: WebSocket + ${valkeyConfigurado() ? "Valkey 📡           " : "LISTEN/NOTIFY 📡    "} ║
║   Actions: Unified Engine ⚡                    ║
║   GraphQL: /api/graphql 📊                    ║
║   Docs: /api/docs (Swagger) 📚                ║
║   API Ref: /api/docs/modern (Scalar) 📖       ║
║   RLS: El Muro de Titanio 🛡️                  ║
║   Port: ${port}                                  ║
╚══════════════════════════════════════════════════╝
`);

// Apagado ordenado: el worker de la cola termina lo que tiene en marcha (lo
// que no acabe lo recupera el barrido cuando venza su arriendo).
let apagando = false;
for (const senal of ["SIGTERM", "SIGINT"] as const) {
  process.once(senal, () => {
    if (apagando) return;
    apagando = true;
    void Promise.allSettled([shutdownQueues(), pararTrazas(), closeValkey()]).finally(() =>
      process.exit(0)
    );
  });
}

export { app };

// ── Hono RPC (arquitectura KITSUDEN §7) ──
// El cliente inicializa: `import { hc } from "hono/client";` +
// `const client = hc<AppType>("http://localhost:3001");`
// para obtener un SDK tipado sin generar archivos intermedios.
export type AppType = typeof app;

// Tipo RPC profundo (routers migrados a chained syntax) — ver src/rpc.ts
export type { KitsudenRpcType } from "./rpc";

export default {
  port,
  hostname,
  fetch: async (req: Request, server: any): Promise<Response> => {
    const url = new URL(req.url);

    // WebSocket upgrade for /api/realtime
    if (url.pathname === "/api/realtime") {
      // El navegador manda las cookies en el handshake de un WebSocket aunque
      // lo abra otra web (no hay CORS para WebSockets). Sin mirar `Origin`,
      // cualquier página podía abrir el canal con la sesión del visitante.
      // Los clientes que no son navegador no mandan `Origin` y siguen igual.
      const origen = req.headers.get("origin");
      if (origen && !corsConfig.origins.includes(origen)) {
        return new Response("Origin not allowed", { status: 403 });
      }
      const session = await getSessionFromRequest(req);
      const clientId = generateClientId();

      const upgraded = server.upgrade(req, {
        data: {
          clientId,
          userId: session.userId,
          // Sin el rol, el autorizador de canales veía a TODOS como sin rol:
          // un admin no podía suscribirse a lo que su política le deja ver.
          userRole: session.userRole,
          sessionId: session.sessionId,
          sessionExpiresAt: session.sessionExpiresAt,
        } satisfies WSClientData,
      });

      if (upgraded) {
        return undefined as any; // Bun handles the upgrade
      }

      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // El SSE de MCP (`GET /api/mcp`) es una conexión larga que solo manda un
    // keepalive cada 30 s, y Bun corta por defecto lo que pasa 10 s sin datos
    // (`idleTimeout`): la sesión moría a los 10 s y el siguiente `POST` del
    // agente recibía «Invalid or expired session» (lo encontró el recorrido de
    // la fase F: un agente que propone y consulta después). Sin límite para
    // esa petición; la sesión sigue caducando a la hora sin actividad.
    if (url.pathname === "/api/mcp" && req.method === "GET") {
      (server as { timeout?: (r: Request, s: number) => void }).timeout?.(req, 0);
    }

    // Regular HTTP request → Hono
    return app.fetch(req, { ip: server.requestIP(req) });
  },

  websocket: {
    // Los frames del protocolo son JSON de pocas decenas de bytes; el valor
    // por defecto de Bun (16 MB) solo sirve para que un anónimo gaste CPU en JSON.parse.
    maxPayloadLength: 64 * 1024,

    open(ws: ServerWebSocket<WSClientData>) {
      const { clientId, userId, userRole, sessionId, sessionExpiresAt } = ws.data;
      realtimeManager.addClient(clientId, ws, userId, userRole ?? null, {
        id: sessionId ?? null,
        expiresAt: sessionExpiresAt ?? null,
      });

      // Send welcome message
      ws.send(
        JSON.stringify({
          type: "connected",
          clientId,
          userId,
          timestamp: Date.now(),
        })
      );
    },

    message(ws: ServerWebSocket<WSClientData>, message: string | Buffer) {
      const { clientId } = ws.data;
      // Un frame que rompe no tumba el proceso: handleMessage ya valida, esto
      // es la última red (auditoría de seguridad, F78).
      try {
        const raw = typeof message === "string" ? message : message.toString();
        realtimeManager.handleMessage(clientId, raw);
      } catch (err) {
        console.error(`[WS Error] ${clientId}:`, messageOf(err));
      }
    },

    close(ws: ServerWebSocket<WSClientData>) {
      const { clientId } = ws.data;
      realtimeManager.removeClient(clientId);
    },

    error(ws: ServerWebSocket<WSClientData>, error: Error) {
      console.error(`[WS Error] ${ws.data.clientId}:`, messageOf(error));
    },
  },
};
