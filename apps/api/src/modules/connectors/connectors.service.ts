/**
 * Data Connectors — Service Layer
 *
 * - CRUD for connector configs
 * - Remote API fetch with JSON key mapping
 * - MySQL/MariaDB introspection via information_schema
 * - Read-only table browsing for DB connectors
 */

import { eq, desc } from "drizzle-orm";
import { db } from "../../db";
import {
    dataConnectors,
    type ApiConnectorConfig,
    type DbConnectorConfig,
} from "./connectors.schema";

// ═══════════════════════════════════════════════
// CRUD — Connector Configs
// ═══════════════════════════════════════════════

export async function listConnectors() {
    return db
        .select()
        .from(dataConnectors)
        .orderBy(desc(dataConnectors.createdAt));
}

export async function getConnector(id: string) {
    const [row] = await db
        .select()
        .from(dataConnectors)
        .where(eq(dataConnectors.id, id))
        .limit(1);
    return row || null;
}

export async function createConnector(data: {
    name: string;
    type: "api" | "database";
    config: ApiConnectorConfig | DbConnectorConfig;
    enabled?: boolean;
}) {
    const [row] = await db
        .insert(dataConnectors)
        .values({
            name: data.name,
            type: data.type,
            config: data.config,
            enabled: data.enabled ?? true,
        })
        .returning();
    return row;
}

export async function updateConnector(
    id: string,
    data: Partial<{
        name: string;
        config: ApiConnectorConfig | DbConnectorConfig;
        enabled: boolean;
    }>
) {
    const updates: Record<string, any> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.config !== undefined) updates.config = data.config;
    if (data.enabled !== undefined) updates.enabled = data.enabled;

    const [row] = await db
        .update(dataConnectors)
        .set(updates)
        .where(eq(dataConnectors.id, id))
        .returning();
    return row || null;
}

export async function deleteConnector(id: string) {
    const [row] = await db
        .delete(dataConnectors)
        .where(eq(dataConnectors.id, id))
        .returning();
    return row || null;
}

// ═══════════════════════════════════════════════
// Remote API Connector
// ═══════════════════════════════════════════════

/**
 * Fetch data from an external JSON API.
 * Maps JSON keys to virtual columns for the Data Visualizer.
 */
export async function fetchApiData(connectorId: string) {
    const connector = await getConnector(connectorId);
    if (!connector || connector.type !== "api") return null;

    const config = connector.config as ApiConnectorConfig;

    const fetchOpts: RequestInit = {
        method: config.method || "GET",
        headers: {
            Accept: "application/json",
            ...(config.headers || {}),
        },
        signal: AbortSignal.timeout(15_000),
    };

    if (config.method === "POST" && config.body) {
        (fetchOpts.headers as Record<string, string>)["Content-Type"] =
            "application/json";
        fetchOpts.body = JSON.stringify(config.body);
    }

    const response = await fetch(config.url, fetchOpts);
    if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    let jsonData = await response.json();

    // Navigate to data path if specified (e.g. "data.items")
    if (config.dataPath) {
        const parts = config.dataPath.split(".");
        for (const part of parts) {
            if (jsonData && typeof jsonData === "object") {
                jsonData = (jsonData as Record<string, unknown>)[part];
            } else {
                break;
            }
        }
    }

    // Ensure we have an array
    const rows: Record<string, unknown>[] = Array.isArray(jsonData)
        ? jsonData
        : [jsonData];

    // Map keys to column metadata
    const columns =
        rows.length > 0
            ? Object.keys(rows[0]).map((key) => ({
                field: key,
                type: inferType(rows[0][key]),
                editable: false,
            }))
            : [];

    // Update lastSyncedAt
    await db
        .update(dataConnectors)
        .set({ lastSyncedAt: new Date() })
        .where(eq(dataConnectors.id, connectorId));

    return {
        source: "api",
        url: config.url,
        columns,
        data: rows.slice(0, 500), // Cap at 500 rows
        totalRows: rows.length,
    };
}

// ═══════════════════════════════════════════════
// Database Introspection (MySQL / MariaDB)
// ═══════════════════════════════════════════════

/**
 * Get a mysql2 connection pool for a database connector.
 */
async function getMysqlPool(config: DbConnectorConfig) {
    const mysql = await import("mysql2/promise");
    return mysql.createPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
        connectionLimit: 2,
        connectTimeout: 10_000,
    });
}

/**
 * Introspect a remote database — list tables with their columns.
 */
