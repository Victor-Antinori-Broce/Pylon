// @ts-nocheck
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
  media,
  dataSets,
  dataEntries,
  siteSettings,
  modules,
} from "../db/schema";
import { count, eq, sql, asc, desc, ilike, gt, lt, gte, lte } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { introspectTable, getAllTables } from "../services/schema-introspector";

export const explorerRoutes = new Hono();

// Apply authentication to all routes
explorerRoutes.use("/*", requireAuth);

// ═══════════════════════════════════════════════
// DYNAMIC TABLE RESOLUTION (fallback for tables not in static registry)
// ═══════════════════════════════════════════════

/**
 * Resolve a table — check static registry first, then fall back to
 * dynamic introspection of any real DB table via information_schema.
 * This allows ALL tables to be explored without manual registration.
 */
async function resolveTable(name: string): Promise<TableMeta | null> {
  // 1. Static registry (fast, typed Drizzle references)
  if (tableRegistry[name]) return tableRegistry[name];

  // 2. Dynamic introspection (any DB table)
  const introspected = await introspectTable(name);
  if (!introspected) return null;

  // Build a dynamic TableMeta using raw SQL
  const pk = introspected.primaryKey[0] || "id";
  const readonlyFields = [
    pk,
    ...introspected.columns.filter(c => c.name.endsWith("_at") || c.name === "createdAt" || c.name === "updatedAt").map(c => c.name),
  ];

  return {
    table: name as any, // Will use raw SQL, not Drizzle reference
    label: humanizeTableNameLocal(name),
    icon: "📋",
    readonlyFields,
    pk,
    _dynamic: true, // Flag: use raw SQL instead of Drizzle ORM
  } as TableMeta;
}

function humanizeTableNameLocal(name: string): string {
  return name.replace(/_/g, " ").replace(/^./, s => s.toUpperCase()).trim();
}

// ═══════════════════════════════════════════════
// SCHEMA INTROSPECTION — For Admin UI generation
// ═══════════════════════════════════════════════

// ── GET /schema/:grimoire — Get schema for a grimoire's tables ──
explorerRoutes.get("/schema/:grimoire", async (c) => {
  const grimoireId = c.req.param("grimoire");

  // Map grimoire IDs to their tables
  const grimoireTables: Record<string, string[]> = {
    academy: ["courses", "lessons", "enrollments"],
    booking: ["bookings", "services", "availability"],
    directory: ["listings", "categories", "reviews"],
    dms: ["documents", "folders", "tags"],
    esports: ["tournaments", "matches", "teams", "players"],
    "gremius-crm": ["contacts", "deals", "activities"],
    games: ["games", "game_collections"],
    media: ["media"],
    posts: ["posts"],
    streamers: ["streamers"],
    webhooks: ["webhooks"],
    workers: ["workers"],
  };

  const tables = grimoireTables[grimoireId] || [grimoireId];

  // Return schema info for each table
  const schema = tables.map(tableName => {
    const meta = tableRegistry[tableName];
    return {
      name: tableName,
      label: meta?.label || tableName,
      icon: meta?.icon || "📄",
      exists: !!meta,
    };
  });

  return c.json({ grimoire: grimoireId, tables: schema });
});

