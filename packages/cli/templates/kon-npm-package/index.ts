// @ts-nocheck
/**
 * Example Kon — Entry Point
 *
 * Exports the KonDefinition used by Kitsuden module-loader.
 */

import type { KonDefinition, KonContext } from "@kitsuden/shared";
import { defineKon } from "@kitsuden/shared";
import { Hono } from "hono";

import { createExampleRouter } from "./routes.js";

// Re-export schema for schema-merger
export * from "./schema.js";

export function createExampleKon(ctx: KonContext): Hono {
  const app = new Hono();
  app.route("/", createExampleRouter(ctx));
  return app;
}

export const kon: KonDefinition = defineKon({
  id: "kon-example",
  name: "Example Kon",
  version: "1.0.0",
  description: "A standard npm-published kon for Kitsuden.",
  icon: "Box",
  mountPath: "/api/examples",
  createRouter: createExampleKon,

  tables: ["examples"],

  admin: {
    category: "content",
    views: [{ id: "examples", type: "grid", title: "Examples", table: "examples" }],
  },

  dependencies: {
    kons: ["kon-media"],
    core: ["auth"],
  },

  hooks: {
    onStartup: async (ctx) => {
      ctx.logger.info("📦 Example kon initialized");
    },
    onEnable: async (ctx) => {
      ctx.logger.info("📦 Example kon enabled");
    },
    onDisable: async (ctx) => {
      ctx.logger.info("📦 Example kon disabled");
    },
  },
});

export default kon;
