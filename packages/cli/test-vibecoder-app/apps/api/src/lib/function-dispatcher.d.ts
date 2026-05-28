/**
 * GremiusCMS — Function Dispatcher (Legacy Wrapper)
 *
 * ⚠️ DEPRECATED: This module is kept for backward compatibility.
 * New code should use the ActionEngine directly from `./actions`.
 *
 * This wrapper bridges the old function-based API to the new unified
 * ActionEngine. It will be removed in Phase 4.
 *
 * Phase 3: Delegates all execution to ActionEngine.
 */
import { gremiusFunctions } from "../db/schema";
import type { SandboxResult } from "./worker-sandbox";
/**
 * @deprecated Use executeActionById from `./actions` instead
 */
export declare function executeFunction(fn: typeof gremiusFunctions.$inferSelect, triggerEvent: string, payload: Record<string, unknown>): Promise<SandboxResult>;
/**
 * @deprecated Use executeActionById from `./actions` instead
 */
export declare function executeManually(functionId: string, customPayload?: Record<string, unknown>): Promise<SandboxResult>;
/**
 * @deprecated ActionEngine handles its own initialization
 */
export declare function initFunctionDispatcher(): void;
//# sourceMappingURL=function-dispatcher.d.ts.map