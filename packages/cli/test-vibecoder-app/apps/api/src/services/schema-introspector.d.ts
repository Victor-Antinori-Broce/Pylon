/**
 * Schema Introspector Service — True Zero Config
 *
 * Auto-discovers database schema for any table:
 * - Column names, types, constraints
 * - Primary keys, foreign keys
 * - Indexes, defaults
 * - Relations between tables
 *
 * Enables any table to work without manual configuration.
 */
export interface IntrospectedColumn {
    name: string;
    type: string;
    nullable: boolean;
    defaultValue: string | null;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    foreignTable: string | null;
    foreignColumn: string | null;
    maxLength: number | null;
    isUnique: boolean;
    isIndexed: boolean;
}
export interface IntrospectedTable {
    name: string;
    schema: string;
    columns: IntrospectedColumn[];
    primaryKey: string[];
    foreignKeys: ForeignKeyInfo[];
    indexes: IndexInfo[];
    estimatedRowCount: number;
}
export interface ForeignKeyInfo {
    column: string;
    foreignTable: string;
    foreignColumn: string;
    constraintName: string;
}
export interface IndexInfo {
    name: string;
    columns: string[];
    unique: boolean;
    primary: boolean;
}
/** Admin column config generated from introspection */
export interface AdminColumnConfig {
    name: string;
    label: string;
    type: string;
    searchable: boolean;
    filterable: boolean;
    relation?: {
        table: string;
        displayField: string;
    };
}
/** Admin config generated from introspection */
export interface AdminConfig {
    table: string;
    label: string;
    icon: string;
    columns: AdminColumnConfig[];
    defaultSort: {
        column: string;
        direction: "asc" | "desc";
    };
}
/**
 * Introspect any table in the database
 */
export declare function introspectTable(tableName: string, schema?: string): Promise<IntrospectedTable | null>;
/**
 * Get all tables in the database
 */
export declare function getAllTables(schema?: string): Promise<string[]>;
/**
 * Search tables by name pattern
 */
export declare function searchTables(pattern: string, schema?: string): Promise<string[]>;
/**
 * Get tables related to a table (via FKs)
 */
export declare function getRelatedTables(tableName: string, schema?: string): Promise<{
    incoming: string[];
    outgoing: string[];
}>;
/**
 * Generate AdminConfig from introspected table
 */
export declare function generateAdminConfigFromIntrospection(tableName: string, schema?: string): Promise<AdminConfig>;
/**
 * Clear introspection cache
 */
export declare function clearIntrospectionCache(): void;
//# sourceMappingURL=schema-introspector.d.ts.map