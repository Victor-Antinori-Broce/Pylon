/**
 * @gremius/sdk — Universal SDK for GremiusCMS
 *
 * The official JavaScript/TypeScript SDK for Gremius BaaS.
 * CRUD in 3 lines of code. Edge-ready. Type-safe. TOON-enabled.
 *
 * @example
 * ```typescript
 * import { GremiusClient } from '@gremius/sdk';
 *
 * const gremius = new GremiusClient({
 *   url: 'https://api.example.com',
 *   apiKey: 'gremius_sk_123'
 * });
 *
 * // CRUD via Explorer
 * const games = await gremius.from('games').list();
 * const game = await gremius.from('games').create({ title: 'New Game' });
 * await gremius.from('games').update(game.id, { status: 'published' });
 * await gremius.from('games').delete(game.id);
 *
 * // Modules
 * const modules = await gremius.modules.list();
 * await gremius.modules.toggle('academy');
 *
 * // Schema
 * const schema = await gremius.schema('games');
 *
 * // TOON (for AI agents — 60% fewer tokens)
 * const toonGremius = new GremiusClient({ url: '...', apiKey: '...', format: 'toon' });
 * const toonData = await toonGremius.from('games').list(); // Returns raw TOON string
 * ```
 */
export interface GremiusClientConfig {
    /** Base URL of your Gremius API (e.g., https://api.example.com) */
    url: string;
    /** API Key for authentication (Bearer token) */
    apiKey?: string;
    /** Response format: 'json' (default) or 'toon' (Token-Optimized Object Notation) */
    format?: 'json' | 'toon';
}
export interface ListOptions {
    limit?: number;
    page?: number;
    sort?: string;
    dir?: 'asc' | 'desc';
    filter_field?: string;
    filter_op?: 'contains' | 'equals' | 'gt' | 'lt' | 'gte' | 'lte';
    filter_value?: string;
}
export interface ListResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
    };
    columns?: Array<{
        field: string;
        type: string;
        editable: boolean;
    }>;
}
export interface SchemaInfo {
    table: string;
    label: string;
    primaryKey: string;
    columns: Array<{
        name: string;
        type: string;
        editable: boolean;
        nullable: boolean;
        relatedTable?: string;
    }>;
}
export interface ModuleInfo {
    key: string;
    name: string;
    description: string;
    enabled: boolean;
    category: string;
    canToggle: boolean;
}
export interface OptionItem {
    value: string;
    label: string;
}
declare class HttpClient {
    private baseUrl;
    private apiKey?;
    private format;
    constructor(config: GremiusClientConfig);
    private request;
    get<T>(path: string, format?: 'json' | 'toon'): Promise<T>;
    post<T>(path: string, body: unknown): Promise<T>;
    patch<T>(path: string, body: unknown): Promise<T>;
    del<T>(path: string): Promise<T>;
}
export declare class GremiusError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number);
}
export declare class TableRef<T extends Record<string, unknown> = Record<string, unknown>> {
    private tableName;
    private client;
    constructor(tableName: string, client: HttpClient);
    /**
     * List records with pagination, sorting, and filtering.
     * @example
     * const games = await gremius.from('games').list();
     * const filtered = await gremius.from('games').list({ limit: 10, sort: 'title', dir: 'asc' });
     */
    list(options?: ListOptions): Promise<ListResponse<T>>;
    /**
     * Get a single record by ID.
     * @example
     * const game = await gremius.from('games').get('uuid-123');
     */
    get(id: string): Promise<T>;
    /**
     * Create a new record.
     * @example
     * const newGame = await gremius.from('games').create({ title: 'New Game', slug: 'new-game' });
     */
    create(data: Partial<T>): Promise<T>;
    /**
     * Update an existing record.
     * @example
     * await gremius.from('games').update('uuid-123', { status: 'published' });
     */
    update(id: string, data: Partial<T>): Promise<T>;
    /**
     * Delete a record.
     * @example
     * await gremius.from('games').delete('uuid-123');
     */
    delete(id: string): Promise<void>;
    /**
     * Get dropdown options for this table (id → display name pairs).
     * Useful for FK resolution.
     * @example
     * const options = await gremius.from('platforms').options();
     */
    options(): Promise<OptionItem[]>;
}
export declare class CollectionRef<T extends Record<string, unknown> = Record<string, unknown>> {
    private collectionName;
    private client;
    constructor(collectionName: string, client: HttpClient);
    get(options?: {
        limit?: number;
        page?: number;
        status?: string;
        sort?: string;
    }): Promise<{
        docs: T[];
        totalDocs: number;
    }>;
    insert(data: Partial<T>): Promise<T>;
}
declare class ModulesAPI {
    private client;
    constructor(client: HttpClient);
    /** List all modules with their status */
    list(): Promise<ModuleInfo[]>;
    /** Toggle a module on/off */
    toggle(key: string): Promise<ModuleInfo>;
    /** Get modules that are currently enabled */
    enabled(): Promise<ModuleInfo[]>;
}
export declare class GremiusClient {
    private httpClient;
    /** Module management API */
    readonly modules: ModulesAPI;
    /**
     * Create a new Gremius SDK client.
     *
     * @example
     * // JSON mode (default)
     * const gremius = new GremiusClient({ url: 'http://localhost:3000', apiKey: 'gremius_sk_xxx' });
     *
     * // TOON mode (for AI agents — 60% fewer tokens)
     * const agent = new GremiusClient({ url: 'http://localhost:3000', apiKey: 'gremius_sk_xxx', format: 'toon' });
     */
    constructor(config: GremiusClientConfig);
    /**
     * Access a table for CRUD operations via the Explorer API.
     * This is the primary way to interact with Gremius data.
     *
     * @example
     * const games = await gremius.from('games').list();
     * const newGame = await gremius.from('games').create({ title: 'Hi' });
     */
    from<T extends Record<string, unknown> = Record<string, unknown>>(table: string): TableRef<T>;
    /**
     * Get schema information for a table.
     * Returns column types, editability, and relation info.
     *
     * @example
     * const schema = await gremius.schema('games');
     * console.log(schema.columns); // [{ name: 'title', type: 'text', editable: true }, ...]
     */
    schema(table: string): Promise<SchemaInfo>;
    /**
     * List all available tables.
     *
     * @example
     * const tables = await gremius.tables();
     */
    tables(): Promise<Array<{
        key: string;
        label: string;
        icon: string;
        rowCount: number;
    }>>;
    /**
     * Access a dataset collection (backward compatibility).
     * For new code, use `.from()` instead.
     *
     * @deprecated Use `.from(table)` for Explorer API
     */
    collection<T extends Record<string, unknown> = Record<string, unknown>>(name: string): CollectionRef<T>;
    /**
     * Health check — verify the API is reachable.
     *
     * @example
     * const healthy = await gremius.ping();
     */
    ping(): Promise<boolean>;
}
/**
 * Create a Gremius client with a simple function call.
 *
 * @example
 * const gremius = createClient('http://localhost:3000', 'gremius_sk_xxx');
 * const toon = createClient('http://localhost:3000', 'gremius_sk_xxx', 'toon');
 */
export declare function createClient(url: string, apiKey?: string, format?: 'json' | 'toon'): GremiusClient;
/** @deprecated Use GremiusClient instead */
export declare const Gremius: typeof GremiusClient;
export default GremiusClient;
//# sourceMappingURL=index.d.ts.map