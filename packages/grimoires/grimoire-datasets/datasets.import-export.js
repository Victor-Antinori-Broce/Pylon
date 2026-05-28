// @ts-nocheck
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
// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMAS ZOD PARA VALIDACIÓN
// ═══════════════════════════════════════════════════════════════════════════════
export const importConfigSchema = z.object({
    strategy: z.enum(["upsert", "replace", "merge", "insert"]).default("upsert"),
    mapping: z.record(z.string()).optional(),
    idField: z.string().optional(),
    validate: z.boolean().default(true),
    skipInvalid: z.boolean().default(false),
});
export const exportConfigSchema = z.object({
    datasets: z.array(z.string()).min(1),
    includeSchema: z.boolean().default(true),
    includeCalculatedFields: z.boolean().default(false),
    includeMetadata: z.boolean().default(true),
    format: z.enum(["json", "csv", "jsonl"]).default("json"),
    filter: z.object({
        status: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
    }).optional(),
});
// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Exporta datasets completos con schema y entries
 */
export async function exportDatasets(ctx, config) {
    const startTime = Date.now();
    const { db } = ctx;
    const { dataSets, dataEntries, dataSetCalculatedFields } = await import("./datasets.schema");
    const exportPackage = {
        metadata: {
            version: "1.0.0",
            exportedAt: new Date().toISOString(),
            exportedBy: "system", // TODO: Get from auth context
            totalDatasets: 0,
            totalEntries: 0,
        },
        datasets: [],
    };
    let totalEntries = 0;
    for (const datasetSlug of config.datasets) {
        // Obtener dataset
        const [dataset] = await db.instance
            .select()
            .from(dataSets)
            .where(eq(dataSets.slug, datasetSlug))
            .limit(1);
        if (!dataset) {
            throw new Error(`Dataset not found: ${datasetSlug}`);
        }
        // Construir query de entries
        let entriesQuery = db.instance
            .select()
            .from(dataEntries)
            .where(eq(dataEntries.dataSetId, dataset.id));
        // Aplicar filtros
        if (config.filter?.status) {
            entriesQuery = entriesQuery.where(eq(dataEntries.status, config.filter.status));
        }
        if (config.filter?.dateFrom) {
            entriesQuery = entriesQuery.where(gte(dataEntries.createdAt, new Date(config.filter.dateFrom)));
        }
        if (config.filter?.dateTo) {
            entriesQuery = entriesQuery.where(lte(dataEntries.createdAt, new Date(config.filter.dateTo)));
        }
        const entries = await entriesQuery.orderBy(asc(dataEntries.sortOrder));
        // Obtener calculated fields si se solicita
        let calculatedFields = [];
        if (config.includeCalculatedFields) {
            calculatedFields = await db.instance
                .select()
                .from(dataSetCalculatedFields)
                .where(eq(dataSetCalculatedFields.dataSetId, dataset.id));
        }
        const exportedDataset = {
            id: dataset.id,
            name: dataset.name,
            slug: dataset.slug,
            description: dataset.description || undefined,
            icon: dataset.icon || undefined,
            schema: config.includeSchema ? dataset.schema : undefined,
            calculatedFields: config.includeCalculatedFields ? calculatedFields : undefined,
            entries: entries.map((e) => ({
                id: e.id,
                title: e.title,
                data: e.data,
                status: e.status,
                sortOrder: e.sortOrder,
                createdAt: e.createdAt?.toISOString(),
                updatedAt: e.updatedAt?.toISOString(),
                createdById: e.createdById || undefined,
            })),
            stats: {
                totalEntries: entries.length,
                exportedAt: new Date().toISOString(),
            },
        };
        exportPackage.datasets.push(exportedDataset);
        totalEntries += entries.length;
    }
    exportPackage.metadata.totalDatasets = exportPackage.datasets.length;
    exportPackage.metadata.totalEntries = totalEntries;
    ctx.logger.info(`📤 Exported ${totalEntries} entries from ${exportPackage.datasets.length} datasets in ${Date.now() - startTime}ms`);
    return exportPackage;
}
/**
 * Convierte export a formato CSV
 */
