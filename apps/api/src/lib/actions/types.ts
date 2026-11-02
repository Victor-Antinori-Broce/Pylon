/**
 * Actions Engine - Type Definitions
 *
 * Unified type system for the Actions engine.
 * This replaces the separate types for workers and webhooks.
 */

import type { actions, actionExecutions } from "../../db/schema";
import type { EjecutorDeAccion } from "../sandbox/identidad";

// ═══════════════════════════════════════════════════════════════════════════
// Database Types
// ═══════════════════════════════════════════════════════════════════════════

export type Action = typeof actions.$inferSelect;
export type ActionExecution = typeof actionExecutions.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════
// Action Types
// ═══════════════════════════════════════════════════════════════════════════

export type ActionType = "code" | "webhook_out" | "webhook_in" | "agent";
export type ActionTrigger = "manual" | "cron" | "event" | "http";
export type ActionStatus = "active" | "paused" | "error";

// ═══════════════════════════════════════════════════════════════════════════
// Trigger Configurations
// ═══════════════════════════════════════════════════════════════════════════

export interface CronTriggerConfig {
  cronExpression: string;
  timezone?: string;
}

export interface EventTriggerConfig {
  eventName: string; // "entry:created", "entry:updated", "post:published", etc.
  datasetId?: string; // Optional: filter by specific dataset
}

export interface HttpTriggerConfig {
  httpMethod: string; // "POST", "GET", "PUT", "DELETE"
  httpPath: string; // "/webhooks/stripe", "/custom/endpoint"
}

export type TriggerConfig =
  | CronTriggerConfig
  | EventTriggerConfig
  | HttpTriggerConfig
  | Record<string, never>; // For manual triggers

// ═══════════════════════════════════════════════════════════════════════════
// Action Configurations
// ═══════════════════════════════════════════════════════════════════════════

export interface CodeActionConfig {
  code: string;
  timeoutMs?: number;
  memoryLimitMb?: number;
  envVars?: Record<string, string>;
  /** Scopes de `kitsuden.api` para el código; sin ellos no hay API (docs/agents/sandbox.md). */
  scopes?: string[];
  /** Hosts a los que `fetch` puede llamar (`api.ejemplo.com`, `*.ejemplo.com`). */
  fetchAllow?: string[];
  /** Máximo de llamadas a fetch + API por ejecución (50 por defecto, 500 como mucho). */
  maxCalls?: number;
}

export interface WebhookOutConfig {
  url: string;
  headers?: Record<string, string>;
  secret?: string; // For HMAC signature
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
}

export interface WebhookInConfig {
  authType?: "none" | "hmac" | "bearer";
}

export interface AgentActionConfig {
  agentId: string;
  promptTemplate?: string;
  model?: string;
}

export type ActionConfig =
  | CodeActionConfig
  | WebhookOutConfig
  | WebhookInConfig
  | AgentActionConfig
  | Record<string, unknown>;

// ═══════════════════════════════════════════════════════════════════════════
// Execution Context
// ═══════════════════════════════════════════════════════════════════════════

export interface ActionContext {
  // Action metadata
  actionId: string;
  actionName: string;
  actionType: ActionType;

  // Trigger information
  trigger: ActionTrigger;
  triggerEvent?: string;

  // Event payload (for event triggers)
  event?: {
    name: string;
    data: Record<string, unknown>;
    timestamp: string;
  };

  // HTTP request (for http triggers)
  request?: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: unknown;
    query: Record<string, string>;
  };

  // Environment variables
  env: Record<string, string>;

  /**
   * Quién pidió la ejecución (rutas). Cron y eventos no lo traen: entonces
   * responde quien creó la acción. Decide la identidad de `kitsuden.api`
   * dentro del sandbox (ver lib/sandbox/identidad.ts). NO se guarda.
   */
  ejecutor?: EjecutorDeAccion;

  // Execution metadata
  executionId: string;
  startedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// Execution Results
// ═══════════════════════════════════════════════════════════════════════════

export interface ActionResult {
  success: boolean;
  result?: unknown;
  logs?: string;
  error?: string;
  durationMs: number;
  memoryUsedBytes?: number;

  // For webhook_out actions
  httpResponse?: {
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
  };
}

export interface ActionHandler {
  type: ActionType;
  execute(action: Action, context: ActionContext): Promise<ActionResult>;
}

// ═══════════════════════════════════════════════════════════════════════════
// API Types
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateActionInput {
  name: string;
  slug?: string;
  description?: string;
  type: ActionType;
  trigger: ActionTrigger;
  triggerConfig?: TriggerConfig;
  config?: ActionConfig;
  status?: ActionStatus;
  /** Cuenta responsable (de la sesión): ver lib/sandbox/identidad.ts. */
  createdById?: string | null;
}

export interface UpdateActionInput {
  name?: string;
  slug?: string;
  description?: string;
  trigger?: ActionTrigger;
  triggerConfig?: TriggerConfig;
  config?: ActionConfig;
  status?: ActionStatus;
}

export interface ActionListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: ActionType;
  trigger: ActionTrigger;
  status: ActionStatus;
  lastExecutedAt: Date | null;
  executionCount: number;
  errorCount: number;
  createdAt: Date;
}
