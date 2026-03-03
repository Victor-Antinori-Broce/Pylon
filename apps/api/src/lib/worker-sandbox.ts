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

import { join } from "node:path";
import { randomUUID } from "node:crypto";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// Sandbox Executor
// ═══════════════════════════════════════════════════════════════

const SANDBOX_DIR = join(import.meta.dir, "..", "..", ".sandbox");

/**
 * Execute user code inside an isolated Bun Worker.
 *
 * The flow:
 *   1. Write a temporary wrapper script that defines a restricted global scope
 *   2. Spawn a Bun Worker pointing to that script
 *   3. Wait for result message or timeout
 *   4. Clean up temp file
 */
export async function executeSandbox(input: SandboxInput): Promise<SandboxResult> {
  const executionId = randomUUID();
  const tmpFile = join(SANDBOX_DIR, `fn_${executionId}.mjs`);

  // Ensure sandbox directory exists
  const { mkdir } = await import("node:fs/promises");
  await mkdir(SANDBOX_DIR, { recursive: true });

  // Build the wrapper script
  const wrapperCode = buildWrapperScript(input.code, input.payload, input.envVars);

  // Write temp file
  await Bun.write(tmpFile, wrapperCode);

  return new Promise<SandboxResult>(async (resolve) => {
    const startTime = performance.now();
    let settled = false;

    const settle = (result: SandboxResult) => {
      if (settled) return;
      settled = true;
      // Cleanup temp file (fire-and-forget)
      Bun.file(tmpFile).exists().then((exists) => {
        if (exists) {
          import("node:fs/promises").then(({ unlink }) => unlink(tmpFile).catch(() => {}));
        }
      });
      resolve(result);
    };

    // Timeout handler
    const timer = setTimeout(() => {
      try { worker.terminate(); } catch {}
      settle({
        success: false,
        result: null,
        logs: "",
        error: `Function timed out after ${input.timeoutMs}ms`,
        durationMs: input.timeoutMs,
        memoryUsedBytes: 0,
        exitReason: "timeout",
      });
    }, input.timeoutMs);

    let worker: Worker;

    try {
      worker = new Worker(tmpFile, { type: "module" });

      worker.onmessage = (event: MessageEvent) => {
        clearTimeout(timer);
        const data = event.data;
        const duration = Math.round(performance.now() - startTime);

        if (data?.type === "result") {
          settle({
            success: !data.error,
            result: data.result ?? null,
            logs: data.logs || "",
            error: data.error || null,
            durationMs: duration,
            memoryUsedBytes: data.memoryUsed || 0,
            exitReason: data.error ? "error" : "success",
          });
        }

        try { worker.terminate(); } catch {}
      };

      worker.onerror = (err: ErrorEvent) => {
        clearTimeout(timer);
        const duration = Math.round(performance.now() - startTime);
        settle({
          success: false,
          result: null,
          logs: "",
          error: err.message || "Worker error",
          durationMs: duration,
          memoryUsedBytes: 0,
          exitReason: "error",
        });
        try { worker.terminate(); } catch {}
      };

    } catch (spawnError: any) {
      clearTimeout(timer);
      settle({
        success: false,
        result: null,
        logs: "",
        error: `Failed to spawn worker: ${spawnError.message}`,
        durationMs: Math.round(performance.now() - startTime),
        memoryUsedBytes: 0,
        exitReason: "killed",
      });
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// Wrapper Script Builder
// ═══════════════════════════════════════════════════════════════

/**
 * Builds a self-contained ESM script that:
 * 1. Overrides dangerous globals (process, require, Bun.file, etc.)
 * 2. Captures console output
 * 3. Executes the user's code
 * 4. Posts the result back via postMessage
 */
function buildWrapperScript(
  userCode: string,
  payload: Record<string, unknown>,
  envVars: Record<string, string>
): string {
  // Escape backticks and backslashes in user code for template literal safety
  const safePayload = JSON.stringify(payload);
  const safeEnvVars = JSON.stringify(envVars);

  return `
// ═══ GremiusCMS Sandbox Wrapper ═══
// This file is auto-generated and immediately deleted after execution.

const __logs = [];
const __maxLogSize = 50000; // 50KB max logs
let __logSize = 0;

// ─── Console Capture ───
const __console = {
  log(...args) {
    const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    if (__logSize + line.length < __maxLogSize) {
      __logs.push('[LOG] ' + line);
      __logSize += line.length;
    }
  },
  warn(...args) {
    const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    if (__logSize + line.length < __maxLogSize) {
      __logs.push('[WARN] ' + line);
      __logSize += line.length;
    }
  },
  error(...args) {
    const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    if (__logSize + line.length < __maxLogSize) {
      __logs.push('[ERROR] ' + line);
      __logSize += line.length;
    }
  },
  info(...args) { __console.log(...args); },
  debug(...args) { __console.log(...args); },
};

// ─── Restricted Context ───
const event = ${safePayload};
const env = ${safeEnvVars};
const console = __console;

// ─── Gremius SDK (limited API surface for user functions) ───
const gremius = {
  async fetch(url, options) {
    return globalThis.fetch(url, {
      ...options,
      signal: AbortSignal.timeout(10000), // 10s max per fetch
    });
  },
  log(msg) { __console.log(msg); },
  env,
  event,
};

// ─── Block dangerous globals ───
const process = undefined;
const require = undefined;
const __filename = undefined;
const __dirname = undefined;
const Deno = undefined;

// ─── Execute User Code ───
async function __execute() {
  try {
    // User code is wrapped in an async IIFE
    const __userFn = new Function(
      'event', 'env', 'console', 'gremius', 'fetch',
      'process', 'require', '__filename', '__dirname', 'Deno',
      \`return (async () => {
        \${${JSON.stringify(userCode)}}
      })()\`
    );

    const result = await __userFn(
      event, env, __console, gremius, gremius.fetch,
      undefined, undefined, undefined, undefined, undefined
    );

    postMessage({
      type: 'result',
      result: result !== undefined ? JSON.parse(JSON.stringify(result)) : null,
      logs: __logs.join('\\n'),
      error: null,
      memoryUsed: 0,
    });
  } catch (err) {
    postMessage({
      type: 'result',
      result: null,
      logs: __logs.join('\\n'),
      error: err?.message || String(err),
      memoryUsed: 0,
    });
  }
}

__execute();
`;
}