export function exportToCSV(dataset) {
    if (dataset.entries.length === 0)
        return "";
    // Obtener todas las columnas posibles del data
    const allKeys = new Set();
    dataset.entries.forEach((e) => {
        Object.keys(e.data).forEach((k) => allKeys.add(k));
    });
    const columns = ["id", "title", "status", ...Array.from(allKeys), "createdAt"];
    // Header
    let csv = columns.join(",") + "\n";
    // Rows
    for (const entry of dataset.entries) {
        const row = columns.map((col) => {
            let value;
            if (col === "id" || col === "title" || col === "status" || col === "createdAt") {
                value = entry[col];
            }
            else {
                value = entry.data[col];
            }
            // Escapar valores
            if (value === null || value === undefined)
                return "";
            if (typeof value === "object")
                return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
            if (typeof value === "string" && (value.includes(",") || value.includes('"'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return String(value);
        });
        csv += row.join(",") + "\n";
    }
    return csv;
}
/**
 * Convierte export a formato JSONL
 */
export function exportToJSONL(dataset) {
    return dataset.entries.map((e) => JSON.stringify(e)).join("\n");
}
// ═══════════════════════════════════════════════════════════════════════════════
// IMPORT ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
import { eq, asc, gte, lte } from "drizzle-orm";
/**
 * Importa datos a un dataset
 */
export async function importToDataset(ctx, datasetId, data, config) {
    const startTime = Date.now();
    const { db } = ctx;
    const { dataSets, dataEntries } = await import("./datasets.schema");
    const result = {
        success: true,
        stats: {
            total: data.length,
            created: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
        },
        errors: [],
        durationMs: 0,
    };
    // Verificar que el dataset existe
    const [dataset] = await db.instance
        .select()
        .from(dataSets)
        .where(eq(dataSets.id, datasetId))
        .limit(1);
    if (!dataset) {
        throw new Error(`Dataset not found: ${datasetId}`);
    }
    // Obtener schema para validación
    const schema = dataset.schema;
    const fieldMap = new Map(schema?.fields.map((f) => [f.key, f]) || []);
    // Preparar operaciones
    const operations = [];
    for (let i = 0; i < data.length; i++) {
        const record = data[i];
        try {
            // Aplicar mapeo de campos
            const mappedRecord = config.mapping ? applyMapping(record, config.mapping) : record;
            // Transformar si hay función
            const transformedRecord = config.transform ? config.transform(mappedRecord) : mappedRecord;
            // Validar si se solicita
            if (config.validate) {
                const validationErrors = validateRecord(transformedRecord, fieldMap);
                if (validationErrors.length > 0) {
                    if (config.skipInvalid) {
                        result.stats.skipped++;
                        result.errors.push({
                            index: i,
                            record: transformedRecord,
                            error: validationErrors.join("; "),
                        });
                        continue;
                    }
                    else {
                        throw new Error(`Validation failed: ${validationErrors.join("; ")}`);
                    }
                }
            }
            // Construir entry
            const entry = {
                dataSetId: datasetId,
                title: transformedRecord.title || transformedRecord.name || "Untitled",
                data: transformedRecord,
                status: transformedRecord.status || "published",
                sortOrder: transformedRecord.sortOrder || 0,
            };
            // Determinar operación según estrategia
            const existingId = config.idField ? transformedRecord[config.idField] : null;
            if (config.strategy === "upsert" && existingId) {
                // Intentar update, si no existe crear
                const [existing] = await db.instance
                    .select({ id: dataEntries.id })
                    .from(dataEntries)
                    .where(eq(dataEntries.id, existingId))
                    .limit(1);
                if (existing) {
                    await db.instance
                        .update(dataEntries)
                        .set({
                        ...entry,
                        updatedAt: new Date(),
                    })
                        .where(eq(dataEntries.id, existingId));
                    result.stats.updated++;
                }
                else {
                    operations.push({ type: "create", entry: { ...entry, id: existingId } });
                }
            }
            else if (config.strategy === "replace" && existingId) {
                // Solo update
                await db.instance
                    .update(dataEntries)
                    .set({
                    ...entry,
                    updatedAt: new Date(),
                })
                    .where(eq(dataEntries.id, existingId));
                result.stats.updated++;
            }
            else if (config.strategy === "merge" && existingId) {
                // Merge datos existentes con nuevos
                const [existing] = await db.instance
                    .select()
                    .from(dataEntries)
                    .where(eq(dataEntries.id, existingId))
                    .limit(1);
                if (existing) {
                    const mergedData = { ...existing.data, ...entry.data };
                    await db.instance
                        .update(dataEntries)
                        .set({
                        ...entry,
                        data: mergedData,
                        updatedAt: new Date(),
                    })
                        .where(eq(dataEntries.id, existingId));
                    result.stats.updated++;
                }
                else {
                    operations.push({ type: "create", entry: { ...entry, id: existingId } });
                }
            }
            else {
                // Insert
                operations.push({ type: "create", entry });
            }
        }
        catch (error) {
            result.stats.failed++;
            result.errors.push({
                index: i,
                record,
                error: error.message,
            });
            if (!config.skipInvalid) {
                result.success = false;
                result.durationMs = Date.now() - startTime;
                return result;
            }
        }
    }
    // Ejecutar creaciones en batch
    if (operations.length > 0) {
        const entriesToCreate = operations.filter((op) => op.type === "create").map((op) => op.entry);
        if (entriesToCreate.length > 0) {
            // Insert en batch de 100
            const batchSize = 100;
            for (let i = 0; i < entriesToCreate.length; i += batchSize) {
                const batch = entriesToCreate.slice(i, i + batchSize);
                await db.instance.insert(dataEntries).values(batch);
                result.stats.created += batch.length;
            }
        }
    }
    result.durationMs = Date.now() - startTime;
    ctx.logger.info(`📥 Imported ${result.stats.created} created, ${result.stats.updated} updated, ${result.stats.skipped} skipped, ${result.stats.failed} failed in ${result.durationMs}ms`);
    return result;
}
/**
 * Importa un package completo (múltiples datasets)
 */
export async function importPackage(ctx, packageData, config) {
    const { db } = ctx;
    const { dataSets } = await import("./datasets.schema");
    const results = {};
    for (const dataset of packageData.datasets) {
        // Verificar si el dataset existe, si no crearlo
        let [existingDataset] = await db.instance
            .select({ id: dataSets.id })
            .from(dataSets)
            .where(eq(dataSets.slug, dataset.slug))
            .limit(1);
        let datasetId;
        if (!existingDataset) {
            // Crear dataset
            const [newDataset] = await db.instance
                .insert(dataSets)
                .values({
                name: dataset.name,
                slug: dataset.slug,
                description: dataset.description,
                icon: dataset.icon,
                schema: dataset.schema || { fields: [] },
            })
                .returning();
            datasetId = newDataset.id;
            ctx.logger.info(`📊 Created dataset: ${dataset.name} (${dataset.slug})`);
        }
        else {
            datasetId = existingDataset.id;
        }
        // Importar entries
        const entries = dataset.entries.map((e) => ({
            ...e.data,
            title: e.title,
            status: e.status,
            sortOrder: e.sortOrder,
            id: e.id,
        }));
        results[dataset.slug] = await importToDataset(ctx, datasetId, entries, {
            ...config,
            idField: "id",
        });
    }
    return results;
}
// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
function applyMapping(record, mapping) {
    const mapped = {};
    for (const [sourceKey, targetKey] of Object.entries(mapping)) {
        if (record[sourceKey] !== undefined) {
            mapped[targetKey] = record[sourceKey];
        }
    }
    // Incluir campos no mapeados
    for (const key of Object.keys(record)) {
        if (!mapping[key]) {
            mapped[key] = record[key];
        }
    }
    return mapped;
}
function validateRecord(record, fieldMap) {
    const errors = [];
    for (const [key, field] of fieldMap) {
        const value = record[key];
        // Validar required
        if (field.required && (value === undefined || value === null || value === "")) {
            errors.push(`${field.label} is required`);
            continue;
        }
        // Si no es requerido y está vacío, pasar
        if (!field.required && (value === undefined || value === null || value === "")) {
            continue;
        }
        // Validar tipo
        if (field.type === "number" && typeof value !== "number") {
            errors.push(`${field.label} must be a number`);
        }
        if (field.type === "boolean" && typeof value !== "boolean") {
            errors.push(`${field.label} must be a boolean`);
        }
        // Validar min/max
        if (field.validation?.min !== undefined && typeof value === "number") {
            if (value < field.validation.min) {
                errors.push(`${field.label} must be at least ${field.validation.min}`);
            }
        }
        if (field.validation?.max !== undefined && typeof value === "number") {
            if (value > field.validation.max) {
                errors.push(`${field.label} must be at most ${field.validation.max}`);
            }
        }
        // Validar pattern
        if (field.validation?.pattern && typeof value === "string") {
            const regex = new RegExp(field.validation.pattern);
            if (!regex.test(value)) {
                errors.push(field.validation.message || `${field.label} format is invalid`);
            }
        }
    }
    return errors;
}
//# sourceMappingURL=datasets.import-export.js.map