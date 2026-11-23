/**
 * MCP (Model Context Protocol) Routes — Agent Gateway
 *
 * Exposes Kitsuden to AI agents (Claude, Cursor, VS Code, etc.)
 * via the standard MCP protocol over Streamable HTTP (SSE + POST).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SECURITY: All MCP connections require a valid Agent NHI token (kitsuden_agent_*)
 * or a legacy API key (kitsuden_sk_* — deprecated, sunset 2026-08-01).
 * Agents must have the 'mcp:connect' scope. MCP tools can insert, query,
 * and dispatch jobs.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Endpoints:
 *   GET  /api/mcp      - SSE connection for agents (requires Bearer token)
 *   POST /api/mcp      - JSON-RPC messages from agent (requires sessionId)
 *
 * Result format:
 *   Tool results come in the shortest LOSSLESS format for each result (compact
 *   JSON, TOON or TRON; `format: "auto"`, the default) and say which in
 *   `_meta["kitsuden/format"]`. `format: "json"` forces compact JSON. The same
 *   choice is available on REST with `Accept: application/vnd.kitsuden.auto`
 *   (lib/formatos.ts, docs/agents/benchmarks.md).
 *
 * Provenance (docs/agents/untrusted-content.md):
 *   Results that carry stored records say who wrote each one in
 *   `_meta["kitsuden/provenance"]` (user | agent | system | anonymous, and
 *   `untrusted`). Text written by others can be wrapped (`untrusted_wrap`
 *   argument or the agent's setting in the panel); default `none`.
 *
 * Toolsets (lib/ajustes-mcp.ts):
 *   `GET /api/mcp?toolset=read,kon:blog` (or the agent's preset in the panel)
 *   narrows what `tools/list` announces and `tools/call` accepts. It is
 *   intersected with `allowedTools` and the scopes: it never grants anything.
 *
 * Reference: https://spec.modelcontextprotocol.io/specification/2024-11-05/
 */

import { createHash } from "crypto";

import { listMCPTools, executeMCPTool, messageOf } from "@kitsuden/engine";
import { camposDelSchema, concedeScope } from "@kitsuden/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { db } from "../db";
import { dataSets, apiKeys } from "../db/schema";
import { META_FORMATO, resultadoEnAuto, type Formato } from "../lib/formatos";
import {
  enTodos,
  parsearToolset,
  textoDeToolset,
  type AjustesMcp,
  type FichaDeHerramienta,
  type Toolset,
} from "../lib/ajustes-mcp";
import { registrarAhorro } from "../lib/ahorro-de-formato";
import { medirFormato } from "../lib/medida-de-formato";
import { META_PROCEDENCIA, type Procedencia } from "../lib/procedencia";
import { ipDelCliente } from "../lib/ip-del-cliente";
import { logger } from "../lib/logger";
import { resumirLlamada } from "../lib/friccion-de-agentes";
import {
  ejecutarHerramientaDeOperacion,
  esRepeticionDeHerramienta,
  fichaDeHerramientaDeOperacion,
  herramientasDeOperaciones,
  consumoDeHerramientaDeOperacion,
  leerGuia,
  recursosDeGuia,
} from "../lib/operaciones-mcp";
import {
  conProblema,
  errorJsonRpc,
  problemaDeExcepcion,
  resultadoDeError,
} from "../lib/problemas-mcp";
import { consumirCuota, problemaDeCuota } from "../lib/cuotas-de-agente";
import {
  fijarEjecutorMcpDeAprobaciones,
  propuestaPorId,
  vistaParaAgente,
} from "../lib/aprobaciones";
import {
  DEFINICION_DE_HERRAMIENTA_DE_ESTADO,
  HERRAMIENTA_DE_ESTADO,
  retenerHerramientaSiHaceFalta,
} from "../lib/aprobaciones-mcp";
import { logAgentAction } from "../services/agent-audit";
import {
  authenticateAgent,
  autenticacionDeLaPeticion,
  esCredencialDeAgente,
  hasScope,
  type AgentAuthContext,
} from "../services/agent-auth";
import {
  agentePuedeLeerDataset,
  assertToolScope,
  assertDynamicToolScope,
  herramientaQueEscribe,
  herramientaDelNucleoDeDatos,
  herramientaDelNucleoDeSoloLectura,
  listHardcodedMCPTools,
  executeHardcodedToolConFormato,
} from "../services/mcp-tools";
import { KON_REGISTRY } from "../services/module-registry";

import { invalidateGraphQLCache } from "./graphql";

// ── Code Generators ──

// ── Nivel 1 Actions Engine ──

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface McpSession {
  /** The human who approved this call, when it replays a held proposal. */
  approvedBy?: string;
  agentId: string; // machine-{apiKeyId}
  agentName: string; // API key name (e.g. "Claude Desktop")
  apiKeyId: string; // For audit trail
  createdAt: number; // Timestamp
  lastActivity: number; // For session cleanup
  /**
   * Scopes y herramientas permitidas del agente. Se REFRESCAN en cada POST con
   * la autenticación de esa petición: revocar un scope o una clave surte
   * efecto en el siguiente mensaje, no al caducar la sesión. Antes la sesión
   * no los guardaba y las herramientas se comprobaban contra una lista vacía.
   */
  scopes: string[];
  allowedTools: string[];
  /** Fase F: el firmante humano del agente, refrescado en cada POST. */
  sponsor?: AgentAuthContext["sponsor"];
  /** Cuotas del agente (fase E), refrescadas en cada POST como los scopes. */
  rateLimit?: number | null;
  writesPerDay?: number | null;
  budgetUnitsPerDay?: number | null;
  /**
   * Toolset elegido al CONECTAR (`?toolset=`); no cambia en la sesión.
   * `toolsets` = [preset del agente (se relee en cada POST), el de la URL]:
   * una herramienta tiene que estar en todos (lib/ajustes-mcp.ts).
   */
  toolsetDeConexion?: Toolset;
  toolsets?: Toolset[];
  /** Envoltorio del contenido no confiable del agente (panel), refrescado en cada POST. */
  untrustedWrap?: AjustesMcp["untrustedWrap"];
}

