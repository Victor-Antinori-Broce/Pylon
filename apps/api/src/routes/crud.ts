import { Hono } from "hono";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "../db";
import {
  platforms, tags, dataSets, dataEntries, streamers, siteSettings, games,
} from "../db/schema";

// ── Platforms ──
export const platformsRoutes = new Hono();

platformsRoutes.get("/", async (c) => {
  const docs = await db.select().from(platforms).orderBy(platforms.name);
  return c.json({ docs, totalDocs: docs.length });
});

platformsRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const [row] = await db.insert(platforms).values({
    name: body.name,
    slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    shortName: body.shortName,
    manufacturer: body.manufacturer,
    iconId: body.iconId,
  }).returning();
  return c.json(row, 201);
});

// ── Tags ──
export const tagsRoutes = new Hono();

tagsRoutes.get("/", async (c) => {
  const docs = await db.select().from(tags).orderBy(tags.name);
  return c.json({ docs, totalDocs: docs.length });
});

tagsRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const [row] = await db.insert(tags).values({
    name: body.name,
    slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    color: body.color,
    category: body.category,
  }).returning();
  return c.json(row, 201);
});

// ── Data Sets ──
export const dataSetsRoutes = new Hono();

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

dataSetsRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const [row] = await db.insert(dataSets).values({
    name: body.name,
    slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    description: body.description,
    gameId: body.gameId,
    icon: body.icon,
    schema: body.schema,
    displayConfig: body.displayConfig,
  }).returning();
  return c.json(row, 201);
});

dataSetsRoutes.post("/:id/entries", async (c) => {
  const body = await c.req.json();
  const entries = Array.isArray(body) ? body : [body];
  const rows = await db.insert(dataEntries).values(
    entries.map((e: any) => ({
      title: e.title,
      dataSetId: c.req.param("id"),
      data: e.data,
      thumbnailId: e.thumbnailId,
      sortOrder: e.sortOrder || 0,
      status: e.status || "published",
    }))
  ).returning();
  return c.json(rows, 201);
});

// ── Streamers ──
export const streamersRoutes = new Hono();

streamersRoutes.get("/", async (c) => {
  const docs = await db.select().from(streamers).orderBy(desc(streamers.followerCount));
  return c.json({ docs, totalDocs: docs.length });
});

streamersRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const [row] = await db.insert(streamers).values({
    displayName: body.displayName,
    slug: body.slug || body.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    platform: body.platform,
    channelId: body.channelId,
    channelUrl: body.channelUrl,
  }).returning();
  return c.json(row, 201);
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

syncRoutes.post("/igdb/import/:igdbId", async (c) => {
  const igdbId = Number(c.req.param("igdbId"));
  const { getGameById, transformIGDBGame } = await import("../services/igdb");
  const igdbGame = await getGameById(igdbId);
  if (!igdbGame) return c.json({ error: "Game not found on IGDB" }, 404);
  const data = transformIGDBGame(igdbGame);
  const [game] = await db.insert(games).values(data as any).returning();
  return c.json(game, 201);
});

syncRoutes.post("/twitch/status", async (c) => {
  const { channelIds } = await c.req.json();
  const { getStreamStatus } = await import("../services/twitch");
  const statuses = await getStreamStatus(channelIds);
  return c.json(Object.fromEntries(statuses));
});
