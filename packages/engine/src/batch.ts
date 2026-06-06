/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BATCH PROCESSOR - FASE 2: La Magia de los Datos
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * API Transaccional para operaciones batch con ACID garantizado.
 * Soporta dependencias entre operaciones mediante @ref:alias.
 *
 * Features:
 * - Transacciones ACID: Todo o nada (rollback automático)
 * - Operaciones: create, update, delete, upsert
 * - Referencias: @ref:alias.id para dependencias
 * - Validación: Integrada con Zod antes de escritura
 * - Rollback: Automático en caso de fallo
 *
 * @example
 * ```typescript
 * const batch = new BatchProcessor();
 * const result = await batch.execute([
 *   { op: "create", table: characters, data: { name: "Hero" }, alias: "hero" },
 *   { op: "create", table: skills, data: { character_id: "@ref:hero.id", damage: 100 } }
 * ]);
 * // Si skill falla, hero NO se crea (rollback ACID)
 * ```
 */

import { eq, and } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import { db } from "../../../apps/api/src/db";

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS Y CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

/** Tipos de operación soportados */
export type BatchOperationType = "create" | "update" | "delete" | "upsert";

/** Operación individual del batch */
export interface BatchOperation {
  /** Tipo de operación */
  op: BatchOperationType;
  /** Tabla objetivo */
  table: PgTable;
  /** Datos para create/update/upsert */
  data?: Record<string, any>;
  /** ID para update/delete (puede ser @ref:alias.id) */
  id?: string;
  /** Alias para referenciar en operaciones posteriores */
  alias?: string;
  /** Condición where para update/delete múltiples */
  where?: Record<string, any>;
  /** Validación Zod opcional */
  validation?: (data: any) => { success: boolean; errors?: string[] };
}

/** Resultado de operación individual */
export interface BatchOperationResult {
  /** Índice de la operación */
  index: number;
  /** Estado de la operación */
  status: "created" | "updated" | "deleted" | "upserted" | "failed" | "rolled_back";
  /** ID del registro afectado */
  id?: string;
  /** Alias asignado */
  alias?: string;
  /** Datos del registro (para create/upsert) */
  data?: any;
  /** Error si falló */
  error?: {
    message: string;
    code: string;
    details?: Record<string, any>;
  };
}

/** Resultado del batch */
export interface BatchResult {
  /** Éxito total del batch */
  success: boolean;
  /** Resultados individuales */
  results: BatchOperationResult[];
  /** Hubo rollback */
  rolledBack?: boolean;
  /** Error que causó el rollback */
  error?: {
    operationIndex?: number;
    message: string;
    code: string;
  };
  /** Metadata */
  meta: {
    executedAt: string;
    durationMs: number;
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
  };
}

/** Error del BatchProcessor */
export class BatchProcessorError extends Error {
  constructor(
    message: string,
    public code:
      | "INVALID_OPERATION"
      | "VALIDATION_FAILED"
      | "REF_NOT_FOUND"
      | "TRANSACTION_FAILED"
      | "ROLLBACK_FAILED",
    public operationIndex?: number,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = "BatchProcessorError";
  }
}

/** Referencias resueltas durante el batch */
type ResolvedRefs = Map<string, { id: string; data: any }>;

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH PROCESSOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * BatchProcessor - Ejecuta operaciones batch con garantías ACID.
 *
 * Todas las operaciones se ejecutan dentro de una transacción.
 * Si una falla, se hace rollback de todo.
 *
 * @example
 * ```typescript
 * const batch = new BatchProcessor();
 *
 * const result = await batch.execute([
 *   {
 *     op: "create",
 *     table: characters,
 *     data: { name: "Hu Tao", element: "pyro", rarity: 5 },
 *     alias: "hu_tao"
 *   },
 *   {
 *     op: "create",
 *     table: skills,
 *     data: {
 *       name: "Guide to Afterlife",
 *       character_id: "@ref:hu_tao.id",  // Referencia a operación anterior
 *       damage: 500
 *     }
 *   }
 * ]);
 *
 * if (result.success) {
 *   console.log("Personaje y skill creados:", result.results);
 * } else {
 *   console.error("Rollback ejecutado:", result.error);
 * }
 * ```
 */