interface AgentLogEntry {
  timestamp: string;
  agentId: string;
  agentName: string;
  method: string;
  tool?: string;
  resource?: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════
// Session Store
// NOTE: In-memory sessions are lost on restart. For multi-instance
// deployments, migrate to Valkey: HSET kitsuden:mcp:sessions {id} {json}
// ═══════════════════════════════════════════════════════════════

const sessions = new Map<string, McpSession>();

/**
 * Sesiones abiertas a la vez, por clave y en total (auditoría 2026-10-25): el
 * mapa no tenía tope y cada GET deja un SSE abierto, así que una clave válida
 * agotaba memoria y conexiones abriendo miles.
 */
const MAX_SESIONES_POR_CLAVE = 20;
const MAX_SESIONES = 2000;

// Periodic cleanup of stale sessions (older than 1 hour)
const SESSION_TTL_MS = 60 * 60 * 1000;
setInterval(
  () => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.lastActivity > SESSION_TTL_MS) {
        sessions.delete(id);
        logger.info({ sessionId: id, agentName: session.agentName }, "MCP session expired");
      }
    }
  },
  5 * 60 * 1000
); // Check every 5 minutes

// ═══════════════════════════════════════════════════════════════
// Agent Activity Log (in-memory ring buffer, last 1000 entries)
// For production: export to OpenTelemetry / Grafana / Loki
// ═══════════════════════════════════════════════════════════════

const MAX_LOG_ENTRIES = 1000;
const agentLog: AgentLogEntry[] = [];

function logAgentActivity(entry: AgentLogEntry): void {
  agentLog.push(entry);
  if (agentLog.length > MAX_LOG_ENTRIES) {
    agentLog.shift();
  }
  logger.info(
    {
      agent: entry.agentName,
      method: entry.method,
      tool: entry.tool,
      resource: entry.resource,
      durationMs: entry.durationMs,
      success: entry.success,
    },
    `MCP ${entry.method}${entry.tool ? ` → ${entry.tool}` : ""}`
  );
}

// ═══════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════

const mcpRoutes = new Hono();

// ═══════════════════════════════════════════════════════════════
// Auth Middleware — Supports Human API Keys & Agent Identities (NHI)
// ═══════════════════════════════════════════════════════════════

interface McpAuthContext {
  type: "human" | "agent";
  agentId: string;
  agentName: string;
  apiKeyId: string;
  scopes: string[]; // For agent NHI (vacío para claves heredadas)
  allowedTools: string[]; // Vacío = sin lista: decide el scope de cada herramienta
  rateLimit?: number; // For agent NHI
  sponsor?: AgentAuthContext["sponsor"];
  writesPerDay?: number | null;
  budgetUnitsPerDay?: number | null;
  mcpSettings?: AjustesMcp;
}

declare module "hono" {
  interface ContextVariableMap {
    mcpAuth: McpAuthContext;
  }
}

