/**
 * Inline Relations Service — Django-style Inlines
 *
 * Enables viewing and editing related records inline within parent forms:
 * - ForeignKey inlines (parent → children)
 * - Many-to-Many inlines with through table
 * - Tabular and Stacked layouts
 * - Nested inlines (limited depth)
 */
/** Inline configuration for a relationship */
export interface InlineConfig {
    /** Name of the inline relationship */
    name: string;
    /** Label for the UI */
    label: string;
    /** Type of inline */
    type: "fk" | "m2m" | "generic";
    /** Table containing the related records */
    table: string;
    /** Foreign key column in the related table pointing to parent */
    fkColumn: string;
    /** Columns to display in the inline */
    fields: string[];
    /** Whether inline is editable */
    editable?: boolean;
    /** Whether records can be added */
    canAdd?: boolean;
    /** Whether records can be deleted */
    canDelete?: boolean;
    /** Maximum number of inline records to show */
    maxCount?: number;
    /** Layout style */
    layout?: "tabular" | "stacked";
    /** Sort field */
    sortField?: string;
}
/** Data returned for an inline relationship */
export interface InlineData {
    config: InlineConfig;
    records: Record<string, unknown>[];
    totalCount: number;
    canAddMore: boolean;
}
/** Information about a relation between tables */
export interface RelationInfo {
    /** Column in parent table that is a FK */
    column: string;
    /** Table being referenced */
    relatedTable: string;
    /** Column in related table */
    relatedColumn: string;
    /** Type of relation */
    type: "belongs_to" | "has_many" | "many_to_many";
    /** For has_many: column in child table pointing to parent */
    inverseColumn?: string;
}
/**
 * Detect all relations for a table
 */
export declare function detectRelations(tableName: string): Promise<RelationInfo[]>;
/**
 * Generate inline configs for a table
 */
export declare function generateInlineConfigs(tableName: string): Promise<InlineConfig[]>;
/**
 * Fetch inline data for a parent record
 */
export declare function fetchInlineData(config: InlineConfig, parentId: string, options?: {
    page?: number;
    limit?: number;
}): Promise<InlineData>;
/** Inline record with optional id */
interface InlineRecord {
    id?: string;
    [key: string]: any;
}
/**
 * Save inline records (create/update/delete)
 */
export declare function saveInlineRecords(tableName: string, fkColumn: string, parentId: string, records: InlineRecord[], deletedIds?: string[]): Promise<{
    success: boolean;
    error?: string;
}>;
export {};
//# sourceMappingURL=inline-relations.d.ts.map