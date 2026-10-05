/**
 * Kitsuden - Hono API Server v0.9.0-beta (Actions Unification)
 *
 * Runtime: Bun + Hono
 * Auth: Better-Auth (cookie sessions)
 * Queue: BullMQ + DragonflyDB
 * Real-time: WebSocket + Valkey Pub/Sub
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
import { BASE_URL_LOCAL, cacheDeMedio, comprobarAlmacen, rutaLocalDe, usaS3 } from "./lib/almacen";
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
import { loadModules, createKonContext } from "./lib/module-loader";
import { setupWorkers, emailQueue } from "./lib/queue";
import { realtimeManager, type WSClientData } from "./lib/realtime";
import { wireRealtimeAuthorization, bridgeEventsToRealtime } from "./lib/realtime-wiring";
import { toonMiddleware } from "./lib/toon";
import { toonProtocolMiddleware } from "./lib/toon-protocol";
import { valkeyConnection } from "./lib/valkey";
import { registerSystemMails } from "./mail/system-mails";
import { requestContextMiddleware, accessLogAndMetrics } from "./middleware/telemetry";

// ── Feature Flags ──

// ── Core Layer Routes (Nivel 2) — Imported through packages/core/ ──
// NOTE: media-library and data-sets have been migrated to kons
// Legacy core imports removed — now provided by kons

// ── Engine Routes (Nivel 1) — Always-on infrastructure ──
import { withTransactionalRLS } from "./middleware/transactional-rls";
import type { PgTable } from "drizzle-orm/pg-core";
import { protectRoute } from "./middleware/auth-guard";
import { enrichUserContext } from "./middleware/user-context";
import { actionsRoutes } from "./routes/actions";
import { adminRegistryRoutes } from "./routes/admin-registry";
import agentMemoryRoutes from "./routes/agent-memory";
import agentPlaygroundRoutes from "./routes/agent-playground";
import type { Context } from "hono";

import { generarGuiaParaAgentes } from "./lib/guia-para-agentes";
import { rutasDeKons, sugerirRutas } from "./lib/rutas-de-kons";
import agentRoutes from "./routes/agents";
import { apiKeysRoutes } from "./routes/api-keys";
import { brainRoutes } from "./routes/brain";
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
import { modulesRoutes } from "./routes/modules";
import konAssetsRoutes from "./routes/kon-assets";
import { schemaIntrospectionRoutes } from "./routes/schema-introspection";
import { sistemaAdminRoutes } from "./routes/sistema-admin";
import { systemRoutes } from "./routes/system";

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

// ══════════════════════════════════════════════
// ⚙️ GLOBAL MIDDLEWARE
// ══════════════════════════════════════════════

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

// ═══════════════════════════════════════════════
// CRITICAL FEATURES - Rate limiting, search & observability
// Global Valkey-based rate limiting, search engine and observability
// routes are mounted together by registerCriticalFeatures. This is placed
// before public routes so the global /api/* rate limiter runs before the
// auth/session middleware and protects all API routes registered later.
// ═══════════════════════════════════════════════
registerCriticalFeatures(app);

// ═══════════════════════════════════════════════
// STRUCTURED ACCESS LOG + SLI METRICS
// Mide cada request (status + latencia → MetricsRegistry) y emite un access-log
// estructurado ya correlado con trace_id/span_id. Ver middleware/telemetry.ts.
// ═══════════════════════════════════════════════
app.use("*", accessLogAndMetrics());

// ═══════════════════════════════════════════════
// CORS DINÁMICO - Configurable via env
// ═══════════════════════════════════════════════
app.use("*", honoLogger());
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
    const [result] = await db.select({ value: count() }).from(user);
    const userCount = result?.value || 0;
    return c.json({ initialized: userCount > 0 });
  } catch (error: unknown) {
    // El detalle va al log, no al cuerpo: esta ruta es PÚBLICA y previa a la
    // autenticación, y el mensaje de un fallo de Drizzle lleva el SQL entero
    // con nombres de tabla y columnas.
    logger.error({ err: error }, "[init-check] fallo comprobando usuarios");
    return c.json({ initialized: true });
  }
});

app.post("/api/system/setup", async (c) => {
  try {
    const [result] = await db.select({ value: count() }).from(user);
    if ((result?.value || 0) > 0) {
      return c.json({ error: "System already initialized" }, 403);
    }

    const body = await c.req.json();
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    // `c.req.raw.headers`, NO `c.req.header()`.
    //
    // El primero es el objeto `Headers` de la petición; el segundo devuelve un
    // objeto plano de Hono. better-auth espera `Headers` y llama a sus métodos
    // por dentro, así que con el objeto plano rompía con
    //
    //     undefined is not an object (evaluating 'result.headers')
    //
    // y lo hacía DESPUÉS de haber escrito en la base: usuario, credencial y
    // sesión creados, y aun así 500. El alta parecía fallar entera cuando en
    // realidad solo faltaba devolver la respuesta.
    //
    // Todas las demás llamadas a `auth.api.*` de este repo ya usaban
    // `c.req.raw.headers`; esta era la única distinta.
    const authRes = await auth.api.signUpEmail({
      body: { email, password, name },
      headers: c.req.raw.headers,
      asResponse: false,
    });

    if (!authRes || !("user" in authRes)) throw new Error("Failed to create user");

    /**
     * Admin Y verificado.
     *
     * Con la verificación de email obligatoria, el alta de better-auth crea el
     * usuario sin verificar y SetupView hace `signIn` justo después: sin marcar
     * aquí `emailVerified`, quien instala la plataforma se quedaría fuera de su
     * propia instancia en el primer segundo, esperando un correo que en una
     * instalación recién hecha aún no hay forma de enviar.
     *
     * Marcarlo no amplía nada: esta ruta solo funciona con CERO usuarios, así
     * que quien llega aquí es, por definición, quien está montando la
     * instalación.
     */
    const updateResult = await db
      .update(user)
      .set({ role: "admin", emailVerified: true })
      .where(eq(user.id, authRes.user.id))
      .returning();
    if (updateResult.length === 0) {
      // ID didn't match — Better-Auth may use a different ID format
      console.warn(`[setup] Role update by ID failed for ${authRes.user.id}, trying by email...`);
      await db
        .update(user)
        .set({ role: "admin", emailVerified: true })
        .where(eq(user.email, email));
    }
    console.log(`[setup] User ${email} promoted to admin`);

    const [settings] = await db.select().from(siteSettings).limit(1);
    if (!settings) {
      await db.insert(siteSettings).values({ siteName: "Kitsuden CMS" });
    }

    try {
      await emailQueue.add("system.welcome", { to: email, name } as any);
    } catch {}

    return c.json({ success: true, user: authRes.user });
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
app.route("/api/sistema", sistemaAdminRoutes);

