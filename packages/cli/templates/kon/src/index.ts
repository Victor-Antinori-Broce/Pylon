/**
 * Kon Entry Point — kon-example
 *
 * This is the main entry point for the kon.
 * It exports either:
 *   1. A Modern Kon (KonDefinition with createRouter)
 *   2. An Auto-Kon (via defineKon)
 *   3. A legacy Hono router
 *
 * The loader tries each mode in order.
 */

import type { KonContext, KonDefinition } from "@kitsuden/shared";
import { Hono } from "hono";

// ═══════════════════════════════════════════════════════════════════════════
// OPTION 1: Modern Kon (Dependency Injection)
// ═══════════════════════════════════════════════════════════════════════════

export const kon: KonDefinition = {
  id: "kon-example",
  name: "Example Kon",
  version: "1.0.0",
  description: "A minimal example kon.",

  mountPath: "/api/example",

  createRouter(ctx: KonContext) {
    const router = new Hono();

    // GET /api/example
    router.get("/", async (c) => {
      return c.json({
        kon: "kon-example",
        message: "Hello from the Example Kon!",
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
    onStartup: async (ctx: any) => {
      ctx.logger.info("Example Kon started!");
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// OPTION 2: Legacy Hono Router Export (also supported)
// ═══════════════════════════════════════════════════════════════════════════
// export const exampleRoutes = kon.createRouter(/* context injected by loader */);

export default kon;
