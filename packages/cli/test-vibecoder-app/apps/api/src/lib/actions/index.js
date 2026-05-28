/**
 * Actions Engine
 *
 * Unified action system that replaces workers and webhooks.
 *
 * Usage:
 *   import { executeAction, listActions, createAction } from "./lib/actions";
 *
 *   // Execute an action
 *   const result = await executeActionById("action-id", {
 *     trigger: "manual",
 *   });
 *
 *   // List all actions
 *   const actions = await listActions({ type: "code" });
 */
export { 
// Execution
executeAction, executeActionById, 
// CRUD
listActions, getAction, createAction, updateAction, deleteAction, 
// Events
dispatchEvent, 
// Init
initActionsEngine, } from "./engine";
export { executeCodeAction, executeWebhookOutAction, executeWebhookInAction, executeAgentAction, } from "./handlers";
//# sourceMappingURL=index.js.map