mcpRoutes.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      errorJsonRpc(
        -32000,
        "Unauthorized. MCP requires a valid API key in Authorization header.",
        null,
        "KITSUDEN_E_UNAUTHENTICATED"
      ),
      401
    );
  }

  const rawToken = authHeader.replace("Bearer ", "").trim();

  // ═══════════════════════════════════════════════════════════════
  // Intentar autenticar como Agente NHI primero (kitsuden_agent_xxx)
  // ═══════════════════════════════════════════════════════════════
  // Clave estática (kitsuden_agent_*) o token OAuth (kitsuden_oat_*, 0055):
  // los dos dan el mismo contexto de agente (services/agent-auth.ts).
  if (esCredencialDeAgente(rawToken)) {
    // La autenticación global ya verificó ESTE token en esta petición: se
    // reutiliza (una sola verificación y una sola fila de auditoría).
    const result =
      autenticacionDeLaPeticion(c.req.raw, rawToken) ??
      (await authenticateAgent(rawToken, {
        ipAddress: ipDelCliente(c),
        userAgent: c.req.header("user-agent"),
        ruta: c.req.path,
      }));

    if (!result.success || !result.context) {
      // La clave no se pudo comprobar (base no disponible): 503, no «clave inválida»
      if (result.code === "AUTH_ERROR") {
        c.header("Retry-After", "5");
        return c.json(
          errorJsonRpc(-32000, "Authentication is temporarily unavailable.", null, "KITSUDEN_E_UNAVAILABLE"),
          503
        );
      }
      return c.json(
        errorJsonRpc(
          -32000,
          result.error || "Invalid agent API key.",
          null,
          "KITSUDEN_E_UNAUTHENTICATED"
        ),
        401
      );
    }

    const agentContext = result.context;

    // Verificar que el agente tenga scope para MCP
    if (!hasScope(agentContext, "mcp:connect")) {
      return c.json(
        errorJsonRpc(
          -32000,
          "Agent does not have MCP scope. Required: mcp:connect",
          null,
          "KITSUDEN_E_FORBIDDEN"
        ),
        403
      );
    }

    c.set("mcpAuth", {
      type: "agent",
      agentId: agentContext.agentId,
      agentName: agentContext.agentName,
      apiKeyId: agentContext.keyId,
      scopes: agentContext.scopes,
      allowedTools: agentContext.allowedTools,
      rateLimit: agentContext.rateLimit,
      sponsor: agentContext.sponsor ?? null,
      writesPerDay: agentContext.writesPerDay,
      budgetUnitsPerDay: agentContext.budgetUnitsPerDay,
      mcpSettings: agentContext.mcpSettings ?? {},
    });

    logger.info(
      {
        agentId: agentContext.agentId,
        agentName: agentContext.agentName,
        type: "agent",
      },
      "MCP agent authenticated"
    );

    await next();
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // Fallback: Legacy Human API Key (kitsuden_sk_xxx) — DEPRECATED
  // Migrate to Agent NHI tokens (kitsuden_agent_xxx) before 2026-08-01.
  // ═══════════════════════════════════════════════════════════════
  if (!rawToken.startsWith("kitsuden_sk_")) {
    return c.json(
      errorJsonRpc(
        -32000,
        "Invalid API key format. Expected: kitsuden_agent_xxx (new) or kitsuden_sk_xxx (deprecated)",
        null,
        "KITSUDEN_E_UNAUTHENTICATED"
      ),
      401
    );
  }

  const keyHash = createHash("sha256").update(rawToken).digest("hex");

  const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);

  if (!apiKey) {
    return c.json(errorJsonRpc(-32000, "Invalid API key.", null, "KITSUDEN_E_UNAUTHENTICATED"), 401);
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return c.json(errorJsonRpc(-32000, "API key expired.", null, "KITSUDEN_E_UNAUTHENTICATED"), 401);
  }

  // Update lastUsedAt (fire and forget)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKey.id))
    .execute()
    .catch(() => {});

  // Deprecation warnings
  logger.warn(
    { keyId: apiKey.id, type: "mcp" },
    "[DEPRECATION] Legacy API key (kitsuden_sk_*) used in MCP. Migrate to Agent NHI (kitsuden_agent_*)."
  );
  c.header("Deprecation", "kitsuden_sk_*; kitsuden_agent_*");
  c.header("Sunset", "2026-08-01");

  c.set("mcpAuth", {
    type: "human",
    agentId: `machine-${apiKey.id}`,
    agentName: apiKey.name,
    apiKeyId: apiKey.id,
    // Las claves heredadas no tienen scopes: conectan, pero no ejecutan
    // herramientas. Para eso está la migración a kitsuden_agent_*.
    scopes: [],
    allowedTools: [],
  });

  logger.info(
    {
      agentId: `machine-${apiKey.id}`,
      agentName: apiKey.name,
      type: "human",
    },
    "MCP legacy human user authenticated"
  );

  await next();
});

/**
 * GET /api/mcp — SSE Endpoint
 *
 * Agents connect here to establish an MCP session.
 * The server sends an `endpoint` event with the POST URL for messages.
 */
mcpRoutes.get("/", async (c) => {
  // Streamable HTTP (2025-03-26+): un cliente con `Mcp-Session-Id` pide aquí
  // el flujo de avisos del servidor, que no hay. 405 es la respuesta que la
  // especificación prevé para eso (el cliente sigue solo con POST).
  if (c.req.header("mcp-session-id")) {
    c.header("Allow", "POST");
    return c.body(null, 405);
  }
  const sessionId = crypto.randomUUID();
  const auth = c.get("mcpAuth") as McpAuthContext;

  let deEstaClave = 0;
  for (const s of sessions.values()) if (s.apiKeyId === auth.apiKeyId) deEstaClave++;
  if (deEstaClave >= MAX_SESIONES_POR_CLAVE || sessions.size >= MAX_SESIONES) {
    return c.json(
      errorJsonRpc(-32000, "Too many open MCP sessions for this key.", null, "KITSUDEN_E_RATE_LIMITED", {
        hint: `Close unused sessions (limit ${MAX_SESIONES_POR_CLAVE} per key).`,
      }),
      429
    );
  }

  // Toolset pedido al conectar: un nombre desconocido es un 400 (mejor que
  // una lista entera, o vacía, sin saber por qué).
  const pedido = parsearToolset(c.req.query("toolset"));
  if (!pedido.ok) {
    return c.json(errorJsonRpc(-32602, pedido.error, null, "KITSUDEN_E_VALIDATION"), 400);
  }

  const session: McpSession = {
    agentId: auth.agentId,
    agentName: auth.agentName,
    apiKeyId: auth.apiKeyId,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    scopes: auth.scopes,
    allowedTools: auth.allowedTools,
    toolsetDeConexion: pedido.toolset,
  };
  refrescarAjustes(session, auth.mcpSettings);
  sessions.set(sessionId, session);

  logger.info(
    { sessionId, agentName: auth.agentName, type: auth.type, toolset: textoDeToolset(pedido.toolset) },
    "MCP session created"
  );

  const messageEndpoint = `/api/mcp?sessionId=${sessionId}`;

  const stream = new ReadableStream({
    start(controller) {
      // MCP spec: send endpoint event
      controller.enqueue(new TextEncoder().encode(`event: endpoint\ndata: ${messageEndpoint}\n\n`));

      // Keepalive every 30s
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(":keepalive\n\n"));
        } catch {
          clearInterval(keepAlive);
        }
      }, 30000);

      c.req.raw.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        sessions.delete(sessionId);
        logger.info({ sessionId, agentName: auth.agentName }, "MCP session closed");
      });
    },
    cancel() {
      sessions.delete(sessionId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-MCP-Session": sessionId,
    },
  });
});

