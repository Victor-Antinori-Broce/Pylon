/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATASETS QUERY & BATCH ROUTES - FASE 2: La Magia de los Datos
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Expone los motores core (QueryTranslator, BatchProcessor, Auto-Join) vía REST.
 *
 * Endpoints:
 * - POST /:id/query    → Ejecuta consultas Kitsuden QL con expansión de relaciones
 * - POST /batch        → Ejecuta operaciones batch transaccionales (ACID)
 *
 * Features:
 * - Anti N+1: Expansión de relaciones en una sola query
 * - Validación semántica: Errores claros (COLUMN_NOT_FOUND, etc.)
 * - Transacciones ACID: Rollback automático en batch
 * - Seguridad: Reutiliza middleware de auth existente
 */

import { zValidator } from "@hono/zod-validator";
import {
  parseKitsudenQuery,
  KitsudenQLError,
  getAvailableRelations,
  validateKitsudenQuery,
  debugQuery,
  BatchProcessor,
  BatchProcessorError,
  resolveExecutor,
} from "@kitsuden/engine";
import { eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";

import { db, mergedSchema } from "../db";
import { dataSets, dataEntries } from "../db/schema-core";
import { requireAuth } from "../middleware/auth";
import { buildDrizzleWhere, publishedOrOwnQl, type PolicyJson, type RLSUser } from "../lib/rls-builder";
import { checkDatasetReadAccess, checkDatasetWriteAccess } from "../middleware/permissions";
import type { AppVariables } from "../types/hono";
import { enProduccion } from "../lib/entorno";

// Importar motores core del engine

// datasetsQueryRoutes se define al FINAL del archivo como expresión encadenada (Hono RPC).

// Aplicar autenticación a todas las rutas
// requireAuth vive en la cadena del final del archivo.

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMAS ZOD PARA VALIDACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

/** Schema para operadores de filtro */
const FieldFilterSchema = z
  .object({
    eq: z.any().optional(),
    neq: z.any().optional(),
    gt: z.any().optional(),
    gte: z.any().optional(),
    lt: z.any().optional(),
    lte: z.any().optional(),
    in: z.array(z.any()).optional(),
    contains: z.string().optional(),
    startsWith: z.string().optional(),
    endsWith: z.string().optional(),
  })
  .strict()
  .optional();

/**
 * Schema recursivo para where (soporta AND/OR/NOT). Cualquier otra clave es un
 * campo y tiene que ser un filtro (`catchall`). Sin `.strict()`: en zod 4
 * sustituye el catchall por `never` y rechazaría todos los campos.
 */
const WhereFilterSchema: z.ZodType<any> = z.lazy(() =>
  z
    .object({
      AND: z.array(z.lazy(() => WhereFilterSchema)).optional(),
      OR: z.array(z.lazy(() => WhereFilterSchema)).optional(),
      NOT: z.lazy(() => WhereFilterSchema).optional(),
    })
    .catchall(FieldFilterSchema)
);

/** Schema para query de dataset */
const DatasetQuerySchema = z
  .object({
    where: WhereFilterSchema.optional(),
    expand: z.array(z.string()).optional(),
    select: z.array(z.string()).optional(),
    limit: z.number().min(1).max(1000).default(50).optional(),
    offset: z.number().min(0).default(0).optional(),
    orderBy: z
      .array(
        z.object({
          field: z.string(),
          direction: z.enum(["asc", "desc"]).default("asc").optional(),
        })
      )
      .optional(),
  })
  .strict();

/** Schema para operación de batch individual */
const BatchOperationSchema = z
  .object({
    op: z.enum(["create", "update", "delete", "upsert"]),
    table: z.string().min(1), // dataEntries or dataSets (see BATCH_TABLES)
    data: z.record(z.string(), z.any()).optional(),
    id: z.string().optional(),
    alias: z.string().optional(),
    where: z.record(z.string(), z.any()).optional(),
  })
  .strict();

/** Schema para batch de operaciones */
const BatchRequestSchema = z
  .object({
    operations: z.array(BatchOperationSchema).min(1).max(100),
    datasetId: z.string().optional(), // Para validar permisos
  })
  .strict();

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Obtener tabla Drizzle por nombre desde mergedSchema
// ═══════════════════════════════════════════════════════════════════════════════

function getTableByName(name: string): PgTable | undefined {
  // Buscar en mergedSchema (core + kons activos)
  const table = (mergedSchema as Record<string, unknown>)[name];
  // La marca interna de drizzle es un Symbol: indexar `unknown` con él no
  // compila, así que se declara la forma mínima que se está comprobando.
  if (
    table &&
    typeof table === "object" &&
    (table as Record<symbol, unknown>)[Symbol.for("drizzle:Name")]
  ) {
    return table as PgTable;
  }
  // Fallback: buscar case-insensitive
  for (const key of Object.keys(mergedSchema)) {
    if (key.toLowerCase() === name.toLowerCase()) {
      const t = (mergedSchema as Record<string, unknown>)[key];
      if (
        t &&
        typeof t === "object" &&
        (t as Record<symbol, unknown>)[Symbol.for("drizzle:Name")]
      ) {
        return t as PgTable;
      }
    }
  }
  return undefined;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /:id/query - Ejecutar consulta Kitsuden QL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ejecuta una consulta Kitsuden QL sobre un dataset.
 *
 * @example Request:
 * POST /api/datasets/characters/query
 * {
 *   "where": { "element": "pyro", "level": { "gte": 50 } },
 *   "expand": ["weapon", "skills"],
 *   "limit": 10,
 *   "orderBy": [{ "field": "name", "direction": "asc" }]
 * }
 *
 * @example Response:
 * {
 *   "data": [...],
 *   "meta": {
 *     "total": 25,
 *     "limit": 10,
 *     "offset": 0,
 *     "hasMore": true,
 *     "executedAt": "2024-01-15T10:30:00Z",
 *     "queryTimeMs": 12.45
 *   }
 * }
 */
export async function queryDatasetHandler(c: Context) {
  const datasetId = c.req.param("id")!;
  const body = await c.req.json();

  try {
    // 1. Verificar que el dataset existe
    const [dataset] = await db.select().from(dataSets).where(eq(dataSets.id, datasetId)).limit(1);

    if (!dataset) {
      return c.json({ error: "Dataset not found" }, 404);
    }

    // 2. Verificar permisos de lectura
    const hasAccess = await checkDatasetReadAccess(c, datasetId);
    if (!hasAccess) {
      return c.json({ error: "Forbidden: No read access to this dataset" }, 403);
    }

    // 2b. Aislamiento por fila. El motor de consultas recibe un `where` de
    // Kitsuden QL y no sabe aplicar las `rlsRules` de la política (que
    // `/entries` sí aplica con `buildDatasetWhere`): con un dataset por dueño,
    // CUALQUIER cuenta con lectura veía aquí las filas de todos los dueños.
    // Mientras el traductor no las entienda, esos datasets solo los consulta
    // admin por esta vía (auditoría 2026-10-15).
    if (consultaSaltariaAislamiento(dataset.policyJson as PolicyJson | null, c.get("user"))) {
      return c.json(
        {
          error:
            "Este dataset aísla filas por usuario: consúltalo con GET /api/data-sets/:id/entries",
        },
        403
      );
    }

    // Outside the team: the published or their own, whatever `where` asks for.
    const user = c.get("user") as { id?: string; role?: string | null } | null | undefined;
    const delEquipo = user?.role === "admin" || user?.role === "editor";

    // 3. Ejecutar query usando el motor Kitsuden QL
    const result = await parseKitsudenQuery(dataEntries, {
      ...body,
      where: {
        AND: delEquipo ? [body.where ?? {}] : [body.where ?? {}, publishedOrOwnQl(user?.id)],
        dataSetId: { eq: datasetId }, // Filtrar por dataset
      },
    } as any);

    return c.json(result, 200);
  } catch (error) {
    console.error("[QueryEngine] Error:", error);

    // Manejar errores semánticos del traductor
    if (error instanceof KitsudenQLError) {
      return c.json(
        {
          error: error.message,
          code: error.code,
          details: error.details,
        },
        400
      );
    }

    // Error genérico
    return c.json(
      {
        error: "Query execution failed",
        message: (error as Error).message,
      },
      500
    );
  }
}

/**
 * ¿Saltaría esta consulta el aislamiento por fila del dataset?
 *
 * Sí cuando la política tiene `rlsRules` que, para este usuario, producen un
 * filtro, y quien pregunta no es admin. Exportada para probarla sin base.
 */
export function consultaSaltariaAislamiento(
  policy: PolicyJson | null,
  user: { id?: string; role?: string | null } | null | undefined
): boolean {
  if (user?.role === "admin") return false;
  const reglas = policy?.rlsRules;
  if (!reglas || reglas.length === 0) return false;
  return buildDrizzleWhere(reglas, (user ?? null) as RLSUser) !== undefined;
}

// (registrado en la cadena final)

// ═══════════════════════════════════════════════════════════════════════════════
// POST /query/:tableName - Query directo sobre tabla (admin only)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Query directo sobre cualquier tabla del esquema (solo administradores).
 * Útil para queries administrativas o cross-dataset.
 */
export async function queryTableHandler(c: Context) {
  const tableName = c.req.param("tableName")!;
  const body = await c.req.json();
  const user = c.get("user");

  // Solo admins pueden hacer queries directas
  if (user?.role !== "admin") {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }

  const table = getTableByName(tableName);
  if (!table) {
    return c.json(
      {
        error: `Table "${tableName}" not found`,
        availableTables: Object.keys(mergedSchema as Record<string, unknown>),
      },
      400
    );
  }

  try {
    const result = await parseKitsudenQuery(table, body as any);
    return c.json(result, 200);
  } catch (error) {
    console.error("[QueryEngine] Error:", error);

    if (error instanceof KitsudenQLError) {
      return c.json(
        {
          error: error.message,
          code: error.code,
          details: error.details,
        },
        400
      );
    }

    return c.json(
      {
        error: "Query execution failed",
        message: (error as Error).message,
      },
      500
    );
  }
}

// (registrado en la cadena final)

// ═══════════════════════════════════════════════════════════════════════════════
// GET /:id/relations - Listar relaciones disponibles
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Lista las relaciones disponibles para expansión en un dataset.
 * Útil para que los clientes sepan qué pueden expandir.
 */
export async function listRelationsHandler(c: Context) {
  const datasetId = c.req.param("id")!;

  // Las relaciones disponibles para dataEntries están definidas en el translator
  const availableRels = getAvailableRelations(dataEntries);

  return c.json(
    {
      datasetId,
      availableRelations: availableRels,
      description: "Use these relation names in the 'expand' parameter of your queries",
    },
    200
  );
}

// (registrado en la cadena final)

// ═══════════════════════════════════════════════════════════════════════════════
// POST /batch - Ejecutar operaciones batch transaccionales
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ejecuta múltiples operaciones en una transacción ACID.
 *
 * Si cualquier operación falla, TODO se revierte (rollback).
 * Soporta referencias entre operaciones mediante @ref:alias.
 *
 * @example Request:
 * POST /api/datasets/batch
 * {
 *   "operations": [
 *     {
 *       "op": "create",
 *       "table": "dataEntries",
 *       "data": { "dataSetId": "characters", "data": { "name": "Hero" } },
 *       "alias": "hero"
 *     },
 *     {
 *       "op": "create",
 *       "table": "dataEntries",
 *       "data": { "dataSetId": "skills", "data": { "name": "Fireball", "characterId": "@ref:hero.id" } }
 *     }
 *   ]
 * }
 *
 * @example Response (success):
 * {
 *   "success": true,
 *   "results": [...],
 *   "meta": { "durationMs": 45.2, "totalOperations": 2 }
 * }
 *
 * @example Response (failure con rollback):
 * {
 *   "success": false,
 *   "rolledBack": true,
 *   "error": { "operationIndex": 1, "message": "...", "code": "VALIDATION_FAILED" },
 *   "results": [...]
 * }
 */
/**
 * The tables the batch processor writes. Only the dataset tables: this route had
 * no deny-list, and with the global pool an `admin`-scope agent could rewrite
 * `approval_settings`, `auth_accounts` or `agent_api_keys` (audit 2026-10-31).
 * Exact names, on purpose: no case-insensitive lookup in the merged schema.
 */
const BATCH_TABLES: Readonly<Record<string, PgTable>> = { dataEntries, dataSets };

export function batchTable(name: unknown): PgTable | undefined {
  return typeof name === "string" && Object.hasOwn(BATCH_TABLES, name) ? BATCH_TABLES[name] : undefined;
}

/**
 * ¿Puede esta identidad usar el procesador batch? Solo admin (o agente con
 * scope `admin`). Antes dependía solo de la regla de prefijo de
 * `RUTAS_SOLO_ADMIN`; ahora se autoriza aquí también, para que la ruta no quede
 * abierta si esa regla se retira (2026-10-15).
 */
export function puedeUsarBatch(
  user: { role?: string | null } | null | undefined,
  agente: { scopes?: string[] } | null | undefined
): boolean {
  if (agente) return agente.scopes?.includes("admin") === true;
  return user?.role === "admin";
}

export async function batchOperationsHandler(c: Context) {
  if (!puedeUsarBatch(c.get("user"), c.get("agent"))) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  const body = await c.req.json();

  const refused = body.operations.findIndex((op: { table?: unknown }) => !batchTable(op.table));
  if (refused >= 0) {
    return c.json(
      {
        success: false,
        error: {
          message: "Batch operations only write dataset tables: dataEntries and dataSets",
          code: "TABLE_NOT_ALLOWED",
          operationIndex: refused,
        },
      },
      403
    );
  }

  try {
    // 1. Validar permisos para cada operación
    // Extraer datasetIds de las operaciones
    const datasetIds = new Set<string>();
    for (const op of body.operations) {
      if (op.table === "dataEntries" && op.data?.dataSetId) {
        datasetIds.add(op.data.dataSetId);
      } else if (op.table === "dataSets" && op.id) {
        datasetIds.add(op.id);
      }
    }

    // Verificar acceso de escritura a todos los datasets involucrados
    for (const dsId of datasetIds) {
      const hasAccess = await checkDatasetWriteAccess(c, dsId);
      if (!hasAccess) {
        return c.json(
          {
            error: `Forbidden: No write access to dataset "${dsId}"`,
          },
          403
        );
      }
    }

    // 2. Transformar operaciones al formato del BatchProcessor
    const batchOps = body.operations.map((op: any) => {
      return {
        op: op.op,
        table: batchTable(op.table)!,
        data: op.data,
        id: op.id,
        alias: op.alias,
        where: op.where,
      };
    });

    // 3. Ejecutar batch usando el BatchProcessor, on the request's RLS
    // transaction (a savepoint of it), so that the policies see who is asking.
    const batchProcessor = new BatchProcessor(resolveExecutor(db));
    const result = await batchProcessor.execute(batchOps);

    // 4. Retornar resultado
    const statusCode = result.success ? 200 : 400;
    return c.json(result, statusCode);
  } catch (error) {
    console.error("[BatchEngine] Error:", error);

    // Manejar errores específicos del BatchProcessor
    if (error instanceof BatchProcessorError) {
      return c.json(
        {
          success: false,
          error: {
            message: error.message,
            code: error.code,
            operationIndex: error.operationIndex,
            details: error.details,
          },
        },
        400
      );
    }

    // Error inesperado
    return c.json(
      {
        success: false,
        error: {
          message: (error as Error).message,
          code: "INTERNAL_ERROR",
        },
      },
      500
    );
  }
}

// (registrado en la cadena final)

// ═══════════════════════════════════════════════════════════════════════════════
// POST /validate-query - Validar query sin ejecutarla
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valida una consulta Kitsuden QL sin ejecutarla.
 * Útil para debugging y validación en el frontend.
 */
export async function validateQueryHandler(c: Context) {
  // Valida contra CUALQUIER tabla y, si no existe, devuelve la lista entera
  // del esquema: con sesión de cualquiera era un índice de la base. Solo admin,
  // como `POST /query/:tableName` (2026-10-15).
  if (!puedeUsarBatch(c.get("user"), c.get("agent"))) {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  const tableName = c.req.param("tableName")!;
  const body = await c.req.json();

  const table = getTableByName(tableName);
  if (!table) {
    return c.json(
      {
        valid: false,
        errors: [`Table "${tableName}" not found`],
        availableTables: Object.keys(mergedSchema as Record<string, unknown>),
      },
      400
    );
  }

  const validation = validateKitsudenQuery(table, body as any);

  return c.json(validation, validation.valid ? 200 : 400);
}

// (registrado en la cadena final)

// ═══════════════════════════════════════════════════════════════════════════════
// DEBUG: GET /query-debug/:tableName - Ver SQL generado (sin ejecutar)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Debug: Muestra el SQL que se generaría para una query (sin ejecutar).
 * Solo disponible en modo desarrollo.
 */
export async function debugQueryHandler(c: Context) {
  const tableName = c.req.param("tableName")!;
  const body = await c.req.json();
  const user = c.get("user");

  // Solo admins en desarrollo
  if (enProduccion()) {
    return c.json({ error: "Debug endpoint not available in production" }, 403);
  }

  if (user?.role !== "admin") {
    return c.json({ error: "Admin access required" }, 403);
  }

  const table = getTableByName(tableName);
  if (!table) {
    return c.json({ error: `Table "${tableName}" not found` }, 400);
  }

  const debug = debugQuery(table, body as any);

  return c.json(
    {
      table: tableName,
      query: body,
      generatedSql: debug.sql,
      params: debug.params,
    },
    200
  );
}

// (registrado en la cadena final)

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTER (chained — Hono RPC, arquitectura KITSUDEN §7)
// Mismo orden de registro que la versión statement-style.
// ═══════════════════════════════════════════════════════════════════════════════

export const datasetsQueryRoutes = new Hono<{ Variables: AppVariables }>()
  .use("/*", requireAuth)
  .post("/:id/query", zValidator("json", DatasetQuerySchema), queryDatasetHandler)
  .post("/query/:tableName", zValidator("json", DatasetQuerySchema), queryTableHandler)
  .get("/:id/relations", listRelationsHandler)
  .post("/batch", zValidator("json", BatchRequestSchema), batchOperationsHandler)
  .post("/validate-query/:tableName", zValidator("json", DatasetQuerySchema), validateQueryHandler)
  .post("/query-debug/:tableName", zValidator("json", DatasetQuerySchema), debugQueryHandler);

/** Tipo acumulado del router — consumido por src/rpc.ts */
export type DatasetsQueryRoutesType = typeof datasetsQueryRoutes;
