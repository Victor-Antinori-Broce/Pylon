/**
 * GremiusCMS - Hono API Server v0.7.0-beta
 *
 * Runtime: Bun + Hono
 * Auth: Better-Auth (cookie sessions)
 * Queue: BullMQ + DragonflyDB
 * Real-time: WebSocket + Valkey Pub/Sub
 *
 * Architecture:
 *   - CORE Layer (Nivel 1): 5 toggleable infrastructure pieces (packages/core/)
 *   - ENGINE routes (auth, datasets, settings) are mounted directly
 *   - GRIMOIRE routes are loaded via module-loader (Nivel 2+)
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";
import { eq, count } from "drizzle-orm";
import type { ServerWebSocket } from "bun";

// ── Feature Flags ──
import gremiusConfig from "../gremius.config";

// ── OpenAPI Documentation ──
import { swaggerUI } from "@hono/swagger-ui";

import { auth } from "./lib/auth";
import { db } from "./db";
import { authUsers as user, siteSettings } from "./db/schema";
import { setupWorkers, emailQueue } from "./lib/queue";
import { realtimeManager, type WSClientData } from "./lib/realtime";

// ── Core Layer Routes (Nivel 1) — All imported through packages/core/ ──
import { mediaRoutes, uploadRoutes } from "../../../packages/core/media-library";
import { dataSetsFullRoutes, explorerRoutes, datasetsOpenAPIRouter } from "../../../packages/core/data-sets";
import { pageBuilderRoutes } from "../../../packages/core/page-builder";

// ── Engine Routes ──
import { withTransactionalRLS } from "./middleware/transactional-rls";
import { modulesRoutes } from "./routes/modules";
import { blogRoutes } from "./routes/blog";
import { systemRoutes } from "./routes/system";
import { settingsRoutes, syncRoutes, platformsRoutes, tagsRoutes, streamersRoutes, dataSetsRoutes as dataSetsLiteRoutes } from "./routes/crud";
import { graphqlRoutes } from "./routes/graphql";
import { functionsRoutes } from "./routes/functions";
import { initFunctionDispatcher } from "./lib/function-dispatcher";
import { initCronScheduler } from "./lib/cron-scheduler";
import { apiKeysRoutes } from "./routes/api-keys";
import { mcpRoutes } from "./routes/mcp";
import { formulasRoutes } from "./modules/formulas";

// ── Module Loader ──
import { loadModules } from "./lib/module-loader";
import { toonMiddleware } from "./lib/toon";

// ── Typed Hono app ──
const app = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
}>();

// ══════════════════════════════════════════════
// ⚙️ GLOBAL MIDDLEWARE
// ══════════════════════════════════════════════

// ═══════════════════════════════════════════════
// CORS DINÁMICO - Configurable via env
// ═══════════════════════════════════════════════
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
  "http://localhost:4321",
  "http://localhost:5173",
  "http://gremius_web:4321",
  "http://gremius_admin:80",
];

app.use("*", logger());
app.use("*", timing());
app.use("*", secureHeaders());
app.use("/api/*", toonMiddleware());
app.use(
  "*",
  cors({
    origin: allowedOrigins,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

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

    const authRes = await auth.api.signUpEmail({
      body: { email, password, name },
    });

    if (!authRes?.user) throw new Error("Failed to create user");

    await db.update(user).set({ role: "admin" }).where(eq(user.id, authRes.user.id));

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
// 🔐 AUTH & SESSION (including Machine Auth)
// ══════════════════════════════════════════════

import { createHash } from "crypto";
import { apiKeys } from "./db/schema";

app.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");

  // 1. Machine Auth (API Keys)
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

  // 2. Human Auth (Better-Auth Cookies)
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
  let queueStatus = "unknown";
  try {
    const waiting = await emailQueue.getWaitingCount();
    const active = await emailQueue.getActiveCount();
    queueStatus = `ok (waiting: ${waiting}, active: ${active})`;
  } catch {
    queueStatus = "disconnected";
  }

  const rtStats = realtimeManager.getStats();

  return c.json({
    status: "ok",
    service: "gremius-api",
    version: "0.7.0-beta",
    timestamp: new Date().toISOString(),
    queue: queueStatus,
    realtime: rtStats,
  });
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
app.route("/api/datasets", dataSetsFullRoutes);
app.route("/api/explorer", explorerRoutes);
app.route("/api/data-sets", dataSetsLiteRoutes);
console.log("  📊 Core: Data Sets & Visualizer → ALWAYS ACTIVE");

// Media Library (toggleable)
if (gremiusConfig.core.mediaLibrary.enabled) {
  app.route("/api/media", mediaRoutes);
  app.route("/api/upload", uploadRoutes);
  console.log("  🖼️  Core: Media Library → ENABLED");
} else {
  console.log("  🖼️  Core: Media Library → DISABLED");
}

// Page Builder (toggleable)
if (gremiusConfig.core.pageBuilder.enabled) {
  app.route("/api/page-builder", pageBuilderRoutes);
  console.log("  🧱 Core: Page Builder → ENABLED");
} else {
  console.log("  🧱 Core: Page Builder → DISABLED");
}

// Note: Promote to Content and Webhooks are loaded via module-loader
// when their Core flags are enabled. See loadModules() below.

// ══════════════════════════════════════════════
// 🔧 ENGINE ROUTES
// ══════════════════════════════════════════════

app.route("/api/blog", blogRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/modules", modulesRoutes);
app.route("/api/sync", syncRoutes);
app.route("/api/graphql", graphqlRoutes);
app.route("/api/functions", functionsRoutes);
app.route("/api/keys", apiKeysRoutes);
app.route("/api/platforms", platformsRoutes);
app.route("/api/tags", tagsRoutes);
app.route("/api/streamers", streamersRoutes);
app.route("/api/mcp", mcpRoutes);
app.route("/api", formulasRoutes);

// ══════════════════════════════════════════════
// 📦 DYNAMIC MODULE ROUTES (Grimoires + Core modules)
// ══════════════════════════════════════════════

await loadModules(app);

// ══════════════════════════════════════════════
// 🚨 ERROR HANDLING
// ══════════════════════════════════════════════

app.notFound((c) => c.json({ error: "Not found", path: c.req.path }, 404));

app.onError((err, c) => {
  console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, err.message);
  return c.json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  }, 500);
});

// ═══════════════════════════════════════════════════════════════════════════
// 📚 OPENAPI DOCUMENTATION (Machine-Readable API)
// ═══════════════════════════════════════════════════════════════════════════

// Mount OpenAPI documented routes
app.route("/api", datasetsOpenAPIRouter);

// Expose OpenAPI specification JSON at /api/doc
datasetsOpenAPIRouter.doc("/doc", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "Gremius BaaS API",
    description: "API oficial de Gremius, optimizada para consumo humano y agentes LLM.\n\nEsta documentación es autogenerada a partir de los esquemas Zod de @gremius/shared, garantizando que siempre está sincronizada con el código.",
    contact: {
      name: "Gremius Team",
      url: "https://gremius.dev",
    },
  },
  servers: [
    {
      url: "http://localhost:3001/api",
      description: "Local development server",
    },
    {
      url: "{protocol}://{host}/api",
      description: "Dynamic server",
      variables: {
        protocol: {
          enum: ["http", "https"],
          default: "https",
        },
        host: {
          default: "api.gremius.dev",
        },
      },
    },
  ],
  tags: [
    {
      name: "Datasets",
      description: "Operaciones CRUD sobre colecciones de datos dinámicas",
    },
    {
      name: "Auth",
      description: "Autenticación y autorización",
    },
  ],
});

// Expose Swagger UI at /api/swagger
app.get("/api/swagger", swaggerUI({ url: "/api/doc" }));

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

// Initialize Cron Scheduler (loads active cron jobs from DB)
initCronScheduler().catch((err) => {
  console.warn(`  ⏰ Cron Scheduler init warning: ${err.message}`);
});

console.log(`
╔══════════════════════════════════════════════════╗
║   ⚡ GremiusCMS API v0.7.0-beta                 ║
║   Runtime: Bun + Hono                          ║
║   Auth: Better-Auth 🔐                         ║
║   Queue: BullMQ + Dragonfly 🐉                 ║
║   Real-time: WebSocket + Valkey 📡             ║
║   Workers: Sandboxed Functions ⚙️               ║
║   GraphQL: /api/graphql 📊                    ║
║   OpenAPI: /api/swagger 📚                    ║
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
