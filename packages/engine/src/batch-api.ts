/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BATCH API - El Muro de Titanio (Escrituras Atómicas)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * API de escritura batch con garantías ACID:
 * - Atomicidad: Todo o nada, rollback automático en fallos
 * - Consistencia: Validación declarativa previa a escritura
 * - Aislamiento: Transacciones de base de datos
 * - Durabilidad: Confirmación explícita de commits
 *
 * Features:
 * - Procesamiento batch de múltiples entidades
 * - Validación previa con ValidatorEngine
 * - Transacciones anidadas (parent-child)
 * - Rollback automático en fallos
 * - Detalle granular de errores
 *
 * @example
 * ```typescript
 * const batch = new BatchProcessor();
 *
 * const result = await batch.execute({
 *   operations: [
 *     { table: agentIdentities, action: "insert", data: { name: "Agent 1" } },
 *     { table: agentApiKeys, action: "insert", data: { agentId: "...", keyHash: "..." } }
 *   ],
 *   validation: agentIdentitySchema
 * });
 *
 * if (!result.success) {
 *   // Toda la transacción fue rollback
 *   console.log(result.errors);
 * }
 * ```
 */

import type { PgTable } from "drizzle-orm/pg-core";

import { db } from "../../../apps/api/src/db";

import { condicionDeEscritura } from "./db-conditions";
import { messageOf } from "./errors";
import { validate, type ValidationSchema } from "./validator";
// import * as schema from "../../../apps/api/src/db/schema";

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS Y CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

/** Acción de base de datos */
export type BatchAction = "insert" | "update" | "delete" | "upsert";

/** Operación individual en el batch (Batch API) */
export interface BatchApiOperation<T = any> {
  /** Tabla objetivo */
  table: PgTable;
  /** Acción a realizar */
  action: BatchAction;
  /** Datos para la operación */
  data: T;
  /** ID para update/delete */
  id?: string;
  /** Condición where para update/delete */
  where?: Record<string, unknown>;
  /** Schema de validación específico para esta operación */
  validation?: ValidationSchema;
  /** Descripción para logs */
  description?: string;
  /** Dependencias: IDs de operaciones previas que deben existir */
  dependsOn?: string[];
  /** Clave para referenciar resultado en operaciones dependientes */
  key?: string;
}

/** Opciones del batch processor */
export interface BatchOptions {
  /** Schema de validación global */
  validation?: ValidationSchema;
  /** Detenerse en el primer error (default: false) */
  abortEarly?: boolean;
  /** Timeout en ms (default: 30000) */
  timeout?: number;
  /** Nivel de aislamiento de la transacción */
  isolationLevel?: "read uncommitted" | "read committed" | "repeatable read" | "serializable";
  /** Contexto para validaciones y transformaciones */
  context?: Record<string, unknown>;
}

/** Resultado de una operación individual (Batch API) */
export interface BatchApiOperationResult<T = any> {
  /** Éxito de la operación */
  success: boolean;
  /** Datos resultantes (para inserts, el registro creado) */
  data?: T;
  /** ID generado o afectado */
  id?: string;
  /** Errores específicos de esta operación */
  errors?: string[];
  /** Índice en el array de operaciones */
  index: number;
  /** Descripción de la operación */
  description?: string;
}

/** Resultado completo del batch (Batch API) */
export interface BatchApiResult {
  /** Éxito total del batch */
  success: boolean;
  /** Resultados individuales (solo si success=true) */
  results?: BatchApiOperationResult[];
  /** Errores acumulados (solo si success=false) */
  errors: BatchError[];
  /** Metadata de ejecución */
  meta: {
    /** Timestamp de inicio */
    startedAt: string;
    /** Timestamp de fin */
    finishedAt: string;
    /** Duración en ms */
    durationMs: number;
    /** Número de operaciones ejecutadas */
    operationsCount: number;
    /** Número de operaciones exitosas */
    successCount: number;
    /** Número de operaciones fallidas */
    failedCount: number;
    /** Indica si se hizo rollback */
    rollback: boolean;
  };
}

