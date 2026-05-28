/**
 * GremiusCMS — Email Worker (Fail-Safe)
 *
 * Processes jobs from the gremius-email queue.
 *
 * TWO MODES:
 *   🟢 Live Mode  — SMTP credentials exist → sends real emails via nodemailer
 *   🟡 Mock Mode  — No SMTP credentials    → logs to console, job succeeds
 *
 * NEVER crashes if SMTP is missing. This is by design.
 */
export declare function registerEmailWorker(): Worker<T>;
//# sourceMappingURL=email.d.ts.map