/**
 * POST /api/mcp — JSON-RPC Message Endpoint
 *
 * Agents send MCP commands here after establishing a session via SSE.
 */
mcpRoutes.post("/", async (c) => {
  // HTTP+SSE (2024-11-05) manda `?sessionId=`; Streamable HTTP, la cabecera
  // `Mcp-Session-Id` (la que se devuelve al `initialize`).
  const sessionId = c.req.query("sessionId") ?? c.req.header("mcp-session-id");
  let session = sessionId ? sessions.get(sessionId) : undefined;
  if (!sessionId) {
    // Streamable HTTP: `initialize` sin sesión ABRE una (los clientes MCP
    // actuales —Claude Code, Inspector, SDK— no abren antes el GET de SSE).
    const abierta = await abrirSesionStreamable(c);
    if (abierta instanceof Response) return abierta;
    if (abierta) {
      session = abierta.session;
      c.header("Mcp-Session-Id", abierta.id);
    }
  }

  if (!session) {
    return c.json(
      errorJsonRpc(
        -32000,
        "Invalid or expired session. Connect via GET /api/mcp first.",
        null,
        "KITSUDEN_E_BAD_REQUEST",
        { hint: "Open GET /api/mcp (SSE) and POST to the endpoint it announces." }
      ),
      400
    );
  }

  // La sesión es de la clave que la abrió. Otra clave válida que conozca el
  // sessionId no puede hablar por ella (ni heredar sus scopes): se responde
  // igual que a una sesión inexistente, para no confirmar que existe.
  const auth = c.get("mcpAuth") as McpAuthContext;
  if (auth.apiKeyId !== session.apiKeyId) {
    return c.json(
      errorJsonRpc(
        -32000,
        "Invalid or expired session. Connect via GET /api/mcp first.",
        null,
        "KITSUDEN_E_BAD_REQUEST",
        { hint: "Open GET /api/mcp (SSE) and POST to the endpoint it announces." }
      ),
      400
    );
  }

  // Scopes del momento, no los de la conexión: una revocación vale ya
  session.scopes = auth.scopes;
  session.allowedTools = auth.allowedTools;
  session.sponsor = auth.sponsor ?? null;
  session.rateLimit = auth.rateLimit ?? null;
  session.writesPerDay = auth.writesPerDay ?? null;
  session.budgetUnitsPerDay = auth.budgetUnitsPerDay ?? null;
  // El preset de toolset y el envoltorio del panel valen ya, como los scopes
  refrescarAjustes(session, auth.mcpSettings);

  // Update last activity
  session.lastActivity = Date.now();

  // Un cuerpo que no es JSON es un «parse error» de JSON-RPC, no un 500.
  const body = await c.req.json().catch(() => undefined);
  if (!body || typeof body !== "object") {
    return c.json(errorJsonRpc(-32700, "Parse error: the body must be a JSON-RPC object.", null), 400);
  }
  const start = Date.now();

  try {
    // Lo que el formato `auto` ahorró en esta llamada (panel → cuotas).
    const { valor: result, medida } = await medirFormato(() => handleMcpMessage(body, session));
    if (esAgenteNhi(session)) registrarAhorro(session.agentId, "mcp", medida);
    auditarLlamada(session, body, result, Date.now() - start);

    logAgentActivity({
      timestamp: new Date().toISOString(),
      agentId: session.agentId,
      agentName: session.agentName,
      method: body.method,
      tool: body.method === "tools/call" ? body.params?.name : undefined,
      resource: body.method === "resources/read" ? body.params?.uri : undefined,
      durationMs: Date.now() - start,
      success: true,
    });

    if (result === null) {
      // Notifications (like "initialized") don't need a response
      return c.body(null, 204);
    }
    return c.json(result);
  } catch (err: unknown) {
    const respuesta = errorJsonRpc(-32603, messageOf(err), body.id || null);
    auditarLlamada(session, body, respuesta, Date.now() - start);
    logAgentActivity({
      timestamp: new Date().toISOString(),
      agentId: session.agentId,
      agentName: session.agentName,
      method: body.method,
      tool: body.method === "tools/call" ? body.params?.name : undefined,
      durationMs: Date.now() - start,
      success: false,
      error: messageOf(err),
    });

    return c.json(respuesta, 500);
  }
});

/**
 * Cada `tools/call` de un agente queda en `agent_audit_logs` (`tool_call`).
 * Antes solo iba al buffer en memoria de arriba: se perdía al reiniciar y el
 * informe de fricción (`GET /api/admin/agents/friction`) no tenía de qué
 * comer. Se guardan los NOMBRES de los argumentos, nunca sus valores.
 * Asíncrono: no retrasa la respuesta.
 */
