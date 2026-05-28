// @ts-nocheck
/**
 * GremiusCMS - Hono API Server v0.8.0-beta (Actions Unification)
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
 *   - GRIMOIRES (Nivel 3): Business modules — loaded via module-loader (packages/grimoires/)
 *
 * Phase 3: Actions Unification Complete
 *   - actions table replaces gremius_functions + webhooks
 *   - ActionEngine handles all automation types
 *   - Legacy APIs maintained for backward compatibility
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";
import { rateLimiter } from "hono-rate-limiter";
import { eq, count, sql } from "drizzle-orm";
import type { ServerWebSocket } from "bun";

// ── Configuration ──
import { config, features, rateLimitConfig, corsConfig } from "./lib/config";
import { logger, createRequestLogger, logSecurity } from "./lib/logger";

// ── Feature Flags ──
import { staticConfig as gremiusConfig } from "../gremius.config";



import { auth } from "./lib/auth";
import { db } from "./db";
import { authUsers as user, siteSettings } from "./db/schema";
import { setupWorkers, emailQueue } from "./lib/queue";
import { realtimeManager, type WSClientData } from "./lib/realtime";

// ── Core Layer Routes (Nivel 2) — Imported through packages/core/ ──
// NOTE: media-library and data-sets have been migrated to grimoires
// import { mediaRoutes, uploadRoutes } from "../../../packages/core/media-library";
// import { dataSetsFullRoutes, explorerRoutes, datasetsOpenAPIRouter } from "../../../packages/core/data-sets";
// Placeholders for migrated routes (now in grimoires)
// These are conditionally mounted below if the grimoire system doesn't provide them
const mediaRoutes = null as any; 
const uploadRoutes = null as any;
const dataSetsFullRoutes = null as any;
const datasetsOpenAPIRouter = null as any;

// ── Engine Routes (Nivel 1) — Always-on infrastructure ──
import { withTransactionalRLS } from "./middleware/transactional-rls";
import { modulesRoutes } from "./routes/modules";
import { systemRoutes } from "./routes/system";
import { settingsRoutes, syncRoutes, dataSetsRoutes as dataSetsLiteRoutes } from "./routes/crud";
import { graphqlRoutes } from "./routes/graphql";
import { functionsRoutes } from "./routes/functions";
import { actionsRoutes } from "./routes/actions";
import { initActionsEngine } from "./lib/actions";
import { initFunctionDispatcher } from "./lib/function-dispatcher";
import { initCronScheduler } from "./lib/cron-scheduler";
import { apiKeysRoutes } from "./routes/api-keys";
import { mcpRoutes } from "./routes/mcp";
import { adminRegistryRoutes } from "./routes/admin-registry";
import agentRoutes from "./routes/agents";
import agentPlaygroundRoutes from "./routes/agent-playground";
import agentMemoryRoutes from "./routes/agent-memory";
import agentsV1Routes from "./routes/agents-v1";
import dataSourcesRoutes from "./routes/data-sources";
import { explorerRoutes } from "./routes/data-explorer";
import { schemaIntrospectionRoutes } from "./routes/schema-introspection";
import { inlineRelationsRoutes } from "./routes/inline-relations";
import { datasetsQueryRoutes } from "./routes/datasets-query";
import { dynamicDocsRouter } from "./routes/docs-dynamic";

// ── Module Loader ──
import { loadModules, createGrimoireContext } from "./lib/module-loader";
import { toonMiddleware } from "./lib/toon";

// ── Actions Layer Integration (Nivel 1 DX) ──
import { initActions } from "@gremius/engine";
import { valkeyConnection } from "./lib/valkey";

// ── Content Publishing (Core) ──
import { createContentPublishingRouter } from "./routes/content-publishing";

// ── Typed Hono app ──
const app = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
    requestId: string;
    agent?: AgentAuthContext;
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
    origin: corsConfig.origins,
    allowMethods: corsConfig.methods,
    allowHeaders: corsConfig.headers,
    credentials: corsConfig.credentials,
  })
);

// Request ID for tracing
app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
});

// ═══════════════════════════════════════════════
// RATE LIMITING - Protection against abuse
// ═══════════════════════════════════════════════
if (rateLimitConfig.enabled) {
  // Global rate limit
  app.use(
    "*",
    rateLimiter({
      windowMs: rateLimitConfig.windowMs,
      limit: rateLimitConfig.maxRequests,
      standardHeaders: "draft-6",
      keyGenerator: (c) => {
        // Use API key if present, otherwise IP
        const authHeader = c.req.header("Authorization");
        if (authHeader?.startsWith("Bearer ")) {
          return authHeader.substring(7);
        }
        return c.req.header("x-forwarded-for") || "unknown";
      },
      skip: (c) => {
        // Skip health checks
        return rateLimitConfig.skipPaths.includes(c.req.path);
      },
    })
  );

  // Stricter rate limit for auth mutation endpoints (sign-in, sign-up)
  // Excludes get-session which runs on every page load
  app.use(
    "/api/auth/sign-in/*",
    rateLimiter({
      windowMs: rateLimitConfig.windowMs,
      limit: rateLimitConfig.authMax,
      standardHeaders: "draft-6",
      keyGenerator: (c) => c.req.header("x-forwarded-for") || "unknown",
    })
  );
  app.use(
    "/api/auth/sign-up/*",
    rateLimiter({
      windowMs: rateLimitConfig.windowMs,
      limit: rateLimitConfig.authMax,
      standardHeaders: "draft-6",
      keyGenerator: (c) => c.req.header("x-forwarded-for") || "unknown",
    })
  );

  logger.info("Rate limiting enabled");
}

// ═══════════════════════════════════════════════
// STRUCTURED LOGGING - Request tracing
// ═══════════════════════════════════════════════
app.use("*", async (c, next) => {
  const start = Date.now();
  const requestLogger = createRequestLogger(
    c.get("requestId"),
    c.get("user")?.id
  );

  requestLogger.info({
    method: c.req.method,
    path: c.req.path,
    userAgent: c.req.header("user-agent"),
  }, "Request started");

  await next();

  const duration = Date.now() - start;
  requestLogger.info({
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration,
  }, "Request completed");
});

// ═══════════════════════════════════════════════
// CORS DINÁMICO - Configurable via env
// ═══════════════════════════════════════════════
app.use("*", honoLogger());
app.use("*", timing());
app.use("*", secureHeaders());
app.use("/api/*", toonMiddleware());
// NOTE: CORS is mounted ABOVE (before rate limiter) to handle OPTIONS preflight correctly

// ══════════════════════════════════════════════
// 🔓 PUBLIC ROUTES (BEFORE AUTH)
// ══════════════════════════════════════════════

app.get("/api/system/init-check", async (c) => {
  try {
    const [result] = await db.select({ value: count() }).from(user);
    const userCount = result?.value || 0;
    return c.json({ initialized: userCount > 0 });
  } catch (error: any) {
    return c.json({ initialized: true, error: error.message });
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

    // Call Better-Auth API with proper Hono context
    const authRes = await auth.api.signUpEmail({
      body: { email, password, name },
      headers: c.req.header(),
      asResponse: false,
    });

    if (!authRes || !('user' in authRes)) throw new Error("Failed to create user");

    // Promote to admin — try by ID first, then by email as fallback
    const updateResult = await db.update(user).set({ role: "admin" }).where(eq(user.id, authRes.user.id)).returning();
    if (updateResult.length === 0) {
      // ID didn't match — Better-Auth may use a different ID format
      console.warn(`[setup] Role update by ID failed for ${authRes.user.id}, trying by email...`);
      await db.update(user).set({ role: "admin" }).where(eq(user.email, email));
    }
    console.log(`[setup] User ${email} promoted to admin`);

    const [settings] = await db.select().from(siteSettings).limit(1);
    if (!settings) {
      await db.insert(siteSettings).values({ siteName: "Gremius CMS" });
    }

    try {
      await emailQueue.add("send-welcome", { to: email, name } as any);
    } catch { }

    return c.json({ success: true, user: authRes.user });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.route("/api/system", systemRoutes);

// ══════════════════════════════════════════════
// 🔐 AUTH & SESSION (Including Agent NHI)
// ══════════════════════════════════════════════

import { createHash } from "crypto";
import { apiKeys } from "./db/schema";
import { authenticateAgent } from "./services/agent-auth";
import type { AgentAuthContext } from "./services/agent-auth";

// Extend Hono context types - agent is now defined in app Variables type above

app.use("*", async (c, next) => {
  // Skip session extraction for Better-Auth endpoints to avoid conflicts
  if (c.req.path.startsWith("/api/auth/")) {
    return next();
  }

  const authHeader = c.req.header("Authorization");

  // 1. AGENT AUTH (NHI - Non-Human Identity) - NEW SYSTEM
  // Format: Bearer grm_agent_xxxxx
  if (authHeader?.startsWith("Bearer grm_agent_")) {
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
        email: `agent@${result.context.agentId}.gremius.local`,
        image: null,
        role: "agent",  // Not admin - granular permissions via scopes
        scopes: result.context.scopes,
      } as any);
      c.set("session", null);

      // Add rate limit headers
      c.header("X-Agent-Id", result.context.agentId);
      c.header("X-RateLimit-Limit", result.context.rateLimit.toString());

      return next();
    } else {
      return c.json({
        error: result.error || "Agent authentication failed",
        code: result.code
      }, 401);
    }
  }

  // 2. LEGACY Machine Auth (API Keys) - DEPRECATED, will migrate to agents
  if (authHeader?.startsWith("Bearer gremius_sk_")) {
    const rawToken = authHeader.replace("Bearer ", "").trim();
    const keyHash = createHash("sha256").update(rawToken).digest("hex");

    const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);

    if (apiKey) {
      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        return c.json({ error: "API Key expired" }, 401);
      }

      // Update lastUsedAt asynchronously (fire and forget)
      db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, apiKey.id)).execute().catch(() => { });

      // Inject synthetic Admin user
      c.set("user", {
        id: "machine-" + apiKey.id,
        name: apiKey.name,
        email: "machine@gremius.local",
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

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// ══════════════════════════════════════════════
// 🛡️ PROTECTED ROUTES
// ══════════════════════════════════════════════

app.get("/api/health", async (c) => {
  const checks: Record<string, { status: string; details?: unknown; error?: string }> = {};
  let overallStatus = "ok";

  // Database check
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    checks.database = {
      status: "ok",
      details: { responseTime: `${Date.now() - start}ms` }
    };
  } catch (err: any) {
    checks.database = { status: "error", error: err.message };
    overallStatus = "degraded";
  }

  // Queue check
  try {
    const waiting = await emailQueue.getWaitingCount();
    const active = await emailQueue.getActiveCount();
    checks.queue = {
      status: "ok",
      details: { waiting, active }
    };
  } catch (err: any) {
    checks.queue = { status: "error", error: err.message };
    overallStatus = "degraded";
  }

  // Realtime check
  try {
    const rtStats = realtimeManager.getStats();
    checks.realtime = { status: "ok", details: rtStats };
  } catch (err: any) {
    checks.realtime = { status: "error", error: err.message };
  }

  // Memory usage
  const memory = process.memoryUsage();
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
    service: "gremius-api",
    version: "0.7.0-beta",
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
  } catch (err: any) {
    return c.json({
      pgvector: false,
      error: err.message,
      message: "Could not check pgvector status. Database connection failed.",
    }, 500);
  }
});

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
app.use("/api/datasets/:id/entries", withTransactionalRLS());
app.use("/api/datasets/:slug/entries", withTransactionalRLS());
// Note: dataSetsFullRoutes and explorerRoutes are now provided by grimoire-datasets
// Only mount lite routes directly (as fallback if grimoire isn't loaded yet)
app.route("/api/data-sets", dataSetsLiteRoutes);
console.log("  📊 Core: Data Sets Lite Routes → ALWAYS ACTIVE");

// Query Engine & Batch Processor Routes (FASE 2: La Magia de los Datos)
app.route("/api/datasets", datasetsQueryRoutes);
console.log("  🔍 Core: Query Engine (Gremius QL) → ALWAYS ACTIVE");
console.log("  📦 Core: Batch Processor (ACID) → ALWAYS ACTIVE");

// Media Library (toggleable) - now as grimoire
const isGrimoireEnabled = (id: string) => gremiusConfig.core.find((g: any) => g.id === id)?.enabled ?? false;

// Note: mediaRoutes and uploadRoutes are now provided by grimoire-media
if (isGrimoireEnabled("grimoire-media")) {
  console.log("  🖼️  Core: Media Library → ENABLED (routes mounted by grimoire)");
} else {
  console.log("  🖼️  Core: Media Library → DISABLED");
}

// Note: Page Builder, Blog, Formulas are now Nivel 3 Grimoires (Promote merged into Blog)
// loaded dynamically by the module-loader. Webhooks and Connectors are
// when their Grimoire / Core flags are enabled. See loadModules() below.

// Connectors (toggleable)
if (isGrimoireEnabled("grimoire-connectors")) {
  console.log("  🔌 Core: Data Connectors → ENABLED");
} else {
  console.log("  🔌 Core: Data Connectors → DISABLED");
}

// ══════════════════════════════════════════════
// 🔧 ENGINE ROUTES
// ══════════════════════════════════════════════

app.route("/api/settings", settingsRoutes);
app.route("/api/modules", modulesRoutes);
app.route("/api/sync", syncRoutes);
app.route("/api/graphql", graphqlRoutes);
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
app.route("/api/admin/agents", agentRoutes);
app.route("/api/v1", agentsV1Routes);  // Frontend API v1 compatibility (includes /agents, /traces, /identities)
app.route("/api/admin/agents/playground", agentPlaygroundRoutes);
app.route("/api/agent/memory", agentMemoryRoutes);
app.route("/api/admin/data-sources", dataSourcesRoutes);
app.route("/api/explorer", explorerRoutes);
app.route("/api/schema", schemaIntrospectionRoutes);
app.route("/api/relations", inlineRelationsRoutes);
console.log("  🎛️  Admin Registry → Auto-discovery enabled");
console.log("  🔍 Schema Introspection → DB reflection enabled");
console.log("  🔗 Inline Relations → Django-style inlines enabled");
// Note: platforms, tags, streamers, blog, formulas and other grimoires
// are loaded dynamically by loadModules() below. Do not add hardcoded routes here.

import { initializeGrimoires, defineAction } from "@gremius/engine";

// ══════════════════════════════════════════════
// 📦 DYNAMIC MODULE ROUTES (Grimoires + Core modules)
// ══════════════════════════════════════════════

await loadModules(app);

// ══════════════════════════════════════════════
// 🪄 INITIALIZE AUTO-GRIMOIRES
// ══════════════════════════════════════════════

const autoMcpProxy = {
  addTool: (toolDef: any) => {
    // Convert generated MCP tools directly to the unified Action engine
    defineAction({
      trigger: `agent.tool:${toolDef.name}`,
      description: toolDef.description,
      inputSchema: toolDef.inputSchema,
      run: async (ctx: any) => {
        // Execute the native handler for this Auto-Grimoire tool
        return toolDef.handler(ctx.payload, {
          agentId: ctx.agent?.agentId,
          agentName: ctx.agent?.agentName,
          scopes: ctx.agent?.scopes || [],
          preferToon: ctx.agent?.preferToon || false
        });
      }
    });
  }
};

initializeGrimoires(createGrimoireContext(), app as any, autoMcpProxy);

// ══════════════════════════════════════════════
// 🚨 ERROR HANDLING
// ══════════════════════════════════════════════

app.notFound((c) => {
  logger.warn({
    method: c.req.method,
    path: c.req.path,
    status: 404,
  }, "Route not found");

  return c.json({
    error: "Not found",
    path: c.req.path,
    requestId: c.get("requestId"),
  }, 404);
});

app.onError((err, c) => {
  const isDevelopment = config.NODE_ENV === "development";
  const statusCode = (err as any).status || 500;

  // Log error with context
  logger.error({
    method: c.req.method,
    path: c.req.path,
    error: err.message,
    stack: isDevelopment ? err.stack : undefined,
    statusCode,
    requestId: c.get("requestId"),
  }, `Error handling request: ${err.message}`);

  // Security: don't expose internal errors in production
  const response: Record<string, unknown> = {
    error: statusCode >= 500 ? "Internal server error" : err.message,
    requestId: c.get("requestId"),
  };

  if (isDevelopment) {
    response.message = err.message;
    response.stack = err.stack;
  }

  return c.json(response, statusCode as any);
});

// ═══════════════════════════════════════════════════════════════════════════
// 📚 API DOCUMENTATION (Swagger + Scalar)
// ═══════════════════════════════════════════════════════════════════════════

import { docsRoutes } from "./routes/docs";

// Mount docs routes (dynamic OpenAPI from grimoires)
app.route("/api/docs", dynamicDocsRouter);

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
  console.error("Worker startup failed (non-fatal):", err.message);
});

// Initialize real-time manager
realtimeManager.initialize().catch((err) => {
  console.error("Real-time init failed (non-fatal):", err.message);
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

// Initialize Gremius Workers dispatcher (event listeners)
initFunctionDispatcher();

// Initialize Actions Engine (unified workers + webhooks)
initActionsEngine();

// Initialize DX Actions Layer (Nivel 1)
initActions({
  hono: app as any,
  bullmq: valkeyConnection,
  mcp: true
});

// Initialize Agent Telemetry (Paso 2: Observability)
import { initAgentTelemetry } from "./services/agent-telemetry";
initAgentTelemetry();

// Initialize Cron Scheduler (loads active cron jobs from DB)
initCronScheduler().catch((err) => {
  console.warn(`  ⏰ Cron Scheduler init warning: ${err.message}`);
});

console.log(`
╔══════════════════════════════════════════════════╗
║   ⚡ GremiusCMS API v0.8.0-beta (Actions)       ║
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
      ws.send(JSON.stringify({
        type: "connected",
        clientId,
        userId,
        timestamp: Date.now(),
      }));
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
      console.error(`[WS Error] ${ws.data.clientId}:`, error.message);
    },
  },
};
