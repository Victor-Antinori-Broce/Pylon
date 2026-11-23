/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Kitsuden Engine — Auto-API & MCP Generator (Nivel 1: Core Infrastructure)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * El "corazón mágico" de Kitsuden: transforma modelos Drizzle en APIs REST y
 * herramientas MCP automáticamente. Una sola declaración genera toda la infraestructura.
 *
 * Design Goals:
 *   1. Metaprogramación elegante: Extraer metadatos de tipos Drizzle en tiempo de ejecución
 *   2. Zero-config CRUD: Solo pasa el array de modelos, el framework hace el resto
 *   3. MCP-native: Cada tabla expone automáticamente tools de lectura/escritura para LLMs
 *   4. Type-safe: Inferencia completa de tipos desde los modelos Drizzle
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * @example
 * ```typescript
 * import { defineKon } from "@kitsuden/engine/kon";
 * import { agileIssues, agileProjects } from "./schema";
 *
 * export const agileKon = defineKon({
 *   id: "agile",
 *   name: "Agile Project Management",
 *   models: [agileIssues, agileProjects],
 *   actions: [
 *     {
 *       trigger: "http.post:/api/agile/sprints/:id/close",
 *       run: async ({ payload, db }) => { ... }
 *     }
 *   ],
 * });
 *
 * // Resultado:
 * // ✅ GET  /api/agile/agile_issues        (Auto-API)
 * // ✅ POST /api/agile/agile_issues        (Auto-API)
 * // ✅ Tool MCP: "read_agile_issues"       (Auto-MCP)
 * // ✅ Tool MCP: "create_agile_issues"     (Auto-MCP)
 * // ✅ POST /api/agile/sprints/:id/close   (Custom Action)
 * ```
 */

import { concedeScope, type KonContext } from "@kitsuden/shared";
import type { Table } from "drizzle-orm";
import {
  getTableColumns,
  getTableName,
  InferSelectModel,
  InferInsertModel,
  eq,
  and,
  desc,
  asc,
  count,
} from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import type { PgTable } from "drizzle-orm/pg-core";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Hono, Context as HonoContext } from "hono";

import type { ActionDefinition } from "./actions";
import { defineAction } from "./actions";
import { messageOf } from "./errors";
import { resolveExecutor } from "./request-scope";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES: Kon Definition
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Drizzle Model type - Acepta cualquier tabla de Drizzle ORM
 * Compatible con PostgreSQL, SQLite y MySQL
 */
export type DrizzleModel = Table | PgTable | SQLiteTable | MySqlTable;

/**
 * Helper type para extraer el tipo Select de un modelo Drizzle
 * Uso: type MyRow = InferKonSelect<typeof myTable>
 */
export type InferKonSelect<T extends DrizzleModel> = InferSelectModel<T>;

/**
 * Helper type para extraer el tipo Insert de un modelo Drizzle
 * Uso: type MyInsert = InferKonInsert<typeof myTable>
 */
export type InferKonInsert<T extends DrizzleModel> = InferInsertModel<T>;

/**
 * MCP Tool schema definition (JSON Schema compatible)
 */
export interface MCPToolSchema {
  type: "object";
  properties: Record<
    string,
    {
      type: string;
      description?: string;
      default?: unknown;
      enum?: unknown[];
    }
  >;
  required?: string[];
}

/**
 * MCP Tool definition
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: MCPToolSchema;
  handler: (args: any, extra: any) => Promise<any>;
}

/**
 * Generated API route metadata
 */
export interface GeneratedRoute {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  tableName: string;
  operation: "list" | "create" | "read" | "update" | "delete";
  description: string;
}

/**
 * Generated MCP tool metadata
 */
export interface GeneratedTool {
  name: string;
  tableName: string;
  operation: "read" | "create" | "update" | "delete";
  description: string;
}

/**
 * Kon configuration options
 */
export interface KonOptions {
  /** Unique identifier (e.g., 'agile', 'crm', 'blog') */
  id: string;
  /** Display name */
  name?: string;
  /** Description for MCP */
  description?: string;
  /** Icon name (Lucide) */
  icon?: string;
  /** Drizzle models to auto-expose */
  models?: DrizzleModel[];
  /** Custom actions (manual routes/tools) */
  actions?: ActionDefinition[];
  /** Auto-API configuration */
  api?: {
    /** Base path (default: /api/{id}) */
    basePath?: string;
    /** Enable auto-generated routes */
    enabled?: boolean;
    /** Require authentication for auto-routes */
    requireAuth?: boolean;
    /** Required scopes for auto-routes */
    requiredScopes?: string[];
  };
  /** MCP configuration */
  mcp?: {
    /** Enable auto-generated tools */
    enabled?: boolean;
    /** Tool name prefix (default: {id}) */
    prefix?: string;
  };
}

