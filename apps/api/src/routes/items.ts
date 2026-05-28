/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * UNIFIED ITEMS API — /api/items/{collection}
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Provides a standard REST interface for ANY collection:
 *   - Datasets (JSONB in data_entries)
 *   - Grimoire tables (native PostgreSQL tables)
 *
 * Endpoints:
 *   GET    /api/items/:collection         → list
 *   GET    /api/items/:collection/:id     → get one
 *   POST   /api/items/:collection         → create
 *   PATCH  /api/items/:collection/:id     → update
 *   DELETE /api/items/:collection/:id     → remove
 *
 * Query params:
 *   ?limit=50&offset=0&sort=-createdAt
 *   ?where={"status":"published"}
 *   ?expand=author,media
 *
 * Security:
 *   - Reads: public (RLS context injected, policies may restrict)
 *   - Mutations: requireAuth + transactional RLS
 */

import { Hono } from "hono";
import { eq, sql, desc, asc, and, ilike, gt, gte, lt, lte, inArray } from "drizzle-orm";
import { db as rawDb, mergedSchema } from "../db";
import { dataSets, dataEntries } from "../db/schema-core";
import { requireAuth } from "../middleware/auth";
import { withTransactionalRLS } from "../middleware/transactional-rls";
import type { AppVariables } from "../types/hono";
import { logger } from "../lib/logger";
import { broadcastMutation } from "../lib/realtime";
import { invalidateGraphQLCache } from "./graphql";
import { parseGremiusQuery, GremiusQLError } from "@gremius/engine";

export const itemsRoutes = new Hono<{ Variables: AppVariables }>();

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