function auditarLlamada(session: McpSession, body: any, respuesta: unknown, durationMs: number): void {
  if (body?.method !== "tools/call" || !esAgenteNhi(session)) return;
  const nombre = typeof body.params?.name === "string" ? body.params.name : "(sin nombre)";
  const resumen = resumirLlamada(respuesta, body.params?.arguments);
  logAgentAction({
    agentId: session.agentId,
    keyId: session.apiKeyId,
    action: "tool_call",
    resource: nombre,
    details: { origen: "mcp", ...resumen },
    durationMs,
    success: resumen.exito,
    errorMessage: resumen.codigo && !resumen.exito ? resumen.codigo : undefined,
  });
}

/**
 * GET /api/mcp/logs — Agent activity log (admin only)
 */
mcpRoutes.get("/logs", async (c) => {
  // Decía «admin only» y bastaba `mcp:connect`: cualquier agente leía la
  // actividad de todos (auditoría 2026-10-25).
  const auth = c.get("mcpAuth") as McpAuthContext;
  if (!concedeScope(auth.scopes, "admin")) {
    return c.json(errorJsonRpc(-32000, "Requires the 'admin' scope.", null, "KITSUDEN_E_FORBIDDEN"), 403);
  }
  const limit = Math.min(Number(c.req.query("limit")) || 100, MAX_LOG_ENTRIES);
  const agentFilter = c.req.query("agent");

  let entries = agentLog.slice(-limit);
  if (agentFilter) {
    entries = entries.filter((e) => e.agentName.includes(agentFilter));
  }

  return c.json({
    entries: entries.reverse(),
    total: agentLog.length,
    activeSessions: sessions.size,
    sessionDetails: Array.from(sessions.entries()).map(([id, s]) => ({
      sessionId: id,
      agentName: s.agentName,
      connectedAt: new Date(s.createdAt).toISOString(),
      lastActivity: new Date(s.lastActivity).toISOString(),
    })),
  });
});

// ═══════════════════════════════════════════════════════════════
// MCP Protocol Handler
// ═══════════════════════════════════════════════════════════════

async function handleMcpMessage(message: any, session: McpSession) {
  const { method, params, id } = message;

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            resources: { listChanged: true },
            tools: { listChanged: true },
          },
          serverInfo: {
            name: "kitsuden-mcp-server",
            version: "0.7.0-beta",
          },
        },
        id,
      };

    case "initialized":
      return null;

    case "ping":
      return { jsonrpc: "2.0", result: {}, id };

    case "resources/list":
      return await listResources(id, session);

    case "resources/read":
      return await readResource(params?.uri, id, session);

    case "tools/list":
      return await listTools(id, session);

    case "tools/call":
      return await executeTool(params?.name, params?.arguments, id, session);

    default:
      return errorJsonRpc(-32601, `Method not found: ${method}`, id);
  }
}

// ═══════════════════════════════════════════════════════════════
// Resources
// ═══════════════════════════════════════════════════════════════

/**
 * Los datasets que ESTA sesión puede leer (la misma regla que las
 * herramientas). Antes los recursos listaban todos, con su esquema y su
 * `policyJson`, a cualquier agente con `mcp:connect` (auditoría 2026-10-25).
 */
async function datasetsVisibles(session: McpSession) {
  const todos = await db.select().from(dataSets);
  return todos.filter((ds) => agentePuedeLeerDataset(session, ds));
}

async function listResources(id: string | number, session: McpSession) {
  const allDatasets = await datasetsVisibles(session);

  const resources = [
    {
      uri: "kitsuden://datasets",
      name: "All Datasets",
      mimeType: "application/json",
      description: `List of all ${allDatasets.length} datasets with their schemas`,
    },
    {
      uri: "kitsuden://kons",
      name: "Active Kons",
      mimeType: "application/json",
      description: "Active modules (blog, CRM, DMS, etc.) and their mount points",
    },
    // Individual dataset resources
    ...allDatasets.map((ds) => ({
      uri: `kitsuden://dataset/${ds.id}`,
      name: `Dataset: ${ds.name}`,
      mimeType: "application/json",
      description: `Schema and metadata for ${ds.name} (${ds.slug})`,
    })),
    // La guía de cada herramienta del SDK que la declara (y esta sesión ve)
    ...(await recursosDeGuia(session)),
  ];

  return { jsonrpc: "2.0", result: { resources }, id };
}

