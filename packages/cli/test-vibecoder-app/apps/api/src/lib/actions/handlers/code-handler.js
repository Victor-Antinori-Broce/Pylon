/**
 * Code Action Handler
 *
 * Executes JavaScript/TypeScript code in a sandboxed environment.
 * This replaces the old worker-sandbox.ts with a unified interface.
 */
import { executeSandbox } from "../../worker-sandbox";
export async function executeCodeAction(action, context) {
    const startTime = Date.now();
    const config = action.config;
    if (!config.code) {
        return {
            success: false,
            error: "No code configured for this action",
            durationMs: Date.now() - startTime,
        };
    }
    // Build the payload for the sandbox
    const payload = {
        action: {
            id: context.actionId,
            name: context.actionName,
            type: context.actionType,
        },
        trigger: context.trigger,
        event: context.event,
        request: context.request,
        timestamp: new Date().toISOString(),
    };
    // Execute in sandbox
    const sandboxResult = await executeSandbox({
        code: config.code,
        payload,
        envVars: { ...config.envVars, ...context.env },
        timeoutMs: config.timeoutMs || 5000,
        memoryLimitMb: config.memoryLimitMb || 64,
    });
    return {
        success: sandboxResult.success,
        result: sandboxResult.result,
        logs: sandboxResult.logs || undefined,
        error: sandboxResult.error || undefined,
        durationMs: sandboxResult.durationMs,
        memoryUsedBytes: sandboxResult.memoryUsedBytes,
    };
}
//# sourceMappingURL=code-handler.js.map