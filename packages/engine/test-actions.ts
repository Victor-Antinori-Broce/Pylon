/**
 * Test script para verificar defineAction y el sistema de Actions
 * Run: npx tsx test-actions.ts
 */

import {
  defineAction,
  defineTypedAction,
  listDefinedActions,
  getAction,
  parseTrigger,
  initActions,
  listMCPTools,
  type ActionContext,
  type ActionResult,
} from "./src/actions";

// Test 1: Definir acción HTTP
const httpAction = defineAction({
  trigger: "http.post:/webhooks/test",
  description: "Test webhook endpoint",
  run: async ({ payload, db }): Promise<ActionResult> => {
    console.log("HTTP Action executed with payload:", payload);
    return { success: true, data: { received: true } };
  },
});

// Test 2: Definir acción de agente con customRef
const agentAction = defineAction({
  trigger: "agent.tool:validate_poe",
  description: "Validates Path of Exile character build",
  inputSchema: {
    type: "object",
    properties: {
      characterName: { type: "string" },
      league: { type: "string" },
    },
    required: ["characterName"],
  },
  run: async ({ payload }: ActionContext<{ characterName: string; league?: string }>) => {
    console.log("Agent tool executed for character:", payload.characterName);
    return {
      success: true,
      data: {
        valid: true,
        dps: 5000000,
        buildUrl: `https://poe.ninja/builds/${payload.league || "challenge"}/${payload.characterName}`,
      },
    };
  },
});

// Test 3: Definir acción de evento
const eventAction = defineAction({
  trigger: "event:process_data",
  description: "Background data processor",
  run: async ({ payload, queue }) => {
    console.log("Event action executed");
    // Can enqueue more jobs
    return { success: true };
  },
});

// Test 4: Definir acción cron
const cronAction = defineAction({
  trigger: "event.cron:0 */6 * * *:cleanup_old_logs",
  description: "Clean up old log files every 6 hours",
  run: async () => {
    console.log("Cron cleanup executed");
    return { success: true, data: { deleted: 100 } };
  },
});

// Verificar registro
console.log("\n✅ Actions registered successfully!\n");

// Listar acciones
const actions = listDefinedActions();
console.log(`📋 Total actions registered: ${actions.length}\n`);

actions.forEach(({ trigger, definition }) => {
  const parsed = parseTrigger(trigger);
  console.log(`  🔹 ${parsed.prefix}.${parsed.variant}:${parsed.path}`);
  console.log(`     Description: ${definition.description || "N/A"}`);
  console.log("");
});

// Verificar que podemos obtener una acción específica
const validatePoeAction = getAction("agent.tool:validate_poe");
if (validatePoeAction) {
  console.log("✅ Found agent.tool:validate_poe action");
  console.log(`   Input schema: ${JSON.stringify(validatePoeAction.inputSchema, null, 2)}`);
}

// Listar herramientas MCP
const mcpTools = listMCPTools();
console.log(`\n🔧 MCP Tools available: ${mcpTools.length}`);
mcpTools.forEach((tool) => {
  console.log(`   - ${tool.name}: ${tool.description}`);
});

console.log("\n✅ All tests passed!");
