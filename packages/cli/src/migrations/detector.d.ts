export declare const migrationsTable: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "_migrations";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "_migrations";
            dataType: "number";
            columnType: "PgSerial";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: true;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        grimoire: import("drizzle-orm/pg-core").PgColumn<{
            name: "grimoire";
            tableName: "_migrations";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        name: import("drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "_migrations";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        appliedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "applied_at";
            tableName: "_migrations";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: undefined;
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
        checksum: import("drizzle-orm/pg-core").PgColumn<{
            name: "checksum";
            tableName: "_migrations";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            isPrimaryKey: false;
            isAutoincrement: false;
            hasRuntimeDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
            identity: undefined;
            generated: undefined;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
/**
 * Post-procesa el SQL generado por drizzle-kit export para hacerlo idempotente.
 * - CREATE TYPE -> DO $$ BEGIN IF NOT EXISTS ... END $$;
 * - CREATE TABLE -> CREATE TABLE IF NOT EXISTS
 * - CREATE INDEX -> CREATE INDEX IF NOT EXISTS
 * - ALTER TABLE ADD CONSTRAINT -> ALTER TABLE IF EXISTS ... ADD CONSTRAINT IF NOT EXISTS
 */
export declare function postProcessSqlForIdempotency(sql: string): string;
//# sourceMappingURL=detector.d.ts.map