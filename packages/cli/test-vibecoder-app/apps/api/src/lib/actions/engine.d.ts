/**
 * Actions Engine
 *
 * The core engine that routes and executes actions.
 * This is the unified replacement for function-dispatcher.ts and webhook handlers.
 */
import type { Action, ActionContext, ActionResult, ActionType, ActionTrigger, ActionStatus, CreateActionInput, UpdateActionInput, ActionListItem } from "./types";
/**
 * Execute an action by ID
 */
export declare function executeActionById(actionId: string, triggerContext?: Partial<ActionContext>): Promise<ActionResult>;
/**
 * Execute an action with full context
 */
export declare function executeAction(action: Action, triggerContext?: Partial<ActionContext>): Promise<ActionResult>;
export declare function listActions(options?: {
    type?: ActionType;
    trigger?: ActionTrigger;
    status?: ActionStatus;
    limit?: number;
}): Promise<ActionListItem[]>;
export declare function getAction(id: string): Promise<Action | null>;
export declare function createAction(input: CreateActionInput): Promise<Action>;
export declare function updateAction(id: string, input: UpdateActionInput): Promise<Action | null>;
export declare function deleteAction(id: string): Promise<boolean>;
export declare function dispatchEvent(eventName: string, data: Record<string, unknown>): Promise<void>;
export declare function initActionsEngine(): void;
//# sourceMappingURL=engine.d.ts.map