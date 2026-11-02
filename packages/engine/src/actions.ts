/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Kitsuden Engine — Actions Layer (Nivel 1: Core Infrastructure)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Abstracción unificada para definir acciones que pueden ejecutarse vía:
 *   - HTTP (Hono routes)
 *   - Eventos asíncronos (la cola de Postgres del host)
 *   - Agentes LLM (MCP tools)
 *
 * Design Goals:
 *   1. Zero-leak abstraction: El desarrollador no ve la cola, Hono o MCP
 *   2. Type inference: El payload se infiere del trigger
 *   3. Unified context: Sin importar el trigger, la función run recibe el mismo ctx
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * @example
 * ```typescript
 * import { defineAction } from "@kitsuden/engine/actions";
 *
 * // HTTP Trigger
 * defineAction({
 *   trigger: "http.post:/webhooks/stripe",
 *   run: async ({ payload, db }) => {
 *     // payload: StripeWebhookEvent (inferred)
 *     // db: Drizzle instance
 *     return { processed: true };
 *   },
 * });
 *
 * // Event Trigger (async worker)
 * defineAction({
 *   trigger: "event:procesar_video",
 *   run: async ({ payload, db, queue }) => {
 *     // Ejecutado por el worker de la cola (Postgres)
 *     // payload: { videoId: string, quality: "1080p" }
 *   },
 * });
 *
 * // Agent Trigger (MCP tool)
 * defineAction({
 *   trigger: "agent.tool:buscar_clientes",
 *   description: "Busca clientes por nombre o email",
 *   inputSchema: { type: "object", properties: { query: { type: "string" } } },
 *   run: async ({ payload, db }) => {
 *     // payload: { query: string }
 *     // Expuesto como tool MCP
 *   },
 * });
 * ```
 */

import type { KonContext } from "@kitsuden/shared";
import type { Hono, Context as HonoContext } from "hono";

import { queue, type OpcionesDeDespacho, type TrabajoDeCola } from "./cola";
import { messageOf } from "./errors";
import { validate, ValidationSchema } from "./validator";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES: Trigger Parsing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Trigger type prefixes
 */
export type TriggerPrefix = "http" | "event" | "agent";

/**
 * HTTP methods supported
 */
export type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "options" | "head";

/**
 * Event trigger variants
 */
export type EventVariant = "async" | "sync" | "cron";

/**
 * Agent trigger variants
 */
export type AgentVariant = "tool" | "resource" | "prompt";

/**
 * Parsed trigger structure
 */
export interface ParsedTrigger {
  /** Full trigger string */
  raw: string;
  /** Main prefix: http | event | agent */
  prefix: TriggerPrefix;
  /** Variant: http method, event type, or agent type */
  variant: string;
  /** Path (for http), queue name (for event), or tool name (for agent) */
  path: string;
  /** Cron expression (only for event.cron) */
  cronExpression?: string;
}

/**
 * Unified context passed to all action runs
 * Regardless of trigger source (HTTP, Event, Agent), the run function receives this context
 */
export interface ActionContext<TPayload = unknown> {
  /** Payload data - type inferred from trigger */
  payload: TPayload;
  /** Database instance (Drizzle) */
  db: any;
  /** Kon context (full DI context) */
  kon: KonContext;
  /** Logger instance */
  logger: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
    debug: (msg: string, meta?: Record<string, unknown>) => void;
  };
  /**
   * Queue dispatcher (la cola de Postgres: `queue.dispatch` del engine).
   * Dentro de una petición va en su transacción: ROLLBACK = no se encola.
   */
  queue: {
    /** Add a job to a queue (lo consume la acción `event:{queueName}`) */
    add: <T = any>(
      queueName: string,
      jobName: string,
      data: T,
      opciones?: OpcionesDeDespacho
    ) => Promise<{ id: string }>;
  };
  /** Cache interface */
  cache: {
    get: <T = any>(key: string) => Promise<T | null>;
    set: <T = any>(key: string, value: T, ttlSeconds?: number) => Promise<void>;
    invalidate: (pattern: string) => Promise<void>;
  };
  /** HTTP-specific context (only populated for http triggers) */
  http?: {
    /** Hono context */
    hono: HonoContext;
    /** Request headers */
    headers: Headers;
    /** Set response status */
    status: (code: number) => void;
    /** Set response header */
    header: (name: string, value: string) => void;
  };
  /** Event-specific context (only populated for event triggers) */
  event?: {
    /** El trabajo de la cola (con su actor, releído al ejecutar) */
    job: TrabajoDeCola;
    /** Job ID */
    jobId: string;
    /** Attempt number */
    attempt: number;
    /** Signal for job abortion */
    signal?: AbortSignal;
  };
  /** Agent-specific context (only populated for agent triggers) */
  agent?: {
    /** Agent/session ID */
    agentId: string;
    /** Agent name */
    agentName: string;
    /** Granted scopes */
    scopes: string[];
    /** Request TOON encoding */
    preferToon: boolean;
  };
}