/**
 * Kon instance - returned by defineKon
 */
export interface Kon {
  /** Kon ID */
  id: string;
  /** Configuration */
  config: KonOptions;
  /** Generated routes */
  routes: GeneratedRoute[];
  /** Generated MCP tools */
  tools: GeneratedTool[];
  /** Manual actions */
  actions: ActionDefinition[];
  /** Initialize with engine */
  initialize: (ctx: KonContext, hono: Hono, mcpServer?: any) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE METADATA EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract column information from a Drizzle model
 * Uses reflection to get column names and types
 */
function extractModelColumns(model: DrizzleModel): Array<{
  name: string;
  type: string;
  isNullable: boolean;
  isPrimary: boolean;
}> {
  const columns: Array<{
    name: string;
    type: string;
    isNullable: boolean;
    isPrimary: boolean;
  }> = [];

  // Access Drizzle's internal column storage
  const modelColumns =
    (model as any)[Symbol.for("drizzle:Columns")] ??
    (model as any).columns ??
    Object.entries(model).filter(([k]) => k !== "config");

  if (typeof modelColumns === "object" && modelColumns !== null) {
    for (const [key, columnDef] of Object.entries(modelColumns)) {
      if (typeof columnDef === "object" && columnDef !== null) {
        const col = columnDef as any;
        columns.push({
          name: col.name ?? key,
          type: col.dataType ?? col.columnType ?? "string",
          isNullable: !col.notNull,
          isPrimary: !!col.primary,
        });
      }
    }
  }

  return columns;
}

/**
 * Infer MCP tool schema from Drizzle model
 * Generates a basic JSON Schema for agent interactions
 */
function inferMCPSchemaFromModel(
  model: DrizzleModel,
  operation: "read" | "create" | "update" | "delete"
): MCPToolSchema {
  const columns = extractModelColumns(model);
  // El tipo exacto ya está declarado arriba: usarlo es mejor que `any` (que
  // apagaba el comprobador) y que `unknown` (que obligaría a castear en cada
  // acceso). Además hace que añadir un campo al esquema MCP falle aquí.
  const properties: MCPToolSchema["properties"] = {};
  const required: string[] = [];

  for (const col of columns) {
    // Map Drizzle types to JSON Schema types
    let jsonType = "string";
    if (col.type.includes("int") || col.type.includes("serial")) {
      jsonType = "integer";
    } else if (col.type.includes("bool")) {
      jsonType = "boolean";
    } else if (col.type.includes("json") || col.type.includes("array")) {
      jsonType = "object";
    } else if (
      col.type.includes("real") ||
      col.type.includes("float") ||
      col.type.includes("double")
    ) {
      jsonType = "number";
    }

    properties[col.name] = {
      type: jsonType,
      description: `${col.name} (${col.type})`,
    };

    // For create operations, require non-nullable fields (except id/auto)
    if (operation === "create" && !col.isNullable && !col.isPrimary && col.name !== "id") {
      // Skip timestamp fields with defaults
      if (!col.name.includes("_at") && !col.name.includes("At")) {
        required.push(col.name);
      }
    }

    // For read operations, id is useful for filtering
    if (operation === "read" && col.isPrimary) {
      properties[col.name].description += " - Filter by ID";
    }
  }

  // Add pagination fields for read operations
  if (operation === "read") {
    properties.limit = {
      type: "integer",
      description: "Maximum number of results (default: 50)",
      default: 50,
    };
    properties.offset = {
      type: "integer",
      description: "Offset for pagination (default: 0)",
      default: 0,
    };
    properties.orderBy = {
      type: "string",
      description: "Field to order by",
    };
    properties.order = {
      type: "string",
      enum: ["asc", "desc"],
      description: "Sort order",
      default: "desc",
    };
  }

  return {
    type: "object",
    properties,
    required: operation === "create" ? required : [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-API GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate CRUD routes for a Drizzle model
 */
function generateModelRoutes(
  _konId: string,
  model: DrizzleModel,
  basePath: string,
  routes: GeneratedRoute[]
): void {
  const tableName = getTableName(model);
  const path = `${basePath}/${tableName}`;

  // LIST - GET /api/{kon}/{table}
  routes.push({
    method: "get",
    path,
    tableName,
    operation: "list",
    description: `List all ${tableName} with pagination`,
  });

  // CREATE - POST /api/{kon}/{table}
  routes.push({
    method: "post",
    path,
    tableName,
    operation: "create",
    description: `Create a new ${tableName}`,
  });

  // READ - GET /api/{kon}/{table}/:id
  routes.push({
    method: "get",
    path: `${path}/:id`,
    tableName,
    operation: "read",
    description: `Get a single ${tableName} by ID`,
  });

  // UPDATE - PATCH /api/{kon}/{table}/:id
  routes.push({
    method: "patch",
    path: `${path}/:id`,
    tableName,
    operation: "update",
    description: `Update a ${tableName}`,
  });

  // DELETE - DELETE /api/{kon}/{table}/:id
  routes.push({
    method: "delete",
    path: `${path}/:id`,
    tableName,
    operation: "delete",
    description: `Delete a ${tableName}`,
  });
}

/**
 * Register auto-generated routes in Hono
 */
function registerAutoRoutes(
  konId: string,
  routes: GeneratedRoute[],
  models: DrizzleModel[],
  hono: Hono,
  db: any,
  options: KonOptions["api"]
): void {
  for (const route of routes) {
    const model = models.find((m) => getTableName(m) === route.tableName);
    if (!model) continue;

    const guard = autoRouteGuard(konId, route, options);
    const run = createRouteHandler(route, model, db);
    const handler = async (c: HonoContext) => {
      const denied = guard(c);
      if (denied) return denied;
      return run(c);
    };

    // Register with Hono
    switch (route.method) {
      case "get":
        hono.get(route.path, handler);
        break;
      case "post":
        hono.post(route.path, handler);
        break;
      case "patch":
        hono.patch(route.path, handler);
        break;
      case "delete":
        hono.delete(route.path, handler);
        break;
    }
  }

  // eslint-disable-next-line no-console -- log de arranque/registro: visible a propósito en boot (el logger del host no es accesible desde el engine sin crear un ciclo)
  console.log(`  📡 [Kon:${konId}] ${routes.length} auto-routes registered`);
}

// ── Seguridad de las rutas automáticas ──────────────────────────────────────
//
// Antes `requireAuth`/`requiredScopes` se documentaban pero nadie los leía: las
// rutas generadas eran anónimas, corrían fuera de la transacción RLS de la
// petición, pasaban `?orderBy` a `sql.raw` y escribían el body tal cual. Ahora:
//
//   · deny-by-default: sin usuario, 401. Solo las LECTURAS se abren sin sesión,
//     y solo con `api.requireAuth: false` explícito.
//   · escribir exige un humano `admin`/`editor`, o un agente cuyos scopes
//     cubran `api.requiredScopes` (o `<kon>:write` si no se declaran). Una
//     denegación `!scope` gana siempre (`concedeScope`).
//   · la db es la de la petición (`resolveExecutor`: el `tx` con RLS).
//   · columnas solo de la tabla (`getTableColumns`), nunca texto del cliente.

const ROLES_QUE_ESCRIBEN = new Set(["admin", "editor"]);

/** Devuelve una respuesta de rechazo, o `null` si la petición puede seguir. */
function autoRouteGuard(konId: string, route: GeneratedRoute, options: KonOptions["api"]) {
  const escribe = route.operation !== "list" && route.operation !== "read";
  const requeridos =
    options?.requiredScopes && options.requiredScopes.length > 0
      ? options.requiredScopes
      : escribe
        ? [`${konId.replace(/^kon-/, "")}:write`]
        : [];
  return (c: HonoContext): Response | null => {
    const user = ((c.get as (k: string) => unknown)("user") ?? null) as {
      role?: string;
      scopes?: string[];
    } | null;
    if (!user) {
      if (!escribe && options?.requireAuth === false) return null;
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (Array.isArray(user.scopes)) {
      // Agente: sus scopes deciden, y una denegación gana.
      if (requeridos.every((r) => concedeScope(user.scopes, r))) return null;
      return c.json({ error: "Forbidden" }, 403);
    }
    if (!escribe || ROLES_QUE_ESCRIBEN.has(user.role ?? "")) return null;
    return c.json({ error: "Forbidden" }, 403);
  };
}

/** La columna Drizzle de `model` llamada `key` (propiedad JS), o `null`. */
function columnaDe(model: DrizzleModel, key: unknown): any {
  if (typeof key !== "string") return null;
  const columnas = getTableColumns(model as any) as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(columnas, key) ? columnas[key] : null;
}

/** Columnas que el cliente nunca fija: identidad y marcas de tiempo. */
const COLUMNAS_DEL_SISTEMA = new Set(["id", "createdAt", "updatedAt"]);

/** Solo las claves que son columnas de la tabla y no del sistema. */
function soloColumnas(model: DrizzleModel, body: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) return out;
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (COLUMNAS_DEL_SISTEMA.has(k)) continue;
    if (columnaDe(model, k)) out[k] = v;
  }
  return out;
}

/** ORDER BY por una columna real; `null` si no hay ninguna válida. */
function ordenDe(model: DrizzleModel, orderBy: unknown, order: unknown) {
  const col = columnaDe(model, orderBy ?? "createdAt");
  if (!col) return null;
  return order === "asc" ? asc(col) : desc(col);
}

/**
 * Create a route handler for a specific operation
 */
function createRouteHandler(route: GeneratedRoute, model: DrizzleModel, globalDb: any) {
  return async (c: HonoContext) => {
    // La transacción RLS de la petición si la hay; la global solo fuera de ella.
    const db = resolveExecutor(globalDb);
    const idCol = columnaDe(model, "id");
    try {
      switch (route.operation) {
        case "list": {
          const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "50") || 50, 1), 100);
          const offset = Math.max(parseInt(c.req.query("offset") ?? "0") || 0, 0);
          const orden = ordenDe(model, c.req.query("orderBy"), c.req.query("order") ?? "desc");
          if (c.req.query("orderBy") !== undefined && !orden) {
            return c.json({ error: "Unknown orderBy column" }, 400);
          }

          let query = db.select().from(model).limit(limit).offset(offset);
          if (orden) query = query.orderBy(orden);
          const results = await query;

          const [{ total }] = await db.select({ total: count() }).from(model);

          return c.json({
            docs: results,
            totalDocs: total,
            limit,
            offset,
          });
        }

        case "create": {
          const body = soloColumnas(model, await c.req.json().catch(() => null));
          const [result] = await db.insert(model).values(body).returning();
          return c.json(result, 201);
        }

        case "read": {
          if (!idCol) return c.json({ error: "Not found" }, 404);
          const id = c.req.param("id");
          const [result] = await db.select().from(model).where(eq(idCol, id)).limit(1);
          if (!result) return c.json({ error: "Not found" }, 404);
          return c.json(result);
        }

        case "update": {
          if (!idCol) return c.json({ error: "Not found" }, 404);
          const id = c.req.param("id");
          const body = soloColumnas(model, await c.req.json().catch(() => null));
          const cambios: Record<string, unknown> = { ...body };
          if (columnaDe(model, "updatedAt")) cambios.updatedAt = new Date();
          const [result] = await db.update(model).set(cambios).where(eq(idCol, id)).returning();
          if (!result) return c.json({ error: "Not found" }, 404);
          return c.json(result);
        }

        case "delete": {
          if (!idCol) return c.json({ error: "Not found" }, 404);
          const id = c.req.param("id");
          const [result] = await db.delete(model).where(eq(idCol, id)).returning();
          if (!result) return c.json({ error: "Not found" }, 404);
          return c.json({ success: true, id });
        }

        default:
          return c.json({ error: "Unknown operation" }, 500);
      }
    } catch (err: unknown) {
      console.error(`[Kon] Route error: ${route.path}`, messageOf(err));
      // El mensaje de la base (SQL, nombres de columnas) no sale al cliente.
      return c.json({ error: "Internal error" }, 500);
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-MCP GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate MCP tools for a Drizzle model
 */
function generateModelTools(
  _konId: string,
  model: DrizzleModel,
  prefix: string,
  tools: GeneratedTool[]
): MCPTool[] {
  const tableName = getTableName(model);
  const generatedTools: MCPTool[] = [];

  // READ tool
  const readToolName = `${prefix}_read_${tableName}`;
  tools.push({
    name: readToolName,
    tableName,
    operation: "read",
    description: `Read/query records from ${tableName}`,
  });
  generatedTools.push({
    name: readToolName,
    description: `Query records from the ${tableName} table. Supports filtering, pagination, and sorting.`,
    inputSchema: inferMCPSchemaFromModel(model, "read"),
    handler: async (_args: any, _extra: any) => {
      // Implementation will be injected by MCP adapter
      return { content: [{ type: "text", text: "Tool not yet implemented" }] };
    },
  });

  // CREATE tool
  const createToolName = `${prefix}_create_${tableName}`;
  tools.push({
    name: createToolName,
    tableName,
    operation: "create",
    description: `Create a new record in ${tableName}`,
  });
  generatedTools.push({
    name: createToolName,
    description: `Create a new record in the ${tableName} table. Provide field values according to the schema.`,
    inputSchema: inferMCPSchemaFromModel(model, "create"),
    handler: async (_args: any, _extra: any) => {
      return { content: [{ type: "text", text: "Tool not yet implemented" }] };
    },
  });

  return generatedTools;
}

/**
 * Register auto-generated tools in MCP server
 */
function registerMCPTools(
  konId: string,
  tools: GeneratedTool[],
  models: DrizzleModel[],
  mcpServer: any,
  db: any
): void {
  if (!mcpServer?.addTool) {
    console.warn(`  ⚠️  [Kon:${konId}] MCP server not available, skipping tools`);
    return;
  }

  for (const toolMeta of tools) {
    const model = models.find((m) => getTableName(m) === toolMeta.tableName);
    if (!model) continue;

    const tool = createMCPTool(toolMeta, model, db);
    mcpServer.addTool(tool);
  }

  // eslint-disable-next-line no-console -- log de arranque/registro: visible a propósito en boot (el logger del host no es accesible desde el engine sin crear un ciclo)
  console.log(`  🤖 [Kon:${konId}] ${tools.length} MCP tools registered`);
}

/**
 * Create an MCP tool with proper handler
 */
function createMCPTool(meta: GeneratedTool, model: DrizzleModel, db: any): MCPTool {
  return {
    name: meta.name,
    description: meta.description,
    inputSchema: inferMCPSchemaFromModel(model, meta.operation),
    handler: async (args: any, _extra: any) => {
      try {
        switch (meta.operation) {
          case "read": {
            const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 100);
            const offset = Math.max(Number(args.offset) || 0, 0);

            // Filtros: solo claves que son columnas de la tabla. Una clave
            // desconocida es un error, no SQL (antes iba a `sql.raw`).
            const filterFields = ["limit", "offset", "orderBy", "order"];
            const filters = [];
            for (const [k, v] of Object.entries(args ?? {})) {
              if (filterFields.includes(k)) continue;
              const col = columnaDe(model, k);
              if (!col) throw new Error(`Unknown field: ${k}`);
              filters.push(eq(col, v));
            }
            const orden = ordenDe(model, args.orderBy, args.order ?? "desc");
            if (args.orderBy !== undefined && !orden) throw new Error("Unknown orderBy column");

            let query = resolveExecutor(db).select().from(model).limit(limit).offset(offset);

            if (filters.length > 0) {
              query = query.where(and(...filters));
            }

            if (orden) query = query.orderBy(orden);

            const results = await query;

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { table: meta.tableName, count: results.length, results },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case "create": {
            const [result] = await resolveExecutor(db)
              .insert(model)
              .values(soloColumnas(model, args))
              .returning();
            return {
              content: [
                {
                  type: "text",
                  text: `Created record in ${meta.tableName}:\n${JSON.stringify(result, null, 2)}`,
                },
              ],
            };
          }

          default:
            return {
              content: [{ type: "text", text: `Operation ${meta.operation} not implemented` }],
              isError: true,
            };
        }
      } catch (err: unknown) {
        return {
          content: [{ type: "text", text: `Error: ${messageOf(err)}` }],
          isError: true,
        };
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// KON FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Define a Kon - Auto-API & MCP Generator
 *
 * Esta función transforma modelos Drizzle en una API completa:
 * - Genera rutas REST automáticamente
 * - Expone herramientas MCP para agentes
 * - Permite acciones personalizadas
 *
 * @example
 * ```typescript
 * const agileKon = defineKon({
 *   id: "agile",
 *   name: "Agile Project Management",
 *   models: [agileIssues, agileProjects],
 *   actions: [
 *     {
 *       trigger: "http.post:/api/agile/sprints/:id/close",
 *       run: async ({ payload }) => { ... }
 *     }
 *   ],
 * });
 * ```
 */
export function defineKon(options: KonOptions): Kon {
  const konId = options.id;
  const basePath = options.api?.basePath ?? `/api/${konId}`;
  const mcpPrefix = options.mcp?.prefix ?? konId;

  // Validate ID
  if (!/^[a-z0-9_-]+$/.test(konId)) {
    throw new Error(
      `Invalid kon ID: "${konId}". Must be lowercase alphanumeric with underscores/hyphens only.`
    );
  }

  // Generate metadata
  const routes: GeneratedRoute[] = [];
  const tools: GeneratedTool[] = [];
  const mcpTools: MCPTool[] = [];

  // Process models
  if (options.models && options.api?.enabled !== false) {
    for (const model of options.models) {
      const tableName = getTableName(model);
      // eslint-disable-next-line no-console -- log de arranque/registro: visible a propósito en boot (el logger del host no es accesible desde el engine sin crear un ciclo)
      console.log(`  📊 [Kon:${konId}] Processing model: ${tableName}`);

      // Generate API routes (already checked enabled above)
      generateModelRoutes(konId, model, basePath, routes);

      // Generate MCP tools
      if (options.mcp?.enabled !== false) {
        const modelTools = generateModelTools(konId, model, mcpPrefix, tools);
        mcpTools.push(...modelTools);
      }
    }
  }

  // Process custom actions through defineAction
  if (options.actions) {
    for (const action of options.actions) {
      defineAction(action);
    }
  }

  // eslint-disable-next-line no-console -- log de arranque/registro: visible a propósito en boot (el logger del host no es accesible desde el engine sin crear un ciclo)
  console.log(`\n✨ Kon "${options.name ?? konId}" defined:`);
  // eslint-disable-next-line no-console -- log de arranque/registro: visible a propósito en boot (el logger del host no es accesible desde el engine sin crear un ciclo)
  console.log(`   📡 ${routes.length} auto-routes`);
  // eslint-disable-next-line no-console -- log de arranque/registro: visible a propósito en boot (el logger del host no es accesible desde el engine sin crear un ciclo)
  console.log(`   🤖 ${tools.length} MCP tools`);
  // eslint-disable-next-line no-console -- log de arranque/registro: visible a propósito en boot (el logger del host no es accesible desde el engine sin crear un ciclo)
  console.log(`   ⚡ ${options.actions?.length ?? 0} custom actions`);

  // Return kon instance
  return {
    id: konId,
    config: options,
    routes,
    tools,
    actions: options.actions ?? [],
    initialize: (ctx: KonContext, hono: Hono, mcpServer?: any) => {
      // eslint-disable-next-line no-console -- log de arranque/registro: visible a propósito en boot (el logger del host no es accesible desde el engine sin crear un ciclo)
      console.log(`\n🔮 Initializing Kon: ${konId}`);

      // Register auto-routes
      if (routes.length > 0 && options.models) {
        registerAutoRoutes(konId, routes, options.models, hono, ctx.db.instance, options.api);
      }

      // Register MCP tools
      if (tools.length > 0 && options.models) {
        registerMCPTools(konId, tools, options.models, mcpServer, ctx.db.instance);
      }

      // eslint-disable-next-line no-console -- log de arranque/registro: visible a propósito en boot (el logger del host no es accesible desde el engine sin crear un ciclo)
      console.log(`✅ Kon "${konId}" ready\n`);
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY & PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Global kon registry
 */
const konRegistry = new Map<string, Kon>();

/**
 * Register a kon in the global registry
 */
export function registerKon(kon: Kon): void {
  konRegistry.set(kon.id, kon);
}

/**
 * Get a kon by ID
 */
export function getKon(id: string): Kon | undefined {
  return konRegistry.get(id);
}

/**
 * List all registered kons
 */
export function listKons(): Kon[] {
  return Array.from(konRegistry.values());
}

/**
 * Initialize all registered kons
 */
export function initializeKons(ctx: KonContext, hono: Hono, mcpServer?: any): void {
  for (const kon of konRegistry.values()) {
    kon.initialize(ctx, hono, mcpServer);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE INFERENCE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Helper to create typed action within a kon
 */
export function createKonAction<TPayload = unknown, TResult = unknown>(
  konId: string,
  action: ActionDefinition<TPayload, TResult>
): ActionDefinition<TPayload, TResult> {
  // Prefix the trigger path with kon base path if HTTP
  const trigger = action.trigger;
  if (trigger.startsWith("http.") && !trigger.includes(`/api/${konId}`)) {
    // Auto-prefix the path
    const colonIndex = trigger.indexOf(":");
    if (colonIndex > -1) {
      const prefix = trigger.slice(0, colonIndex);
      const path = trigger.slice(colonIndex + 1);
      if (!path.startsWith("/api/")) {
        action.trigger = `${prefix}:/api/${konId}${path}`;
      }
    }
  }
  return defineAction(action);
}

// Note: Types are already exported as interfaces above
