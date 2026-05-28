/**
 * GremiusCMS — Worker Sandbox
 *
 * Executes user-provided JS/TS code in an isolated Bun Worker thread.
 * Security boundaries:
 *   - No access to `process.env`, `fs`, `child_process`
 *   - No access to database connection or server internals
 *   - Timeout enforcement (kills worker after N ms)
 *   - Console output capture (logs returned to caller)
 *   - Limited global scope (only safe built-ins: fetch, JSON, Math, Date, crypto, etc.)
 *
 * The worker runs a temporary file that wraps the user's code
 * in a restricted context and communicates results via `postMessage`.
 */
export interface SandboxInput {
    /** User's JS/TS code (as a string) */
    code: string;
    /** Data payload passed to the function as `event` */
    payload: Record<string, unknown>;
    /** Environment variables available as `env` */
    envVars: Record<string, string>;
    /** Max execution time in ms */
    timeoutMs: number;
    /** Max memory in MB (informational — Bun doesn't enforce per-worker yet) */
    memoryLimitMb: number;
}
export interface SandboxResult {
    success: boolean;
    /** Return value from the user's function (if any) */
    result: unknown;
    /** Captured console.log/warn/error output */
    logs: string;
    /** Error message (if failed) */
    error: string | null;
    /** Execution duration in ms */
    durationMs: number;
    /** Memory used (best-effort estimate) */
    memoryUsedBytes: number;
    /** How the execution ended */
    exitReason: "success" | "error" | "timeout" | "killed";
}
/**
 * Execute user code inside an isolated Bun Worker.
 *
 * The flow:
 *   1. Write a temporary wrapper script that defines a restricted global scope
 *   2. Spawn a Bun Worker pointing to that script
 *   3. Wait for result message or timeout
 *   4. Clean up temp file
 */
export declare function executeSandbox(input: SandboxInput): Promise<SandboxResult>;
//# sourceMappingURL=worker-sandbox.d.ts.map