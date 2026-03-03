/**
 * Data Explorer API — "Data Studio" (Pilar 1)
 *
 * Universal table explorer with:
 *   ✅ Whitelist-based table access (security)
 *   ✅ Server-side pagination (limit/offset)
 *   ✅ Server-side sorting (any column, asc/desc)
 *   ✅ Server-side filtering (field, operator, value)
 *   ✅ Inline edit via PATCH (single cell updates)
 *   ✅ Column metadata (types, editability)
 *   ✅ Smart Views (saved filter presets)
 */

import { Hono } from "hono";
import { db } from "../db";
import {
  authUsers as user,
  games,
  blogPosts,
  media,
  platforms,
  tags,
  streamers,
  dataSets,
  dataEntries,
  siteSettings,
  modules,
  gameCollections,
} from "../db/schema";
import { count, eq, sql, asc, desc, ilike, gt, lt, gte, lte } from "drizzle-orm";

export const explorerRoutes = new Hono();

// ═══════════════════════════════════════════════
// TABLE REGISTRY (Security whitelist + metadata)
// ═══════════════════════════════════════════════

interface TableMeta {
  table: any;
  label: string;
  icon: string;
  /** Columns that cannot be edited inline */
  readonlyFields: string[];
  /** Primary key column name */
  pk: string;
}

const tableRegistry: Record<string, TableMeta> = {
  auth_users: { table: user, label: "Auth Users", icon: "🔐", readonlyFields: ["id", "created_at", "updated_at"], pk: "id" },
  games: { table: games, label: "Games", icon: "🎮", readonlyFields: ["id", "created_at", "updated_at"], pk: "id" },
  posts: { table: blogPosts, label: "Blog Posts", icon: "📝", readonlyFields: ["id", "created_at", "updated_at"], pk: "id" },
  media: { table: media, label: "Media", icon: "🖼️", readonlyFields: ["id", "created_at", "s3_key"], pk: "id" },
  platforms: { table: platforms, label: "Platforms", icon: "🕹️", readonlyFields: ["id", "created_at"], pk: "id" },
  tags: { table: tags, label: "Tags", icon: "🏷️", readonlyFields: ["id", "created_at"], pk: "id" },
  streamers: { table: streamers, label: "Streamers", icon: "📺", readonlyFields: ["id", "created_at"], pk: "id" },
  datasets: { table: dataSets, label: "Data Sets", icon: "📊", readonlyFields: ["id", "created_at"], pk: "id" },
  entries: { table: dataEntries, label: "Data Entries", icon: "📋", readonlyFields: ["id", "created_at", "updated_at"], pk: "id" },
  settings: { table: siteSettings, label: "Site Settings", icon: "⚙️", readonlyFields: ["id"], pk: "id" },
  modules: { table: modules, label: "Modules", icon: "🧩", readonlyFields: ["created_at"], pk: "key" },
  collections: { table: gameCollections, label: "Game Collections", icon: "📚", readonlyFields: ["id", "created_at", "updated_at"], pk: "id" },
};

// ── GET /tables — List available tables ──
explorerRoutes.get("/tables", async (c) => {
  const tables = await Promise.all(
    Object.entries(tableRegistry).map(async ([key, meta]) => {
      try {
        const [result] = await db.select({ value: count() }).from(meta.table);
        return {
          key,
          label: meta.label,
          icon: meta.icon,
          rowCount: Number(result?.value ?? 0),
        };
      } catch {
        return { key, label: meta.label, icon: meta.icon, rowCount: 0 };
      }
    })
  );
  return c.json({ tables });
});