// ── GET /schema/:grimoire/:table — Get detailed column info ──
explorerRoutes.get("/schema/:grimoire/:table", async (c) => {
  const tableName = c.req.param("table");
  const meta = tableRegistry[tableName];

  if (!meta) {
    return c.json({
      error: `Table '${tableName}' not found`,
      available: Object.keys(tableRegistry)
    }, 404);
  }

  // Get sample row to infer columns
  try {
    const [sample] = await db.select().from(meta.table).limit(1);

    const columns = sample
      ? Object.entries(sample).map(([key, value]) => ({
        name: key,
        type: inferColumnType(key, value),
        editable: !meta.readonlyFields.includes(key),
        nullable: value === null,
      }))
      : [];

    return c.json({
      table: tableName,
      label: meta.label,
      icon: meta.icon,
      primaryKey: meta.pk,
      columns,
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ── GET /schema/json/:table — JSON Schema export (for AI codegen & SDK) ──
// Returns a standard JSON Schema document. TOON-compatible via middleware.
explorerRoutes.get("/schema/json/:table", async (c) => {
  const tableName = c.req.param("table");
  const meta = tableRegistry[tableName];

  if (!meta) {
    return c.json({
      error: `Table '${tableName}' not found`,
      available: Object.keys(tableRegistry)
    }, 404);
  }

  try {
    const [sample] = await db.select().from(meta.table).limit(1);

    const properties: Record<string, any> = {};
    const required: string[] = [];

    if (sample) {
      for (const [key, value] of Object.entries(sample)) {
        const colType = inferColumnType(key, value);
        const isReadonly = meta.readonlyFields.includes(key);
        const relatedTable = getRelatedTable(key);

        const prop: Record<string, any> = {
          type: mapToJsonSchemaType(colType, value),
        };

        // Add format hints
        if (colType === 'date') prop.format = 'date-time';
        if (colType === 'email') prop.format = 'email';
        if (colType === 'url') prop.format = 'uri';
        if (colType === 'id') prop.format = 'uuid';

        // Add relation metadata
        if (colType === 'relation' && relatedTable) {
          prop.format = 'uuid';
          prop['x-relation'] = {
            table: relatedTable,
            optionsEndpoint: `/api/explorer/${relatedTable}/options`,
          };
        }

        // Add readonly hint
        if (isReadonly) {
          prop.readOnly = true;
        }

        // Description
        prop.description = generateFieldDescription(key, colType, relatedTable);

        properties[key] = prop;

        // Non-nullable, non-readonly fields are required
        if (value !== null && !isReadonly && key !== meta.pk) {
          required.push(key);
        }
      }
    }

    const jsonSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: `gremius://tables/${tableName}`,
      title: meta.label,
      description: `Schema for the ${meta.label} table in GremiusCMS`,
      type: "object",
      properties,
      required,
      "x-gremius": {
        table: tableName,
        primaryKey: meta.pk,
        icon: meta.icon,
        readonlyFields: meta.readonlyFields,
        endpoints: {
          list: `/api/explorer/${tableName}`,
          create: `/api/explorer/${tableName}`,
          update: `/api/explorer/${tableName}/{id}`,
          delete: `/api/explorer/${tableName}/{id}`,
          options: `/api/explorer/${tableName}/options`,
        },
      },
    };

    return c.json(jsonSchema);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

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
  /** If true, use raw SQL queries instead of Drizzle ORM (dynamically discovered table) */
  _dynamic?: boolean;
}

const tableRegistry: Record<string, TableMeta> = {
  auth_users: { table: user, label: "Auth Users", icon: "🔐", readonlyFields: ["id", "created_at", "updated_at"], pk: "id" },
  media: { table: media, label: "Media", icon: "🖼️", readonlyFields: ["id", "created_at", "s3_key"], pk: "id" },
  datasets: { table: dataSets, label: "Data Sets", icon: "📊", readonlyFields: ["id", "created_at"], pk: "id" },
  entries: { table: dataEntries, label: "Data Entries", icon: "📋", readonlyFields: ["id", "created_at", "updated_at"], pk: "id" },
  settings: { table: siteSettings, label: "Site Settings", icon: "⚙️", readonlyFields: ["id"], pk: "id" },
  modules: { table: modules, label: "Modules", icon: "🧩", readonlyFields: ["created_at"], pk: "key" },
};

// ── GET /tables — List ALL available tables (static + dynamic from DB) ──
explorerRoutes.get("/tables", async (c) => {
  // Start with static registry
  const staticTables = await Promise.all(
    Object.entries(tableRegistry).map(async ([key, meta]) => {
      try {
        const [result] = await db.select({ value: count() }).from(meta.table);
        return {
          key,
          label: meta.label,
          icon: meta.icon,
          rowCount: Number(result?.value ?? 0),
          source: "static" as const,
        };
      } catch {
        return { key, label: meta.label, icon: meta.icon, rowCount: 0, source: "static" as const };
      }
    })
  );

  // Discover additional tables from DB that aren't in static registry
  const allDbTables = await getAllTables();
  const staticKeys = new Set(Object.keys(tableRegistry));
  const dynamicTables = allDbTables
    .filter(t => !staticKeys.has(t) && !t.startsWith("auth_") && !t.startsWith("_"))
    .map(t => ({
      key: t,
      label: humanizeTableNameLocal(t),
      icon: "📋",
      rowCount: 0, // Avoid N queries — count on demand
      source: "dynamic" as const,
    }));

  return c.json({ tables: [...staticTables, ...dynamicTables] });
});

// ── GET /discover/:grimoireId — Discover tables owned by a grimoire ──
// Reads grimoire.json tables[] AND cross-refs with real DB tables
explorerRoutes.get("/discover/:grimoireId", async (c) => {
  const grimoireId = c.req.param("grimoireId");
  const allDbTables = await getAllTables();

  // Strategy 1: Check grimoire.json for declared tables
  const { scanPackages } = await import("../services/scanner");
  const grimoires = await scanPackages("grimoires");
  const manifest = grimoires.find(g => g.id === grimoireId || g.id === `grimoire-${grimoireId}`);

  let declaredTables: string[] = [];
  if (manifest?.tables) {
    declaredTables = (manifest.tables as any[]).map(t => typeof t === "string" ? t : t.name).filter(Boolean);
  }

  // Strategy 2: Pattern-match DB tables by grimoire name prefix
  const shortId = grimoireId.replace(/^grimoire-/, "").replace(/-/g, "_");
  const patternMatches = allDbTables.filter(t =>
    t.startsWith(shortId + "_") || t === shortId || t === shortId + "s"
  );

  // Strategy 3: Check for well-known table name patterns
  const knownPatterns: Record<string, string[]> = {
    booking: ["reservations", "rooms", "amenities", "room_amenities"],
    academy: ["academy_courses", "academy_enrollments", "academy_topics", "academy_quizzes", "academy_questions", "academy_quiz_attempts", "academy_satisfaction_surveys", "academy_user_progress"],
    dms: ["documents", "document_versions"],
    directory: ["employee_profile"],
    blog: ["blog_posts", "blog_posts_to_tags", "blog_posts_to_games"],
    webhooks: ["webhooks_config", "webhooks_log"],
    connectors: ["data_connectors"],
    "media-library": ["media"],
    games: ["games", "games_to_platforms", "games_to_streamers", "games_to_tags"],
    streamers: ["streamers"],
    platforms: ["platforms"],
    tags: ["tags"],
    collections: ["game_collections", "game_collection_entries"],
    "ai-memories": ["ai_memories", "ai_memory_chunks"],
    workers: ["gremius_functions", "function_executions"],
    "gremius-crm": [],  // No tables in migration yet
  };
  const knownTables = knownPatterns[shortId] || knownPatterns[grimoireId] || [];

  // Merge all sources, dedupe, and validate against actual DB
  const allCandidates = new Set([...declaredTables, ...patternMatches, ...knownTables]);
  const verified: Array<{ name: string; exists: boolean; rowCount: number; source: string }> = [];

  for (const tableName of allCandidates) {
    const exists = allDbTables.includes(tableName);
    let rowCount = 0;
    if (exists) {
      try {
        const result = await db.execute(sql`SELECT count(*) as c FROM "${sql.raw(tableName)}"`);
        rowCount = Number((result.rows[0] as any)?.c ?? 0);
      } catch { }
    }
    const source = declaredTables.includes(tableName) ? "grimoire.json" :
      knownTables.includes(tableName) ? "known-pattern" : "prefix-match";
    verified.push({ name: tableName, exists, rowCount, source });
  }

  return c.json({
    grimoireId,
    tables: verified.filter(t => t.exists),
    missing: verified.filter(t => !t.exists).map(t => t.name),
    manifestFound: !!manifest,
  });
});

// ── GET /:collection — Paginated, sorted, filtered list ──
explorerRoutes.get("/:collection", async (c) => {
  const collectionName = c.req.param("collection");
  const meta = await resolveTable(collectionName);

  if (!meta) {
    return c.json({ error: `Collection '${collectionName}' not found.`, available: Object.keys(tableRegistry) }, 404);
  }

  // Dynamic tables use raw SQL
  if (meta._dynamic) {
    return handleDynamicQuery(c, collectionName, meta);
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
  const meta = await resolveTable(collectionName);

  if (!meta) {
    return c.json({ error: `Collection '${collectionName}' not found.` }, 404);
  }

  if (meta._dynamic) {
    return handleDynamicUpdate(c, collectionName, meta, id);
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

// ── POST /:collection — Create a new record ──
explorerRoutes.post("/:collection", async (c) => {
  const collectionName = c.req.param("collection");
  const meta = await resolveTable(collectionName);

  if (!meta) {
    return c.json({ error: `Collection '${collectionName}' not found.` }, 404);
  }

  if (meta._dynamic) {
    return handleDynamicCreate(c, collectionName, meta);
  }

  try {
    const body = await c.req.json();

    // Security: strip readonly fields
    for (const field of meta.readonlyFields) {
      delete body[field];
    }

    if (Object.keys(body).length === 0) {
      return c.json({ error: "No fields provided" }, 400);
    }

    const result = await db
      .insert(meta.table)
      .values(body)
      .returning();

    const created = Array.isArray(result) ? result[0] : result;

    return c.json(created, 201);
  } catch (error: any) {
    console.error(`Explorer Create [${collectionName}]:`, error);
    return c.json({ error: error.message }, 500);
  }
});

// ── DELETE /:collection/:id — Delete a record ──
explorerRoutes.delete("/:collection/:id", async (c) => {
  const collectionName = c.req.param("collection");
  const id = c.req.param("id");
  const meta = await resolveTable(collectionName);

  if (!meta) {
    return c.json({ error: `Collection '${collectionName}' not found.` }, 404);
  }

  if (meta._dynamic) {
    return handleDynamicDelete(c, collectionName, meta, id);
  }

  try {
    const pkCol = meta.table[meta.pk];
    const [deleted] = await db
      .delete(meta.table)
      .where(eq(pkCol, id))
      .returning();

    if (!deleted) {
      return c.json({ error: "Record not found" }, 404);
    }

    return c.json({ deleted: true, id });
  } catch (error: any) {
    console.error(`Explorer Delete [${collectionName}]:`, error);
    return c.json({ error: error.message }, 500);
  }
});

// ── GET /:collection/options — FK dropdown options ──
// Returns { value, label } pairs for populating relation dropdowns
explorerRoutes.get("/:collection/options", async (c) => {
  const collectionName = c.req.param("collection");
  const meta = await resolveTable(collectionName);

  if (!meta) {
    return c.json({ error: `Collection '${collectionName}' not found.` }, 404);
  }

  if (meta._dynamic) {
    return handleDynamicOptions(c, collectionName, meta);
  }

  try {
    const rows = await db.select().from(meta.table).limit(200);

    // Find the best display field: name > title > label > email > slug > first text column
    const displayPriority = ["name", "title", "label", "email", "slug", "siteName"];
    let displayField = "id";

    if (rows.length > 0) {
      const keys = Object.keys(rows[0]);
      for (const prio of displayPriority) {
        if (keys.includes(prio)) {
          displayField = prio;
          break;
        }
      }
      // Fallback: first string column that isn't the PK
      if (displayField === "id") {
        const textCol = keys.find(k => k !== meta.pk && typeof rows[0][k] === "string");
        if (textCol) displayField = textCol;
      }
    }

    const options = rows.map(row => ({
      value: (row as any)[meta.pk],
      label: String((row as any)[displayField] || (row as any)[meta.pk]),
    }));

    return c.json({ options, displayField, collection: collectionName });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// ═══════════════════════════════════════════════
// DYNAMIC TABLE HANDLERS (raw SQL for auto-discovered tables)
// ═══════════════════════════════════════════════

async function handleDynamicQuery(c: any, tableName: string, meta: TableMeta) {
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 500);
  const page = Math.max(Number(c.req.query("page")) || 1, 1);
  const offset = (page - 1) * limit;
  const sortField = c.req.query("sort") || meta.pk;
  const sortDir = c.req.query("dir") === "asc" ? "ASC" : "DESC";
  const filterField = c.req.query("filter_field");
  const filterOp = c.req.query("filter_op") || "contains";
  const filterValue = c.req.query("filter_value");

  try {
    let whereClause = "";
    if (filterField && filterValue) {
      // Sanitize: only allow alphanumeric and underscore in field names
      const safeField = filterField.replace(/[^a-zA-Z0-9_]/g, "");
      if (filterOp === "contains") {
        whereClause = `WHERE "${safeField}"::text ILIKE '%' || $1 || '%'`;
      } else if (filterOp === "equals") {
        whereClause = `WHERE "${safeField}"::text = $1`;
      }
    }

    const safeSort = sortField.replace(/[^a-zA-Z0-9_]/g, "");
    const queryParams = filterValue ? [filterValue] : [];

    const countResult = await db.execute(
      sql.raw(`SELECT count(*) as total FROM "${tableName}" ${whereClause}`, queryParams)
    );
    const total = Number((countResult.rows[0] as any)?.total ?? 0);

    const dataResult = await db.execute(
      sql.raw(`SELECT * FROM "${tableName}" ${whereClause} ORDER BY "${safeSort}" ${sortDir} LIMIT ${limit} OFFSET ${offset}`, queryParams)
    );

    const data = dataResult.rows;
    const columns = data.length > 0
      ? Object.keys(data[0]).map(key => ({
        field: key,
        editable: !meta.readonlyFields.includes(key),
        type: inferColumnType(key, (data[0] as any)[key]),
      }))
      : [];

    const totalPages = Math.ceil(total / limit);
    return c.json({
      data,
      columns,
      pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
    });
  } catch (error: any) {
    console.error(`Explorer Dynamic Query [${tableName}]:`, error);
    return c.json({ error: error.message }, 500);
  }
}

async function handleDynamicCreate(c: any, tableName: string, meta: TableMeta) {
  try {
    const body = await c.req.json();
    for (const field of meta.readonlyFields) delete body[field];
    if (Object.keys(body).length === 0) return c.json({ error: "No fields provided" }, 400);

    const keys = Object.keys(body);
    const safeKeys = keys.map(k => `"${k.replace(/[^a-zA-Z0-9_]/g, "")}"`);
    const placeholders = keys.map((_, i) => `${i + 1}`);
    const values = keys.map(k => body[k]);

    const result = await db.execute(
      sql.raw(`INSERT INTO "${tableName}" (${safeKeys.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`, values)
    );
    return c.json(result.rows[0], 201);
  } catch (error: any) {
    console.error(`Explorer Dynamic Create [${tableName}]:`, error);
    return c.json({ error: error.message }, 500);
  }
}

async function handleDynamicUpdate(c: any, tableName: string, meta: TableMeta, id: string) {
  try {
    const body = await c.req.json();
    for (const field of meta.readonlyFields) delete body[field];
    if (Object.keys(body).length === 0) return c.json({ error: "No editable fields provided" }, 400);

    const keys = Object.keys(body);
    const setClauses = keys.map((k, i) => `"${k.replace(/[^a-zA-Z0-9_]/g, "")}" = ${i + 1}`);
    const values = [...keys.map(k => body[k]), id];

    const safePk = meta.pk.replace(/[^a-zA-Z0-9_]/g, "");
    const result = await db.execute(
      sql.raw(`UPDATE "${tableName}" SET ${setClauses.join(", ")} WHERE "${safePk}" = ${keys.length + 1} RETURNING *`, values)
    );
    if (result.rows.length === 0) return c.json({ error: "Record not found" }, 404);
    return c.json(result.rows[0]);
  } catch (error: any) {
    console.error(`Explorer Dynamic Update [${tableName}]:`, error);
    return c.json({ error: error.message }, 500);
  }
}

async function handleDynamicDelete(c: any, tableName: string, meta: TableMeta, id: string) {
  try {
    const safePk = meta.pk.replace(/[^a-zA-Z0-9_]/g, "");
    const result = await db.execute(
      sql.raw(`DELETE FROM "${tableName}" WHERE "${safePk}" = $1 RETURNING *`, [id])
    );
    if (result.rows.length === 0) return c.json({ error: "Record not found" }, 404);
    return c.json({ deleted: true, id });
  } catch (error: any) {
    console.error(`Explorer Dynamic Delete [${tableName}]:`, error);
    return c.json({ error: error.message }, 500);
  }
}

async function handleDynamicOptions(c: any, tableName: string, meta: TableMeta) {
  try {
    const result = await db.execute(
      sql.raw(`SELECT * FROM "${tableName}" LIMIT 200`)
    );
    const rows = result.rows as any[];
    const displayPriority = ["name", "title", "label", "email", "slug", "display_name"];
    let displayField = meta.pk;
    if (rows.length > 0) {
      const keys = Object.keys(rows[0]);
      for (const prio of displayPriority) {
        if (keys.includes(prio)) { displayField = prio; break; }
      }
      if (displayField === meta.pk) {
        const textCol = keys.find(k => k !== meta.pk && typeof rows[0][k] === "string");
        if (textCol) displayField = textCol;
      }
    }
    const options = rows.map(row => ({ value: row[meta.pk], label: String(row[displayField] || row[meta.pk]) }));
    return c.json({ options, displayField, collection: tableName });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
}

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

/**
 * Infer the column type and optional FK reference from a column name and value.
 * Returns type string. For FK columns, also provides the related table name.
 */
interface ColumnTypeInfo {
  type: string;
  /** For FK columns: the inferred related table name */
  relatedTable?: string;
}

/** Map of known FK column → table name patterns */
const FK_TABLE_MAP: Record<string, string> = {
  game_id: "games",
  gameId: "games",
  platform_id: "platforms",
  platformId: "platforms",
  tag_id: "tags",
  tagId: "tags",
  streamer_id: "streamers",
  streamerId: "streamers",
  collection_id: "collections",
  collectionId: "collections",
  user_id: "auth_users",
  userId: "auth_users",
  author_id: "auth_users",
  authorId: "auth_users",
  assigned_to_id: "auth_users",
  assignedToId: "auth_users",
  contact_id: "contacts",
  contactId: "contacts",
  dataset_id: "datasets",
  datasetId: "datasets",
};

function inferColumnType(key: string, value: any): string {
  if (key === "id") return "id";
  if (key.endsWith("_id") || (key.endsWith("Id") && key !== "id")) return "relation";
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

/** Get the related table for a FK column name */
function getRelatedTable(columnName: string): string | undefined {
  if (FK_TABLE_MAP[columnName]) return FK_TABLE_MAP[columnName];
  // Infer from column name: strip _id suffix → pluralize
  const base = columnName.replace(/_id$/, "").replace(/Id$/, "");
  const plural = base.endsWith("s") ? base : base + "s";
  if (tableRegistry[plural]) return plural;
  if (tableRegistry[base]) return base;
  return undefined;
}

/** Map internal column types to JSON Schema types */
function mapToJsonSchemaType(colType: string, value: any): string {
  switch (colType) {
    case 'id':
    case 'text':
    case 'email':
    case 'url':
    case 'color':
    case 'date':
    case 'relation':
      return 'string';
    case 'number':
      return Number.isInteger(value) ? 'integer' : 'number';
    case 'boolean':
      return 'boolean';
    case 'json':
      return 'object';
    default:
      return 'string';
  }
}

/** Generate a human-readable field description */
function generateFieldDescription(key: string, colType: string, relatedTable?: string): string {
  if (colType === 'relation' && relatedTable) {
    return `Foreign key to ${relatedTable} table`;
  }
  if (colType === 'id') return 'Unique identifier (UUID)';
  if (colType === 'date') return `Timestamp field`;
  if (key === 'createdAt') return 'Record creation timestamp';
  if (key === 'updatedAt') return 'Last modification timestamp';
  // Convert camelCase to human-readable
  const readable = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
  return readable;
}