export async function introspectDatabase(connectorId: string) {
    const connector = await getConnector(connectorId);
    if (!connector || connector.type !== "database") return null;

    const config = connector.config as DbConnectorConfig;
    const pool = await getMysqlPool(config);

    try {
        // Get tables
        const [tableRows] = await pool.query(
            `SELECT TABLE_NAME, TABLE_ROWS, TABLE_COMMENT
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`,
            [config.database]
        );

        const tables = tableRows as Array<{
            TABLE_NAME: string;
            TABLE_ROWS: number;
            TABLE_COMMENT: string;
        }>;

        // Get columns per table
        const [columnRows] = await pool.query(
            `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_COMMENT
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
            [config.database]
        );

        const columns = columnRows as Array<{
            TABLE_NAME: string;
            COLUMN_NAME: string;
            DATA_TYPE: string;
            IS_NULLABLE: string;
            COLUMN_KEY: string;
            COLUMN_COMMENT: string;
        }>;

        // Group columns by table
        const columnsByTable: Record<
            string,
            Array<{
                name: string;
                type: string;
                nullable: boolean;
                isPrimaryKey: boolean;
                comment: string;
            }>
        > = {};

        for (const col of columns) {
            if (!columnsByTable[col.TABLE_NAME]) {
                columnsByTable[col.TABLE_NAME] = [];
            }
            columnsByTable[col.TABLE_NAME].push({
                name: col.COLUMN_NAME,
                type: col.DATA_TYPE,
                nullable: col.IS_NULLABLE === "YES",
                isPrimaryKey: col.COLUMN_KEY === "PRI",
                comment: col.COLUMN_COMMENT,
            });
        }

        // Update lastSyncedAt
        await db
            .update(dataConnectors)
            .set({ lastSyncedAt: new Date() })
            .where(eq(dataConnectors.id, connectorId));

        return {
            source: "database",
            database: config.database,
            host: config.host,
            tables: tables.map((t) => ({
                name: t.TABLE_NAME,
                estimatedRows: t.TABLE_ROWS,
                comment: t.TABLE_COMMENT,
                columns: columnsByTable[t.TABLE_NAME] || [],
            })),
            totalTables: tables.length,
        };
    } finally {
        await pool.end();
    }
}

/**
 * Browse rows from a specific table in a remote database (read-only).
 */
export async function browseDbTable(
    connectorId: string,
    tableName: string,
    limit = 50,
    offset = 0
) {
    const connector = await getConnector(connectorId);
    if (!connector || connector.type !== "database") return null;

    const config = connector.config as DbConnectorConfig;
    const pool = await getMysqlPool(config);

    try {
        // Validate table exists in this database (prevent SQL injection)
        const [validTables] = await pool.query(
            `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND TABLE_TYPE = 'BASE TABLE'`,
            [config.database, tableName]
        );

        if (!Array.isArray(validTables) || validTables.length === 0) {
            throw new Error(`Table '${tableName}' not found in database '${config.database}'`);
        }

        // Get total count
        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total FROM \`${tableName}\``
        );
        const total = Number((countResult as any[])[0]?.total ?? 0);

        // Fetch rows (read-only, capped)
        const safeLimit = Math.min(Math.max(limit, 1), 500);
        const safeOffset = Math.max(offset, 0);

        const [rows] = await pool.query(
            `SELECT * FROM \`${tableName}\` LIMIT ? OFFSET ?`,
            [safeLimit, safeOffset]
        );

        const data = rows as Record<string, unknown>[];

        // Column metadata from first row
        const columns =
            data.length > 0
                ? Object.keys(data[0]).map((key) => ({
                    field: key,
                    type: inferType(data[0][key]),
                    editable: false,
                }))
                : [];

        return {
            source: "database",
            table: tableName,
            columns,
            data,
            pagination: {
                limit: safeLimit,
                offset: safeOffset,
                total,
                totalPages: Math.ceil(total / safeLimit),
            },
        };
    } finally {
        await pool.end();
    }
}

/**
 * Test a connector's connection.
 */
export async function testConnection(connectorId: string) {
    const connector = await getConnector(connectorId);
    if (!connector) return null;

    const startTime = Date.now();

    try {
        if (connector.type === "api") {
            const config = connector.config as ApiConnectorConfig;
            const res = await fetch(config.url, {
                method: "HEAD",
                signal: AbortSignal.timeout(10_000),
            });
            return {
                success: true,
                type: "api",
                statusCode: res.status,
                durationMs: Date.now() - startTime,
            };
        } else {
            const config = connector.config as DbConnectorConfig;
            const pool = await getMysqlPool(config);
            try {
                await pool.query("SELECT 1");
                return {
                    success: true,
                    type: "database",
                    durationMs: Date.now() - startTime,
                };
            } finally {
                await pool.end();
            }
        }
    } catch (err: any) {
        return {
            success: false,
            type: connector.type,
            error: err.message,
            durationMs: Date.now() - startTime,
        };
    }
}

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

function inferType(value: unknown): string {
    if (value === null || value === undefined) return "text";
    if (typeof value === "number") return Number.isInteger(value) ? "integer" : "float";
    if (typeof value === "boolean") return "boolean";
    if (value instanceof Date) return "date";
    if (typeof value === "string") {
        if (!isNaN(Date.parse(value)) && value.length > 8) return "date";
        return "text";
    }
    if (typeof value === "object") return "json";
    return "text";
}