// ══════════════════════════════════════════════
// 🔐 AUTH & SESSION (Including Agent NHI)
// ══════════════════════════════════════════════

import { createHash } from "crypto";

import { authenticateAgent, isAgentApiKey } from "./services/agent-auth";
import type { AgentAuthContext } from "./services/agent-auth";

// Extend Hono context types - agent is now defined in app Variables type above

app.use("*", async (c, next) => {
  // Skip session extraction for Better-Auth endpoints to avoid conflicts
  if (c.req.path.startsWith("/api/auth/")) {
    return next();
  }

  const authHeader = c.req.header("Authorization");

  // 1. AGENT AUTH (NHI - Non-Human Identity) - NEW SYSTEM
  // Format: Bearer kitsuden_agent_xxxxx (acepta el legacy grm_agent_* hasta el
  // sunset 2026-08-01; ver ACCEPTED_API_KEY_PREFIXES en services/agent-auth).
  if (authHeader?.startsWith("Bearer ") && isAgentApiKey(authHeader.slice(7).trim())) {
    const rawToken = authHeader.replace("Bearer ", "").trim();

    const result = await authenticateAgent(rawToken, {
      ipAddress: c.req.header("x-forwarded-for") || undefined,
      userAgent: c.req.header("user-agent") || undefined,
    });

    if (result.success && result.context) {
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
      } as any);
      c.set("session", null);

      // Add rate limit headers
      c.header("X-Agent-Id", result.context.agentId);
      c.header("X-RateLimit-Limit", result.context.rateLimit.toString());

      return next();
    } else {
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
  const s = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", s?.user || null);
  c.set("session", s?.session || null);
  await next();
});

