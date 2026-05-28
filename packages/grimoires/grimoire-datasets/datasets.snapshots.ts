// @ts-nocheck
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATASETS SNAPSHOTS - Denormalización y Snapshots Inmutables
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Sistema de snapshots para guardar datos relacionados en el momento de creación.
 * Crítico para builds de gaming donde los ítems/cambios afectan históricos.
 *
 * Features:
 * - Snapshots automáticos en create/update
 * - Inmutabilidad de builds históricos
 * - Restauración a versiones anteriores
 * - Comparación de snapshots
 * - Auditoría completa
 */

import { z } from "zod";
import type { GrimoireContext } from "@gremius/shared";
import type { DataSet, DataEntry } from "./datasets.schema";

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS Y SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

export type SnapshotTrigger = "create" | "update" | "manual" | "scheduled";

export interface SnapshotConfig {
  /** Habilitar snapshots */
  enabled: boolean;
  /** Triggers que generan snapshot */
  on: SnapshotTrigger[];
  /** Campos a snapshotear (relaciones) */
  fields: SnapshotField[];
  /** Campos calculados a incluir */
  calculated?: string[];
  /** Retención: número de versiones a mantener (0 = infinito) */
  retention?: number;
}

export interface SnapshotField {
  /** Campo que contiene el ID de la relación */
  source: string;
  /** Campos del objeto relacionado a snapshotear */
  snapshot: string[];
  /** Nombre personalizado en el snapshot */
  as?: string;
}

export interface SnapshotData {
  /** Timestamp del snapshot */
  timestamp: string;
  /** Versión del schema */
  version: string;
  /** Datos snapshoteados */
  data: Record<string, any>;
  /** Campos calculados snapshoteados */
  calculated?: Record<string, any>;
  /** Metadata adicional */
  meta?: {
    triggeredBy?: string;
    reason?: string;
    source?: string;
  };
}

export interface SnapshotComparison {
  field: string;
  oldValue: any;
  newValue: any;
  changed: boolean;
}

