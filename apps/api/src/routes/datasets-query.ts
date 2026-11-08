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
  esUuid,
} from "@kitsuden/engine";
import { accesoADataset } from "@kitsuden/shared";
import { eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";

// Deep import, como transactional-rls: la fachada del engine no exporta el
// mapa de relaciones, y hace falta para saber a QUÉ tabla lleva un `expand`.
import { getRelationsMap } from "../../../../packages/engine/src/translator";
import { db, mergedSchema } from "../db";
import { dataSets, dataEntries } from "../db/schema-core";
import { esColumnaSecreta, sinColumnasSecretas, tablaNativaProhibida } from "../lib/tablas-explorables";
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

/** Nombre SQL de una tabla de drizzle. */
function nombreSql(tabla: unknown): string | undefined {
  return (tabla as Record<symbol, unknown> | null | undefined)?.[Symbol.for("drizzle:Name")] as
    | string
    | undefined;
}

/**
 * La tabla del esquema fusionado con ese nombre, salvo las prohibidas
 * (auditoría 2026-11-04, F71): `POST /query/authAccounts` devolvía hashes de
 * contraseña y tokens a un admin. Una prohibida responde como inexistente, y
 * tampoco sale en la lista de tablas disponibles.
 */
function getTableByName(name: string): PgTable | undefined {
  const tabla = buscarTabla(name);
  if (tabla && tablaNativaProhibida(nombreSql(tabla) ?? "")) return undefined;
  return tabla;
}

/** Las claves del esquema fusionado que se pueden nombrar aquí. */
function tablasDisponibles(): string[] {
  return Object.entries(mergedSchema as Record<string, unknown>)
    .filter(([, v]) => {
      const nombre = nombreSql(v);
      return nombre !== undefined && !tablaNativaProhibida(nombre);
    })
    .map(([k]) => k);
}

/**
 * ¿Qué tiene esta consulta que no se puede pedir sobre una tabla nativa?
 * `null` si nada. Un `where`, un `orderBy` o un `select` sobre una columna
 * secreta es un oráculo (o una fuga directa), y un `expand` a una tabla
 * prohibida la lee de lado (`agentIdentities.apiKeys` → `agent_api_keys`).
 */
export function problemaDeConsultaNativa(table: PgTable, body: unknown): string | null {
  const consulta = (body ?? {}) as {
    where?: unknown;
    orderBy?: { field?: unknown }[];
    select?: unknown[];
    expand?: unknown[];
  };
  const campoSecreto = (where: unknown): string | null => {
    if (!where || typeof where !== "object") return null;
    if (Array.isArray(where)) {
      for (const w of where) {
        const s = campoSecreto(w);
        if (s) return s;
      }
      return null;
    }
    for (const [clave, valor] of Object.entries(where as Record<string, unknown>)) {
      if (clave === "AND" || clave === "OR" || clave === "NOT") {
        const s = campoSecreto(valor);
        if (s) return s;
      } else if (esColumnaSecreta(clave)) {
        return clave;
      }
    }
    return null;
  };
  const enWhere = campoSecreto(consulta.where);
  if (enWhere) return `Column "${enWhere}" cannot be filtered`;
  for (const o of consulta.orderBy ?? []) {
    if (typeof o?.field === "string" && esColumnaSecreta(o.field)) return `Column "${o.field}" cannot be sorted`;
  }
  for (const c of consulta.select ?? []) {
    if (typeof c === "string" && esColumnaSecreta(c)) return `Column "${c}" cannot be selected`;
  }
  const relaciones = getRelationsMap().get(nombreSql(table) ?? "");
  for (const rel of consulta.expand ?? []) {
    if (typeof rel !== "string") continue;
    const destino = relaciones?.get(rel)?.table;
    if (destino && tablaNativaProhibida(nombreSql(destino) ?? "")) return `Relation "${rel}" cannot be expanded`;
  }
  return null;
}

function buscarTabla(name: string): PgTable | undefined {
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
// HELPER: scopes por dataset del agente (auditoría 2026-11-04, F70)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Los scopes `datasets:<slug>:<acción>` y sus denegaciones `!datasets:<slug>:*`
 * deciden ANTES que la política, como en `crud.ts`, kon-datasets y MCP. Esta
 * ruta solo miraba `policyJson`: una clave con `["admin", "!datasets:secreto:*"]`
 * leía aquí lo que `/api/data-sets/:id/entries` le niega.
 *
 * `null`: los scopes no dicen nada de este dataset; decide la política.
 */
export function accesoPorScopesDelAgente(
  c: { get: unknown },
  slug: string | null | undefined,
  accion: "read" | "write"
): "denegado" | "concedido" | null {
  const get = (c.get as (k: string) => unknown).bind(c);
  const agente = get("agent") as { scopes?: string[] } | undefined;
  const usuario = get("user") as { scopes?: unknown } | null | undefined;
  const scopes = agente?.scopes ?? (Array.isArray(usuario?.scopes) ? (usuario!.scopes as string[]) : undefined);
  return accesoADataset(scopes, slug ?? null, accion);
}

/**
 * ¿Puede leer este dataset? Scopes del agente primero; si no dicen nada, la
 * política (`checkDatasetReadAccess`).
 */
async function puedeLeerDataset(c: Context, dataset: { id: string; slug: string | null }): Promise<boolean> {
  const acceso = accesoPorScopesDelAgente(c, dataset.slug, "read");
  if (acceso) return acceso === "concedido";
  return checkDatasetReadAccess(c, dataset.id);
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

    // 2. Verificar permisos de lectura: scopes por dataset del agente, luego la política
    const hasAccess = await puedeLeerDataset(c, dataset);
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
        availableTables: tablasDisponibles(),
      },
      400
    );
  }

  const problema = problemaDeConsultaNativa(table, body);
  if (problema) return c.json({ error: problema, code: "FIELD_NOT_ALLOWED" }, 400);

  try {
    const result = await parseKitsudenQuery(table, body as any);
    // Ni a un admin se le devuelve un hash o un token (como `/api/items`, MCP y el explorador).
    return c.json(sinColumnasSecretas(result) as Record<string, unknown>, 200);
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

  // Las mismas puertas que la consulta: un dataset que no puede leer no existe
  // para él (la lista es estática, pero confirmaría que el id existe).
  const [dataset] = esUuid(datasetId)
    ? await db.select({ id: dataSets.id, slug: dataSets.slug }).from(dataSets).where(eq(dataSets.id, datasetId)).limit(1)
    : [];
  if (!dataset || !(await puedeLeerDataset(c, dataset))) {
    return c.json({ error: "Dataset not found" }, 404);
  }

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

    // Verificar acceso de escritura a todos los datasets involucrados: una
    // denegación `!datasets:<slug>:*` del agente gana a su scope `admin`.
    for (const dsId of datasetIds) {
      const [ds] = esUuid(dsId)
        ? await db.select({ slug: dataSets.slug }).from(dataSets).where(eq(dataSets.id, dsId)).limit(1)
        : [];
      const acceso = accesoPorScopesDelAgente(c, ds?.slug, "write");
      const hasAccess = acceso ? acceso === "concedido" : await checkDatasetWriteAccess(c, dsId);
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
        availableTables: tablasDisponibles(),
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
