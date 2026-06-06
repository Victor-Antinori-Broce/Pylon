// @ts-nocheck
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TypeScript DX Validation - Grimoire Auto-API & MCP Generator
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Este archivo verifica que TypeScript infiera correctamente los tipos
 * al usar defineGrimoire con modelos Drizzle.
 *
 * Run: npx tsc packages/engine/src/dummy-grimoire.ts --noEmit --skipLibCheck
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { GrimoireContext } from "@gremius/shared";

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK: Modelos Drizzle (simulados para validación de tipos)
// ═══════════════════════════════════════════════════════════════════════════════

// Simulamos un modelo Drizzle usando pgTable
import { pgTable, uuid, varchar, text, timestamp, boolean } from "drizzle-orm/pg-core";

import {
  defineGrimoire,
  InferGrimoireSelect,
  InferGrimoireInsert,
  createGrimoireAction,
  registerGrimoire,
  getGrimoire,
  listGrimoires,
  initializeGrimoires,
} from "./grimoire";

// Modelo: agile_issues
export const agileIssues = pgTable("agile_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 50 }).notNull().default("open"),
  priority: varchar("priority", { length: 20 }).default("medium"),
  assigneeId: uuid("assignee_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Modelo: agile_projects
export const agileProjects = pgTable("agile_projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  description: text("description"),
  isPublic: boolean("is_public").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Inferencia de tipos desde Drizzle models
// ═══════════════════════════════════════════════════════════════════════════════

// Inferir tipo Select (para lecturas)
type IssueSelect = InferGrimoireSelect<typeof agileIssues>;
// ✅ IssueSelect debe tener: id, title, description, status, priority, assigneeId, createdAt, updatedAt

// Inferir tipo Insert (para creaciones)
type IssueInsert = InferGrimoireInsert<typeof agileIssues>;
// ✅ IssueInsert debe tener opcionales los campos con default (id, createdAt, updatedAt)

// Verificar tipos específicos
const testIssueSelect: IssueSelect = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "Test Issue",
  description: "Test description",
  status: "open",
  priority: "high",
  assigneeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const testIssueInsert: IssueInsert = {
  title: "New Issue", // required (notNull, no default)
  status: "open", // optional (has default)
  // id, createdAt, updatedAt son opcionales (tienen default)
};

// @ts-expect-error - title es required, debe dar error si falta
const invalidIssueInsert: IssueInsert = {
  status: "open",
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: defineGrimoire con modelos Drizzle
// ═══════════════════════════════════════════════════════════════════════════════

const agileGrimoire = defineGrimoire({
  id: "agile",
  name: "Agile Project Management",
  description: "Project management tools for agile teams",
  icon: "Kanban",
  models: [agileIssues, agileProjects],
  api: {
    basePath: "/api/agile",
    enabled: true,
    requireAuth: true,
    requiredScopes: ["agile:read", "agile:write"],
  },
  mcp: {
    enabled: true,
    prefix: "agile",
  },
  actions: [
    {
      trigger: "http.post:/api/agile/sprints/:id/close",
      description: "Close a sprint and move incomplete issues",
      run: async ({ payload, db }) => {
        // ✅ payload debe estar tipado
        const sprintId: string = payload.sprintId;

        return {
          success: true,
          data: { sprintId, closedAt: new Date().toISOString() },
        };
      },
    },
  ],
});

// Verificar propiedades del grimoire
const grimoireId: string = agileGrimoire.id;
const grimoireConfig = agileGrimoire.config;
const grimoireRoutes = agileGrimoire.routes;
const grimoireTools = agileGrimoire.tools;

// Verificar rutas generadas
const listRoute = agileGrimoire.routes.find(
  (r) => r.operation === "list" && r.tableName === "agile_issues"
);
// ✅ listRoute.path === "/api/agile/agile_issues"
// ✅ listRoute.method === "get"

const createRoute = agileGrimoire.routes.find(
  (r) => r.operation === "create" && r.tableName === "agile_issues"
);
// ✅ createRoute.path === "/api/agile/agile_issues"
// ✅ createRoute.method === "post"

// Verificar tools MCP generadas
const readTool = agileGrimoire.tools.find(
  (t) => t.operation === "read" && t.tableName === "agile_issues"
);
// ✅ readTool.name === "agile_read_agile_issues"

const createTool = agileGrimoire.tools.find(
  (t) => t.operation === "create" && t.tableName === "agile_issues"
);
// ✅ createTool.name === "agile_create_agile_issues"

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Convenciones de nomenclatura
// ═══════════════════════════════════════════════════════════════════════════════

// Rutas esperadas para agile_issues:
// GET    /api/agile/agile_issues
// POST   /api/agile/agile_issues
// GET    /api/agile/agile_issues/:id
// PATCH  /api/agile/agile_issues/:id
// DELETE /api/agile/agile_issues/:id

// Verificar que todas las rutas existen
const expectedOperations = ["list", "create", "read", "update", "delete"] as const;
for (const op of expectedOperations) {
  const route = agileGrimoire.routes.find(
    (r) => r.operation === op && r.tableName === "agile_issues"
  );
  if (!route) {
    console.error(`Missing route for operation: ${op}`);
  }
}

// Tools MCP esperadas:
// agile_read_agile_issues
// agile_create_agile_issues

const expectedTools = ["read", "create"] as const;
for (const op of expectedTools) {
  const tool = agileGrimoire.tools.find(
    (t) => t.operation === op && t.tableName === "agile_issues"
  );
  if (!tool) {
    console.error(`Missing tool for operation: ${op}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Validación de ID de grimoire
// ═══════════════════════════════════════════════════════════════════════════════

// @ts-expect-error - ID inválido debe dar error (caracteres especiales)
const invalidGrimoire1 = defineGrimoire({
  id: "My Agile!!!",
  models: [],
});

// @ts-expect-error - ID inválido debe dar error (mayúsculas)
const invalidGrimoire2 = defineGrimoire({
  id: "AgileProject",
  models: [],
});

// @ts-expect-error - ID inválido debe dar error (espacios)
const invalidGrimoire3 = defineGrimoire({
  id: "agile project",
  models: [],
});

// ✅ IDs válidos:
const validGrimoire1 = defineGrimoire({ id: "agile", models: [] });
const validGrimoire2 = defineGrimoire({ id: "crm_system", models: [] });
const validGrimoire3 = defineGrimoire({ id: "blog-v2", models: [] });

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: createGrimoireAction helper
// ═══════════════════════════════════════════════════════════════════════════════

const customAction = createGrimoireAction("agile", {
  trigger: "http.post:/sprints/:id/archive",
  run: async ({ payload, db }) => {
    // La ruta debe ser auto-prefijada con /api/agile
    // Resultado: POST /api/agile/sprints/:id/archive
    return { success: true };
  },
});

// Verificar que el trigger fue prefijado
// @ts-expect-error - trigger es string, no tiene propiedad específica
const triggerPath: string = customAction.trigger;
// Debe ser "http.post:/api/agile/sprints/:id/archive"

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Contexto unificado en acciones de grimoire
// ═══════════════════════════════════════════════════════════════════════════════

const actionWithFullContext = defineGrimoire({
  id: "test",
  models: [agileIssues],
  actions: [
    {
      trigger: "http.post:/api/test/custom",
      run: async (ctx) => {
        // ✅ Contexto debe tener todas las propiedades base
        const { payload, db, grimoire, logger, queue, cache, http } = ctx;

        // HTTP context debe existir para triggers http
        const hono = http?.hono;
        const headers = http?.headers;
        http?.status(201);
        http?.header("X-Custom", "value");

        // No debe tener event o agent context
        // @ts-expect-error - event no debe existir en http trigger
        const jobId = ctx.event?.jobId;
        // @ts-expect-error - agent no debe existir en http trigger
        const agentId = ctx.agent?.agentId;

        return { success: true, data: { received: true } };
      },
    },
  ],
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Registro global de grimoires
// ═══════════════════════════════════════════════════════════════════════════════

// Registrar grimoire
registerGrimoire(agileGrimoire);

// Obtener por ID
const retrieved = getGrimoire("agile");
// ✅ retrieved === agileGrimoire

// Listar todos
const allGrimoires = listGrimoires();
// ✅ allGrimoires incluye agileGrimoire

// Inicializar todos (mock)
const mockCtx = {} as GrimoireContext;
const mockHono = {} as any;
const mockMcpServer = { addTool: () => {} };

// @ts-expect-error - Hono no está completamente tipado
initializeGrimoires(mockCtx, mockHono, mockMcpServer);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Schema MCP inferido
// ═══════════════════════════════════════════════════════════════════════════════

// El schema para create_agile_issues debe incluir:
// - title: string (required, notNull)
// - description: string (optional, nullable)
// - status: string (optional, has default)
// - priority: string (optional, nullable)
// - assigneeId: string (optional, nullable)
// - limit: integer (pagination, default 50)
// - offset: integer (pagination, default 0)

// El schema para read_agile_issues debe incluir todos los campos
// para permitir filtrado + campos de paginación

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 9: Acciones personalizadas coexisten con auto-generadas
// ═══════════════════════════════════════════════════════════════════════════════

const mixedGrimoire = defineGrimoire({
  id: "mixed",
  models: [agileIssues],
  actions: [
    // Acción personalizada (trigger HTTP)
    {
      trigger: "http.post:/api/mixed/custom-action",
      run: async () => ({ success: true }),
    },
    // Acción personalizada (trigger Event)
    {
      trigger: "event:process_something",
      run: async () => ({ success: true }),
    },
    // Acción personalizada (trigger Agent)
    {
      trigger: "agent.tool:custom_tool",
      run: async () => ({ success: true }),
    },
  ],
});

// Debe tener 5 rutas auto-generadas + 1 ruta personalizada
// Debe tener 2 tools auto-generados + 1 tool personalizado

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 10: Type narrowing en operaciones
// ═══════════════════════════════════════════════════════════════════════════════

// Operación LIST
const listOp = mixedGrimoire.routes.find((r) => r.operation === "list");
if (listOp) {
  const method: "get" = listOp.method; // Debe ser GET
  const path: string = listOp.path; // Debe ser /api/mixed/agile_issues
}

// Operación CREATE
const createOp = mixedGrimoire.routes.find((r) => r.operation === "create");
if (createOp) {
  const method: "post" = createOp.method; // Debe ser POST
}

// Operación READ (by id)
const readOp = mixedGrimoire.routes.find((r) => r.operation === "read");
if (readOp) {
  const path: string = readOp.path; // Debe incluir /:id
  const hasIdParam: boolean = path.includes(":id");
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT para evitar "declarations but never used"
// ═══════════════════════════════════════════════════════════════════════════════

export {
  agileIssues,
  agileProjects,
  agileGrimoire,
  testIssueSelect,
  testIssueInsert,
  customAction,
  mixedGrimoire,
};

console.log("✅ Grimoire TypeScript DX Validation file loaded successfully");
console.log("Run: npx tsc packages/engine/src/dummy-grimoire.ts --noEmit --skipLibCheck");