export interface EntryVersion {
  version: number;
  entryId: string;
  datasetId: string;
  snapshot: SnapshotData;
  createdAt: string;
  restoredFrom?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMAS ZOD
// ═══════════════════════════════════════════════════════════════════════════════

export const snapshotFieldSchema = z.object({
  source: z.string(),
  snapshot: z.array(z.string()),
  as: z.string().optional(),
});

export const snapshotConfigSchema = z.object({
  enabled: z.boolean().default(false),
  on: z.array(z.enum(["create", "update", "manual", "scheduled"])).default(["create"]),
  fields: z.array(snapshotFieldSchema).default([]),
  calculated: z.array(z.string()).optional(),
  retention: z.number().int().min(0).default(0),
});

// ═══════════════════════════════════════════════════════════════════════════════
// SNAPSHOT ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

import { eq, and, desc, asc, sql } from "drizzle-orm";

/**
 * Verifica si se debe generar snapshot según la configuración
 */
export function shouldSnapshot(config: SnapshotConfig, trigger: SnapshotTrigger): boolean {
  if (!config.enabled) return false;
  return config.on.includes(trigger);
}

/**
 * Genera un snapshot de un entry con sus relaciones
 */
export async function generateSnapshot(
  ctx: GrimoireContext,
  entry: DataEntry,
  config: SnapshotConfig,
  trigger: SnapshotTrigger,
  options?: {
    reason?: string;
    source?: string;
    calculatedValues?: Record<string, any>;
  }
): Promise<SnapshotData> {
  const snapshot: SnapshotData = {
    timestamp: new Date().toISOString(),
    version: "1.0",
    data: {},
    meta: {
      triggeredBy: trigger,
      reason: options?.reason,
      source: options?.source,
    },
  };

  // Si hay campos relacionados que snapshotear
  if (config.fields.length > 0) {
    for (const field of config.fields) {
      const relatedId = entry.data[field.source];
      
      if (!relatedId) {
        snapshot.data[field.as || field.source] = null;
        continue;
      }

      // Determinar la tabla relacionada desde el schema
      const relatedData = await fetchRelatedData(ctx, relatedId, field);
      
      if (relatedData) {
        // Filtrar solo los campos solicitados
        const snapshotData: Record<string, any> = {};
        for (const key of field.snapshot) {
          snapshotData[key] = relatedData[key];
        }
        snapshot.data[field.as || field.source] = snapshotData;
      } else {
        snapshot.data[field.as || field.source] = null;
      }
    }
  }

  // Incluir campos calculados si se proporcionaron
  if (options?.calculatedValues && config.calculated) {
    snapshot.calculated = {};
    for (const calcField of config.calculated) {
      if (options.calculatedValues[calcField] !== undefined) {
        snapshot.calculated[calcField] = options.calculatedValues[calcField];
      }
    }
  }

  return snapshot;
}

/**
 * Guarda un snapshot en el entry
 */
export async function saveSnapshot(
  ctx: GrimoireContext,
  entryId: string,
  snapshot: SnapshotData,
  config: SnapshotConfig
): Promise<void> {
  const { db } = ctx;
  const { dataEntries } = await import("./datasets.schema");

  // Obtener entry actual
  const [entry] = await db.instance
    .select()
    .from(dataEntries)
    .where(eq(dataEntries.id, entryId))
    .limit(1);

  if (!entry) {
    throw new Error(`Entry not found: ${entryId}`);
  }

  // Construir historial de snapshots
  const existingSnapshots: SnapshotData[] = (entry.data as any)._snapshots || [];
  
  // Agregar nuevo snapshot al inicio (más reciente primero)
  const newSnapshots = [snapshot, ...existingSnapshots];
  
  // Aplicar retención si está configurada
  if (config.retention && config.retention > 0) {
    while (newSnapshots.length > config.retention) {
      newSnapshots.pop();
    }
  }

  // Actualizar entry con el snapshot
  const updatedData = {
    ...entry.data,
    _snapshot: snapshot, // Último snapshot (acceso rápido)
    _snapshots: newSnapshots, // Historial completo
  };

  await db.instance
    .update(dataEntries)
    .set({
      data: updatedData,
      updatedAt: new Date(),
    })
    .where(eq(dataEntries.id, entryId));

  ctx.logger.debug(`📸 Snapshot saved for entry ${entryId}`);
}

/**
 * Obtiene el snapshot actual de un entry
 */
export async function getCurrentSnapshot(
  ctx: GrimoireContext,
  entryId: string
): Promise<SnapshotData | null> {
  const { db } = ctx;
  const { dataEntries } = await import("./datasets.schema");

  const [entry] = await db.instance
    .select()
    .from(dataEntries)
    .where(eq(dataEntries.id, entryId))
    .limit(1);

  if (!entry) return null;

  return (entry.data as any)._snapshot || null;
}

/**
 * Obtiene el historial de snapshots de un entry
 */
export async function getSnapshotHistory(
  ctx: GrimoireContext,
  entryId: string
): Promise<SnapshotData[]> {
  const { db } = ctx;
  const { dataEntries } = await import("./datasets.schema");

  const [entry] = await db.instance
    .select()
    .from(dataEntries)
    .where(eq(dataEntries.id, entryId))
    .limit(1);

  if (!entry) return [];

  return (entry.data as any)._snapshots || [];
}

/**
 * Compara dos snapshots y retorna las diferencias
 */
export function compareSnapshots(
  oldSnapshot: SnapshotData | null,
  newSnapshot: SnapshotData
): SnapshotComparison[] {
  const differences: SnapshotComparison[] = [];
  const allKeys = new Set([
    ...Object.keys(oldSnapshot?.data || {}),
    ...Object.keys(newSnapshot.data),
  ]);

  for (const key of allKeys) {
    const oldValue = oldSnapshot?.data?.[key];
    const newValue = newSnapshot.data[key];

    differences.push({
      field: key,
      oldValue,
      newValue,
      changed: JSON.stringify(oldValue) !== JSON.stringify(newValue),
    });
  }

  return differences;
}

/**
 * Restaura un entry a un snapshot anterior
 */
export async function restoreToSnapshot(
  ctx: GrimoireContext,
  entryId: string,
  snapshotTimestamp: string
): Promise<boolean> {
  const { db } = ctx;
  const { dataEntries } = await import("./datasets.schema");

  const [entry] = await db.instance
    .select()
    .from(dataEntries)
    .where(eq(dataEntries.id, entryId))
    .limit(1);

  if (!entry) {
    throw new Error(`Entry not found: ${entryId}`);
  }

  const snapshots: SnapshotData[] = (entry.data as any)._snapshots || [];
  const targetSnapshot = snapshots.find((s) => s.timestamp === snapshotTimestamp);

  if (!targetSnapshot) {
    throw new Error(`Snapshot not found: ${snapshotTimestamp}`);
  }

  // Crear snapshot del estado actual antes de restaurar
  const currentSnapshot: SnapshotData = {
    timestamp: new Date().toISOString(),
    version: "1.0",
    data: { ...entry.data },
    meta: {
      triggeredBy: "restore",
      reason: "Auto-snapshot before restore",
      source: "restore_operation",
    },
  };

  // Restaurar datos del snapshot
  const restoredData = {
    ...targetSnapshot.data,
    _snapshot: targetSnapshot,
    _snapshots: [currentSnapshot, ...snapshots],
    _restoredFrom: snapshotTimestamp,
    _restoredAt: new Date().toISOString(),
  };

  await db.instance
    .update(dataEntries)
    .set({
      data: restoredData,
      updatedAt: new Date(),
    })
    .where(eq(dataEntries.id, entryId));

  ctx.logger.info(`⏪ Entry ${entryId} restored to snapshot ${snapshotTimestamp}`);

  return true;
}

/**
 * Crea un snapshot manual de un entry
 */
export async function createManualSnapshot(
  ctx: GrimoireContext,
  entryId: string,
  config: SnapshotConfig,
  options?: {
    reason?: string;
    calculatedValues?: Record<string, any>;
  }
): Promise<SnapshotData> {
  const { db } = ctx;
  const { dataEntries } = await import("./datasets.schema");

  const [entry] = await db.instance
    .select()
    .from(dataEntries)
    .where(eq(dataEntries.id, entryId))
    .limit(1);

  if (!entry) {
    throw new Error(`Entry not found: ${entryId}`);
  }

  const snapshot = await generateSnapshot(ctx, entry, config, "manual", {
    reason: options?.reason || "Manual snapshot",
    calculatedValues: options?.calculatedValues,
  });

  await saveSnapshot(ctx, entryId, snapshot, config);

  return snapshot;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SNAPSHOT AUTO-CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detecta configuración de snapshot automática desde el schema del dataset
 */
export function detectSnapshotConfig(dataset: DataSet): SnapshotConfig | null {
  const schema = dataset.schema as any;
  
  if (!schema?.snapshot?.enabled) {
    return null;
  }

  return snapshotConfigSchema.parse(schema.snapshot);
}

/**
 * Aplica snapshot automático en hooks de create/update
 */
export async function autoSnapshotOnCreate(
  ctx: GrimoireContext,
  entry: DataEntry,
  dataset: DataSet
): Promise<void> {
  const config = detectSnapshotConfig(dataset);
  
  if (!config || !shouldSnapshot(config, "create")) {
    return;
  }

  const snapshot = await generateSnapshot(ctx, entry, config, "create");
  await saveSnapshot(ctx, entry.id, snapshot, config);
}

export async function autoSnapshotOnUpdate(
  ctx: GrimoireContext,
  entry: DataEntry,
  dataset: DataSet,
  oldEntry?: DataEntry
): Promise<void> {
  const config = detectSnapshotConfig(dataset);
  
  if (!config || !shouldSnapshot(config, "update")) {
    return;
  }

  // Verificar si cambió algún campo que requiere snapshot
  const fieldsToWatch = config.fields.map((f) => f.source);
  const hasChanged = fieldsToWatch.some((field) => {
    return JSON.stringify(entry.data[field]) !== JSON.stringify(oldEntry?.data?.[field]);
  });

  if (!hasChanged) {
    return;
  }

  const snapshot = await generateSnapshot(ctx, entry, config, "update");
  await saveSnapshot(ctx, entry.id, snapshot, config);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS PRIVADOS
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchRelatedData(
  ctx: GrimoireContext,
  relatedId: string,
  field: SnapshotField
): Promise<any> {
  const { db } = ctx;

  // Inferir tabla relacionada desde el nombre del campo
  // Ej: weapon_id -> weapons, characterId -> characters
  const tableName = inferTableName(field.source);
  
  try {
    // Usar raw query para obtener datos de tabla dinámica
    const result = await db.instance.execute(
      sql`SELECT * FROM ${sql.identifier(tableName)} WHERE id = ${relatedId} LIMIT 1`
    );
    
    return result.rows[0] || null;
  } catch (error) {
    ctx.logger.warn(`Failed to fetch related data from ${tableName}:`, error);
    return null;
  }
}

function inferTableName(fieldName: string): string {
  // Convertir field name a posible nombre de tabla
  // weapon_id -> weapons
  // characterId -> characters
  
  let base = fieldName
    .replace(/_id$/, "")
    .replace(/Id$/, "")
    .toLowerCase();
  
  // Pluralizar
  if (!base.endsWith("s")) {
    base += "s";
  }
  
  return base;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIDADES PARA GAMING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuración predefinida para builds de POE/Diablo
 */
export const GAMING_BUILD_SNAPSHOT_CONFIG: SnapshotConfig = {
  enabled: true,
  on: ["create", "update"],
  fields: [
    { source: "weapon_id", snapshot: ["name", "base_dps", "mods", "rarity"], as: "weapon" },
    { source: "character_id", snapshot: ["name", "class", "level", "ascendancy"], as: "character" },
    { source: "helmet_id", snapshot: ["name", "defense", "mods"], as: "helmet" },
    { source: "chest_id", snapshot: ["name", "defense", "mods"], as: "chest" },
    { source: "gloves_id", snapshot: ["name", "defense", "mods"], as: "gloves" },
    { source: "boots_id", snapshot: ["name", "defense", "mods"], as: "boots" },
  ],
  calculated: ["total_dps", "total_life", "total_resistances", "ehp"],
  retention: 10, // Mantener últimas 10 versiones
};

/**
 * Compara dos builds para mostrar diff visual
 */
export function diffBuilds(
  build1: SnapshotData,
  build2: SnapshotData
): { item: string; oldValue: any; newValue: any; change: "buff" | "nerf" | "neutral" }[] {
  const diff = compareSnapshots(build1, build2);
  
  return diff
    .filter((d) => d.changed)
    .map((d) => ({
      item: d.field,
      oldValue: d.oldValue,
      newValue: d.newValue,
      change: detectChangeType(d.field, d.oldValue, d.newValue),
    }));
}

function detectChangeType(
  field: string,
  oldVal: any,
  newVal: any
): "buff" | "nerf" | "neutral" {
  // Para campos numéricos relacionados con stats
  const buffFields = ["dps", "life", "mana", "armor", "evasion", "resistances", "damage"];
  const nerfFields = ["cost", "requirements"];
  
  const isBuffField = buffFields.some((f) => field.includes(f));
  const isNerfField = nerfFields.some((f) => field.includes(f));
  
  if (typeof oldVal === "number" && typeof newVal === "number") {
    if (isBuffField) {
      return newVal > oldVal ? "buff" : "nerf";
    }
    if (isNerfField) {
      return newVal < oldVal ? "buff" : "nerf";
    }
  }
  
  return "neutral";
}


