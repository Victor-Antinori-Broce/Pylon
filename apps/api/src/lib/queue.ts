/**
 * GremiusCMS — Async Queue Infrastructure
 *
 * Powered by BullMQ + Valkey (Redis-compatible, open-source fork).
 *
 * Design: FULLY fail-safe.
 *   - If Valkey is down, the API starts normally — NO crashes, NO error loops.
 *   - Queue/Worker creation is LAZY — only happens when Valkey is reachable.
 *   - Jobs dispatched while Valkey is down are silently dropped (logged once).
 *   - Health check returns "disconnected" instead of crashing.
 */

import { Queue, Worker, type Processor, type ConnectionOptions } from "bullmq";
import { valkeyConnection, isValkeyAvailable, VALKEY_URL } from "./valkey";

const connection: ConnectionOptions = valkeyConnection;

// ── Valkey availability (delegated to valkey.ts) ──
const checkRedis = isValkeyAvailable;

// ── Queue Factory (lazy, only when Redis is confirmed available) ──
const queueRegistry = new Map<string, Queue>();

function getQueue<T = any>(name: string): Queue<T> {
  if (queueRegistry.has(name)) return queueRegistry.get(name) as Queue<T>;

  const queue = new Queue<T>(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });

  // Suppress connection error spam from Queue instances
  queue.on("error", () => {
    // Silenced — we handle availability via checkRedis()
  });

  queueRegistry.set(name, queue);
  return queue;
}

// ── Worker Factory ──
export function createWorker<T = any>(
  name: string,
  processor: Processor<T>,
  opts: { concurrency?: number } = {}
): Worker<T> {
  const worker = new Worker<T>(name, processor, {
    connection,
    concurrency: opts.concurrency ?? 3,
  });

  worker.on("completed", (job) => {
    console.log(`  ✅ [${name}] Job ${job.id} (${job.name}) completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`  ❌ [${name}] Job ${job?.id} (${job?.name}) failed: ${err.message}`);
  });

  // Suppress noisy reconnect errors — just log once
  let errorLogged = false;
  worker.on("error", (err) => {
    if (!errorLogged) {
      console.warn(`  ⚠️  [${name}] Worker connection error (suppressing repeats): ${err.message}`);
      errorLogged = true;
      setTimeout(() => { errorLogged = false; }, 60000);
    }
  });

  console.log(`  🔧 [Worker] ${name} registered (concurrency: ${opts.concurrency ?? 3})`);
  return worker;
}

// ═══════════════════════════════════════════════
// Named Queue Exports — SAFE proxy objects
// ═══════════════════════════════════════════════

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface WebhookJobData {
  url: string;
  event: string;
  payload: Record<string, any>;
}

/**
 * Safe email queue — wraps BullMQ Queue with fail-safe add().
 * If Redis is down, jobs are logged and dropped (not queued).
 * NEVER creates a Queue instance unless Redis is confirmed available.
 */
export const emailQueue = {
  async add(name: string, data: EmailJobData & Record<string, any>) {
    const available = await checkRedis();
    if (!available) {
      console.warn(`  📧 [QUEUE OFFLINE] Valkey unavailable — skipping job "${name}" for ${data.to}`);
      return null;
    }
    try {
      const queue = getQueue<EmailJobData>("gremius-email");
      return await queue.add(name, data);
    } catch (err: any) {
      console.warn(`  📧 [QUEUE ERROR] Could not enqueue "${name}": ${err.message}`);
      return null;
    }
  },

  async getWaitingCount() {
    const available = await checkRedis();
    if (!available) return 0;
    try {
      const queue = getQueue<EmailJobData>("gremius-email");
      return await queue.getWaitingCount();
    } catch { return 0; }
  },

  async getActiveCount() {
    const available = await checkRedis();
    if (!available) return 0;
    try {
      const queue = getQueue<EmailJobData>("gremius-email");
      return await queue.getActiveCount();
    } catch { return 0; }
  },
};

// ═══════════════════════════════════════════════
// Worker Bootstrap
// ═══════════════════════════════════════════════

let workersInitialized = false;

export async function setupWorkers(): Promise<void> {
  if (workersInitialized) return;
  workersInitialized = true;

  console.log("\n⚙️  Starting background workers...");

  const available = await checkRedis();
  if (!available) {
    console.warn("⚙️  Valkey not available — workers will NOT start.");
    console.warn(`   Valkey URL: ${VALKEY_URL}`);
    console.warn("   Run 'pnpm docker:infra' to start Valkey.\n");
    return;
  }

  try {
    const { registerEmailWorker } = await import("../jobs/email");
    registerEmailWorker();
    console.log("⚙️  All workers running.\n");
  } catch (err: any) {
    console.error(`⚙️  Worker startup error (non-fatal): ${err.message}`);
  }
}

export async function shutdownQueues(): Promise<void> {
  for (const [name, queue] of queueRegistry) {
    try {
      await queue.close();
      console.log(`  🔌 Queue ${name} closed`);
    } catch {
      // Already closed or disconnected
    }
  }
}
