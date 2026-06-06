/**
 * Webhook Out Action Handler
 *
 * Sends HTTP requests to external services.
 * Handles retries, signatures, and response tracking.
 */

import { createHmac } from "crypto";

import type { Action, ActionContext, ActionResult } from "../types";

interface WebhookOutConfig {
  url: string;
  headers?: Record<string, string>;
  secret?: string;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
}

export async function executeWebhookOutAction(
  action: Action,
  context: ActionContext
): Promise<ActionResult> {
  const startTime = Date.now();

  const config = action.config as WebhookOutConfig;

  if (!config.url) {
    return {
      success: false,
      error: "No URL configured for webhook",
      durationMs: Date.now() - startTime,
    };
  }

  // Build payload
  const payload = {
    event: context.event?.name,
    data: context.event?.data,
    timestamp: new Date().toISOString(),
    action: {
      id: context.actionId,
      name: context.actionName,
    },
  };

  const body = JSON.stringify(payload);

  // Build headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Gremius-Actions/1.0",
    "X-Gremius-Action-ID": context.actionId,
    "X-Gremius-Execution-ID": context.executionId,
    "X-Gremius-Timestamp": payload.timestamp,
    ...config.headers,
  };

  // Add signature if secret is configured
  if (config.secret) {
    const signature = createHmac("sha256", config.secret).update(body).digest("hex");
    headers["X-Gremius-Signature"] = `sha256=${signature}`;
  }

  // Execute request with retry logic
  const maxRetries = config.retryPolicy?.maxRetries ?? 3;
  const backoffMs = config.retryPolicy?.backoffMs ?? 1000;

  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const response = await fetch(config.url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(30000), // 30s timeout
      });

      const responseBody = await response.text();
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(responseBody);
      } catch {
        parsedBody = responseBody;
      }

      const result: ActionResult = {
        success: response.ok,
        durationMs: Date.now() - startTime,
        httpResponse: {
          statusCode: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: parsedBody,
        },
      };

      if (!response.ok) {
        result.error = `HTTP ${response.status}: ${responseBody}`;
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      attempt++;

      if (attempt <= maxRetries) {
        // Exponential backoff
        const delay = backoffMs * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  return {
    success: false,
    error: `Failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
    durationMs: Date.now() - startTime,
  };
}