// ── GET /:collection — Paginated, sorted, filtered list ──
explorerRoutes.get("/:collection", async (c) => {
  const collectionName = c.req.param("collection");
  const meta = tableRegistry[collectionName];

  if (!meta) {
    return c.json({ error: `Collection '${collectionName}' not found.`, available: Object.keys(tableRegistry) }, 404);
  }

  // Parse query params
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 500);
  const page = Math.max(Number(c.req.query("page")) || 1, 1);
  const offset = (page - 1) * limit;
  const sortField = c.req.query("sort") || null;
  const sortDir = c.req.query("dir") === "asc" ? "asc" : "desc";

  // Filters: ?filter_field=email&filter_op=contains&filter_value=@gmail.com
  const filterField = c.req.query("filter_field");
  const filterOp = c.req.query("filter_op") || "contains";
  const filterValue = c.req.query("filter_value");

  try {
    // Build base query
    let query = db.select().from(meta.table).$dynamic();

    // Apply filter
    if (filterField && filterValue) {
      const col = meta.table[filterField];
      if (col) {
        switch (filterOp) {
          case "contains":
            query = query.where(ilike(col, `%${filterValue}%`));
            break;
          case "equals":
            query = query.where(eq(col, filterValue));
            break;
          case "gt":
            query = query.where(gt(col, filterValue));
            break;
          case "lt":
            query = query.where(lt(col, filterValue));
            break;
          case "gte":
            query = query.where(gte(col, filterValue));
            break;
          case "lte":
            query = query.where(lte(col, filterValue));
            break;
        }
      }
    }

    // Get total (with filters applied)
    // We need a separate count query with same filters
    let countQuery = db.select({ value: count() }).from(meta.table).$dynamic();
    if (filterField && filterValue) {
      const col = meta.table[filterField];
      if (col) {
        switch (filterOp) {
          case "contains":
            countQuery = countQuery.where(ilike(col, `%${filterValue}%`));
            break;
          case "equals":
            countQuery = countQuery.where(eq(col, filterValue));
            break;
          case "gt":
            countQuery = countQuery.where(gt(col, filterValue));
            break;
          case "lt":
            countQuery = countQuery.where(lt(col, filterValue));
            break;
          case "gte":
            countQuery = countQuery.where(gte(col, filterValue));
            break;
          case "lte":
            countQuery = countQuery.where(lte(col, filterValue));
            break;
        }
      }
    }

    const [countResult] = await countQuery;
    const total = Number(countResult?.value ?? 0);

    // Apply sort
    if (sortField && meta.table[sortField]) {
      query = query.orderBy(
        sortDir === "asc" ? asc(meta.table[sortField]) : desc(meta.table[sortField])
      );
    }

    // Apply pagination
    query = query.limit(limit).offset(offset);

    const data = await query;

    // Column metadata (derived from first row or table definition)
    const columns = data.length > 0
      ? Object.keys(data[0]).map((key) => ({
        field: key,
        editable: !meta.readonlyFields.includes(key),
        type: inferColumnType(key, data[0][key]),
      }))
      : [];

    const totalPages = Math.ceil(total / limit);

    return c.json({
      data,
      columns,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error: any) {
    console.error(`Explorer Error [${collectionName}]:`, error);
    return c.json({ error: error.message }, 500);
  }
});

// ── PATCH /:collection/:id — Inline cell update ──
explorerRoutes.patch("/:collection/:id", async (c) => {
  const collectionName = c.req.param("collection");
  const id = c.req.param("id");
  const meta = tableRegistry[collectionName];

  if (!meta) {
    return c.json({ error: `Collection '${collectionName}' not found.` }, 404);
  }

  try {
    const body = await c.req.json();

    // Security: strip readonly fields
    for (const field of meta.readonlyFields) {
      delete body[field];
    }

    if (Object.keys(body).length === 0) {
      return c.json({ error: "No editable fields provided" }, 400);
    }

    // Add updated_at if the table has it
    if (meta.table.updated_at || meta.table.updatedAt) {
      body.updated_at = new Date();
    }

    const pkCol = meta.table[meta.pk];
    const [updated] = await db
      .update(meta.table)
      .set(body)
      .where(eq(pkCol, id))
      .returning();

    if (!updated) {
      return c.json({ error: "Record not found" }, 404);
    }

    return c.json(updated);
  } catch (error: any) {
    console.error(`Explorer Update [${collectionName}]:`, error);
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════
// SMART VIEWS (Saved filter presets)
// ═══════════════════════════════════════════════

// In-memory store (upgrade to DB table later for persistence)
// For now this is per-server-restart. The frontend will also
// persist to localStorage as backup.
const smartViews = new Map<string, SmartView[]>();

interface SmartView {
  id: string;
  name: string;
  collection: string;
  filters: { field: string; op: string; value: string }[];
  sort?: { field: string; dir: string };
  createdAt: string;
}

// ── GET /:collection/views — List saved views ──
explorerRoutes.get("/:collection/views", async (c) => {
  const collection = c.req.param("collection");
  const views = smartViews.get(collection) || [];
  return c.json({ views });
});

// ── POST /:collection/views — Save a new view ──
explorerRoutes.post("/:collection/views", async (c) => {
  const collection = c.req.param("collection");
  const body = await c.req.json();

  const view: SmartView = {
    id: `sv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: body.name || "Untitled View",
    collection,
    filters: body.filters || [],
    sort: body.sort,
    createdAt: new Date().toISOString(),
  };

  const existing = smartViews.get(collection) || [];
  existing.push(view);
  smartViews.set(collection, existing);

  return c.json(view, 201);
});

// ── DELETE /:collection/views/:viewId — Delete a view ──
explorerRoutes.delete("/:collection/views/:viewId", async (c) => {
  const collection = c.req.param("collection");
  const viewId = c.req.param("viewId");

  const existing = smartViews.get(collection) || [];
  const filtered = existing.filter((v) => v.id !== viewId);
  smartViews.set(collection, filtered);

  return c.json({ deleted: true });
});

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function inferColumnType(key: string, value: any): string {
  if (key === "id" || key.endsWith("_id") || key.endsWith("Id")) return "id";
  if (key.includes("at") || key.includes("At") || key.includes("date") || key.includes("Date")) {
    if (value instanceof Date || (typeof value === "string" && !isNaN(Date.parse(value)))) return "date";
  }
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "object" && value !== null) return "json";
  if (key.includes("url") || key.includes("Url")) return "url";
  if (key.includes("email")) return "email";
  if (key.includes("color") || key.includes("Color")) return "color";
  return "text";
}
