/**
 * Webhook In Action Handler
 *
 * Handles incoming webhook requests.
 * Validates signatures, parses requests, and executes associated actions.
 */
import type { Action, ActionContext, ActionResult } from "../types";
export interface WebhookInRequest {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: unknown;
}
export declare function executeWebhookInAction(action: Action, context: ActionContext, _webhookRequest: WebhookInRequest): Promise<ActionResult>;
//# sourceMappingURL=webhook-in-handler.d.ts.map