export class BatchProcessor {
  private refs: ResolvedRefs = new Map();

  /**
   * Ejecuta un batch de operaciones transaccionalmente.
   *
   * @param operations - Array de operaciones a ejecutar
   * @returns Resultado del batch con éxito/fracaso de cada operación
   */
  async execute(operations: BatchOperation[]): Promise<BatchResult> {
    const startTime = performance.now();
    const results: BatchOperationResult[] = [];
    const executedAt = new Date().toISOString();

    // Validar operaciones antes de iniciar transacción
    this.validateOperations(operations);

    try {
      // Ejecutar en transacción
      await db.transaction(async (tx) => {
        for (let i = 0; i < operations.length; i++) {
          const op = operations[i];

          try {
            const result = await this.executeOperation(tx, op, i);
            results.push(result);

            // Guardar referencia si tiene alias
            if (result.alias && result.id) {
              this.refs.set(result.alias, { id: result.id, data: result.data });
            }
          } catch (error) {
            // Marcar operación como fallida
            results.push({
              index: i,
              status: "failed",
              alias: op.alias,
              error: {
                message: (error as Error).message,
                code: error instanceof BatchProcessorError ? error.code : "UNKNOWN_ERROR",
                details: error instanceof BatchProcessorError ? error.details : undefined,
              },
            });

            // Lanzar error para trigger rollback
            throw new BatchProcessorError(
              `Operación ${i} falló: ${(error as Error).message}`,
              "TRANSACTION_FAILED",
              i,
              { operation: op, originalError: error }
            );
          }
        }
      });

      const durationMs = performance.now() - startTime;
      const successfulOps = results.filter((r) => !r.error).length;

      return {
        success: true,
        results,
        meta: {
          executedAt,
          durationMs: Math.round(durationMs * 100) / 100,
          totalOperations: operations.length,
          successfulOperations: successfulOps,
          failedOperations: operations.length - successfulOps,
        },
      };
    } catch (error) {
      const durationMs = performance.now() - startTime;

      // Marcar operaciones pendientes como rolled_back
      for (let i = results.length; i < operations.length; i++) {
        results.push({
          index: i,
          status: "rolled_back",
          alias: operations[i].alias,
        });
      }

      // Actualizar estado de operaciones exitosas a rolled_back
      for (const result of results) {
        if (result.status !== "failed") {
          result.status = "rolled_back";
        }
      }

      return {
        success: false,
        results,
        rolledBack: true,
        error: {
          operationIndex: error instanceof BatchProcessorError ? error.operationIndex : -1,
          message: (error as Error).message,
          code: error instanceof BatchProcessorError ? error.code : "TRANSACTION_FAILED",
        },
        meta: {
          executedAt,
          durationMs: Math.round(durationMs * 100) / 100,
          totalOperations: operations.length,
          successfulOperations: 0,
          failedOperations: operations.length,
        },
      };
    }
  }

  /**
   * Ejecuta una sola operación dentro de la transacción.
   */
  private async executeOperation(
    tx: any,
    operation: BatchOperation,
    index: number
  ): Promise<BatchOperationResult> {
    const { op, table, data, id, where, validation } = operation;

    // Resolver referencias en data
    const resolvedData = data ? this.resolveReferences(data) : undefined;
    const resolvedId = id ? this.resolveReferenceValue(id) : undefined;

    // Validar datos si hay schema
    if (validation && resolvedData) {
      const validationResult = validation(resolvedData);
      if (!validationResult.success) {
        throw new BatchProcessorError(
          `Validación fallida: ${validationResult.errors?.join(", ")}`,
          "VALIDATION_FAILED",
          index,
          { errors: validationResult.errors }
        );
      }
    }

    switch (op) {
      case "create":
        return this.executeCreate(tx, table, resolvedData!, operation.alias, index);

      case "update":
        return this.executeUpdate(
          tx,
          table,
          resolvedId,
          resolvedData,
          where,
          operation.alias,
          index
        );

      case "delete":
        return this.executeDelete(tx, table, resolvedId, where, operation.alias, index);

      case "upsert":
        return this.executeUpsert(tx, table, resolvedId, resolvedData!, operation.alias, index);

      default:
        throw new BatchProcessorError(`Operación no soportada: ${op}`, "INVALID_OPERATION", index, {
          supportedOperations: ["create", "update", "delete", "upsert"],
        });
    }
  }

