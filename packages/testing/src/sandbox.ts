// @ts-nocheck

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TEST SANDBOX - Core of the Testing Framework
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Hono } from "hono";
import type { GrimoireDefinition } from "@gremius/shared";
import type { SandboxConfig, TestSandbox, TestGrimoire, TestGrimoireContext } from "./types.js";
import { createTestContext } from "./context.js";
import { createTestHttpClient } from "./http.js";
import { createTestDatabase } from "./database.js";
import { createTestEvents } from "./events.js";
import { createTestAssertions } from "./assertions.js";
import { loadFixtures } from "./fixtures.js";

let sandboxCounter = 0;

/**
 * Create a test sandbox for grimoire testing
 * 
 * Usage:
 * ```typescript
 * const sandbox = createTestSandbox({
 *   grimoires: ["grimoire-blog"],
 *   fixtures: "blog-seed"
 * });
 * 
 * beforeAll(() => sandbox.setup());
 * afterAll(() => sandbox.teardown());
 * afterEach(() => sandbox.reset());
 * ```
 */
export async function createTestSandbox(config: SandboxConfig): Promise<TestSandbox> {
  const sandboxId = `sandbox-${Date.now()}-${++sandboxCounter}`;
  
  // Create isolated test context (like production but isolated)
  const context = await createTestContext(sandboxId, config.database);
  
  // Track events
  const events = createTestEvents();
  
  // Database helpers
  const db = createTestDatabase(context);
  
  // Load grimoires
  const grimoires: Record<string, TestGrimoire> = {};
  
  for (const grimoireId of config.grimoires) {
    const grimoire = await loadGrimoire(grimoireId, context, events);
    if (grimoire) {
      grimoires[grimoireId] = grimoire;
    }
  }
  
  // HTTP client
  const http = createTestHttpClient(grimoires, context);
  
  // Assertions
  const assert = createTestAssertions(db, events);
  
  // Sandbox instance
  const sandbox: TestSandbox = {
    id: sandboxId,
    context,
    grimoires,
    fixtures: {},
    http,
    db,
    events,
    assert,
    
    setup: async () => {
      // Load fixtures if specified
      if (config.fixtures) {
        sandbox.fixtures = await loadFixtures(config.fixtures, context);
      }
      
      // Call grimoire onStartup hooks
      for (const grimoire of Object.values(grimoires)) {
        if (grimoire.definition.hooks?.onStartup) {
          await grimoire.definition.hooks.onStartup(context);
        }
      }
    },
    
    teardown: async () => {
      // Call grimoire onDisable hooks
      for (const grimoire of Object.values(grimoires)) {
        if (grimoire.definition.hooks?.onDisable) {
          await grimoire.definition.hooks.onDisable(context);
        }
      }
      
      // Cleanup database
      await db.truncate("*");
    },
    
    reset: async () => {
      // Clear events
      events.clear();
      
      // Truncate data but keep schema
      const tables = Object.values(grimoires)
        .flatMap(g => g.definition.tables || []);
      
      if (tables.length > 0) {
        await db.truncate(...tables);
      }
      
      // Reload fixtures
      if (config.fixtures) {
        sandbox.fixtures = await loadFixtures(config.fixtures, context);
      }
    }
  };
  
  return sandbox;
}

/**
 * Load a grimoire for testing
 */
async function loadGrimoire(
  grimoireId: string, 
  context: TestGrimoireContext,
  events: ReturnType<typeof createTestEvents>
): Promise<TestGrimoire | null> {
  try {
    // Try to load from packages/grimoires/
    const path = `../../../packages/grimoires/${grimoireId}/index.ts`;
    const module = await import(path);
    const definition: GrimoireDefinition = module.grimoire || module.default;
    
    if (!definition) {
      console.warn(`Grimoire ${grimoireId} not found or missing export`);
      return null;
    }
    
    // Wrap context to capture events
    const contextWithEventTracking: TestGrimoireContext = {
      ...context,
      events: {
        ...context.events,
        emit: (name: string, data: any) => {
          events.all.push({ name, data, timestamp: new Date() });
          return context.events.emit(name, data);
        }
      }
    };
    
    // Create router
    const router = definition.createRouter(contextWithEventTracking);
    
    // Invoke helper for direct function access
    const invoke = async <T>(method: string, ...args: any[]): Promise<T> => {
      // This is a placeholder - in a real implementation,
      // you'd expose internal grimoire functions
      throw new Error(`Direct method invocation not implemented for ${method}`);
    };
    
    return {
      definition,
      router,
      invoke
    };
    
  } catch (error) {
    console.warn(`Failed to load grimoire ${grimoireId}:`, error);
    return null;
  }
}

export default { createTestSandbox };