// Enrich user context with ACL fields (roles, department)
// Must run after auth middleware so that `user` is already populated
app.use("*", enrichUserContext);

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
      const fichero = Bun.file(rutaLocalDe(clave));
      if (!(await fichero.exists())) return c.notFound();
      return new Response(fichero, {
        headers: {
          "Cache-Control": cacheDeMedio(clave),
          "Last-Modified": new Date(fichero.lastModified).toUTCString(),
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
 * Requieren sesion porque revelan el tamano de la instalacion.
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
app.get("/api/users/count", protectRoute, async (c) => c.json({ count: await contar(user) }));

app.get("/api/media/count", protectRoute, async (c) => c.json({ count: await contar(mediaTable) }));

app.get("/api/datasets/count", protectRoute, async (c) =>
  c.json({ count: await contar(dataSetsTable) })
);

app.get("/api/blog/posts/count", protectRoute, async (c) => {
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
    checks.database = { status: "error", error: messageOf(err) };
    overallStatus = "degraded";
  }

  // Queue check
  try {
    const waiting = await emailQueue.getWaitingCount();
    const active = await emailQueue.getActiveCount();
    checks.queue = {
      status: "ok",
      details: { waiting, active },
    };
  } catch (err: unknown) {
    checks.queue = { status: "error", error: messageOf(err) };
    overallStatus = "degraded";
  }

  // Realtime check
  try {
    const rtStats = realtimeManager.getStats();
    checks.realtime = { status: "ok", details: rtStats };
  } catch (err: unknown) {
    checks.realtime = { status: "error", error: messageOf(err) };
  }

  // Memory usage
  const memory = process.memoryUsage();
  // Almacenamiento. No se comprobaba, y ese es justo el fallo que se cuela: el
  // contenedor se declaraba sano mientras TODA subida fallaba. La comprobacion
  // escribe y borra un objeto de prueba, porque que el destino exista no dice
  // si se puede escribir en el.
  try {
    const almacen = await comprobarAlmacen();
    checks.storage = {
      status: almacen.ok ? "ok" : "error",
      details: { proveedor: almacen.proveedor, detalle: almacen.detalle },
    };
    if (!almacen.ok) overallStatus = "degraded";
  } catch (err) {
    checks.storage = { status: "error", error: messageOf(err) };
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
  return c.json({
    status: overallStatus,
    service: "kitsuden-api",
    version: "0.9.0-beta",
    environment: config.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
    checks,
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
        error: messageOf(err),
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
        error: messageOf(err),
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

app.use("/api/admin/*", async (c, next) => {
  const u = c.get("user");
  if (!u) return c.json({ error: "Unauthorized" }, 401);
  if ((u as any).role !== "admin") return c.json({ error: "Forbidden" }, 403);
  await next();
});

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
app.route("/api/keys", apiKeysRoutes);
if (features.mcpEnabled) {
  app.route("/api/mcp", mcpRoutes);
  console.log("  🤖 MCP Server → ENABLED (/api/mcp)");
} else {
  console.log("  🤖 MCP Server → DISABLED");
}
app.route("/api/admin/registry", adminRegistryRoutes);
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
// /api/v1 (agents/traces/identities) ahora se monta via rpcSurface (src/rpc.ts)
app.route("/api/admin/agents", agentPlaygroundRoutes);
app.route("/api/agent/memory", agentMemoryRoutes);
app.route("/api/admin/data-sources", dataSourcesRoutes);
app.route("/api/explorer", explorerRoutes);
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
    const { allow, didYouMean } = sugerirRutas(c.req.method, c.req.path);

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
        hint:
          "Todas las rutas de los kons están en GET /api/docs/openapi.json, " +
          "y la guía para agentes en GET /llms.txt.",
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
app.route("/api/docs", dynamicDocsRouter);

/**
 * Guía para agentes. En la raíz porque es donde un agente la busca por
 * convención, y bajo `/api` porque es donde el MCP standalone sabe llamar.
 * Se genera en cada petición: las rutas salen del router montado, así que no
 * puede quedarse atrás respecto de lo que la API sirve.
 */
const servirGuiaParaAgentes = (c: Context) =>
  c.text(
    generarGuiaParaAgentes({ baseUrl: `${new URL(c.req.url).origin}/api`, rutas: rutasDeKons() }),
    200,
    { "content-type": "text/markdown; charset=utf-8" }
  );
app.get("/llms.txt", servirGuiaParaAgentes);
app.get("/api/llms.txt", servirGuiaParaAgentes);

// Also mount legacy docs for compatibility
app.route("/api/docs-legacy", docsRoutes);

// Redirect legacy /api/swagger to new docs
app.get("/api/swagger", (c) => c.redirect("/api/docs"));

// Also redirect /api/doc (OpenAPI JSON spec) to new endpoint
app.get("/api/doc", (c) => c.redirect("/api/docs/openapi.json"));

console.log("  📚 API Documentation → /api/docs (Swagger UI)");
console.log("  📚 API Reference (Modern) → /api/docs/modern (Scalar)");
console.log("  📚 OpenAPI Spec → /api/docs/openapi.json");

// ══════════════════════════════════════════════
// 🚀 SERVER START
// ══════════════════════════════════════════════

const port = Number(process.env.PORT) || 3001;

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
 */
async function getSessionFromRequest(req: Request): Promise<{ userId: string | null }> {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    return { userId: session?.user?.id || null };
  } catch {
    return { userId: null };
  }
}

// Initialize Kitsuden Workers dispatcher (event listeners)
initFunctionDispatcher();

// Initialize Actions Engine (unified workers + webhooks)
initActionsEngine();

// Initialize DX Actions Layer (Nivel 1)
initActions({
  hono: app as any,
  bullmq: valkeyConnection,
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
║   Queue: BullMQ + Dragonfly 🐉                 ║
║   Real-time: WebSocket + Valkey 📡             ║
║   Actions: Unified Engine ⚡                    ║
║   GraphQL: /api/graphql 📊                    ║
║   Docs: /api/docs (Swagger) 📚                ║
║   API Ref: /api/docs/modern (Scalar) 📖       ║
║   RLS: El Muro de Titanio 🛡️                  ║
║   Port: ${port}                                  ║
╚══════════════════════════════════════════════════╝
`);

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
  fetch: async (req: Request, server: any): Promise<Response> => {
    const url = new URL(req.url);

    // WebSocket upgrade for /api/realtime
    if (url.pathname === "/api/realtime") {
      const session = await getSessionFromRequest(req);
      const clientId = generateClientId();

      const upgraded = server.upgrade(req, {
        data: {
          clientId,
          userId: session.userId,
        } satisfies WSClientData,
      });

      if (upgraded) {
        return undefined as any; // Bun handles the upgrade
      }

      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Regular HTTP request → Hono
    return app.fetch(req, { ip: server.requestIP(req) });
  },

  websocket: {
    open(ws: ServerWebSocket<WSClientData>) {
      const { clientId, userId } = ws.data;
      realtimeManager.addClient(clientId, ws, userId);

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
      const raw = typeof message === "string" ? message : message.toString();
      realtimeManager.handleMessage(clientId, raw);
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