  private async executeCreate(
    tx: any,
    table: PgTable,
    data: Record<string, any>,
    alias: string | undefined,
    index: number
  ): Promise<BatchOperationResult> {
    const result = await tx.insert(table).values(data).returning();
    const inserted = result[0];

    return {
      index,
      status: "created",
      id: inserted.id,
      alias,
      data: inserted,
    };
  }

  private async executeUpdate(
    tx: any,
    table: PgTable,
    id: string | undefined,
    data: Record<string, any> | undefined,
    where: Record<string, any> | undefined,
    alias: string | undefined,
    index: number
  ): Promise<BatchOperationResult> {
    if (!data) {
      throw new BatchProcessorError("Update requiere data", "INVALID_OPERATION", index);
    }

    let query = tx.update(table).set(data);

    if (id) {
      query = query.where(eq((table as any).id, id));
    } else if (where) {
      // Construir where clause simple
      const conditions = Object.entries(where).map(([key, value]) => {
        return eq((table as any)[key], value);
      });
      if (conditions.length === 1) {
        query = query.where(conditions[0]);
      } else if (conditions.length > 1) {
        query = query.where(and(...conditions));
      }
    } else {
      throw new BatchProcessorError("Update requiere id o where", "INVALID_OPERATION", index);
    }

    const result = await query.returning();
    const updated = result[0];

    return {
      index,
      status: "updated",
      id: updated?.id || id,
      alias,
      data: updated,
    };
  }

  private async executeDelete(
    tx: any,
    table: PgTable,
    id: string | undefined,
    where: Record<string, any> | undefined,
    alias: string | undefined,
    index: number
  ): Promise<BatchOperationResult> {
    let query = tx.delete(table);

    if (id) {
      query = query.where(eq((table as any).id, id));
    } else if (where) {
      const conditions = Object.entries(where).map(([key, value]) => {
        return eq((table as any)[key], value);
      });
      if (conditions.length === 1) {
        query = query.where(conditions[0]);
      } else if (conditions.length > 1) {
        query = query.where(and(...conditions));
      }
    } else {
      throw new BatchProcessorError("Delete requiere id o where", "INVALID_OPERATION", index);
    }

    const result = await query.returning();

    return {
      index,
      status: "deleted",
      id: result[0]?.id || id,
      alias,
    };
  }

  private async executeUpsert(
    tx: any,
    table: PgTable,
    id: string | undefined,
    data: Record<string, any>,
    alias: string | undefined,
    index: number
  ): Promise<BatchOperationResult> {
    // Intentar update primero si hay id
    if (id) {
      const existing = await tx
        .select()
        .from(table)
        .where(eq((table as any).id, id))
        .limit(1);

      if (existing.length > 0) {
        // Update
        const result = await tx
          .update(table)
          .set(data)
          .where(eq((table as any).id, id))
          .returning();
        return {
          index,
          status: "upserted",
          id: result[0].id,
          alias,
          data: result[0],
        };
      }
    }

    // Create
    const result = await tx.insert(table).values(data).returning();
    return {
      index,
      status: "upserted",
      id: result[0].id,
      alias,
      data: result[0],
    };
  }

