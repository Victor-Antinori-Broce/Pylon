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
import { Worker, type Processor } from "bullmq";
export declare function createWorker<T = unknown>(name: string, processor: Processor<T>, opts?: {
    concurrency?: number;
}): Worker<T>;
export interface EmailJobData {
    to: string;
    subject: string;
    html: string;
    text?: string;
}
export interface WebhookJobData {
    url: string;
    event: string;
    payload: Record<string, unknown>;
}
/**
 * Safe email queue — wraps BullMQ Queue with fail-safe add().
 * If Redis is down, jobs are logged and dropped (not queued).
 * NEVER creates a Queue instance unless Redis is confirmed available.
 */
export declare const emailQueue: {
    add(name: string, data: EmailJobData & Record<string, unknown>): Promise<any>;
    getWaitingCount(): Promise<any>;
    getActiveCount(): Promise<any>;
};
export declare function setupWorkers(): Promise<void>;
export declare function shutdownQueues(): Promise<void>;
//# sourceMappingURL=queue.d.ts.map