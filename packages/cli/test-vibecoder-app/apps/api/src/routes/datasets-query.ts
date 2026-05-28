// @ts-nocheck
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATASETS QUERY & BATCH ROUTES - FASE 2: La Magia de los Datos
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Expone los motores core (QueryTranslator, BatchProcessor, Auto-Join) vía REST.
 *
 * Endpoints:
 * - POST /:id/query    → Ejecuta consultas Gremius QL con expansión de relaciones
 * - POST /batch        → Ejecuta operaciones batch transaccionales (ACID)
 *
 * Features:
 * - Anti N+1: Expansión de relaciones en una sola query
 * - Validación semántica: Errores claros (COLUMN_NOT_FOUND, etc.)
 * - Transacciones ACID: Rollback automático en batch
 * - Seguridad: Reutiliza middleware de auth existente
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db";
import { dataSets, dataEntries } from "../db/schema";
import { eq } from "drizzle-orm";
import type { AppVariables } from "../types/hono";
import { requireAuth } from "../middleware/auth";
import { checkDatasetReadAccess, checkDatasetWriteAccess } from "../middleware/permissions";

// Importar motores core del engine
import {
  parseGremiusQuery,
  GremiusQLError,
  getAvailableRelations,
  validateGremiusQuery,
  debugQuery,
  BatchProcessor,
  BatchProcessorError,
} from "@gremius/engine";
import type { PgTable } from "drizzle-orm/pg-core";

export const datasetsQueryRoutes = new Hono<{ Variables: AppVariables }>();

// Aplicar autenticación a todas las rutas
datasetsQueryRoutes.use("/*", requireAuth);

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMAS ZOD PARA VALIDACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

/** Schema para operadores de filtro */
const FieldFilterSchema = z.object({
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
}).strict().optional();

/** Schema recursivo para where (soporta AND/OR/NOT) */
const WhereFilterSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    AND: z.array(z.lazy(() => WhereFilterSchema)).optional(),
    OR: z.array(z.lazy(() => WhereFilterSchema)).optional(),
    NOT: z.lazy(() => WhereFilterSchema).optional(),
  }).catchall(FieldFilterSchema).strict()
);

/** Schema para query de dataset */
const DatasetQuerySchema = z.object({
  where: WhereFilterSchema.optional(),
  expand: z.array(z.string()).optional(),
  select: z.array(z.string()).optional(),
  limit: z.number().min(1).max(1000).default(50).optional(),
  offset: z.number().min(0).default(0).optional(),
  orderBy: z.array(z.object({
    field: z.string(),
    direction: z.enum(["asc", "desc"]).default("asc").optional(),
  })).optional(),
}).strict();

/** Schema para operación de batch individual */
const BatchOperationSchema = z.object({
  op: z.enum(["create", "update", "delete", "upsert"]),
  table: z.enum(["dataEntries", "dataSets"]), // Tablas soportadas
  data: z.record(z.any()).optional(),
  id: z.string().optional(),
  alias: z.string().optional(),
  where: z.record(z.any()).optional(),
}).strict();

/** Schema para batch de operaciones */
const BatchRequestSchema = z.object({
  operations: z.array(BatchOperationSchema).min(1).max(100),
  datasetId: z.string().optional(), // Para validar permisos
}).strict();

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Obtener tabla Drizzle por nombre
// ═══════════════════════════════════════════════════════════════════════════════

import * as schema from "../db/schema";

const TABLE_MAP: Record<string, PgTable> = {
  dataEntries: schema.dataEntries,
  dataSets: schema.dataSets,
  games: schema.games,
  agentIdentities: schema.agentIdentities,
  agentTraces: schema.agentTraces,
  agentTraceSteps: schema.agentTraceSteps,
};

