/**
 * Grimoire Entry Point — grimoire-example
 *
 * This is the main entry point for the grimoire.
 * It exports either:
 *   1. A Modern Grimoire (GrimoireDefinition with createRouter)
 *   2. An Auto-Grimoire (via defineGrimoire)
 *   3. A legacy Hono router
 *
 * The loader tries each mode in order.
 */

import { Hono } from "hono";
import type { GrimoireContext, GrimoireDefinition } from "@gremius/shared";

// ═══════════════════════════════════════════════════════════════════════════
// OPTION 1: Modern Grimoire (Dependency Injection)
// ═══════════════════════════════════════════════════════════════════════════

export const grimoire: GrimoireDefinition = {
  id: "grimoire-example",
  name: "Example Grimoire",
  version: "1.0.0",
  description: "A minimal example grimoire.",

  mountPath: "/api/example",

  createRouter(ctx: GrimoireContext) {
    const router = new Hono();

    // GET /api/example
    router.get("/", async (c) => {
      return c.json({
        grimoire: "grimoire-example",
        message: "Hello from the Example Grimoire!",
      });
    });

    // GET /api/example/items
    router.get("/items", async (c) => {
      // Example: query the database via context
      // const items = await ctx.db.instance.select().from(exampleItems).limit(10);
      return c.json({ items: [] });
    });

    // POST /api/example/items
    router.post("/items", async (c) => {
      const body = await c.req.json();
      // Example: insert into database
      // await ctx.db.instance.insert(exampleItems).values(body);
      return c.json({ created: true, data: body }, 201);
    });

    return router;
  },

  hooks: {
    onStartup: async (ctx) => {
      ctx.logger.info("Example Grimoire started!");
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// OPTION 2: Legacy Hono Router Export (also supported)
// ═══════════════════════════════════════════════════════════════════════════
// export const exampleRoutes = grimoire.createRouter(/* context injected by loader */);

export default grimoire;