async function readResource(uri: string, id: string | number, session: McpSession) {
  try {
    const guia = typeof uri === "string" ? await leerGuia(uri, session) : null;
    if (guia !== null) {
      return { jsonrpc: "2.0", result: { contents: [{ uri, mimeType: "text/markdown", text: guia }] }, id };
    }

    if (uri === "kitsuden://datasets") {
      const allDatasets = await datasetsVisibles(session);
      const mapped = allDatasets.map((ds: any) => ({
        id: ds.id,
        name: ds.name,
        slug: ds.slug,
        description: ds.description,
        fields: camposDelSchema(ds.schema),
        entryCount: ds.entryCount || 0,
      }));

      return jsonRpcResult(uri, mapped, id);
    }

    if (uri === "kitsuden://kons") {
      // Return actual kon registry instead of hardcoded stub
      const kons = KON_REGISTRY.map((g) => ({
        key: g.key,
        name: g.name,
        description: g.description,
        icon: g.icon,
        category: g.category,
        tables: g.tables,
        grimoireId: g.grimoireId || null,
      }));

      return jsonRpcResult(uri, kons, id);
    }

    // Individual dataset: kitsuden://dataset/{id}
    const datasetMatch = uri.match(/^kitsuden:\/\/dataset\/(.+)$/);
    if (datasetMatch) {
      const [dataset] = await db
        .select()
        .from(dataSets)
        .where(eq(dataSets.id, datasetMatch[1]))
        .limit(1);

      // El que no puede leer no existe para esta sesión
      if (!dataset || !agentePuedeLeerDataset(session, dataset)) {
        return jsonRpcError(-32002, `Dataset not found: ${datasetMatch[1]}`, id);
      }

      return jsonRpcResult(
        uri,
        {
          id: dataset.id,
          name: dataset.name,
          slug: dataset.slug,
          description: dataset.description,
          schema: dataset.schema,
        },
        id
      );
    }

    return jsonRpcError(-32002, `Unknown resource: ${uri}`, id);
  } catch (err: unknown) {
    // El detalle (puede ser SQL) va al log, no al agente
    logger.warn({ err, uri }, "MCP resources/read failed");
    return jsonRpcError(-32603, "Resource read failed", id);
  }
}

// ═══════════════════════════════════════════════════════════════
// Tools
// ═══════════════════════════════════════════════════════════════

/**
 * ¿Puede esta sesión usar la herramienta? Con lista de herramientas permitidas
 * en el agente (panel), solo esas; sin lista, todas, y el scope de cada una
 * decide al ejecutarla.
 */
function herramientaPermitida(session: McpSession, nombre: string): boolean {
  if (session.allowedTools.length > 0 && !session.allowedTools.includes(nombre)) return false;
  const toolsets = session.toolsets ?? [];
  return toolsets.length === 0 || enTodos(toolsets, fichaDe(nombre));
}

/** El preset del agente (panel) se relee en cada petición; el de la URL queda. */
/**
 * Streamable HTTP: un POST `initialize` sin sesión abre una, con los mismos
 * topes por clave que el GET de SSE. `null` si el cuerpo no es un
 * `initialize` (se sigue y se responde «sesión inválida», como siempre).
 */
async function abrirSesionStreamable(
  c: import("hono").Context
): Promise<{ id: string; session: McpSession } | Response | null> {
  const cuerpo = (await c.req.raw
    .clone()
    .json()
    .catch(() => null)) as { method?: unknown } | null;
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo) || cuerpo.method !== "initialize") return null;
  const auth = c.get("mcpAuth") as McpAuthContext;
  let deEstaClave = 0;
  for (const s of sessions.values()) if (s.apiKeyId === auth.apiKeyId) deEstaClave++;
  if (deEstaClave >= MAX_SESIONES_POR_CLAVE || sessions.size >= MAX_SESIONES) {
    return c.json(
      errorJsonRpc(-32000, "Too many open MCP sessions for this key.", null, "KITSUDEN_E_RATE_LIMITED", {
        hint: `Close unused sessions (limit ${MAX_SESIONES_POR_CLAVE} per key).`,
      }),
      429
    );
  }
  const pedido = parsearToolset(c.req.query("toolset"));
  if (!pedido.ok) {
    return c.json(errorJsonRpc(-32602, pedido.error, null, "KITSUDEN_E_VALIDATION"), 400);
  }
  const id = crypto.randomUUID();
  const session: McpSession = {
    agentId: auth.agentId,
    agentName: auth.agentName,
    apiKeyId: auth.apiKeyId,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    scopes: auth.scopes,
    allowedTools: auth.allowedTools,
    toolsetDeConexion: pedido.toolset,
  };
  refrescarAjustes(session, auth.mcpSettings);
  sessions.set(id, session);
  logger.info({ sessionId: id, agentName: auth.agentName, type: auth.type, transport: "streamable-http" }, "MCP session created");
  return { id, session };
}

function refrescarAjustes(session: McpSession, ajustes: AjustesMcp | undefined): void {
  const preset = parsearToolset(ajustes?.toolset);
  // Los que no restringen (`all`) no hace falta mirarlos en cada herramienta
  session.toolsets = [
    ...(preset.ok ? [preset.toolset] : []),
    ...(session.toolsetDeConexion ? [session.toolsetDeConexion] : []),
  ].filter((t) => !t.todos);
  session.untrustedWrap = ajustes?.untrustedWrap;
}

/** Dónde cae una herramienta para los toolsets (lib/ajustes-mcp.ts). */
function fichaDe(nombre: string): FichaDeHerramienta {
  if (nombre === HERRAMIENTA_DE_ESTADO) return { nombre, origen: "propuestas", soloLectura: true };
  const sdk = fichaDeHerramientaDeOperacion(nombre);
  if (sdk) return { nombre, origen: "kon", kon: sdk.kon, soloLectura: sdk.soloLectura };
  if (listMCPTools().some((t) => t.name === nombre)) return { nombre, origen: "accion", soloLectura: false };
  return {
    nombre,
    origen: "nucleo",
    soloLectura: herramientaDelNucleoDeSoloLectura(nombre),
    deDatos: herramientaDelNucleoDeDatos(nombre),
  };
}

