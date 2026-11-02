import { describe, it, expect, mock, beforeAll } from "bun:test";

import type { Action, ActionContext } from "../lib/actions/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let executeAgentAction: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let runAgentCalls: any[] = [];
let shouldFail = false;

beforeAll(async () => {
  // Mock del Agent Engine (superficie COMPLETA de exports para evitar
  // "Export named X not found" en otros archivos — mock.module se filtra
  // entre tests del mismo proceso de bun).
  mock.module("@/services/agent-engine", () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runAgent: async (options: any) => {
      runAgentCalls.push(options);
      if (shouldFail) throw new Error("LLM provider unavailable");
      return {
        response: "Tarea completada",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        tokensIn: 100,
        tokensOut: 50,
        traceId: "trace-1",
        sessionId: "session-1",
      };
    },
  }));

  const mod = await import("../lib/actions/handlers/agent-handler");
  executeAgentAction = mod.executeAgentAction;
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const baseAction = (config: any): Action =>
  ({
    id: "act-1",
    name: "Test Agent Action",
    type: "agent",
    trigger: "manual",
    enabled: true,
    config,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

const baseContext: ActionContext = {
  actionId: "act-1",
  actionName: "Test",
  actionType: "agent",
  trigger: "manual",
  env: {},
  executionId: "exec-1",
  startedAt: new Date(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe("executeAgentAction", () => {
  it("returns error when no agentId configured", async () => {
    const result = await executeAgentAction(baseAction({}), baseContext);
    expect(result.success).toBe(false);
    expect(result.error).toBe("No agent configured for this action");
    expect(result.durationMs).toBeDefined();
  });

  it("runs the agent via Agent Engine and maps the result", async () => {
    runAgentCalls = [];
    shouldFail = false;

    const result = await executeAgentAction(
      baseAction({ agentId: "agent-1", promptTemplate: "Hello" }),
      baseContext
    );

    expect(result.success).toBe(true);
    expect(result.result.response).toBe("Tarea completada");
    expect(result.result.provider).toBe("anthropic");
    expect(result.result.tokensIn).toBe(100);
    expect(result.result.traceId).toBe("trace-1");
    expect(result.durationMs).toBeDefined();

    expect(runAgentCalls.length).toBe(1);
    expect(runAgentCalls[0].agentId).toBe("agent-1");
    expect(runAgentCalls[0].message).toBe("Hello");
    // Defaults: memoria y brain search habilitados salvo opt-out explícito
    expect(runAgentCalls[0].enableMemory).toBe(true);
    expect(runAgentCalls[0].enableBrainSearch).toBe(true);
  });

  it("renders {{variables}} del contexto en el promptTemplate", async () => {
    runAgentCalls = [];
    shouldFail = false;

    const context = {
      ...baseContext,
      event: { data: { user: { name: "Arqui" }, issue: "BUG-42" } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await executeAgentAction(
      baseAction({ agentId: "agent-1", promptTemplate: "Revisa {{issue}} de {{user.name}}" }),
      context
    );

    expect(runAgentCalls[0].message).toBe("Revisa BUG-42 de Arqui");
  });

  it("respeta opt-out de memoria y brain search", async () => {
    runAgentCalls = [];
    shouldFail = false;

    await executeAgentAction(
      baseAction({ agentId: "agent-1", enableMemory: false, enableBrainSearch: false }),
      baseContext
    );

    expect(runAgentCalls[0].enableMemory).toBe(false);
    expect(runAgentCalls[0].enableBrainSearch).toBe(false);
  });

  it("mapea errores del Agent Engine a ActionResult", async () => {
    shouldFail = true;

    const result = await executeAgentAction(baseAction({ agentId: "agent-1" }), baseContext);

    expect(result.success).toBe(false);
    expect(result.error).toBe("LLM provider unavailable");
    expect(result.durationMs).toBeDefined();

    shouldFail = false;
  });
});
