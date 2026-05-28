/**
 * Inline Relations Service — Django-style Inlines
 *
 * Enables viewing and editing related records inline within parent forms:
 * - ForeignKey inlines (parent → children)
 * - Many-to-Many inlines with through table
 * - Tabular and Stacked layouts
 * - Nested inlines (limited depth)
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { introspectTable } from "./schema-introspector";
/**
 * Detect all relations for a table
 */
export async function detectRelations(tableName) {
    const introspected = await introspectTable(tableName);
    if (!introspected)
        return [];
    const relations = [];
    // 1. Detect outgoing FKs (belongs_to)
    for (const col of introspected.columns) {
        if (col.isForeignKey && col.foreignTable) {
            relations.push({
                column: col.name,
                relatedTable: col.foreignTable,
                relatedColumn: col.foreignColumn || "id",
                type: "belongs_to"
            });
        }
    }
    // 2. Detect incoming relations (has_many)
    // Find tables that have FKs pointing to this table
    try {
        const result = await db.execute(sql `
      SELECT
        tc.table_name as child_table,
        kcu.column_name as fk_column,
        ccu.table_name as parent_table,
        ccu.column_name as parent_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = ${tableName}
      AND ccu.column_name = 'id'
    `);
        for (const row of result.rows) {
            // Avoid self-referential loops
            if (row.child_table !== tableName) {
                relations.push({
                    column: "id", // parent's id is referenced
                    relatedTable: row.child_table,
                    relatedColumn: row.parent_column,
                    type: "has_many",
                    inverseColumn: row.fk_column,
                });
            }
        }
    }
    catch (err) {
        console.error(`[InlineRelations] Failed to detect incoming relations for ${tableName}:`, err);
    }
    // 3. Detect many-to-many through junction tables
    try {
        // Find potential junction tables (contain two FKs)
        const result = await db.execute(sql `
      SELECT 
        tc.table_name as junction_table,
        COUNT(*) as fk_count
      FROM information_schema.table_constraints tc
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name IN (
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      )
      GROUP BY tc.table_name
      HAVING COUNT(*) = 2
    `);
        for (const row of result.rows) {
            // Check if this junction table references our table
            const refsResult = await db.execute(sql `
        SELECT
          kcu.column_name,
          ccu.table_name as referenced_table
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = ${row.junction_table}
      `);
            const refs = refsResult.rows;
            const hasCurrentTable = refs.some((r) => r.referenced_table === tableName);
            if (hasCurrentTable && refs.length === 2) {
                const otherRef = refs.find((r) => r.referenced_table !== tableName);
                if (otherRef) {
                    relations.push({
                        column: "id",
                        relatedTable: otherRef.referenced_table,
                        relatedColumn: "id",
                        type: "many_to_many",
                    });
                }
            }
        }
    }
    catch (err) {
        console.error(`[InlineRelations] Failed to detect M2M relations for ${tableName}:`, err);
    }
    return relations;
}
/**
 * Generate inline configs for a table
 */
export async function generateInlineConfigs(tableName) {
    const relations = await detectRelations(tableName);
    const configs = [];
    for (const relation of relations) {
        // Only create inlines for has_many relations
        if (relation.type !== "has_many" || !relation.inverseColumn)
            continue;
        // Introspect the child table to get field suggestions
        const childIntrospected = await introspectTable(relation.relatedTable);
        if (!childIntrospected)
            continue;
        // Pick fields to display (exclude FK to parent and metadata)
        const fields = childIntrospected.columns
            .filter(c => c.name !== relation.inverseColumn &&
            c.name !== "id" &&
            !c.name.endsWith("_id") &&
            !c.name.endsWith("At") &&
            !c.name.startsWith("created") &&
            !c.name.startsWith("updated"))
            .slice(0, 5) // Max 5 fields
            .map(c => c.name);
        // Add some meaningful fields if we filtered too aggressively
        if (fields.length === 0) {
            fields.push(...childIntrospected.columns
                .filter(c => c.name !== "id" && c.name !== relation.inverseColumn)
                .slice(0, 3)
                .map(c => c.name));
        }
        configs.push({
            name: relation.relatedTable,
            label: humanize(relation.relatedTable),
            type: "fk",
            table: relation.relatedTable,
            fkColumn: relation.inverseColumn,
            fields,
            editable: true,
            canAdd: true,
            canDelete: true,
            maxCount: 10,
            layout: "tabular",
            sortField: childIntrospected.columns.find(c => c.name === "created_at" || c.name === "sort_order")?.name
        });
    }
    return configs;
}
/**
 * Fetch inline data for a parent record
 */
export async function fetchInlineData(config, parentId, options = {}) {
    const { page = 1, limit = 10 } = options;
    const offset = (page - 1) * limit;
    try {
        // Build query dynamically
        const result = await db.execute(sql `
      SELECT *
      FROM ${sql.identifier(config.table)}
      WHERE ${sql.identifier(config.fkColumn)} = ${parentId}
      ${config.sortField ? sql `ORDER BY ${sql.identifier(config.sortField)} DESC` : sql ``}
      LIMIT ${limit}
      OFFSET ${offset}
    `);
        // Get total count
        const countResult = await db.execute(sql `
      SELECT COUNT(*) as count
      FROM ${sql.identifier(config.table)}
      WHERE ${sql.identifier(config.fkColumn)} = ${parentId}
    `);
        const totalCount = parseInt(countResult.rows[0].count);
        return {
            config,
            records: result.rows,
            totalCount,
            canAddMore: !config.maxCount || totalCount < config.maxCount,
        };
    }
    catch (err) {
        console.error(`[InlineRelations] Failed to fetch inline data:`, err);
        return {
            config,
            records: [],
            totalCount: 0,
            canAddMore: false
        };
    }
}
/**
 * Save inline records (create/update/delete)
 */
export async function saveInlineRecords(tableName, fkColumn, parentId, records, deletedIds = []) {
    try {
        // Delete removed records
        if (deletedIds.length > 0) {
            const idPlaceholders = deletedIds.map((id) => sql `${id}`);
            await db.execute(sql `
        DELETE FROM ${sql.identifier(tableName)}
        WHERE id IN (${sql.join(idPlaceholders)})
        AND ${sql.identifier(fkColumn)} = ${parentId}
      `);
        }
        // Upsert records
        for (const record of records) {
            const data = { ...record, [fkColumn]: parentId };
            if (record.id) {
                // Update
                const { id, ...updateData } = data;
                const entries = Object.entries(updateData);
                await db.execute(sql `
          UPDATE ${sql.identifier(tableName)}
          SET ${sql.join(entries.map(([k, v]) => sql `${sql.identifier(k)} = ${v}`), sql `, `)}
          WHERE id = ${id}
          AND ${sql.identifier(fkColumn)} = ${parentId}
        `);
            }
            else {
                // Insert
                const keys = Object.keys(data);
                const values = Object.values(data);
                await db.execute(sql `
          INSERT INTO ${sql.identifier(tableName)} (${sql.join(keys.map((k) => sql.identifier(k)), sql `, `)})
          VALUES (${sql.join(values.map((v) => sql `${v}`), sql `, `)})
        `);
            }
        }
        return { success: true };
    }
    catch (err) {
        console.error(`[InlineRelations] Failed to save inline records:`, err);
        return {
            success: false,
            error: err instanceof Error ? err.message : "Failed to save records",
        };
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════
function humanize(str) {
    return str
        .replace(/_/g, " ")
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase())
        .trim();
}
//# sourceMappingURL=inline-relations.js.map