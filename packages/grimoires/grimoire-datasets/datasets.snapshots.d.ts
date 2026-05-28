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
export declare const snapshotFieldSchema: z.ZodObject<{
    source: z.ZodString;
    snapshot: z.ZodArray<z.ZodString, "many">;
    as: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    source: string;
    snapshot: string[];
    as?: string | undefined;
}, {
    source: string;
    snapshot: string[];
    as?: string | undefined;
}>;
export declare const snapshotConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    on: z.ZodDefault<z.ZodArray<z.ZodEnum<["create", "update", "manual", "scheduled"]>, "many">>;
    fields: z.ZodDefault<z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        snapshot: z.ZodArray<z.ZodString, "many">;
        as: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        source: string;
        snapshot: string[];
        as?: string | undefined;
    }, {
        source: string;
        snapshot: string[];
        as?: string | undefined;
    }>, "many">>;
    calculated: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    retention: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    on: ("scheduled" | "create" | "update" | "manual")[];
    enabled: boolean;
    fields: {
        source: string;
        snapshot: string[];
        as?: string | undefined;
    }[];
    retention: number;
    calculated?: string[] | undefined;
}, {
    on?: ("scheduled" | "create" | "update" | "manual")[] | undefined;
    enabled?: boolean | undefined;
    fields?: {
        source: string;
        snapshot: string[];
        as?: string | undefined;
    }[] | undefined;
    calculated?: string[] | undefined;
    retention?: number | undefined;
}>;
/**
 * Verifica si se debe generar snapshot según la configuración
 */
export declare function shouldSnapshot(config: SnapshotConfig, trigger: SnapshotTrigger): boolean;
/**
 * Genera un snapshot de un entry con sus relaciones
 */
export declare function generateSnapshot(ctx: GrimoireContext, entry: DataEntry, config: SnapshotConfig, trigger: SnapshotTrigger, options?: {
    reason?: string;
    source?: string;
    calculatedValues?: Record<string, any>;
}): Promise<SnapshotData>;
/**
 * Guarda un snapshot en el entry
 */
export declare function saveSnapshot(ctx: GrimoireContext, entryId: string, snapshot: SnapshotData, config: SnapshotConfig): Promise<void>;
/**
 * Obtiene el snapshot actual de un entry
 */
export declare function getCurrentSnapshot(ctx: GrimoireContext, entryId: string): Promise<SnapshotData | null>;
/**
 * Obtiene el historial de snapshots de un entry
 */
export declare function getSnapshotHistory(ctx: GrimoireContext, entryId: string): Promise<SnapshotData[]>;
/**
 * Compara dos snapshots y retorna las diferencias
 */
export declare function compareSnapshots(oldSnapshot: SnapshotData | null, newSnapshot: SnapshotData): SnapshotComparison[];
/**
 * Restaura un entry a un snapshot anterior
 */
export declare function restoreToSnapshot(ctx: GrimoireContext, entryId: string, snapshotTimestamp: string): Promise<boolean>;
/**
 * Crea un snapshot manual de un entry
 */
export declare function createManualSnapshot(ctx: GrimoireContext, entryId: string, config: SnapshotConfig, options?: {
    reason?: string;
    calculatedValues?: Record<string, any>;
}): Promise<SnapshotData>;
/**
 * Detecta configuración de snapshot automática desde el schema del dataset
 */
export declare function detectSnapshotConfig(dataset: DataSet): SnapshotConfig | null;
/**
 * Aplica snapshot automático en hooks de create/update
 */
export declare function autoSnapshotOnCreate(ctx: GrimoireContext, entry: DataEntry, dataset: DataSet): Promise<void>;
export declare function autoSnapshotOnUpdate(ctx: GrimoireContext, entry: DataEntry, dataset: DataSet, oldEntry?: DataEntry): Promise<void>;
/**
 * Configuración predefinida para builds de POE/Diablo
 */
export declare const GAMING_BUILD_SNAPSHOT_CONFIG: SnapshotConfig;
/**
 * Compara dos builds para mostrar diff visual
 */
export declare function diffBuilds(build1: SnapshotData, build2: SnapshotData): {
    item: string;
    oldValue: any;
    newValue: any;
    change: "buff" | "nerf" | "neutral";
}[];
//# sourceMappingURL=datasets.snapshots.d.ts.map