async function listTools(id: string | number, session: McpSession) {
  // Dynamically retrieve tools from the Actions engine
  const dynamicTools = listMCPTools().map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema || { type: "object", properties: {} },
  }));

  const hardcodedTools = listHardcodedMCPTools().map((t) => ({
    name: t.function.name,
    description: t.function.description,
    inputSchema: t.function.parameters,
  }));

  // SDK de kons: una herramienta por operación declarada, con el mismo
  // esquema que su ruta REST. Ya vienen filtradas por `allowedTools` y por
  // los scopes de la sesión (ver lib/operaciones-mcp.ts).
  const deOperaciones = (await herramientasDeOperaciones(session))
    .filter((t) => !session.toolsets?.length || enTodos(session.toolsets, fichaDe(t.name)))
    .map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: t.annotations,
  }));

  // Fase F: la consulta de sus propuestas (solo lee lo suyo). Con lista de
  // herramientas permitidas, solo si está en ella (GET /api/proposals/{id}
  // vale siempre por REST).
  const deAprobacion =
    esAgenteNhi(session) && herramientaPermitida(session, HERRAMIENTA_DE_ESTADO)
      ? [DEFINICION_DE_HERRAMIENTA_DE_ESTADO]
      : [];

  return {
    jsonrpc: "2.0",
    result: {
      // Solo las que este agente puede llamar: anunciar las demás invita a fallar
      tools: [
        ...[...dynamicTools, ...hardcodedTools].filter((t) => herramientaPermitida(session, t.name)),
        ...deOperaciones,
        ...deAprobacion,
      ],
    },
    id,
  };
}

/** Un agente de verdad (no una clave heredada `kitsuden_sk_*`). */
function esAgenteNhi(session: McpSession): boolean {
  return Boolean(session.agentId) && !session.agentId.startsWith("machine-");
}

/** `kitsuden_proposal_status`: el estado de UNA propuesta de este agente. */
async function estadoDePropuesta(args: unknown, id: string | number, session: McpSession) {
  const pedido = (args as { proposal_id?: unknown } | null)?.proposal_id;
  const propuestaId = typeof pedido === "string" ? pedido : "";
  const p = esAgenteNhi(session) ? await propuestaPorId(propuestaId) : null;
  // La de otro agente no existe para este.
  if (!p || p.agentId !== session.agentId) {
    return jsonRpcError(-32602, `Proposal not found: ${propuestaId || "(missing proposal_id)"}`, id, "KITSUDEN_E_NOT_FOUND");
  }
  const vista = vistaParaAgente(p);
  return {
    jsonrpc: "2.0",
    result: {
      content: [{ type: "text", text: JSON.stringify(vista) }],
      structuredContent: vista,
    },
    id,
  };
}

/** Lo que cambia al ejecutar una propuesta YA aprobada (ver lib/aprobaciones.ts). */
interface OpcionesDeEjecucion {
  aprobacion?: { proposalId: string; approvedBy: string };
}

