// @ts-nocheck
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Gremius Engine — Actions Layer (Nivel 1: Core Infrastructure)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Abstracción unificada para definir acciones que pueden ejecutarse vía:
 *   - HTTP (Hono routes)
 *   - Eventos asíncronos (BullMQ workers)
 *   - Agentes LLM (MCP tools)
 *
 * Design Goals:
 *   1. Zero-leak abstraction: El desarrollador no ve BullMQ, Hono o MCP
 *   2. Type inference: El payload se infiere del trigger
 *   3. Unified context: Sin importar el trigger, la función run recibe el mismo ctx
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * @example
 * ```typescript
 * import { defineAction } from "@gremius/engine/actions";
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
 *     // Ejecutado en BullMQ worker
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

import type { Hono, Context as HonoContext } from "hono";
import type { Worker, Job, Queue } from "bullmq";
import type { GrimoireContext } from "@gremius/shared";
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
  /** Grimoire context (full DI context) */
  grimoire: GrimoireContext;
  /** Logger instance */
  logger: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
    debug: (msg: string, meta?: Record<string, unknown>) => void;
  };
  /** Queue dispatcher (for enqueueing new jobs) */
  queue: {
    /** Add a job to a queue */
    add: <T = any>(queueName: string, jobName: string, data: T) => Promise<Job<T> | null>;
    /** Get queue instance */
    get: (name: string) => Queue | undefined;
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
    /** BullMQ job instance */
    job: Job;
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
  properties?: Record<string, {
    type: string;
    description?: string;
    default?: unknown;
    enum?: unknown[];
    items?: InputSchema;
    required?: string[];
  }>;
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
    throw new Error(
      `Invalid trigger prefix: "${prefix}". Must be one of: http, event, agent`
    );
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
          grimoire: c.get("grimoireContext") as GrimoireContext,
          http: {
            hono: c,
            headers: c.req.header() as any,
            status: (code: number) => { c.status(code as any); },
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
      } catch (err: any) {
        ctx!.logger.error(`Action failed: ${trigger.raw}`, { error: err.message });
        return c.json(
          {
            success: false,
            error: err.message,
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

    console.log(`  🔷 [Actions] HTTP ${method.toUpperCase()} ${path} registered`);
  }
}

/**
 * BullMQ Event Adapter
 */
class BullMQAdapter implements ActionAdapter {
  private workers: Map<string, Worker> = new Map();
  private queues: Map<string, Queue> = new Map();
  private connection: any = null;
  private isInitialized = false;

  setConnection(connection: any) {
    this.connection = connection;
    this.isInitialized = true;
  }

  isReady(): boolean {
    return this.isInitialized && this.connection !== null;
  }

  register<TPayload, TResult>(
    trigger: ParsedTrigger,
    definition: ActionDefinition<TPayload, TResult>
  ): void {
    if (!this.isReady()) {
      console.warn(`  ⚠️  [Actions] BullMQ not ready, skipping event: ${trigger.path}`);
      return;
    }

    const queueName = `gremius:actions:${trigger.path}`;
    const concurrency = definition.meta?.concurrency ?? 3;

    // Create queue if not exists
    if (!this.queues.has(queueName)) {
      const { Queue } = require("bullmq");
      const queue = new Queue(queueName, { connection: this.connection });
      this.queues.set(queueName, queue);
    }

    // Create worker
    const { Worker } = require("bullmq");
    const worker = new Worker(
      queueName,
      async (job: Job<TPayload>) => {
        const ctx = buildActionContext({
          payload: job.data,
          grimoire: null as any, // Will be injected by engine
          event: {
            job,
            jobId: job.id ?? "unknown",
            attempt: job.attemptsMade + 1,
          },
        });

        const result = await definition.run(ctx as ActionContext<TPayload>);
        return normalizeResult(result);
      },
      { connection: this.connection, concurrency }
    );

    worker.on("completed", (job: Job) => {
      console.log(`  ✅ [Action Worker] ${trigger.path}#${job.id} completed`);
    });

    worker.on("failed", (job: Job | undefined, err: Error) => {
      console.error(`  ❌ [Action Worker] ${trigger.path}#${job?.id} failed: ${err.message}`);
    });

    this.workers.set(trigger.path, worker);
    console.log(`  🔷 [Actions] Event worker "${trigger.path}" registered (concurrency: ${concurrency})`);
  }

  async shutdown(): Promise<void> {
    for (const [name, worker] of Array.from(this.workers.entries())) {
      await worker.close();
      console.log(`  🔌 [Actions] Worker "${name}" closed`);
    }
    for (const [name, queue] of Array.from(this.queues.entries())) {
      await queue.close();
      console.log(`  🔌 [Actions] Queue "${name}" closed`);
    }
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
        // Generate traceId for agent tool execution (telemetry)
        const traceId = extra?.traceId || generateUUID();
        
        const ctx = buildActionContext({
          payload: args,
          grimoire: null as any,
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
                ? JSON.stringify(normalized.data, null, 2)
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

    // Generate traceId for agent tool execution (telemetry)
    const traceId = extra?.traceId || generateUUID();

    const ctx = buildActionContext({
      payload: args,
      grimoire: null as any,
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
            ? JSON.stringify(normalized.data, null, 2)
            : `Error: ${normalized.error}`,
        },
      ],
      isError: !normalized.success,
    };
  }
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
      const validationResult = validate(ctx.payload as Record<string, any>, validationSchema);

      if (!validationResult.valid) {
        ctx.logger.warn(`Validation failed for action: ${definition.trigger}`, {
          errors: validationResult.errors,
        });

        // Return validation error as ActionResult
        return {
          success: false,
          error: `Validation failed: ${validationResult.errors.map(e => `${e.field}: ${e.message}`).join(", ")}`,
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
      const traceId = (ctx.grimoire as any)?.telemetry?.traceId as string | undefined;
      
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
      
      // Get step order (from grimoire telemetry state or default to 0)
      const telemetryState = (ctx.grimoire as any)?.telemetry;
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
        provider.updateStep(stepId, {
          toolOutput,
          durationMs,
        }).catch((err: any) => {
          ctx.logger.warn("Failed to update telemetry step", { error: err?.message, stepId });
        });

        return result;
      } catch (error: any) {
        const durationMs = Math.round(performance.now() - startTime);
        const errorMessage = error?.message || String(error);

        // Update step with error result (async, don't await)
        provider.updateStep(stepId, {
          toolOutput: { error: errorMessage },
          errorMessage,
          durationMs,
        }).catch((err: any) => {
          ctx.logger.warn("Failed to update telemetry step with error", { error: err?.message, stepId });
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
  grimoire: GrimoireContext;
  http?: ActionContext["http"];
  event?: ActionContext["event"];
  agent?: ActionContext["agent"];
  traceId?: string; // Optional traceId for telemetry
}

function buildActionContext<TPayload>(opts: ContextBuildOptions): ActionContext<TPayload> {
  const { payload, grimoire, http, event, agent, traceId } = opts;

  // Inject telemetry state into grimoire context if traceId provided
  const enhancedGrimoire = grimoire || {} as GrimoireContext;
  if (traceId && enhancedGrimoire) {
    (enhancedGrimoire as any).telemetry = {
      traceId,
      stepOrder: 0,
    };
  }

  return {
    payload: payload as TPayload,
    db: (enhancedGrimoire as any)?.db?.instance,
    grimoire: enhancedGrimoire,
    logger: (enhancedGrimoire as any)?.logger || console,
    queue: {
      add: async (_queueName, _jobName, _data) => {
        // Implementation would use BullMQ queue
        console.log(`[Queue] Adding job "${_jobName}" to "${_queueName}"`);
        return null;
      },
      get: (_name: string) => {
        // Return queue instance
        return undefined;
      },
    },
    cache: (enhancedGrimoire as any)?.cache || {
      get: async () => null,
      set: async () => { },
      invalidate: async () => { },
    },
    http,
    event,
    agent,
  };
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
  private bullAdapter = new BullMQAdapter();
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
        this.bullAdapter.register(trigger, wrappedDefinition);
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
   * Initialize with BullMQ connection
   */
  useBullMQ(connection: any): void {
    this.bullAdapter.setConnection(connection);
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
    await this.bullAdapter.shutdown();
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
 * - `event:{queueName}` → Registers BullMQ worker
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
 * import { initActions } from "@gremius/engine/actions";
 * import { valkeyConnection } from "./valkey";
 *
 * const app = new Hono();
 *
 * initActions({
 *   hono: app,
 *   bullmq: valkeyConnection,
 *   mcp: mcpServer, // optional
 * });
 * ```
 */
export interface ActionsInitOptions {
  /** Hono app instance */
  hono?: Hono;
  /** BullMQ connection options */
  bullmq?: any;
  /** MCP server instance */
  mcp?: any;
}

export function initActions(options: ActionsInitOptions): void {
  if (options.hono) {
    globalRegistry.useHono(options.hono);
  }
  if (options.bullmq) {
    globalRegistry.useBullMQ(options.bullmq);
  }
  if (options.mcp) {
    globalRegistry.useMCP(options.mcp);
  }

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
export function listMCPTools(): Array<{ name: string; description: string; inputSchema: InputSchema }> {
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
export type { ValidationSchema, ValidationResult, ValidationError, ValidationRule } from "./validator";