// Apply transactional RLS for all routes (reads + mutations)
// Handlers MUST use getDb(c) to get the transaction-aware db instance
itemsRoutes.use("/*", async (c, next) => {
  if (["POST", "PATCH", "DELETE"].includes(c.req.method)) {
    return requireAuth(c, async () => {
      await withTransactionalRLS()(c, next);
    });
  }
  // For reads, also use transactional RLS so policies are enforced consistently
  await withTransactionalRLS()(c, next);
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Get the transaction-aware db instance (tx if inside RLS middleware, else rawDb) */
function getDb(c: any) {
  return c.get("tx") || rawDb;
}

/** Irregular plural → singular map */
const IRREGULAR_PLURALS: Record<string, string> = {
  children: "child",
  people: "person",
  men: "man",
  women: "woman",
  teeth: "tooth",
  feet: "foot",
  mice: "mouse",
  geese: "goose",
};

/** Try to find a dataset by slug */
async function findDatasetBySlug(db: any, slug: string) {
  const [ds] = await db.select().from(dataSets).where(eq(dataSets.slug, slug)).limit(1);
  return ds || null;
}

/** Get a native table from the merged schema by name (robust plural/singular resolution) */
function getNativeTable(name: string): any {
  const clean = name.trim();
  const lower = clean.toLowerCase();

  // Direct match (case-insensitive key search)
  for (const key of Object.keys(mergedSchema)) {
    if (key.toLowerCase() === lower) {
      const table = (mergedSchema as any)[key];
      if (table && typeof table === "object" && table[Symbol.for("drizzle:Name")]) {
        return table;
      }
    }
  }

  // Build candidate names
  const candidates = new Set<string>();

  // plural → singular
  if (IRREGULAR_PLURALS[lower]) {
    candidates.add(IRREGULAR_PLURALS[lower]);
  } else if (lower.endsWith("ies")) {
    candidates.add(lower.slice(0, -3) + "y");
  } else if (lower.endsWith("es") && (lower.endsWith("ches") || lower.endsWith("shes") || lower.endsWith("xes") || lower.endsWith("zes"))) {
    candidates.add(lower.slice(0, -2));
  } else if (lower.endsWith("s") && !lower.endsWith("ss")) {
    candidates.add(lower.slice(0, -1));
  }

  // singular → plural
  if (lower.endsWith("y") && !/[aeiou]y$/.test(lower)) {
    candidates.add(lower.slice(0, -1) + "ies");
  } else if (/[sxz]$/.test(lower) || /(ch|sh)$/.test(lower)) {
    candidates.add(lower + "es");
  } else {
    candidates.add(lower + "s");
  }

  // Also try the original casing variants
  candidates.add(clean);
  candidates.add(lower);

  for (const key of candidates) {
    for (const schemaKey of Object.keys(mergedSchema)) {
      if (schemaKey.toLowerCase() === key) {
        const table = (mergedSchema as any)[schemaKey];
        if (table && typeof table === "object" && table[Symbol.for("drizzle:Name")]) {
          return table;
        }
      }
    }
  }

  return null;
}

/** Determine if collection is a dataset or a native table */
async function resolveCollection(db: any, collection: string): Promise<
  | { type: "dataset"; dataset: typeof dataSets.$inferSelect }
  | { type: "native"; table: any }
  | { type: "unknown" }
> {
  const ds = await findDatasetBySlug(db, collection);
  if (ds) return { type: "dataset", dataset: ds };

  const table = getNativeTable(collection);
  if (table) return { type: "native", table };

  return { type: "unknown" };
}

/** Parse ?where JSON into Drizzle filters for native tables */
function buildWhereFilters(table: any, whereJson: string | undefined): any[] {
  if (!whereJson) return [];
  try {
    const filters = JSON.parse(whereJson);
    const conditions: any[] = [];

    for (const [key, val] of Object.entries(filters)) {
      const col = table[key];
      if (!col) continue;

      if (typeof val === "string") {
        conditions.push(eq(col, val));
      } else if (typeof val === "number" || typeof val === "boolean") {
        conditions.push(eq(col, val));
      } else if (val && typeof val === "object") {
        const op = val as any;
        if (op.$gt !== undefined) conditions.push(gt(col, op.$gt));
        if (op.$gte !== undefined) conditions.push(gte(col, op.$gte));
        if (op.$lt !== undefined) conditions.push(lt(col, op.$lt));
        if (op.$lte !== undefined) conditions.push(lte(col, op.$lte));
        if (op.$ne !== undefined) conditions.push(sql`${col} <> ${op.$ne}`);
        if (op.$in !== undefined) conditions.push(inArray(col, op.$in));
        if (op.$contains !== undefined) conditions.push(ilike(col, `%${op.$contains}%`));
      }
    }
    return conditions;
  } catch {
    return [];
  }
}

/** Parse ?sort into Drizzle orderBy */
function buildOrderBy(table: any, sort: string | undefined) {
  if (!sort) return [desc(table.createdAt || table.id)];
  const fields = sort.split(",");
  return fields.map((f) => {
    const descFlag = f.startsWith("-");
    const name = descFlag ? f.slice(1) : f;
    const col = table[name];
    if (!col) return desc(table.id);
    return descFlag ? desc(col) : asc(col);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY (Gremius QL) — Unified for datasets and native tables
// ═══════════════════════════════════════════════════════════════════════════════

itemsRoutes.post("/:collection/query", async (c) => {
  const db = getDb(c);
  const collection = c.req.param("collection");
  const body = await c.req.json().catch(() => ({}));

  const resolved = await resolveCollection(db, collection);
  if (resolved.type === "unknown") {
    return c.json({ error: "Collection not found", collection }, 404);
  }

  try {
    if (resolved.type === "dataset") {
      const ds = resolved.dataset;
      const result = await parseGremiusQuery(dataEntries, {
        ...body,
        where: {
          ...(body.where || {}),
          dataSetId: { eq: ds.id },
        },
      });
      return c.json(result);
    }

    const table = resolved.table;
    const result = await parseGremiusQuery(table, body);
    return c.json(result);
  } catch (err: any) {
    if (err instanceof GremiusQLError) {
      return c.json({ error: err.message, code: err.code, details: err.details }, 400);
    }
    logger.error({ collection, error: err.message }, "Failed to query items");
    return c.json({ error: "Query failed", details: err.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LIST
// ═══════════════════════════════════════════════════════════════════════════════

itemsRoutes.get("/:collection", async (c) => {
  const db = getDb(c);
  const collection = c.req.param("collection");
  const limit = Math.min(Number(c.req.query("limit")) || 50, 1000);
  const offset = Number(c.req.query("offset")) || 0;
  const sort = c.req.query("sort");
  const whereJson = c.req.query("where");

  const resolved = await resolveCollection(db, collection);

  if (resolved.type === "unknown") {
    return c.json({ error: "Collection not found", collection }, 404);
  }

  try {
    if (resolved.type === "dataset") {
      const ds = resolved.dataset;
      const conditions = [eq(dataEntries.dataSetId, ds.id)];

      if (whereJson) {
        try {
          const filters = JSON.parse(whereJson);
          for (const [key, val] of Object.entries(filters)) {
            conditions.push(sql`data->>${key} = ${val as string}`);
          }
        } catch { /* ignore invalid JSON */ }
      }

      const [docs, [total]] = await Promise.all([
        db.select().from(dataEntries)
          .where(and(...conditions))
          .orderBy(sort ? asc(sql`data->>${sort.replace(/^-/, "")}`) : desc(dataEntries.createdAt))
          .limit(limit).offset(offset),
        db.select({ value: sql<number>`count(*)` })
          .from(dataEntries).where(and(...conditions)),
      ]);

      return c.json({
        docs: docs.map((d: typeof dataEntries.$inferSelect) => ({ id: d.id, ...d.data, _meta: { datasetId: d.dataSetId, createdAt: d.createdAt } })),
        totalDocs: total?.value || 0,
        limit,
        offset,
        collection,
      });
    }

    const table = resolved.table;
    const conditions = buildWhereFilters(table, whereJson);
    const orderBy = buildOrderBy(table, sort);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [docs, [total]] = await Promise.all([
      db.select().from(table).where(where).orderBy(...orderBy).limit(limit).offset(offset),
      db.select({ value: sql<number>`count(*)` }).from(table).where(where),
    ]);

    return c.json({
      docs,
      totalDocs: total?.value || 0,
      limit,
      offset,
      collection,
    });
  } catch (err: any) {
    logger.error({ collection, error: err.message }, "Failed to list items");
    return c.json({ error: "Query failed", details: err.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET ONE
// ═══════════════════════════════════════════════════════════════════════════════

itemsRoutes.get("/:collection/:id", async (c) => {
  const db = getDb(c);
  const collection = c.req.param("collection");
  const id = c.req.param("id");

  const resolved = await resolveCollection(db, collection);
  if (resolved.type === "unknown") {
    return c.json({ error: "Collection not found", collection }, 404);
  }

  try {
    if (resolved.type === "dataset") {
      const [doc] = await db.select().from(dataEntries)
        .where(and(eq(dataEntries.dataSetId, resolved.dataset.id), eq(dataEntries.id, id)))
        .limit(1);
      if (!doc) return c.json({ error: "Not found" }, 404);
      return c.json({ id: doc.id, ...doc.data, _meta: { datasetId: doc.dataSetId, createdAt: doc.createdAt } });
    }

    const table = resolved.table;
    const [doc] = await db.select().from(table).where(eq(table.id, id)).limit(1);
    if (!doc) return c.json({ error: "Not found" }, 404);
    return c.json(doc);
  } catch (err: any) {
    logger.error({ collection, id, error: err.message }, "Failed to get item");
    return c.json({ error: "Query failed", details: err.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE
// ═══════════════════════════════════════════════════════════════════════════════

itemsRoutes.post("/:collection", async (c) => {
  const db = getDb(c);
  const collection = c.req.param("collection");
  const body = await c.req.json();

  const resolved = await resolveCollection(db, collection);
  if (resolved.type === "unknown") {
    return c.json({ error: "Collection not found", collection }, 404);
  }

  try {
    if (resolved.type === "dataset") {
      const ds = resolved.dataset;
      const title = body.title || body.name || "Untitled";
      const ownerId = body.ownerId ?? c.get("user")?.id ?? null;
      const [doc] = await db.insert(dataEntries).values({
        dataSetId: ds.id,
        title,
        data: { ...body, ownerId },
        ownerId,
      }).returning();

      broadcastMutation(ds.id, "insert", { datasetSlug: collection, entryId: doc.id });
      await invalidateGraphQLCache();
      return c.json({ id: doc.id, ...doc.data, _meta: { datasetId: doc.dataSetId } }, 201);
    }

    const table = resolved.table;
    const [doc] = await db.insert(table).values(body).returning();
    broadcastMutation(collection, "insert", { id: doc.id });
    await invalidateGraphQLCache();
    return c.json(doc, 201);
  } catch (err: any) {
    logger.error({ collection, error: err.message }, "Failed to create item");
    return c.json({ error: "Insert failed", details: err.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE
// ═══════════════════════════════════════════════════════════════════════════════

itemsRoutes.patch("/:collection/:id", async (c) => {
  const db = getDb(c);
  const collection = c.req.param("collection");
  const id = c.req.param("id");
  const body = await c.req.json();

  const resolved = await resolveCollection(db, collection);
  if (resolved.type === "unknown") {
    return c.json({ error: "Collection not found", collection }, 404);
  }

  try {
    if (resolved.type === "dataset") {
      const ds = resolved.dataset;
      const [existing] = await db.select().from(dataEntries)
        .where(and(eq(dataEntries.dataSetId, ds.id), eq(dataEntries.id, id)))
        .limit(1);
      if (!existing) return c.json({ error: "Not found" }, 404);

      const mergedData = { ...(existing.data as any), ...body };
      const [doc] = await db.update(dataEntries)
        .set({ data: mergedData, title: body.title || body.name || existing.title })
        .where(eq(dataEntries.id, id))
        .returning();

      broadcastMutation(ds.id, "update", { datasetSlug: collection, entryId: doc.id });
      await invalidateGraphQLCache();
      return c.json({ id: doc.id, ...doc.data, _meta: { datasetId: doc.dataSetId } });
    }

    const table = resolved.table;
    const [existing] = await db.select().from(table).where(eq(table.id, id)).limit(1);
    if (!existing) return c.json({ error: "Not found" }, 404);

    const [doc] = await db.update(table).set(body).where(eq(table.id, id)).returning();
    broadcastMutation(collection, "update", { id: doc.id });
    await invalidateGraphQLCache();
    return c.json(doc);
  } catch (err: any) {
    logger.error({ collection, id, error: err.message }, "Failed to update item");
    return c.json({ error: "Update failed", details: err.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE
// ═══════════════════════════════════════════════════════════════════════════════

itemsRoutes.delete("/:collection/:id", async (c) => {
  const db = getDb(c);
  const collection = c.req.param("collection");
  const id = c.req.param("id");

  const resolved = await resolveCollection(db, collection);
  if (resolved.type === "unknown") {
    return c.json({ error: "Collection not found", collection }, 404);
  }

  try {
    if (resolved.type === "dataset") {
      const ds = resolved.dataset;
      const [existing] = await db.select().from(dataEntries)
        .where(and(eq(dataEntries.dataSetId, ds.id), eq(dataEntries.id, id)))
        .limit(1);
      if (!existing) return c.json({ error: "Not found" }, 404);

      await db.delete(dataEntries).where(eq(dataEntries.id, id));
      broadcastMutation(ds.id, "delete", { datasetSlug: collection, entryId: id });
      await invalidateGraphQLCache();
      return c.json({ success: true, id });
    }

    const table = resolved.table;
    const [existing] = await db.select().from(table).where(eq(table.id, id)).limit(1);
    if (!existing) return c.json({ error: "Not found" }, 404);

    await db.delete(table).where(eq(table.id, id));
    broadcastMutation(collection, "delete", { id });
    await invalidateGraphQLCache();
    return c.json({ success: true, id });
  } catch (err: any) {
    logger.error({ collection, id, error: err.message }, "Failed to delete item");
    return c.json({ error: "Delete failed", details: err.message }, 500);
  }
});
