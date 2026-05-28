/**
 * Code Action Handler
 *
 * Executes JavaScript/TypeScript code in a sandboxed environment.
 * This replaces the old worker-sandbox.ts with a unified interface.
 */
import type { Action, ActionContext, ActionResult } from "../types";
export declare function executeCodeAction(action: Action, context: ActionContext): Promise<ActionResult>;
//# sourceMappingURL=code-handler.d.ts.map