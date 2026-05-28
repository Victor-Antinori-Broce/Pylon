/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DATASETS IMPORT/EXPORT - Importación y Exportación de Datos
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Sistema completo para importar y exportar datos de datasets.
 * Soporta múltiples formatos y estrategias de importación.
 *
 * Features:
 * - Export completo de datasets con schema y entries
 * - Import con estrategias: upsert, replace, merge
 * - Validación de datos importados
 * - Mapeo de campos
 * - Progreso de importación larga
 * - Backup/Restore completo
 */
import { z } from "zod";
import type { GrimoireContext } from "@gremius/shared";
import type { FieldDefinition } from "./datasets.schema";
export type ImportStrategy = "upsert" | "replace" | "merge" | "insert";
export type ExportFormat = "json" | "csv" | "jsonl";
export interface ImportConfig {
    /** Estrategia de importación */
    strategy: ImportStrategy;
    /** Mapeo de campos { sourceField: targetField } */
    mapping?: Record<string, string>;
    /** Campo usado como ID para upsert/merge */
    idField?: string;
    /** Validar datos antes de importar */
    validate?: boolean;
    /** Skip registros inválidos en lugar de fallar */
    skipInvalid?: boolean;
    /** Transformar datos antes de insertar */
    transform?: (record: any) => any;
}
export interface ImportResult {
    success: boolean;
    stats: {
        total: number;
        created: number;
        updated: number;
        skipped: number;
        failed: number;
    };
    errors: ImportError[];
    durationMs: number;
}
export interface ImportError {
    index: number;
    record: any;
    error: string;
    field?: string;
}
export interface ExportConfig {
    /** Datasets a exportar */
    datasets: string[];
    /** Incluir schema */
    includeSchema?: boolean;
    /** Incluir calculated fields */
    includeCalculatedFields?: boolean;
    /** Incluir metadata */
    includeMetadata?: boolean;
    /** Formato de exportación */
    format?: ExportFormat;
    /** Filtrar entries */
    filter?: {
        status?: string;
        dateFrom?: string;
        dateTo?: string;
    };
}
export interface ExportPackage {
    metadata: {
        version: string;
        exportedAt: string;
        exportedBy: string;
        totalDatasets: number;
        totalEntries: number;
    };
    datasets: ExportedDataset[];
}
export interface ExportedDataset {
    id?: string;
    name: string;
    slug: string;
    description?: string;
    icon?: string;
    schema?: {
        fields: FieldDefinition[];
    };
    calculatedFields?: any[];
    entries: ExportedEntry[];
    stats: {
        totalEntries: number;
        exportedAt: string;
    };
}
export interface ExportedEntry {
    id?: string;
    title: string;
    data: Record<string, any>;
    status?: string;
    sortOrder?: number;
    createdAt?: string;
    updatedAt?: string;
    createdById?: string;
    _snapshot?: Record<string, any>;
}
export declare const importConfigSchema: z.ZodObject<{
    strategy: z.ZodDefault<z.ZodEnum<["upsert", "replace", "merge", "insert"]>>;
    mapping: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    idField: z.ZodOptional<z.ZodString>;
    validate: z.ZodDefault<z.ZodBoolean>;
    skipInvalid: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    strategy: "replace" | "insert" | "merge" | "upsert";
    validate: boolean;
    skipInvalid: boolean;
    mapping?: Record<string, string> | undefined;
    idField?: string | undefined;
}, {
    strategy?: "replace" | "insert" | "merge" | "upsert" | undefined;
    mapping?: Record<string, string> | undefined;
    idField?: string | undefined;
    validate?: boolean | undefined;
    skipInvalid?: boolean | undefined;
}>;
export declare const exportConfigSchema: z.ZodObject<{
    datasets: z.ZodArray<z.ZodString, "many">;
    includeSchema: z.ZodDefault<z.ZodBoolean>;
    includeCalculatedFields: z.ZodDefault<z.ZodBoolean>;
    includeMetadata: z.ZodDefault<z.ZodBoolean>;
    format: z.ZodDefault<z.ZodEnum<["json", "csv", "jsonl"]>>;
    filter: z.ZodOptional<z.ZodObject<{
        status: z.ZodOptional<z.ZodString>;
        dateFrom: z.ZodOptional<z.ZodString>;
        dateTo: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        status?: string | undefined;
        dateFrom?: string | undefined;
        dateTo?: string | undefined;
    }, {
        status?: string | undefined;
        dateFrom?: string | undefined;
        dateTo?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    format: "json" | "csv" | "jsonl";
    datasets: string[];
    includeSchema: boolean;
    includeCalculatedFields: boolean;
    includeMetadata: boolean;
    filter?: {
        status?: string | undefined;
        dateFrom?: string | undefined;
        dateTo?: string | undefined;
    } | undefined;
}, {
    datasets: string[];
    filter?: {
        status?: string | undefined;
        dateFrom?: string | undefined;
        dateTo?: string | undefined;
    } | undefined;
    format?: "json" | "csv" | "jsonl" | undefined;
    includeSchema?: boolean | undefined;
    includeCalculatedFields?: boolean | undefined;
    includeMetadata?: boolean | undefined;
}>;
/**
 * Exporta datasets completos con schema y entries
 */
export declare function exportDatasets(ctx: GrimoireContext, config: ExportConfig): Promise<ExportPackage>;
/**
 * Convierte export a formato CSV
 */
export declare function exportToCSV(dataset: ExportedDataset): string;
/**
 * Convierte export a formato JSONL
 */
export declare function exportToJSONL(dataset: ExportedDataset): string;
/**
 * Importa datos a un dataset
 */
export declare function importToDataset(ctx: GrimoireContext, datasetId: string, data: any[], config: ImportConfig): Promise<ImportResult>;
/**
 * Importa un package completo (múltiples datasets)
 */
export declare function importPackage(ctx: GrimoireContext, packageData: ExportPackage, config: Omit<ImportConfig, "mapping">): Promise<Record<string, ImportResult>>;
//# sourceMappingURL=datasets.import-export.d.ts.map