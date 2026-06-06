// @ts-nocheck
/**
 * Example Grimoire — Hono Router
 */

import type { GrimoireContext } from "@gremius/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { examples } from "./schema.js";

export function createExampleRouter(ctx: GrimoireContext): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const rows = await ctx.db.instance.select().from(examples);
    return c.json(rows);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const [row] = await ctx.db.instance.select().from(examples).where(eq(examples.id, id));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  });

  app.post("/", async (c) => {
    const body = await c.req.json();
    const [row] = await ctx.db.instance.insert(examples).values(body).returning();
    return c.json(row, 201);
  });

  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const [row] = await ctx.db.instance
      .update(examples)
      .set(body)
      .where(eq(examples.id, id))
      .returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  });

  app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    await ctx.db.instance.delete(examples).where(eq(examples.id, id));
    return c.json({ success: true });
  });

  return app;
}
