/**
 * GremiusCMS — Async Queue Infrastructure
 *
 * Powered by BullMQ + DragonflyDB (Redis-compatible).
 *
 * Design: FULLY fail-safe.
 *   - If Redis is down, the API starts normally.
 *   - Queue/Worker creation is LAZY — only happens when Redis is reachable.
 *   - Jobs dispatched while Redis is down are silently dropped (logged).
 */

import { Queue, Worker, type Processor, type ConnectionOptions } from "bullmq";

// ── Shared Connection ──
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

function parseRedisUrl(url: string): ConnectionOptions {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "localhost",
      port: Number(parsed.port) || 6379,
      password: parsed.password || undefined,
      username: parsed.username || undefined,
    };
  } catch {
    return { host: "localhost", port: 6379 };
  }
}

const connection: ConnectionOptions = parseRedisUrl(REDIS_URL);

// ── Redis availability check ──
let redisAvailable: boolean | null = null;

async function checkRedis(): Promise<boolean> {
  if (redisAvailable !== null) return redisAvailable;

  try {
    const net = await import("net");
    return new Promise((resolve) => {
      const socket = net.createConnection({
        host: connection.host as string,
        port: connection.port as number,
      });
      socket.setTimeout(2000);
      socket.on("connect", () => {
        socket.destroy();
        redisAvailable = true;
        resolve(true);
      });
      socket.on("error", () => {
        socket.destroy();
        redisAvailable = false;
        resolve(false);
      });
      socket.on("timeout", () => {
        socket.destroy();
        redisAvailable = false;
        resolve(false);
      });
    });
  } catch {
    redisAvailable = false;
    return false;
  }
}

// ── Queue Factory (lazy) ──
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
      // Reset after 60s to allow re-logging if it's a new issue
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
 */
export const emailQueue = {
  async add(name: string, data: EmailJobData & Record<string, any>) {
    const available = await checkRedis();
    if (!available) {
      console.warn(`  📧 [QUEUE OFFLINE] Redis unavailable — skipping job "${name}" for ${data.to}`);
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
    try {
      const queue = getQueue<EmailJobData>("gremius-email");
      return await queue.getWaitingCount();
    } catch { return 0; }
  },

  async getActiveCount() {
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

  // Check Redis first
  const available = await checkRedis();
  if (!available) {
    console.warn("⚙️  Redis not available — workers will NOT start.");
    console.warn(`   Redis URL: ${REDIS_URL}`);
    console.warn("   Run 'pnpm docker:infra' to start DragonflyDB.\n");
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
    await queue.close();
    console.log(`  🔌 Queue ${name} closed`);
  }
}
