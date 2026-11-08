/**
 * Webhook Out Action Handler
 *
 * Sends HTTP requests to external services.
 * Handles retries, signatures, and response tracking.
 */

import { createHmac } from "crypto";

import {
  ErrorDeSalida,
  hostDeUrl,
  hostEnLista,
  peticionSaliente,
  resolverDestino,
  validarUrlSaliente,
} from "../../salida-segura";
import type { Action, ActionContext, ActionResult } from "../types";

/** Tope de la respuesta que se guarda (el mismo que el `fetch` del sandbox). */
const RESPUESTA_MAXIMA = 1_000_000;
const TIEMPO_MAXIMO_MS = 30_000;

/**
 * Hosts INTERNOS a los que un `webhook_out` sí puede llamar (auditoría 2026-11-04, F7):
 * `KITSUDEN_WEBHOOK_ALLOW_INTERNAL=n8n,*.interno.lan,10.0.0.5`. Sin esta lista,
 * un webhook solo sale a direcciones públicas (nada de localhost, la red de
 * Docker ni los metadatos de la nube). Es un opt-in de quien despliega: la
 * config de una acción la escribe un admin o un agente con scope `admin`.
 */
export function hostsInternosDeWebhook(): string[] {
  return (process.env.KITSUDEN_WEBHOOK_ALLOW_INTERNAL ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function internoPermitido(url: URL): boolean {
  return hostEnLista(hostDeUrl(url), hostsInternosDeWebhook());
}

/**
 * Validación de `config.url` al crear o editar la acción: forma (http/https,
 * sin credenciales) y, si el nombre resuelve, que no sea una dirección interna
 * fuera de la lista. Un nombre que aún no resuelve se deja pasar: al enviar se
 * vuelve a comprobar (y es esa comprobación la que manda). `null` = vale.
 */
export async function problemaDeUrlDeWebhook(valor: unknown): Promise<string | null> {
  if (typeof valor !== "string" || !valor.trim()) return "config.url is required for webhook_out actions";
  let url: URL;
  try {
    url = validarUrlSaliente(valor.trim());
  } catch (err) {
    return `config.url: ${(err as Error).message}`;
  }
  if (internoPermitido(url)) return null;
  try {
    await resolverDestino(url);
  } catch (err) {
    const texto = (err as Error).message;
    if (/non-public/.test(texto)) {
      return `config.url: ${texto} (internal hosts must be listed in KITSUDEN_WEBHOOK_ALLOW_INTERNAL)`;
    }
  }
  return null;
}

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
    "User-Agent": "Kitsuden-Actions/1.0",
    "X-Kitsuden-Action-ID": context.actionId,
    "X-Kitsuden-Execution-ID": context.executionId,
    "X-Kitsuden-Timestamp": payload.timestamp,
    ...config.headers,
  };

  // Add signature if secret is configured
  if (config.secret) {
    const signature = createHmac("sha256", config.secret).update(body).digest("hex");
    headers["X-Kitsuden-Signature"] = `sha256=${signature}`;
  }

  // Execute request with retry logic
  const maxRetries = config.retryPolicy?.maxRetries ?? 3;
  const backoffMs = config.retryPolicy?.backoffMs ?? 1000;

  let lastError: Error | null = null;
  let attempt = 0;

  // Forma de la URL: si no vale, no hay reintento que la arregle.
  let url: URL;
  try {
    url = validarUrlSaliente(config.url);
  } catch (err) {
    return { success: false, error: `Invalid webhook URL: ${(err as Error).message}`, durationMs: Date.now() - startTime };
  }
  const permitirInternos = internoPermitido(url);

  while (attempt <= maxRetries) {
    try {
      // Resuelve una vez, rechaza lo no público y conecta a ESA dirección
      // (Host y SNI = el nombre). Sin seguir redirecciones (lib/salida-segura.ts).
      const response = await peticionSaliente(url, {
        method: "POST",
        headers,
        body,
        timeoutMs: TIEMPO_MAXIMO_MS,
        maxBytes: RESPUESTA_MAXIMA,
        permitirInternos,
      });

      const responseBody = response.body;
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
          headers: response.headers,
          body: parsedBody,
        },
      };

      if (!response.ok) {
        result.error = `HTTP ${response.status}: ${responseBody}`;
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // Destino prohibido o respuesta demasiado grande: reintentar no cambia nada.
      if (error instanceof ErrorDeSalida && /non-public|too large|Invalid URL|not allowed/.test(error.message)) {
        return { success: false, error: error.message, durationMs: Date.now() - startTime };
      }
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