/** Error de batch detallado */
export interface BatchError {
  /** Índice de la operación que falló */
  operationIndex: number;
  /** Descripción de la operación */
  operationDescription?: string;
  /** Mensaje de error */
  message: string;
  /** Código de error (si aplica) */
  code?: string;
  /** Detalles adicionales */
  details?: any;
}

/** Estado interno del batch */
interface BatchState {
  results: Map<string, any>;
  errors: BatchError[];
  operationResults: BatchApiOperationResult[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH PROCESSOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Antes esto llamaba a `columna.eq(valor)` — un método que las columnas de
 * Drizzle NO tienen (se usa `eq(columna, valor)`), así que lanzaba un
 * TypeError; el `as any` de por medio es lo que dejaba compilarlo. En el
 * `upsert`, además, un `try/catch` se lo tragaba y hacía el insert igualmente,
 * duplicando filas en silencio.
 *
 * Ahora lo construye `condicionDeEscritura`, compartido con `batch.ts`.
 */
const condicionDe = condicionDeEscritura;

/**
 * Procesador de operaciones batch con garantías ACID.
 */
export class BatchProcessor {
  private state: BatchState;
  private options: BatchOptions;

  constructor(options: BatchOptions = {}) {
    this.options = {
      abortEarly: false,
      timeout: 30000,
      isolationLevel: "read committed",
      ...options,
    };
    this.state = {
      results: new Map(),
      errors: [],
      operationResults: [],
    };
  }

  /**
   * Ejecuta un batch de operaciones dentro de una transacción.
   *
   * @param operations - Array de operaciones a ejecutar
   * @returns Resultado del batch
   *
   * @example
   * ```typescript
   * const batch = new BatchProcessor();
   *
   * const result = await batch.execute([
   *   {
   *     table: agentIdentities,
   *     action: "insert",
   *     data: { name: "Agent 1", type: "service" },
   *     key: "agent1",
   *     validation: {
   *       name: { required: true, min: 1 },
   *       type: { enum: ["service", "user"] }
   *     }
   *   },
   *   {
   *     table: agentApiKeys,
   *     action: "insert",
   *     data: { keyHash: "abc123" },
   *     dependsOn: ["agent1"],
   *     description: "Create API key for agent"
   *   }
   * ]);
   * ```
   */
  async execute(operations: BatchApiOperation[]): Promise<BatchApiResult> {
    const startedAt = new Date().toISOString();
    const startTime = performance.now();

    // Resetear estado
    this.state = {
      results: new Map(),
      errors: [],
      operationResults: [],
    };

    // Validar operaciones previo a transacción
    const preValidationErrors = this.validateOperations(operations);
    if (preValidationErrors.length > 0) {
      return {
        success: false,
        errors: preValidationErrors,
        meta: {
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: performance.now() - startTime,
          operationsCount: operations.length,
          successCount: 0,
          failedCount: operations.length,
          rollback: false,
        },
      };
    }

    // Ejecutar transacción
    try {
      await db.transaction(async (tx) => {
        for (let i = 0; i < operations.length; i++) {
          const op = operations[i];

          // Verificar dependencias
          if (op.dependsOn) {
            for (const depKey of op.dependsOn) {
              if (!this.state.results.has(depKey)) {
                throw new Error(`Dependency not met: ${depKey}`);
              }
            }
          }

          // Ejecutar operación
          const result = await this.executeOperation(tx, op, i);

          if (!result.success) {
            this.state.errors.push({
              operationIndex: i,
              operationDescription: op.description,
              message: result.errors?.[0] || "Operation failed",
              details: result.errors,
            });

            if (this.options.abortEarly) {
              throw new Error(`Operation ${i} failed: ${result.errors?.[0]}`);
            }
          } else {
            this.state.operationResults.push(result);

            // Guardar resultado para dependencias
            if (op.key) {
              this.state.results.set(op.key, result.data);
            }
          }
        }

        // Si hay errores y no es abortEarly, hacer rollback
        if (this.state.errors.length > 0) {
          throw new Error("Batch validation failed");
        }
      });

      const finishedAt = new Date().toISOString();
      const durationMs = performance.now() - startTime;

      return {
        success: true,
        results: this.state.operationResults,
        errors: [],
        meta: {
          startedAt,
          finishedAt,
          durationMs,
          operationsCount: operations.length,
          successCount: this.state.operationResults.length,
          failedCount: 0,
          rollback: false,
        },
      };
    } catch (error: unknown) {
      const finishedAt = new Date().toISOString();
      const durationMs = performance.now() - startTime;

      // Rollback automático por la transacción
      return {
        success: false,
        errors: [
          ...this.state.errors,
          {
            operationIndex: -1,
            message: messageOf(error, "Transaction failed"),
            // El código lo pone el driver y no siempre viene: se lee con
            // cuidado en vez de dar por hecho que el error tiene forma.
            code: (error as { code?: string })?.code,
            details: error,
          },
        ],
        meta: {
          startedAt,
          finishedAt,
          durationMs,
          operationsCount: operations.length,
          successCount: this.state.operationResults.length,
          failedCount: operations.length - this.state.operationResults.length,
          rollback: true,
        },
      };
    }
  }

  /**
   * Ejecuta una operación individual dentro de la transacción.
   */
  private async executeOperation(
    tx: any,
    operation: BatchApiOperation,
    index: number
  ): Promise<BatchApiOperationResult> {
    const { table, action, data, id, where, validation, description, dependsOn } = operation;

    try {
      // Validar datos si hay schema
      if (validation || this.options.validation) {
        const schemaToUse = validation || this.options.validation!;
        const validationResult = validate(data, schemaToUse, {
          context: this.options.context,
        });

        if (!validationResult.valid) {
          return {
            success: false,
            index,
            description,
            errors: validationResult.errors.map((e) => `${e.field}: ${e.message}`),
          };
        }
      }

      // Resolver dependencias en datos
      const resolvedData = { ...data };
      if (dependsOn) {
        for (const depKey of dependsOn) {
          const depResult = this.state.results.get(depKey);
          if (depResult?.id) {
            // Reemplazar placeholders como {agentId} con valores reales
            for (const [field, value] of Object.entries(resolvedData)) {
              if (typeof value === "string" && value.includes(`{${depKey}}`)) {
                resolvedData[field] = value.replace(`{${depKey}}`, depResult.id);
              }
            }
            // Si hay un campo que termina en "Id" y está vacío, asignar el ID de la dependencia
            for (const field of Object.keys(resolvedData)) {
              if (field.endsWith("Id") && !resolvedData[field]) {
                resolvedData[field] = depResult.id;
              }
            }
          }
        }
      }

      // Ejecutar acción
      let result: any;
      let resultId: string | undefined;

      switch (action) {
        case "insert":
          const insertResult = await tx.insert(table).values(resolvedData).returning();
          result = insertResult[0];
          resultId = result.id;
          break;

        case "update": {
          const updateResult = await tx
            .update(table)
            .set(resolvedData)
            .where(condicionDe(table, id, where, "Update"))
            .returning();
          result = updateResult[0];
          resultId = result?.id || id;
          break;
        }

        case "delete": {
          const deleteResult = await tx
            .delete(table)
            .where(condicionDe(table, id, where, "Delete"))
            .returning();
          result = deleteResult[0];
          resultId = id;
          break;
        }

        case "upsert": {
          // "No existía" se decide por `length === 0`, no por que algo lance.
          //
          // Esto estaba envuelto en un `try/catch` que ante CUALQUIER error
          // hacía el insert igualmente. Con la llamada rota de antes
          // (`columna.eq(...)`, que no existe en Drizzle) el TypeError caía
          // ahí: todos los upserts se convertían en altas, duplicando filas en
          // silencio. Y con la llamada arreglada seguiría siendo trampa —una
          // violación de unicidad o un campo inexistente en `where` acabarían
          // insertando en vez de avisar.
          const upsertResult = await tx
            .update(table)
            .set(resolvedData)
            .where(condicionDe(table, id, where, "Upsert"))
            .returning();

          if (upsertResult.length > 0) {
            result = upsertResult[0];
          } else {
            const insertResult = await tx.insert(table).values(resolvedData).returning();
            result = insertResult[0];
          }
          resultId = result.id;
          break;
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      return {
        success: true,
        data: result,
        id: resultId,
        index,
        description,
      };
    } catch (error: unknown) {
      return {
        success: false,
        index,
        description,
        errors: [messageOf(error) || "Unknown error"],
      };
    }
  }

  /**
   * Valida las operaciones antes de ejecutar la transacción.
   */
  private validateOperations(operations: BatchApiOperation[]): BatchError[] {
    const errors: BatchError[] = [];

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];

      // Validar campos requeridos
      if (!op.table) {
        errors.push({
          operationIndex: i,
          message: "Table is required",
        });
      }

      if (!op.action) {
        errors.push({
          operationIndex: i,
          message: "Action is required",
        });
      }

      if (!op.data && op.action !== "delete") {
        errors.push({
          operationIndex: i,
          message: "Data is required",
        });
      }

      // Validar dependencias
      if (op.dependsOn) {
        for (const dep of op.dependsOn) {
          const depOp = operations.find((o) => o.key === dep);
          if (!depOp) {
            errors.push({
              operationIndex: i,
              message: `Dependency '${dep}' not found in operations`,
            });
          }
        }
      }
    }

    return errors;
  }

  /**
   * Resetea el estado del procesador.
   */
  reset(): void {
    this.state = {
      results: new Map(),
      errors: [],
      operationResults: [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIONES AUXILIARES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Crea un batch processor con opciones predefinidas.
 */
export function createBatchProcessor(options: BatchOptions = {}): BatchProcessor {
  return new BatchProcessor(options);
}

/**
 * Ejecuta un batch simple de una sola operación.
 */
export async function executeSingle<T = any>(
  table: PgTable,
  action: BatchAction,
  data: T,
  options?: BatchOptions
): Promise<BatchApiResult> {
  const batch = new BatchProcessor(options);
  return batch.execute([
    {
      table,
      action,
      data,
    },
  ]);
}

/**
 * Crea un registro padre y múltiples hijos en una transacción.
 *
 * @example
 * ```typescript
 * const result = await createWithChildren(
 *   agentIdentities,
 *   { name: "Agent 1", type: "service" },
 *   [
 *     { table: agentApiKeys, data: { keyHash: "abc" } },
 *     { table: agentMemory, data: { content: { role: "assistant" } } }
 *   ]
 * );
 * ```
 */
export async function createWithChildren<T = any>(
  parentTable: PgTable,
  parentData: T,
  children: Array<{
    table: PgTable;
    data: any;
    foreignKeyField?: string;
  }>,
  options?: BatchOptions
): Promise<BatchApiResult> {
  const operations: BatchApiOperation[] = [
    {
      table: parentTable,
      action: "insert",
      data: parentData,
      key: "parent",
    },
  ];

  for (const child of children) {
    const fkField = child.foreignKeyField || "parentId";
    operations.push({
      table: child.table,
      action: "insert",
      data: {
        ...child.data,
        [fkField]: "{parent}", // Será reemplazado por el ID real
      },
      dependsOn: ["parent"],
    });
  }

  const batch = new BatchProcessor(options);
  return batch.execute(operations);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTACIONES
// ═══════════════════════════════════════════════════════════════════════════════
// Note: Types are already exported as interfaces above