function getTableByName(name: string): PgTable | undefined {
  return TABLE_MAP[name];
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /:id/query - Ejecutar consulta Gremius QL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ejecuta una consulta Gremius QL sobre un dataset.
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
datasetsQueryRoutes.post(
  "/:id/query",
  zValidator("json", DatasetQuerySchema),
  async (c) => {
    const datasetId = c.req.param("id");
    const body = c.req.valid("json");
    const user = c.get("user");

    try {
      // 1. Verificar que el dataset existe
      const dataset = await db.query.dataSets.findFirst({
        where: eq(dataSets.id, datasetId),
      });

      if (!dataset) {
        return c.json({ error: "Dataset not found" }, 404);
      }

      // 2. Verificar permisos de lectura
      const hasAccess = await checkDatasetReadAccess(datasetId, user?.id);
      if (!hasAccess) {
        return c.json({ error: "Forbidden: No read access to this dataset" }, 403);
      }

      // 3. Ejecutar query usando el motor Gremius QL
      const result = await parseGremiusQuery(dataEntries, {
        ...body,
        where: {
          ...body.where,
          dataSetId: { eq: datasetId }, // Filtrar por dataset
        },
      });

      return c.json(result, 200);

    } catch (error) {
      console.error("[QueryEngine] Error:", error);

      // Manejar errores semánticos del traductor
      if (error instanceof GremiusQLError) {
        return c.json({
          error: error.message,
          code: error.code,
          details: error.details,
        }, 400);
      }

      // Error genérico
      return c.json({
        error: "Query execution failed",
        message: (error as Error).message,
      }, 500);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /query/:tableName - Query directo sobre tabla (admin only)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Query directo sobre cualquier tabla del esquema (solo administradores).
 * Útil para queries administrativas o cross-dataset.
 */
datasetsQueryRoutes.post(
  "/query/:tableName",
  zValidator("json", DatasetQuerySchema),
  async (c) => {
    const tableName = c.req.param("tableName");
    const body = c.req.valid("json");
    const user = c.get("user");

    // Solo admins pueden hacer queries directas
    if (user?.role !== "admin") {
      return c.json({ error: "Forbidden: Admin access required" }, 403);
    }

    const table = getTableByName(tableName);
    if (!table) {
      return c.json({
        error: `Table "${tableName}" not found`,
        availableTables: Object.keys(TABLE_MAP),
      }, 400);
    }

    try {
      const result = await parseGremiusQuery(table, body);
      return c.json(result, 200);
    } catch (error) {
      console.error("[QueryEngine] Error:", error);

      if (error instanceof GremiusQLError) {
        return c.json({
          error: error.message,
          code: error.code,
          details: error.details,
        }, 400);
      }

      return c.json({
        error: "Query execution failed",
        message: (error as Error).message,
      }, 500);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /:id/relations - Listar relaciones disponibles
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Lista las relaciones disponibles para expansión en un dataset.
 * Útil para que los clientes sepan qué pueden expandir.
 */
datasetsQueryRoutes.get("/:id/relations", async (c) => {
  const datasetId = c.req.param("id");

  // Las relaciones disponibles para dataEntries están definidas en el translator
  const availableRels = getAvailableRelations(dataEntries);

  return c.json({
    datasetId,
    availableRelations: availableRels,
    description: "Use these relation names in the 'expand' parameter of your queries",
  }, 200);
});

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
datasetsQueryRoutes.post(
  "/batch",
  zValidator("json", BatchRequestSchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");

    try {
      // 1. Validar permisos para cada operación
      // Extraer datasetIds de las operaciones (para dataEntries está en data.dataSetId)
      const datasetIds = new Set<string>();
      for (const op of body.operations) {
        if (op.table === "dataEntries" && op.data?.dataSetId) {
          datasetIds.add(op.data.dataSetId);
        } else if (op.table === "dataSets" && op.id) {
          // Para operaciones sobre datasets, usamos el id directo
          datasetIds.add(op.id);
        }
      }

      // Verificar acceso de escritura a todos los datasets involucrados
      for (const dsId of datasetIds) {
        const hasAccess = await checkDatasetWriteAccess(dsId, user?.id);
        if (!hasAccess) {
          return c.json({
            error: `Forbidden: No write access to dataset "${dsId}"`,
          }, 403);
        }
      }

      // 2. Transformar operaciones al formato del BatchProcessor
      const batchOps = body.operations.map(op => {
        const table = getTableByName(op.table);
        if (!table) {
          throw new Error(`Table "${op.table}" not found`);
        }

        return {
          op: op.op,
          table,
          data: op.data,
          id: op.id,
          alias: op.alias,
          where: op.where,
        };
      });

      // 3. Ejecutar batch usando el BatchProcessor
      const batchProcessor = new BatchProcessor();
      const result = await batchProcessor.execute(batchOps);

      // 4. Retornar resultado
      const statusCode = result.success ? 200 : 400;
      return c.json(result, statusCode);

    } catch (error) {
      console.error("[BatchEngine] Error:", error);

      // Manejar errores específicos del BatchProcessor
      if (error instanceof BatchProcessorError) {
        return c.json({
          success: false,
          error: {
            message: error.message,
            code: error.code,
            operationIndex: error.operationIndex,
            details: error.details,
          },
        }, 400);
      }

      // Error inesperado
      return c.json({
        success: false,
        error: {
          message: (error as Error).message,
          code: "INTERNAL_ERROR",
        },
      }, 500);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /validate-query - Validar query sin ejecutarla
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valida una consulta Gremius QL sin ejecutarla.
 * Útil para debugging y validación en el frontend.
 */
datasetsQueryRoutes.post(
  "/validate-query/:tableName",
  zValidator("json", DatasetQuerySchema),
  async (c) => {
    const tableName = c.req.param("tableName");
    const body = c.req.valid("json");

    const table = getTableByName(tableName);
    if (!table) {
      return c.json({
        valid: false,
        errors: [`Table "${tableName}" not found`],
        availableTables: Object.keys(TABLE_MAP),
      }, 400);
    }

    const validation = validateGremiusQuery(table, body);

    return c.json(validation, validation.valid ? 200 : 400);
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// DEBUG: GET /query-debug/:tableName - Ver SQL generado (sin ejecutar)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Debug: Muestra el SQL que se generaría para una query (sin ejecutar).
 * Solo disponible en modo desarrollo.
 */
datasetsQueryRoutes.post(
  "/query-debug/:tableName",
  zValidator("json", DatasetQuerySchema),
  async (c) => {
    const tableName = c.req.param("tableName");
    const body = c.req.valid("json");
    const user = c.get("user");

    // Solo admins en desarrollo
    if (process.env.NODE_ENV === "production") {
      return c.json({ error: "Debug endpoint not available in production" }, 403);
    }

    if (user?.role !== "admin") {
      return c.json({ error: "Admin access required" }, 403);
    }

    const table = getTableByName(tableName);
    if (!table) {
      return c.json({ error: `Table "${tableName}" not found` }, 400);
    }

    const debug = debugQuery(table, body);

    return c.json({
      table: tableName,
      query: body,
      generatedSql: debug.sql,
      params: debug.params,
    }, 200);
  }
);
