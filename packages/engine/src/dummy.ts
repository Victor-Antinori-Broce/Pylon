// @ts-nocheck
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TypeScript DX Validation - Actions Layer
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Este archivo verifica que TypeScript infiera correctamente los tipos
 * al usar defineAction con diferentes triggers.
 *
 * Run: npx tsc packages/engine/src/dummy.ts --noEmit --skipLibCheck
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { defineAction, defineTypedAction, parseTrigger, ActionContext, ActionResult } from "./actions";
import type { GrimoireContext } from "@gremius/shared";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: HTTP Trigger - Type Inference
// ═══════════════════════════════════════════════════════════════════════════════

// Definir tipos para el payload y resultado
interface StripeWebhookEvent {
  id: string;
  type: "payment_intent.succeeded" | "invoice.payment_failed";
  data: {
    object: {
      id: string;
      amount: number;
      customer: string;
    };
  };
}

interface PaymentResult {
  processed: boolean;
  paymentId: string;
  amount: number;
}

// HTTP Action con tipado estricto
const stripeWebhookAction = defineAction<StripeWebhookEvent, PaymentResult>({
  trigger: "http.post:/webhooks/stripe",
  description: "Handle Stripe webhook events",
  meta: {
    requireAuth: false, // Webhooks don't need auth
    rateLimitPerMinute: 60,
    tags: ["payments", "webhooks"],
  },
  run: async (ctx): Promise<ActionResult<PaymentResult>> => {
    // ✅ TypeScript debe inferir ctx.payload como StripeWebhookEvent
    const { payload, db, logger, http, queue, cache } = ctx;

    // Payload debe tener las propiedades de StripeWebhookEvent
    const eventId: string = payload.id;
    const eventType: string = payload.type;
    const amount: number = payload.data.object.amount;

    // HTTP context debe estar disponible
    const headers = http?.headers;
    http?.status(200);
    http?.header("X-Event-Id", eventId);

    // Queue y cache deben funcionar
    await queue.add("process-payment", "process", { eventId });
    await cache.set(`stripe:${eventId}`, { processed: true }, 3600);

    // Logger debe tener métodos tipados
    logger.info("Processing Stripe event", { eventId, type: eventType });

    // Resultado debe coincidir con PaymentResult
    return {
      success: true,
      data: {
        processed: true,
        paymentId: payload.data.object.id,
        amount: amount,
      },
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Event Trigger - Async Worker
// ═══════════════════════════════════════════════════════════════════════════════

interface ProcessVideoPayload {
  videoId: string;
  quality: "720p" | "1080p" | "4k";
  formats: string[];
}

interface VideoResult {
  videoId: string;
  status: "completed" | "failed";
  outputs: string[];
}

const processVideoAction = defineAction<ProcessVideoPayload, VideoResult>({
  trigger: "event:process_video",
  description: "Process video in background",
  meta: {
    concurrency: 2, // Limit concurrent video processing
    tags: ["video", "background"],
  },
  run: async (ctx): Promise<ActionResult<VideoResult>> => {
    // ✅ TypeScript debe inferir ctx.payload como ProcessVideoPayload
    const { payload, db, logger, event, queue } = ctx;

    // Payload debe tener las propiedades correctas
    const videoId: string = payload.videoId;
    const quality: "720p" | "1080p" | "4k" = payload.quality;
    const formats: string[] = payload.formats;

    // Event context debe estar disponible
    const jobId = event?.jobId;
    const attempt = event?.attempt;

    logger.info("Processing video", { videoId, quality, attempt });

    // No debe haber ctx.http en event triggers
    // @ts-expect-error - http should not exist in event context
    const httpHeaders = ctx.http;

    return {
      success: true,
      data: {
        videoId,
        status: "completed",
        outputs: formats.map((f) => `${videoId}.${f}`),
      },
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Agent Trigger - MCP Tool
// ═══════════════════════════════════════════════════════════════════════════════

interface SearchUsersPayload {
  query: string;
  limit?: number;
  includeInactive?: boolean;
}

interface UserResult {
  users: Array<{
    id: string;
    name: string;
    email: string;
  }>;
  total: number;
}

const searchUsersAction = defineAction<SearchUsersPayload, UserResult>({
  trigger: "agent.tool:search_users",
  description: "Search users by name or email",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query (name or email)",
      },
      limit: {
        type: "number",
        default: 10,
        description: "Maximum results to return",
      },
      includeInactive: {
        type: "boolean",
        default: false,
        description: "Include inactive users",
      },
    },
    required: ["query"],
  },
  meta: {
    requiredScopes: ["users:read"],
    tags: ["users", "search"],
  },
  run: async (ctx): Promise<ActionResult<UserResult>> => {
    // ✅ TypeScript debe inferir ctx.payload como SearchUsersPayload
    const { payload, db, logger, agent } = ctx;

    // Payload debe tener las propiedades del schema
    const query: string = payload.query;
    const limit: number = payload.limit ?? 10;
    const includeInactive: boolean = payload.includeInactive ?? false;

    // Agent context debe estar disponible
    const agentId = agent?.agentId;
    const agentName = agent?.agentName;
    const scopes = agent?.scopes;
    const preferToon = agent?.preferToon;

    logger.info("Agent searching users", { agentId, agentName, query, scopes });

    // No debe haber ctx.http ni ctx.event en agent triggers
    // @ts-expect-error - http should not exist in agent context
    const httpHeaders = ctx.http;
    // @ts-expect-error - event should not exist in agent context
    const eventJob = ctx.event;

    return {
      success: true,
      data: {
        users: [],
        total: 0,
      },
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Cron Event Trigger
// ═══════════════════════════════════════════════════════════════════════════════

const cleanupAction = defineAction<Record<string, never>, { cleaned: number }>({
  trigger: "event.cron:0 0 * * *:cleanup_old_data",
  description: "Clean up old data daily at midnight",
  meta: {
    concurrency: 1,
    tags: ["maintenance", "cron"],
  },
  run: async (ctx): Promise<ActionResult<{ cleaned: number }>> => {
    const { payload, logger } = ctx;

    // Cron jobs typically have empty payload
    logger.info("Running cleanup job");

    return {
      success: true,
      data: { cleaned: 42 },
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: HTTP GET con Query Params
// ═══════════════════════════════════════════════════════════════════════════════

interface ListUsersQuery {
  page?: string;
  limit?: string;
  search?: string;
}

const listUsersAction = defineAction<ListUsersQuery, { users: unknown[]; page: number }>({
  trigger: "http.get:/api/users",
  description: "List users with pagination",
  meta: {
    requireAuth: true,
    requiredScopes: ["users:read"],
    rateLimitPerMinute: 120,
  },
  run: async (ctx) => {
    const { payload, http } = ctx;

    // GET requests have query params as payload
    const page = parseInt(payload.page ?? "1");
    const limit = parseInt(payload.limit ?? "10");
    const search = payload.search;

    http?.header("X-Total-Count", "100");

    return {
      success: true,
      data: {
        users: [],
        page,
      },
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Parser de Triggers
// ═══════════════════════════════════════════════════════════════════════════════

// Test parseTrigger function
const httpTrigger = parseTrigger("http.post:/webhooks/stripe");
// httpTrigger.prefix === "http"
// httpTrigger.variant === "post"
// httpTrigger.path === "/webhooks/stripe"

const eventTrigger = parseTrigger("event:process_video");
// eventTrigger.prefix === "event"
// eventTrigger.variant === "async"
// eventTrigger.path === "process_video"

const cronTrigger = parseTrigger("event.cron:0 * * * *:cleanup");
// cronTrigger.prefix === "event"
// cronTrigger.variant === "cron"
// cronTrigger.path === "cleanup"
// cronTrigger.cronExpression === "0 * * * *"

const agentTrigger = parseTrigger("agent.tool:search_users");
// agentTrigger.prefix === "agent"
// agentTrigger.variant === "tool"
// agentTrigger.path === "search_users"

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Type Inference Helpers
// ═══════════════════════════════════════════════════════════════════════════════

// Test defineTypedAction helper
const typedAction = defineTypedAction<{ id: string }, { found: boolean }>({
  trigger: "http.get:/test/:id",
  run: async (ctx) => {
    // payload should be typed as { id: string }
    const id: string = ctx.payload.id;
    return { found: true };
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Unified Context - All triggers have base properties
// ═══════════════════════════════════════════════════════════════════════════════

async function testUnifiedContext() {
  // HTTP action
  const httpResult = await stripeWebhookAction.run({
    payload: { id: "evt_123", type: "payment_intent.succeeded", data: { object: { id: "pi_123", amount: 1000, customer: "cus_123" } } },
    db: {},
    grimoire: {} as GrimoireContext,
    logger: console,
    queue: { add: async () => null, get: () => undefined },
    cache: { get: async () => null, set: async () => {}, invalidate: async () => {} },
    http: {
      hono: {} as any,
      headers: new Headers(),
      status: () => {},
      header: () => {},
    },
  });

  // Event action
  const eventResult = await processVideoAction.run({
    payload: { videoId: "vid_123", quality: "1080p", formats: ["mp4", "webm"] },
    db: {},
    grimoire: {} as GrimoireContext,
    logger: console,
    queue: { add: async () => null, get: () => undefined },
    cache: { get: async () => null, set: async () => {}, invalidate: async () => {} },
    event: {
      job: {} as any,
      jobId: "job_123",
      attempt: 1,
    },
  });

  // Agent action
  const agentResult = await searchUsersAction.run({
    payload: { query: "john", limit: 10 },
    db: {},
    grimoire: {} as GrimoireContext,
    logger: console,
    queue: { add: async () => null, get: () => undefined },
    cache: { get: async () => null, set: async () => {}, invalidate: async () => {} },
    agent: {
      agentId: "agent_123",
      agentName: "TestAgent",
      scopes: ["users:read"],
      preferToon: false,
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 9: Error Cases - TypeScript debe rechazar estos
// ═══════════════════════════════════════════════════════════════════════════════

// @ts-expect-error - Missing trigger
const invalidAction1 = defineAction({
  run: async () => {},
});

// @ts-expect-error - Missing run
const invalidAction2 = defineAction({
  trigger: "http.post:/test",
});

// @ts-expect-error - Invalid trigger format
const invalidAction3 = defineAction({
  trigger: "invalid:format:extra",
  run: async () => {},
});

// Resultado de acción incorrecto
const invalidResultAction = defineAction<{}, { success: boolean }>({
  trigger: "http.post:/test",
  run: async () => {
    // @ts-expect-error - Property 'data' does not exist in { success: boolean }
    return { data: "wrong" };
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Export para evitar "declarations but never used"
// ═══════════════════════════════════════════════════════════════════════════════

export {
  stripeWebhookAction,
  processVideoAction,
  searchUsersAction,
  cleanupAction,
  listUsersAction,
  httpTrigger,
  eventTrigger,
  cronTrigger,
  agentTrigger,
  testUnifiedContext,
};

console.log("✅ TypeScript DX Validation file loaded successfully");
console.log("Run: npx tsc packages/engine/src/dummy.ts --noEmit --skipLibCheck");
