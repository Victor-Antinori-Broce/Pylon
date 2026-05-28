/**
 * Actions Engine - Type Definitions
 *
 * Unified type system for the Actions engine.
 * This replaces the separate types for workers and webhooks.
 */
import type { actions, actionExecutions } from "../../db/schema";
export type Action = typeof actions.$inferSelect;
export type ActionExecution = typeof actionExecutions.$inferSelect;
export type ActionType = "code" | "webhook_out" | "webhook_in" | "agent";
export type ActionTrigger = "manual" | "cron" | "event" | "http";
export type ActionStatus = "active" | "paused" | "error";
export interface CronTriggerConfig {
    cronExpression: string;
    timezone?: string;
}
export interface EventTriggerConfig {
    eventName: string;
    datasetId?: string;
}
export interface HttpTriggerConfig {
    httpMethod: string;
    httpPath: string;
}
export type TriggerConfig = CronTriggerConfig | EventTriggerConfig | HttpTriggerConfig | Record<string, never>;
export interface CodeActionConfig {
    code: string;
    timeoutMs?: number;
    memoryLimitMb?: number;
    envVars?: Record<string, string>;
}
export interface WebhookOutConfig {
    url: string;
    headers?: Record<string, string>;
    secret?: string;
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
export type ActionConfig = CodeActionConfig | WebhookOutConfig | WebhookInConfig | AgentActionConfig | Record<string, unknown>;
export interface ActionContext {
    actionId: string;
    actionName: string;
    actionType: ActionType;
    trigger: ActionTrigger;
    triggerEvent?: string;
    event?: {
        name: string;
        data: Record<string, unknown>;
        timestamp: string;
    };
    request?: {
        method: string;
        path: string;
        headers: Record<string, string>;
        body: unknown;
        query: Record<string, string>;
    };
    env: Record<string, string>;
    executionId: string;
    startedAt: Date;
}
export interface ActionResult {
    success: boolean;
    result?: unknown;
    logs?: string;
    error?: string;
    durationMs: number;
    memoryUsedBytes?: number;
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
export interface CreateActionInput {
    name: string;
    slug?: string;
    description?: string;
    type: ActionType;
    trigger: ActionTrigger;
    triggerConfig?: TriggerConfig;
    config?: ActionConfig;
    status?: ActionStatus;
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
//# sourceMappingURL=types.d.ts.map