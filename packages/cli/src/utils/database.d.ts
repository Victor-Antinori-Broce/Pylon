import postgres from 'postgres';
export declare function loadDatabase(): Promise<{
    db: import("drizzle-orm/postgres-js").PostgresJsDatabase<Record<string, never>> & {
        $client: postgres.Sql<{}>;
    };
    client: postgres.Sql<{}>;
}>;
export declare function closeDatabase(client: postgres.Sql): Promise<void>;
//# sourceMappingURL=database.d.ts.map