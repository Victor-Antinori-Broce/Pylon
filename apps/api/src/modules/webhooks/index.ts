/**
 * Webhooks Engine — Module Barrel
 *
 * Exports the Hono router and init function for the module-loader.
 * Convention: module-loader auto-discovers the Hono router export
 * and calls any function prefixed with `init`.
 */

import { Hono } from "hono";
import { webhooksRoutes } from "./webhooks.routes";
import { initWebhookListeners } from "./webhooks.service";
import { registerWebhookWorker } from "./webhooks.worker";

// ── Hono Sub-App ─────────────────────────────────────────────
// Mounted at /api/custom by the module-loader, but we also
// export it for direct mounting at /api/webhooks in index.ts.

const app = new Hono();
app.route("/webhooks", webhooksRoutes);

export const webhookModuleRoutes = app;

// ── Init Function (called by module-loader) ──────────────────

export async function initWebhooks() {
    // 1. Register event listeners (EventEmitter → Queue)
    initWebhookListeners();

    // 2. Start background worker (Queue → HTTP POST)
    registerWebhookWorker();

    console.log("  🪝 Webhook Engine initialized");
}
