// @ts-nocheck
/**
 * Example Grimoire — Entry Point
 *
 * Exports the GrimoireDefinition used by GremiusCMS module-loader.
 */

import type { GrimoireDefinition, GrimoireContext } from "@gremius/shared";
import { defineGrimoire } from "@gremius/shared";
import { Hono } from "hono";

import { createExampleRouter } from "./routes.js";

// Re-export schema for schema-merger
export * from "./schema.js";

export function createExampleGrimoire(ctx: GrimoireContext): Hono {
  const app = new Hono();
  app.route("/", createExampleRouter(ctx));
  return app;
}

export const grimoire: GrimoireDefinition = defineGrimoire({
  id: "grimoire-example",
  name: "Example Grimoire",
  version: "1.0.0",
  description: "A standard npm-published grimoire for GremiusCMS.",
  icon: "Box",
  mountPath: "/api/examples",
  createRouter: createExampleGrimoire,

  tables: ["examples"],

  admin: {
    category: "content",
    views: [{ id: "examples", type: "grid", title: "Examples", table: "examples" }],
  },

  dependencies: {
    grimoires: ["grimoire-media"],
    core: ["auth"],
  },

  hooks: {
    onStartup: async (ctx) => {
      ctx.logger.info("📦 Example grimoire initialized");
    },
    onEnable: async (ctx) => {
      ctx.logger.info("📦 Example grimoire enabled");
    },
    onDisable: async (ctx) => {
      ctx.logger.info("📦 Example grimoire disabled");
    },
  },
});

export default grimoire;