  /**
   * Resuelve referencias @ref:alias.key en el objeto data.
   */
  private resolveReferences(data: Record<string, any>): Record<string, any> {
    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "string" && value.startsWith("@ref:")) {
        resolved[key] = this.resolveReferenceValue(value);
      } else if (typeof value === "object" && value !== null) {
        resolved[key] = this.resolveReferences(value);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * Resuelve un valor de referencia @ref:alias.key.
   */
  private resolveReferenceValue(value: string): string {
    if (!value.startsWith("@ref:")) {
      return value;
    }

    const parts = value.slice(5).split("."); // Remover "@ref:" y split
    if (parts.length < 2) {
      throw new BatchProcessorError(
        `Formato de referencia inválido: ${value}. Use @ref:alias.property`,
        "REF_NOT_FOUND",
        undefined,
        { value }
      );
    }

    const [alias, ...propertyPath] = parts;
    const ref = this.refs.get(alias);

    if (!ref) {
      throw new BatchProcessorError(
        `Referencia no encontrada: ${alias}`,
        "REF_NOT_FOUND",
        undefined,
        { alias, availableRefs: Array.from(this.refs.keys()) }
      );
    }

    // Navegar por el path de propiedades
    let result: any = ref;
    for (const prop of propertyPath) {
      result = result[prop];
      if (result === undefined) {
        throw new BatchProcessorError(
          `Propiedad no encontrada en referencia: ${alias}.${propertyPath.join(".")}`,
          "REF_NOT_FOUND",
          undefined,
          { alias, property: prop, availableProperties: Object.keys(ref) }
        );
      }
    }

    return result;
  }

  /**
   * Valida las operaciones antes de ejecutar.
   */
  private validateOperations(operations: BatchOperation[]): void {
    if (!Array.isArray(operations) || operations.length === 0) {
      throw new BatchProcessorError("Se requiere un array de operaciones", "INVALID_OPERATION");
    }

    if (operations.length > 100) {
      throw new BatchProcessorError(
        "Máximo 100 operaciones por batch",
        "INVALID_OPERATION",
        undefined,
        { provided: operations.length, max: 100 }
      );
    }

    // Validar duplicados de alias
    const aliases = new Set<string>();
    for (const op of operations) {
      if (op.alias) {
        if (aliases.has(op.alias)) {
          throw new BatchProcessorError(
            `Alias duplicado: ${op.alias}`,
            "INVALID_OPERATION",
            undefined,
            { alias: op.alias }
          );
        }
        aliases.add(op.alias);
      }
    }
  }

  /**
   * Limpia las referencias internas.
   */
  clearRefs(): void {
    this.refs.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCIONES AUXILIARES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Crea un nuevo BatchProcessor.
 */
export function createBatchProcessor(): BatchProcessor {
  return new BatchProcessor();
}

/**
 * Ejecuta una operación única dentro de una transacción.
 *
 * @example
 * ```typescript
 * const result = await executeSingle(characters, "create", {
 *   name: "Hero",
 *   level: 50
 * });
 * ```
 */
export async function executeSingle(
  table: PgTable,
  op: BatchOperationType,
  data: Record<string, any>,
  options?: {
    id?: string;
    validation?: (data: any) => { success: boolean; errors?: string[] };
  }
): Promise<BatchOperationResult> {
  const batch = new BatchProcessor();
  const result = await batch.execute([
    {
      op,
      table,
      data,
      id: options?.id,
      validation: options?.validation,
    },
  ]);

  if (!result.success) {
    throw new BatchProcessorError(
      result.error?.message || "Operación fallida",
      (result.error?.code as any) || "TRANSACTION_FAILED"
    );
  }

  return result.results[0];
}

/**
 * Crea un registro padre con hijos en una sola transacción.
 *
 * @example
 * ```typescript
 * const result = await createWithChildren(
 *   characters,
 *   { name: "Hu Tao", element: "pyro" },
 *   [
 *     { table: skills, data: { name: "Skill 1", damage: 100 } },
 *     { table: skills, data: { name: "Skill 2", damage: 200 } }
 *   ]
 * );
 * ```
 */
export async function createWithChildren(
  parentTable: PgTable,
  parentData: Record<string, any>,
  children: Array<{
    table: PgTable;
    data: Record<string, any>;
    foreignKeyField: string;
  }>,
  options?: {
    parentAlias?: string;
    validation?: (data: any) => { success: boolean; errors?: string[] };
  }
): Promise<BatchResult> {
  const operations: BatchOperation[] = [];
  const parentAlias = options?.parentAlias || "parent";

  // Operación padre
  operations.push({
    op: "create",
    table: parentTable,
    data: parentData,
    alias: parentAlias,
    validation: options?.validation,
  });

  // Operaciones hijas con referencia al padre
  for (const child of children) {
    operations.push({
      op: "create",
      table: child.table,
      data: {
        ...child.data,
        [child.foreignKeyField]: `@ref:${parentAlias}.id`,
      },
    });
  }

  const batch = new BatchProcessor();
  return batch.execute(operations);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════
// Note: Types are already exported as interfaces above