/**
 * Action result
 */
export interface ActionResult<TResult = unknown> {
  /** Success flag */
  success: boolean;
  /** Result data */
  data?: TResult;
  /** Error message if failed */
  error?: string;
  /** HTTP status code (for http triggers) */
  statusCode?: number;
  /** Metadata */
  meta?: Record<string, unknown>;
}

/**
 * Action run function type
 */
export type ActionRunFunction<TPayload = unknown, TResult = unknown> = (
  ctx: ActionContext<TPayload>
) => Promise<ActionResult<TResult> | TResult | void>;

/**
 * JSON Schema for input validation (for agent tools)
 */
export interface InputSchema {
  type: "object";
  properties?: Record<
    string,
    {
      type: string;
      description?: string;
      default?: unknown;
      enum?: unknown[];
      items?: InputSchema;
      required?: string[];
    }
  >;
  required?: string[];
  description?: string;
}

/**
 * Action definition structure
 */
export interface ActionDefinition<TPayload = unknown, TResult = unknown> {
  /** Trigger string: http.{method}:{path} | event:{name} | agent.tool:{name} */
  trigger: string;
  /** Human-readable description */
  description?: string;
  /** Input schema (required for agent tools, optional for others) */
  inputSchema?: InputSchema;
  /** Validation schema (declarative validation with if/then/else logic) */
  validation?: ValidationSchema;
  /** Action implementation */
  run: ActionRunFunction<TPayload, TResult>;
  /** Metadata */
  meta?: {
    /** Tags for organization */
    tags?: string[];
    /** Rate limit: requests per minute (for http) */
    rateLimitPerMinute?: number;
    /** Require authentication (for http) */
    requireAuth?: boolean;
    /** Required scopes (for http and agent) */
    requiredScopes?: string[];
    /** Concurrency for event workers */
    concurrency?: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRIGGER PARSER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a trigger string into structured components
 *
 * @example
 * parseTrigger("http.post:/webhooks/stripe")
 * // => { prefix: "http", variant: "post", path: "/webhooks/stripe" }
 *
 * parseTrigger("event:procesar_video")
 * // => { prefix: "event", variant: "async", path: "procesar_video" }
 *
 * parseTrigger("event.cron:0 * * * *:cleanup_old_data")
 * // => { prefix: "event", variant: "cron", path: "cleanup_old_data", cronExpression: "0 * * * *" }
 *
 * parseTrigger("agent.tool:buscar_clientes")
 * // => { prefix: "agent", variant: "tool", path: "buscar_clientes" }
 */
export function parseTrigger(trigger: string): ParsedTrigger {
  // Format: prefix.variant:path or prefix:path
  const colonIndex = trigger.indexOf(":");
  if (colonIndex === -1) {
    throw new Error(
      `Invalid trigger format: "${trigger}". Expected format: "prefix.variant:path" or "prefix:path"`
    );
  }

  const prefixPart = trigger.slice(0, colonIndex);
  const pathPart = trigger.slice(colonIndex + 1);

  // Parse prefix and variant
  const dotIndex = prefixPart.indexOf(".");
  let prefix: TriggerPrefix;
  let variant: string;

  if (dotIndex === -1) {
    // No variant specified, use defaults
    prefix = prefixPart as TriggerPrefix;
    variant = getDefaultVariant(prefix);
  } else {
    prefix = prefixPart.slice(0, dotIndex) as TriggerPrefix;
    variant = prefixPart.slice(dotIndex + 1);
  }

  // Validate prefix
  if (!["http", "event", "agent"].includes(prefix)) {
    throw new Error(`Invalid trigger prefix: "${prefix}". Must be one of: http, event, agent`);
  }

  // Handle cron special case: event.cron:{expression}:{name}
  let path = pathPart;
  let cronExpression: string | undefined;

  if (prefix === "event" && variant === "cron") {
    const cronColonIndex = pathPart.indexOf(":");
    if (cronColonIndex === -1) {
      throw new Error(
        `Invalid cron trigger format: "${trigger}". Expected: "event.cron:* * * * *:jobName"`
      );
    }
    cronExpression = pathPart.slice(0, cronColonIndex);
    path = pathPart.slice(cronColonIndex + 1);
  }

  return {
    raw: trigger,
    prefix,
    variant,
    path,
    cronExpression,
  };
}

function getDefaultVariant(prefix: TriggerPrefix): string {
  switch (prefix) {
    case "http":
      return "post";
    case "event":
      return "async";
    case "agent":
      return "tool";
    default:
      return "default";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADAPTER INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Adapter interface for registering actions to different backends
 */
interface ActionAdapter {
  /** Register an action definition */
  register<TPayload, TResult>(
    trigger: ParsedTrigger,
    definition: ActionDefinition<TPayload, TResult>
  ): void;
  /** Check if adapter is initialized */
  isReady(): boolean;
}

/**
 * Hono HTTP Adapter
 */
class HonoAdapter implements ActionAdapter {
  private app: Hono | null = null;
  private pendingRegistrations: Array<{
    trigger: ParsedTrigger;
    definition: ActionDefinition<any, any>;
  }> = [];

  setApp(app: Hono) {
    this.app = app;
    // Flush pending registrations
    for (const { trigger, definition } of this.pendingRegistrations) {
      this.register(trigger, definition);
    }
    this.pendingRegistrations = [];
  }

  isReady(): boolean {
    return this.app !== null;
  }

  register<TPayload, TResult>(
    trigger: ParsedTrigger,
    definition: ActionDefinition<TPayload, TResult>
  ): void {
    if (!this.app) {
      this.pendingRegistrations.push({ trigger, definition });
      return;
    }

    const method = trigger.variant as HttpMethod;
    const path = trigger.path;

    // Create Hono handler
    const handler = async (c: HonoContext) => {
      const startTime = Date.now();

      let ctx: ActionContext<unknown>;
      try {
        // Build unified context
        const payload = method === "get" ? c.req.query() : await c.req.json().catch(() => ({}));

        ctx = buildActionContext({
          payload,
          kon: c.get("konContext") as KonContext,
          http: {
            hono: c,
            headers: c.req.header() as any,
            status: (code: number) => {
              c.status(code as any);
            },
            header: (name: string, value: string) => c.header(name, value),
          },
        });

        // Execute action
        const result = await definition.run(ctx as ActionContext<TPayload>);

        // Normalize result
        const normalized = normalizeResult(result);

        // Log execution
        ctx.logger.debug(`Action executed: ${trigger.raw}`, {
          duration: Date.now() - startTime,
          status: normalized.success ? "success" : "error",
        });

        // Return response
        return c.json(
          {
            success: normalized.success,
            data: normalized.data,
            error: normalized.error,
            meta: {
              ...normalized.meta,
              trigger: trigger.raw,
              duration: Date.now() - startTime,
            },
          },
          (normalized.statusCode as any) || 200
        );
      } catch (err: unknown) {
        ctx!.logger.error(`Action failed: ${trigger.raw}`, { error: messageOf(err) });
        return c.json(
          {
            success: false,
            error: messageOf(err),
            meta: { trigger: trigger.raw, duration: Date.now() - startTime },
          },
          500
        );
      }
    };

    // Register with Hono
    switch (method.toLowerCase()) {
      case "get":
        this.app.get(path, handler);
        break;
      case "post":
        this.app.post(path, handler);
        break;
      case "put":
        this.app.put(path, handler);
        break;
      case "patch":
        this.app.patch(path, handler);
        break;
      case "delete":
        this.app.delete(path, handler);
        break;
      default:
        (this.app as any).on(method.toUpperCase(), path, handler);
    }

    // eslint-disable-next-line no-console -- log de arranque/registro: visible a propósito en boot (el logger del host no es accesible desde el engine sin crear un ciclo)
    console.log(`  🔷 [Actions] HTTP ${method.toUpperCase()} ${path} registered`);
  }
}

/**
 * Event Adapter: la cola de Postgres (kitsuden2.md, B1; antes BullMQ).
 *
 * `event:{nombre}` registra el manejador de la cola `{nombre}`; se encola con
 * `ctx.queue.add("{nombre}", …)` o `queue.dispatch("{nombre}", …)`. Entrega
 * al menos una vez: la acción debe ser idempotente. Un `run` que lanza se
 * reintenta (espera exponencial) y, agotado, queda en la «dead letter».
 */
class ColaAdapter implements ActionAdapter {
  /** Siempre: los manejadores se guardan aunque el worker del host aún no corra. */
  isReady(): boolean {
    return true;
  }

  register<TPayload, TResult>(
    trigger: ParsedTrigger,
    definition: ActionDefinition<TPayload, TResult>
  ): void {
    const concurrencia = definition.meta?.concurrency ?? 3;
    try {
      queue.handle(
        trigger.path,
        async (trabajo) => {
          const ctx = buildActionContext({
            payload: trabajo.payload,
            // Sin contexto de kon: `ctx.db` fallará diciéndolo si la acción lo usa.
            kon: null,
            event: { job: trabajo, jobId: trabajo.id, attempt: trabajo.intento },
          });
          const result = await definition.run(ctx as ActionContext<TPayload>);
          return normalizeResult(result);
        },
        { concurrencia }
      );
    } catch (err) {
      console.warn(`  ⚠️  [Actions] Evento "${trigger.path}" no registrado: ${messageOf(err)}`);
      return;
    }
    // eslint-disable-next-line no-console -- log de arranque/registro: visible a propósito en boot (el logger del host no es accesible desde el engine sin crear un ciclo)
    console.log(
      `  🔷 [Actions] Event worker "${trigger.path}" registered (concurrency: ${concurrencia})`
    );
  }

  async shutdown(): Promise<void> {
    // El worker es del host (apps/api/src/lib/queue.ts) y lo apaga él.
  }
}

/**
 * MCP Agent Adapter
 */
class MCPAdapter implements ActionAdapter {
  private server: any = null;
  private tools: Map<string, ActionDefinition<unknown, unknown>> = new Map();

  setServer(server: any) {
    this.server = server;
    // Flush pending tools
    for (const [toolPath, definition] of Array.from(this.tools.entries())) {
      const parsedTrigger: ParsedTrigger = {
        raw: `agent.tool:${toolPath}`,
        prefix: "agent",
        variant: "tool",
        path: toolPath,
      };
      this.registerToServer(parsedTrigger, definition);
    }
  }

  isReady(): boolean {
    return this.server !== null;
  }

  register<TPayload, TResult>(
    trigger: ParsedTrigger,
    definition: ActionDefinition<TPayload, TResult>
  ): void {
    this.tools.set(trigger.path, definition as ActionDefinition<unknown, unknown>);

    if (this.server) {
      this.registerToServer(trigger, definition);
    }
  }

  private registerToServer<TPayload, TResult>(
    trigger: ParsedTrigger,
    definition: ActionDefinition<TPayload, TResult>
  ): void {
    if (!this.server) return;

    // Register as MCP tool
    const toolName = trigger.path;
    const toolDef = {
      name: toolName,
      description: definition.description || `Action: ${toolName}`,
      inputSchema: definition.inputSchema || {
        type: "object",
        properties: {},
      },
      handler: async (args: TPayload, extra: any) => {
        // Mismo control que `executeTool`: los scopes declarados se exigen
        const faltan = scopesQueFaltan(definition.meta?.requiredScopes ?? [], extra?.scopes ?? []);
        if (faltan.length > 0) {
          return {
            content: [
              {
                type: "text",
                text: `Error: agent lacks required scope(s) ${faltan.map((s) => `'${s}'`).join(", ")} to execute tool '${toolName}'`,
              },
            ],
            isError: true,
            code: "KITSUDEN_E_FORBIDDEN",
          };
        }

        // Generate traceId for agent tool execution (telemetry)
        const traceId = extra?.traceId || generateUUID();

        const ctx = buildActionContext({
          payload: args,
          kon: null,
          agent: {
            agentId: extra?.agentId || "unknown",
            agentName: extra?.agentName || "unknown",
            scopes: extra?.scopes || [],
            preferToon: extra?.preferToon || false,
          },
          traceId, // Pass traceId for telemetry
        });

        const result = await definition.run(ctx as ActionContext<TPayload>);
        const normalized = normalizeResult(result);

        return {
          content: [
            {
              type: "text",
              text: normalized.success
                ? JSON.stringify(normalized.data)
                : `Error: ${normalized.error}`,
            },
          ],
          isError: !normalized.success,
        };
      },
    };

    // Register with MCP server (implementation depends on MCP SDK)
    if (this.server.addTool) {
      this.server.addTool(toolDef);
    }

    // eslint-disable-next-line no-console -- log de arranque/registro: visible a propósito en boot (el logger del host no es accesible desde el engine sin crear un ciclo)
    console.log(`  🔷 [Actions] MCP tool "${toolName}" registered`);
  }

  listTools(): Array<{ name: string; description: string; inputSchema: InputSchema }> {
    return Array.from(this.tools.entries()).map(([name, def]) => ({
      name,
      description: def.description || `Action: ${name}`,
      inputSchema: def.inputSchema || { type: "object", properties: {} },
    }));
  }

  async executeTool(name: string, args: any, extra: any): Promise<any> {
    const definition = this.tools.get(name);
    if (!definition) {
      throw new Error(`Tool not found: ${name}`);
    }

    // `requiredScopes` estaba declarado pero nadie lo comprobaba: cualquier
    // agente conectado ejecutaba cualquier acción-herramienta. Sin scopes en
    // `extra` no hay nada que comparar, así que se niega (falla cerrado).
    const faltan = scopesQueFaltan(definition.meta?.requiredScopes ?? [], extra?.scopes ?? []);
    if (faltan.length > 0) {
      return {
        content: [
          {
            type: "text",
            text: `Error: agent lacks required scope(s) ${faltan.map((s) => `'${s}'`).join(", ")} to execute tool '${name}'`,
          },
        ],
        isError: true,
        code: "KITSUDEN_E_FORBIDDEN",
      };
    }

    // Generate traceId for agent tool execution (telemetry)
    const traceId = extra?.traceId || generateUUID();

    const ctx = buildActionContext({
      payload: args,
      kon: null,
      agent: {
        agentId: extra?.agentId || "unknown",
        agentName: extra?.agentName || "unknown",
        scopes: extra?.scopes || [],
        preferToon: extra?.preferToon || false,
      },
      traceId, // Pass traceId for telemetry
    });

    const result = await definition.run(ctx);
    const normalized = normalizeResult(result);

    return {
      content: [
        {
          type: "text",
          text: normalized.success
            ? JSON.stringify(normalized.data)
            : `Error: ${normalized.error}`,
        },
      ],
      isError: !normalized.success,
    };
  }
}

/**
 * Scopes requeridos que los concedidos no cubren. Misma semántica que
 * `hasScope` de la API (`admin`/`admin:*` lo cubren todo, `recurso:*` y
 * `*:accion` como comodines); vive aquí porque el engine no importa de la app.
 */
export function scopesQueFaltan(requeridos: readonly string[], concedidos: readonly string[]): string[] {
  if (concedidos.includes("admin") || concedidos.includes("admin:*")) return [];
  const cubre = (concedido: string, requerido: string) =>
    concedido === requerido ||
    (concedido.endsWith(":*") && requerido.startsWith(concedido.slice(0, -1))) ||
    (concedido.startsWith("*:") && requerido.endsWith(concedido.slice(1)));
  return requeridos.filter((r) => !concedidos.some((c) => cubre(c, r)));
}

// ═══════════════════════════════════════════════════════════════════════════════
// TELEMETRY INTERCEPTOR (Paso 2: Observabilidad tipo LangSmith)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Telemetry step data structure
 */
export interface TelemetryStepData {
  id: string;
  traceId: string;
  stepOrder: number;
  stepType: "tool_call" | "llm_call" | "thinking" | "error" | string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  durationMs?: number;
  errorMessage?: string;
  createdAt: Date;
}

/**
 * Telemetry provider interface
 * Implementado por apps/api para proporcionar acceso a la BD
 */
export interface TelemetryProvider {
  /** Insert a new telemetry step */
  insertStep: (step: TelemetryStepData) => Promise<void>;
  /** Update an existing telemetry step */
  updateStep: (stepId: string, data: Partial<TelemetryStepData>) => Promise<void>;
}

// Global telemetry provider (set by the application)
let globalTelemetryProvider: TelemetryProvider | null = null;

/**
 * Set the global telemetry provider
 * Called by apps/api during initialization
 */
export function setTelemetryProvider(provider: TelemetryProvider): void {
  globalTelemetryProvider = provider;
}

/**
 * Get the global telemetry provider
 */
export function getTelemetryProvider(): TelemetryProvider | null {
  return globalTelemetryProvider;
}

/**
 * Generate UUID v4
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Wrap action definition with validation interceptor
 * Validates payload against ValidationSchema before execution
 */
function wrapWithValidation<TPayload, TResult>(
  definition: ActionDefinition<TPayload, TResult>
): ActionDefinition<TPayload, TResult> {
  const originalRun = definition.run;
  const validationSchema = definition.validation;

  // If no validation schema, return as-is
  if (!validationSchema) {
    return definition;
  }

  return {
    ...definition,
    run: async (ctx: ActionContext<TPayload>): Promise<ActionResult<TResult> | TResult | void> => {
      // Validate payload before execution
      const validationResult = validate(ctx.payload as Record<string, unknown>, validationSchema);

      if (!validationResult.valid) {
        ctx.logger.warn(`Validation failed for action: ${definition.trigger}`, {
          errors: validationResult.errors,
        });

        // Return validation error as ActionResult
        return {
          success: false,
          error: `Validation failed: ${validationResult.errors.map((e) => `${e.field}: ${e.message}`).join(", ")}`,
          statusCode: 400,
          meta: {
            validationErrors: validationResult.errors,
            trigger: definition.trigger,
          },
        };
      }

      // Use validated/transformed data if available
      if (validationResult.data) {
        ctx.payload = validationResult.data as TPayload;
      }

      // Proceed with original execution
      return originalRun(ctx);
    },
  };
}

/**
 * Wrap action definition with telemetry interceptor
 * Automatically logs execution to agentTraceSteps when traceId is present in context
 */
function wrapWithTelemetry<TPayload, TResult>(
  definition: ActionDefinition<TPayload, TResult>
): ActionDefinition<TPayload, TResult> {
  const originalRun = definition.run;

  return {
    ...definition,
    run: async (ctx: ActionContext<TPayload>): Promise<ActionResult<TResult> | TResult | void> => {
      // Check if we have a traceId in the context (set by agent/trigger)
      const traceId = telemetriaDe(ctx)?.traceId;

      // Check if telemetry provider is available
      const provider = globalTelemetryProvider;

      // If no traceId or no provider, run normally without telemetry
      if (!traceId || !provider) {
        return originalRun(ctx);
      }

      // Parse tool name from trigger
      const parsedTrigger = parseTrigger(definition.trigger);
      const toolName = parsedTrigger.path || definition.trigger;

      // Generate step ID
      const stepId = generateUUID();
      const startTime = performance.now();

      // Get step order (from kon telemetry state or default to 0)
      const telemetryState = telemetriaDe(ctx);
      const stepOrder = telemetryState?.stepOrder || 0;

      // Increment step order for next step
      if (telemetryState) {
        telemetryState.stepOrder = stepOrder + 1;
      }

      // Insert initial step record (async, don't await to avoid blocking)
      const insertStepPromise = provider.insertStep({
        id: stepId,
        traceId,
        stepOrder,
        stepType: "tool_call",
        toolName,
        toolInput: ctx.payload,
        createdAt: new Date(),
      });

      // Catch and log any insert errors (don't fail the action)
      insertStepPromise.catch((err: any) => {
        ctx.logger.warn("Failed to insert telemetry step", { error: err?.message, traceId });
      });

      try {
        // Execute the original action
        const result = await originalRun(ctx);
        const durationMs = Math.round(performance.now() - startTime);

        // Normalize result for storage
        let toolOutput: unknown;
        if (result === null || result === undefined) {
          toolOutput = null;
        } else if (typeof result === "object" && "success" in result) {
          toolOutput = result;
        } else {
          toolOutput = { success: true, data: result };
        }

        // Update step with success result (async, don't await)
        provider
          .updateStep(stepId, {
            toolOutput,
            durationMs,
          })
          .catch((err: any) => {
            ctx.logger.warn("Failed to update telemetry step", { error: err?.message, stepId });
          });

        return result;
      } catch (error: unknown) {
        const durationMs = Math.round(performance.now() - startTime);
        const errorMessage = messageOf(error, String(error));

        // Update step with error result (async, don't await)
        provider
          .updateStep(stepId, {
            toolOutput: { error: errorMessage },
            errorMessage,
            durationMs,
          })
          .catch((err: any) => {
            ctx.logger.warn("Failed to update telemetry step with error", {
              error: err?.message,
              stepId,
            });
          });

        // Relaunch the error to maintain original behavior
        throw error;
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

interface ContextBuildOptions {
  payload: unknown;
  /**
   * Contenedor de DI del kon. `null` en los caminos de agente, MCP y cola.
   *
   * No es un descuido de tipos: es que ahí NO HAY contexto. Esos tres caminos
   * pasan `null` con un "will be injected by engine" que nunca se implementó,
   * así que la acción se ejecuta sin base de datos. Antes se escribía
   * `kon: null as any`, que hacía pasar un nulo por un `KonContext` y dejaba el
   * hueco invisible; declararlo `| null` lo pone en el tipo, donde se ve.
   */
  kon: KonContext | null;
  http?: ActionContext["http"];
  event?: ActionContext["event"];
  agent?: ActionContext["agent"];
  traceId?: string; // Optional traceId for telemetry
}

/**
 * Estado de telemetría de UNA ejecución.
 *
 * Vive en el contexto de la ejecución, no colgado del `kon`. Antes se hacía
 * `(kon as any).telemetry = {...}`, o sea que se MUTABA el contenedor de DI —
 * que es compartido por todas las ejecuciones de ese kon. Hoy no llega a
 * romperse porque el único camino que fija `traceId` pasa `kon: null` y acaba
 * mutando un objeto recién creado; pero bastaba con que el camino HTTP
 * empezara a mandar `traceId` para que dos peticiones concurrentes se pisaran
 * el trazo y los pasos acabaran atribuidos a la traza equivocada.
 */
export interface EstadoTelemetria {
  traceId: string;
  stepOrder: number;
}

/** Estado de telemetría por ejecución, indexado por el contexto que la lleva. */
const telemetriaPorContexto = new WeakMap<object, EstadoTelemetria>();

/** Lee el estado de telemetría de una ejecución, si la tiene. */
export function telemetriaDe(ctx: object): EstadoTelemetria | undefined {
  return telemetriaPorContexto.get(ctx);
}

/**
 * `db` cuando no hay contexto de kon.
 *
 * Devolver `undefined` convertía "esta acción se lanzó sin contexto" en
 * `Cannot read properties of undefined (reading 'select')`, cien líneas más
 * adentro y sin pista de por qué por HTTP sí funcionaba. Este proxy falla en
 * la primera propiedad que se toque y dice exactamente qué pasó.
 */
/**
 * Logger de reserva cuando no hay contexto de kon.
 *
 * Antes era `|| console` a secas. `console` casi encaja, pero no es el mismo
 * tipo: se apoyaba en el `any` para colar. Aquí se adapta explícitamente, y
 * queda escrito que esta salida NO va al logging estructurado del host — el
 * engine no puede alcanzarlo sin crear un ciclo.
 */
function loggerDeConsola(): ActionContext["logger"] {
  /* eslint-disable no-console -- reserva sin contexto: no hay logger del host al que ir */
  return {
    info: (msg, meta) => console.info(msg, meta ?? ""),
    warn: (msg, meta) => console.warn(msg, meta ?? ""),
    error: (msg, meta) => console.error(msg, meta ?? ""),
    debug: (msg, meta) => console.debug(msg, meta ?? ""),
  };
  /* eslint-enable no-console */
}

function dbAusente(): unknown {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        throw new Error(
          `ctx.db no está disponible: esta acción se ejecutó SIN contexto de kon ` +
            `(camino de agente, MCP o cola, que pasan kon=null). Por HTTP sí lo hay. ` +
            `Propiedad pedida: "${String(prop)}".`
        );
      },
    }
  );
}

function buildActionContext<TPayload>(opts: ContextBuildOptions): ActionContext<TPayload> {
  const { payload, kon, http, event, agent, traceId } = opts;

  const ctx: ActionContext<TPayload> = {
    payload: payload as TPayload,
    db: kon?.db?.instance ?? dbAusente(),
    kon: kon ?? ({} as KonContext),
    logger: kon?.logger ?? loggerDeConsola(),
    queue: {
      add: (queueName, jobName, data, opciones) =>
        queue.dispatch(queueName, jobName, data, opciones),
    },
    cache: kon?.cache ?? {
      get: async () => null,
      set: async () => {},
      invalidate: async () => {},
    },
    http,
    event,
    agent,
  };

  // La telemetría se asocia AL CONTEXTO de esta ejecución, no al kon.
  if (traceId) telemetriaPorContexto.set(ctx, { traceId, stepOrder: 0 });

  return ctx;
}

function normalizeResult(result: ActionResult | unknown): ActionResult {
  if (result === null || result === undefined) {
    return { success: true, data: null };
  }

  if (typeof result === "object" && result !== null && "success" in result) {
    return result as ActionResult;
  }

  // Wrap raw result
  return {
    success: true,
    data: result,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY & PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Action registry - stores all defined actions
 */
class ActionRegistry {
  private actions: Map<string, ActionDefinition<unknown, unknown>> = new Map();
  private honoAdapter = new HonoAdapter();
  private colaAdapter = new ColaAdapter();
  private mcpAdapter = new MCPAdapter();

  /**
   * Define and register an action
   */
  define<TPayload = unknown, TResult = unknown>(
    definition: ActionDefinition<TPayload, TResult>
  ): ActionDefinition<TPayload, TResult> {
    const trigger = parseTrigger(definition.trigger);

    // Step 1: Wrap with validation (validates payload before execution)
    const validatedDefinition = wrapWithValidation(definition);

    // Step 2: Wrap with telemetry (logs execution to agentTraces)
    const wrappedDefinition = wrapWithTelemetry(validatedDefinition);

    // Store in registry (store wrapped version)
    this.actions.set(definition.trigger, wrappedDefinition as ActionDefinition<unknown, unknown>);

    // Route to appropriate adapter
    switch (trigger.prefix) {
      case "http":
        this.honoAdapter.register(trigger, wrappedDefinition);
        break;
      case "event":
        this.colaAdapter.register(trigger, wrappedDefinition);
        break;
      case "agent":
        this.mcpAdapter.register(trigger, wrappedDefinition);
        break;
    }

    return wrappedDefinition;
  }

  /**
   * Get all registered actions
   */
  list(): Array<{ trigger: string; definition: ActionDefinition }> {
    return Array.from(this.actions.entries()).map(([trigger, definition]) => ({
      trigger,
      definition,
    }));
  }

  /**
   * Get a specific action by trigger
   */
  get(trigger: string): ActionDefinition | undefined {
    return this.actions.get(trigger);
  }

  /**
   * Initialize with Hono app
   */
  useHono(app: Hono): void {
    this.honoAdapter.setApp(app);
  }

  /**
   * Initialize with MCP server
   */
  useMCP(server: any): void {
    this.mcpAdapter.setServer(server);
  }

  /**
   * Shutdown all adapters
   */
  async shutdown(): Promise<void> {
    await this.colaAdapter.shutdown();
  }

  /**
   * List MCP tools (for tools/list endpoint)
   */
  listMCPTools(): Array<{ name: string; description: string; inputSchema: InputSchema }> {
    return this.mcpAdapter.listTools();
  }

  /**
   * Execute an MCP tool by name
   */
  async executeMCPTool(name: string, args: any, extra: any): Promise<any> {
    return this.mcpAdapter.executeTool(name, args, extra);
  }
}

// Global registry instance
const globalRegistry = new ActionRegistry();

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Define an action
 *
 * This is the primary DX-friendly API for registering actions.
 * The trigger string determines where the action is registered:
 *
 * - `http.{method}:{path}` → Registers HTTP endpoint in Hono
 * - `event:{queueName}` → Registers a Postgres queue handler
 * - `event.cron:{expression}:{name}` → Registers scheduled job
 * - `agent.tool:{name}` → Registers MCP tool
 *
 * @example
 * ```typescript
 * defineAction({
 *   trigger: "http.post:/api/webhooks/stripe",
 *   description: "Handle Stripe webhook events",
 *   run: async ({ payload, db }) => {
 *     await db.insert(payments).values({ ...payload });
 *     return { received: true };
 *   },
 * });
 * ```
 */
export function defineAction<TPayload = unknown, TResult = unknown>(
  definition: ActionDefinition<TPayload, TResult>
): ActionDefinition<TPayload, TResult> {
  return globalRegistry.define(definition);
}

/**
 * List all registered actions
 */
export function listDefinedActions(): Array<{ trigger: string; definition: ActionDefinition }> {
  return globalRegistry.list();
}

/**
 * Get a specific action by trigger
 */
export function getAction(trigger: string): ActionDefinition | undefined {
  return globalRegistry.get(trigger);
}

/**
 * Initialize actions system with infrastructure
 *
 * @example
 * ```typescript
 * import { Hono } from "hono";
 * import { initActions } from "@kitsuden/engine/actions";
 *
 * const app = new Hono();
 *
 * initActions({
 *   hono: app,
 *   mcp: mcpServer, // optional
 * });
 * // Los `event:` no necesitan nada: van a la cola de Postgres del host.
 * ```
 */
export interface ActionsInitOptions {
  /** Hono app instance */
  hono?: Hono;
  /** MCP server instance */
  mcp?: any;
}

export function initActions(options: ActionsInitOptions): void {
  if (options.hono) {
    globalRegistry.useHono(options.hono);
  }
  if (options.mcp) {
    globalRegistry.useMCP(options.mcp);
  }

  // eslint-disable-next-line no-console -- log de arranque/registro: visible a propósito en boot (el logger del host no es accesible desde el engine sin crear un ciclo)
  console.log("\n⚡ Actions Engine initialized");
}

/**
 * Shutdown actions system gracefully
 */
export async function shutdownActions(): Promise<void> {
  await globalRegistry.shutdown();
}

/**
 * List MCP tools (for MCP server tools/list handler)
 */
export function listMCPTools(): Array<{
  name: string;
  description: string;
  inputSchema: InputSchema;
}> {
  return globalRegistry.listMCPTools();
}

/**
 * Execute an MCP tool (for MCP server tools/call handler)
 */
export async function executeMCPTool(name: string, args: any, extra: any): Promise<any> {
  return globalRegistry.executeMCPTool(name, args, extra);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE INFERENCE HELPERS (for better DX)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Helper to extract payload type from HTTP trigger
 */
export type InferHttpPayload<T extends string> = T extends `http.post:${infer Path}`
  ? Path extends `/webhooks/${string}`
    ? { event: string; data: Record<string, unknown> }
    : Record<string, unknown>
  : T extends `http.get:${infer Path}`
    ? Path extends `${string}?${string}`
      ? Record<string, string>
      : Record<string, never>
    : Record<string, unknown>;

/**
 * Helper to create typed action definition
 */
export function defineTypedAction<TPayload, TResult = unknown>(
  definition: ActionDefinition<TPayload, TResult>
): ActionDefinition<TPayload, TResult> {
  return globalRegistry.define(definition);
}

// Types already exported above via 'export interface' declarations

// Re-export validation types for convenience
export type {
  ValidationSchema,
  ValidationResult,
  ValidationError,
  ValidationRule,
} from "./validator";
