/**
 * @gremius/core — Webhooks Engine
 *
 * Core infrastructure piece: Event-driven HTTP callbacks
 * for external integrations (n8n, Zapier, etc.) with retry logic.
 *
 * Layer: Core (toggleable via gremius.config.ts)
 * Mount: /api/custom/webhooks (via module-loader)
 *
 * Implementation: apps/api/src/modules/webhooks/
 */

export { webhookModuleRoutes, initWebhooks } from "../../../apps/api/src/modules/webhooks";