async function executeTool(
  name: string,
  args: any,
  id: string | number,
  session: McpSession,
  opciones: OpcionesDeEjecucion = {}
) {
  if (!herramientaPermitida(session, name)) {
    return jsonRpcError(
      -32602,
      `Tool '${name}' is not in this agent's allowed tools.`,
      id,
      "KITSUDEN_E_FORBIDDEN"
    );
  }
  if (name === HERRAMIENTA_DE_ESTADO) return estadoDePropuesta(args, id, session);
  // Cuota del día (fase E): cada herramienta gasta su escritura y sus
  // unidades. La petición HTTP que la trae ya contó para el minuto.
  let devolverCuota: (() => Promise<void>) | null = null;
  if (
    !opciones.aprobacion &&
    session.agentId &&
    !session.agentId.startsWith("machine-") &&
    // Fase F: una repetición (misma idempotency_key y argumentos) no gasta.
    !(await esRepeticionDeHerramienta(name, args, session.agentId))
  ) {
    const delSdk = consumoDeHerramientaDeOperacion(name);
    const escritura = delSdk
      ? delSdk.escritura
      : listMCPTools().some((t) => t.name === name) || herramientaQueEscribe(name);
    const cuota = await consumirCuota(
      {
        agentId: session.agentId,
        rateLimit: null,
        writesPerDay: session.writesPerDay ?? null,
        budgetUnitsPerDay: session.budgetUnitsPerDay ?? null,
      },
      { peticion: false, escritura, unidades: delSdk ? delSdk.unidades : 1 }
    );
    if (!cuota.permitido) {
      return { jsonrpc: "2.0", result: resultadoDeError(problemaDeCuota(cuota, "/api/mcp")), id };
    }
    devolverCuota = cuota.devolver;
  }
  // Fase F: si esta llamada necesita aprobación humana, no se ejecuta: queda
  // como propuesta y se devuelve «pendiente» con su id.
  if (!opciones.aprobacion && esAgenteNhi(session)) {
    const retenida = await retenerHerramientaSiHaceFalta(name, args, session);
    if (retenida) return { jsonrpc: "2.0", result: retenida, id };
  }
  try {
    // Operaciones del SDK de kons: se ejecutan por el mismo camino que REST
    // (puertas, idempotencia, RLS, permiso de la operación) con la identidad
    // del agente de esta sesión.
    const deOperacion = await ejecutarHerramientaDeOperacion(name, args, session);
    if (deOperacion) {
      // Fase F: una repetición de la idempotencia (`idempotency_key` ya usada)
      // no ejecutó nada: no gasta cuota.
      const sc = deOperacion.structuredContent as { idempotentReplayed?: boolean; code?: string } | undefined;
      if (sc?.idempotentReplayed || sc?.code === "KITSUDEN_E_IDEMPOTENCY_NOT_REPLAYABLE") {
        await devolverCuota?.();
      }
      return { jsonrpc: "2.0", result: deOperacion, id };
    }

    // First check if this is a dynamic tool registered in the Actions engine
    const dynamicTools = listMCPTools();
    if (dynamicTools.find((t) => t.name === name)) {
      // Igual que en agent-tools: el scope base de MCP, y luego los que la
      // acción declare (los exige el engine con los scopes de la sesión)
      assertDynamicToolScope(name, session.scopes);
      const result = await executeMCPTool(name, args, session);
      return {
        jsonrpc: "2.0",
        // Si la acción devolvió un fallo, lleva el mismo problema que la API REST
        // El texto de una acción que sale bien, en el formato más corto sin pérdida
        result: resultadoEnAuto(conProblema(result), `mcp:${name}`),
        id,
      };
    }

    // Delegate hardcoded tools to shared implementation
    const { text, formato, procedencia } = await executeHardcodedToolConFormato(name, args || {}, session, {
      onMutate: invalidateGraphQLCache,
    });

    // Propagate validation errors that return string messages as MCP errors
    if (
      text.startsWith("Missing:") ||
      text.startsWith("Invalid") ||
      text.startsWith("Collection not found") ||
      text.startsWith("Dataset not found") ||
      text.startsWith("Record not found") ||
      text.startsWith("Unsupported") ||
      text.startsWith("Unknown queue")
    ) {
      return jsonRpcError(
        -32602,
        text,
        id,
        /not found/i.test(text) ? "KITSUDEN_E_NOT_FOUND" : "KITSUDEN_E_VALIDATION"
      );
    }

    return toolResult(text, id, formato, procedencia);
  } catch (err: unknown) {
    // Un error de la BASE (SQL, restricciones) no se le enseña al agente: va
    // al log. Los de las herramientas (scope, argumentos) sí, que son para él
    // (auditoría 2026-10-25).
    const mensaje = messageOf(err);
    const sqlstate = (err as { code?: unknown } | null)?.code;
    const deLaBase =
      /Failed query|syntax error|does not exist|violates|duplicate key/i.test(mensaje) ||
      (typeof sqlstate === "string" && /^[0-9A-Z]{5}$/.test(sqlstate));
    if (deLaBase) logger.warn({ err, tool: name }, "MCP tool failed on the database");
    return {
      jsonrpc: "2.0",
      result: resultadoDeError(problemaDeExcepcion(err, deLaBase ? "Internal error" : mensaje)),
      id,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// JSON-RPC Helpers
// ═══════════════════════════════════════════════════════════════

function jsonRpcResult(uri: string, data: unknown, id: string | number) {
  return {
    jsonrpc: "2.0",
    result: {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(data),
        },
      ],
    },
    id,
  };
}

function jsonRpcError(
  code: number,
  message: string,
  id: string | number,
  kitsudenCode?: Parameters<typeof errorJsonRpc>[3]
) {
  // Mismos campos que un problem+json de la API, en `error.data`
  return errorJsonRpc(code, message, id, kitsudenCode);
}

function toolResult(text: string, id: string | number, formato?: Formato, procedencia?: Procedencia) {
  const meta: Record<string, unknown> = {};
  // En qué formato va el texto (json | toon | tron); sin él, es un mensaje.
  if (formato) meta[META_FORMATO] = formato;
  // Quién escribió cada fila y si es contenido no confiable (lib/procedencia.ts)
  if (procedencia) meta[META_PROCEDENCIA] = procedencia;
  return {
    jsonrpc: "2.0",
    result: {
      content: [{ type: "text", text }],
      ...(Object.keys(meta).length ? { _meta: meta } : {}),
    },
    id,
  };
}

/**
 * Fase F: cómo se ejecuta una propuesta MCP aprobada. La misma herramienta,
 * los mismos argumentos y una sesión del agente reconstruida con su identidad
 * de AHORA (la releyó lib/aprobaciones.ts); sin cuota (ya se contó) ni puerta.
 */
fijarEjecutorMcpDeAprobaciones(async (herramienta, args, agente, aprobacion) => {
  const sesion: McpSession = {
    agentId: agente.agentId,
    agentName: agente.agentName,
    apiKeyId: agente.keyId,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    scopes: agente.scopes,
    allowedTools: agente.allowedTools,
    sponsor: agente.sponsor ?? null,
    untrustedWrap: agente.mcpSettings?.untrustedWrap,
  };
  sesion.approvedBy = aprobacion.approvedBy;
  const r = (await executeTool(herramienta, args, 0, sesion, { aprobacion })) as {
    result?: { content?: unknown; structuredContent?: unknown; isError?: boolean };
    error?: { message?: string; data?: unknown };
  };
  if (r.result) return r.result;
  return {
    content: [{ type: "text", text: r.error?.message ?? "error" }],
    structuredContent: r.error?.data,
    isError: true,
  };
});

export { mcpRoutes };
