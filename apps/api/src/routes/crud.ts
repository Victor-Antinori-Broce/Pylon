import { Hono } from "hono";
import { eq } from "drizzle-orm";
// @ts-ignore - Path alias @/ not resolved by tsc
import { db } from "../db";
// @ts-ignore - Path alias @/ not resolved by tsc
import {
  dataSets, dataEntries, siteSettings,
} from "../db/schema";
// @ts-ignore - Path alias not resolved by tsc
import { requireAuth } from "../middleware/auth";
import { invalidateGraphQLCache } from "./graphql";
import type { AppVariables } from "../types/hono";

// ── Data Sets Lite (fallback when grimoire-datasets isn't loaded) ──
export const dataSetsRoutes = new Hono<{ Variables: AppVariables }>();

dataSetsRoutes.get("/", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
  const docs = await db.select().from(dataSets).orderBy(dataSets.name).limit(limit);
  return c.json({ docs, totalDocs: docs.length });
});

dataSetsRoutes.get("/slug/:slug", async (c) => {
  const result = await db.select().from(dataSets).where(eq(dataSets.slug, c.req.param("slug"))).limit(1);
  if (!result.length) return c.json({ error: "DataSet not found" }, 404);
  return c.json(result[0]);
});

dataSetsRoutes.get("/:id/entries", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 500, 1000);
  const docs = await db.select().from(dataEntries)
    .where(eq(dataEntries.dataSetId, c.req.param("id")))
    .orderBy(dataEntries.sortOrder)
    .limit(limit);
  return c.json({ docs, totalDocs: docs.length });
});

dataSetsRoutes.post("/", requireAuth, async (c) => {
  const body = await c.req.json();
  const [row] = await db.insert(dataSets).values({
    name: body.name,
    slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    description: body.description,
    icon: body.icon,
    schema: body.schema,
    displayConfig: body.displayConfig,
    policyJson: body.policyJson || {
      readAccess: "authenticated",
      writeAccess: "authenticated",
      enableRLS: true,
      rlsRules: [
        { field: "ownerId", operator: "eq", value: "{{current_user_id}}" }
      ]
    },
  }).returning();
  await invalidateGraphQLCache();
  return c.json(row, 201);
});

dataSetsRoutes.post("/:id/entries", requireAuth, async (c) => {
  const body = await c.req.json();
  const entries = Array.isArray(body) ? body : [body];
  const rows = await db.insert(dataEntries).values(
    entries.map((e: any) => {
      const ownerId = e.ownerId ?? c.get("user")?.id ?? null;
      return {
        title: e.title,
        dataSetId: c.req.param("id"),
        data: { ...(e.data || {}), ownerId },
        thumbnailId: e.thumbnailId,
        sortOrder: e.sortOrder || 0,
        status: e.status || "published",
        ownerId,
      };
    })
  ).returning();
  await invalidateGraphQLCache();
  return c.json(rows, 201);
});

// ── Site Settings (singleton) ──
export const settingsRoutes = new Hono();

settingsRoutes.get("/", async (c) => {
  const result = await db.select().from(siteSettings).limit(1);
  if (!result.length) {
    const [defaults] = await db.insert(siteSettings).values({}).returning();
    return c.json(defaults);
  }
  return c.json(result[0]);
});

settingsRoutes.patch("/", async (c) => {
  const body = await c.req.json();
  const existing = await db.select().from(siteSettings).limit(1);
  if (!existing.length) {
    const [row] = await db.insert(siteSettings).values({ ...body }).returning();
    return c.json(row);
  }
  const [updated] = await db.update(siteSettings)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(siteSettings.id, existing[0].id))
    .returning();
  return c.json(updated);
});

// ── Auth ──
// Auth is now handled by Better-Auth in lib/auth.ts
// Mounted via app.on(["POST", "GET"], "/api/auth/*") in index.ts

// ── Sync Routes ──
export const syncRoutes = new Hono();

syncRoutes.post("/igdb/search", async (c) => {
  const { query, limit } = await c.req.json();
  const { searchGames } = await import("../services/igdb");
  const results = await searchGames(query, limit);
  return c.json(results);
});

// NOTE: IGDB import moved to grimoire-games. The core BaaS does not depend on gaming domain tables.
syncRoutes.post("/igdb/import/:igdbId", async (c) => {
  return c.json({ error: "IGDB import is handled by grimoire-games. Install it with: gremius install grimoire-games" }, 501);
});

syncRoutes.post("/twitch/status", async (c) => {
  const { channelIds } = await c.req.json();
  const { getStreamStatus } = await import("../services/twitch");
  const statuses = await getStreamStatus(channelIds);
  return c.json(Object.fromEntries(statuses));
});
