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
// ═══════════════════════════════════════════════════════════════
// TOON Parser
// ═══════════════════════════════════════════════════════════════
const TOON_MIME = 'application/vnd.toon';
/**
 * Parse TOON format into JavaScript objects.
 * TOON format: key:value lines, separated by --- for arrays.
 */
function parseTOON(toonString) {
    const records = toonString.split('\n---\n');
    if (records.length === 1) {
        return parseTOONRecord(records[0]);
    }
    return records
        .filter(r => r.trim())
        .map(r => parseTOONRecord(r));
}
function parseTOONRecord(record) {
    const obj = {};
    const lines = record.trim().split('\n');
    for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1)
            continue;
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        // Skip type hints
        if (key.startsWith('~'))
            continue;
        // Handle nested paths: user.name → { user: { name: value } }
        setNestedValue(obj, key, parseValue(value));
    }
    return obj;
}
function setNestedValue(obj, path, value) {
    // Handle array notation: items[0].name
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        const nextPart = parts[i + 1];
        const isNextArray = /^\d+$/.test(nextPart);
        if (!(part in current)) {
            current[part] = isNextArray ? [] : {};
        }
        current = current[part];
    }
    current[parts[parts.length - 1]] = value;
}
function parseValue(value) {
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    if (value === 'null' || value === '')
        return null;
    const num = Number(value);
    if (!isNaN(num) && value !== '')
        return num;
    return value;
}
// ═══════════════════════════════════════════════════════════════
// HTTP Client
// ═══════════════════════════════════════════════════════════════
class HttpClient {
    baseUrl;
    apiKey;
    format;
    constructor(config) {
        this.baseUrl = config.url.replace(/\/$/, '');
        this.apiKey = config.apiKey;
        this.format = config.format || 'json';
    }
    async request(method, path, body, overrideFormat) {
        const format = overrideFormat || this.format;
        let url = `${this.baseUrl}/api${path}`;
        // Add format=toon as query param for TOON mode
        if (format === 'toon') {
            const sep = url.includes('?') ? '&' : '?';
            url += `${sep}format=toon`;
        }
        const headers = {
            'Content-Type': 'application/json',
        };
        if (format === 'toon') {
            headers['Accept'] = TOON_MIME;
        }
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }
        const res = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
            const error = await res.json().catch(() => ({ error: res.statusText }));
            throw new GremiusError(error.error || error.message || `Request failed: ${res.status}`, res.status);
        }
        // Handle 204 No Content
        if (res.status === 204) {
            return undefined;
        }
        // Parse response based on content type
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes(TOON_MIME)) {
            const text = await res.text();
            return parseTOON(text);
        }
        return res.json();
    }
    get(path, format) {
        return this.request('GET', path, undefined, format);
    }
    post(path, body) {
        return this.request('POST', path, body, 'json'); // Always JSON for writes
    }
    patch(path, body) {
        return this.request('PATCH', path, body, 'json');
    }
    del(path) {
        return this.request('DELETE', path, undefined, 'json');
    }
}
// ═══════════════════════════════════════════════════════════════
// Error Class
// ═══════════════════════════════════════════════════════════════
export class GremiusError extends Error {
    statusCode;
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'GremiusError';
    }
}
// ═══════════════════════════════════════════════════════════════
// Table Reference — Explorer-based CRUD
// ═══════════════════════════════════════════════════════════════
export class TableRef {
    tableName;
    client;
    constructor(tableName, client) {
        this.tableName = tableName;
        this.client = client;
    }
    /**
     * List records with pagination, sorting, and filtering.
     * @example
     * const games = await gremius.from('games').list();
     * const filtered = await gremius.from('games').list({ limit: 10, sort: 'title', dir: 'asc' });
     */
    async list(options = {}) {
        const params = new URLSearchParams();
        if (options.limit)
            params.set('limit', String(options.limit));
        if (options.page)
            params.set('page', String(options.page));
        if (options.sort)
            params.set('sort', options.sort);
        if (options.dir)
            params.set('dir', options.dir);
        if (options.filter_field)
            params.set('filter_field', options.filter_field);
        if (options.filter_op)
            params.set('filter_op', options.filter_op);
        if (options.filter_value)
            params.set('filter_value', options.filter_value);
        const query = params.toString();
        return this.client.get(`/explorer/${this.tableName}${query ? `?${query}` : ''}`);
    }
    /**
     * Get a single record by ID.
     * @example
     * const game = await gremius.from('games').get('uuid-123');
     */
    async get(id) {
        // Explorer doesn't have a single-record GET, so we use filter
        const result = await this.list({ filter_field: 'id', filter_op: 'equals', filter_value: id, limit: 1 });
        const record = result.data?.[0];
        if (!record)
            throw new GremiusError('Record not found', 404);
        return record;
    }
    /**
     * Create a new record.
     * @example
     * const newGame = await gremius.from('games').create({ title: 'New Game', slug: 'new-game' });
     */
    async create(data) {
        return this.client.post(`/explorer/${this.tableName}`, data);
    }
    /**
     * Update an existing record.
     * @example
     * await gremius.from('games').update('uuid-123', { status: 'published' });
     */
    async update(id, data) {
        return this.client.patch(`/explorer/${this.tableName}/${id}`, data);
    }
    /**
     * Delete a record.
     * @example
     * await gremius.from('games').delete('uuid-123');
     */
    async delete(id) {
        await this.client.del(`/explorer/${this.tableName}/${id}`);
    }
    /**
     * Get dropdown options for this table (id → display name pairs).
     * Useful for FK resolution.
     * @example
     * const options = await gremius.from('platforms').options();
     */
    async options() {
        const result = await this.client.get(`/explorer/${this.tableName}/options`);
        return result.options;
    }
}
// ═══════════════════════════════════════════════════════════════
// Collection Reference — DataSets API (backward compat)
// ═══════════════════════════════════════════════════════════════
export class CollectionRef {
    collectionName;
    client;
    constructor(collectionName, client) {
        this.collectionName = collectionName;
        this.client = client;
    }
    async get(options = {}) {
        const params = new URLSearchParams();
        if (options.limit)
            params.set('limit', String(options.limit));
        if (options.page)
            params.set('page', String(options.page));
        if (options.status)
            params.set('status', options.status);
        if (options.sort)
            params.set('sort', options.sort);
        const query = params.toString();
        return this.client.get(`/datasets/${this.collectionName}/entries${query ? `?${query}` : ''}`);
    }
    async insert(data) {
        return this.client.post(`/datasets/slug/${this.collectionName}/entries`, data);
    }
}
// ═══════════════════════════════════════════════════════════════
// Modules API
// ═══════════════════════════════════════════════════════════════
class ModulesAPI {
    client;
    constructor(client) {
        this.client = client;
    }
    /** List all modules with their status */
    async list() {
        const result = await this.client.get('/modules');
        return result.docs;
    }
    /** Toggle a module on/off */
    async toggle(key) {
        return this.client.post(`/modules/${key}/toggle`, {});
    }
    /** Get modules that are currently enabled */
    async enabled() {
        const all = await this.list();
        return all.filter(m => m.enabled);
    }
}
// ═══════════════════════════════════════════════════════════════
// Main SDK Class
// ═══════════════════════════════════════════════════════════════
export class GremiusClient {
    httpClient;
    /** Module management API */
    modules;
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
    constructor(config) {
        this.httpClient = new HttpClient(config);
        this.modules = new ModulesAPI(this.httpClient);
    }
    /**
     * Access a table for CRUD operations via the Explorer API.
     * This is the primary way to interact with Gremius data.
     *
     * @example
     * const games = await gremius.from('games').list();
     * const newGame = await gremius.from('games').create({ title: 'Hi' });
     */
    from(table) {
        return new TableRef(table, this.httpClient);
    }
    /**
     * Get schema information for a table.
     * Returns column types, editability, and relation info.
     *
     * @example
     * const schema = await gremius.schema('games');
     * console.log(schema.columns); // [{ name: 'title', type: 'text', editable: true }, ...]
     */
    async schema(table) {
        return this.httpClient.get(`/explorer/schema/grimoires/${table}`);
    }
    /**
     * List all available tables.
     *
     * @example
     * const tables = await gremius.tables();
     */
    async tables() {
        const result = await this.httpClient.get('/explorer/tables');
        return result.tables;
    }
    /**
     * Access a dataset collection (backward compatibility).
     * For new code, use `.from()` instead.
     *
     * @deprecated Use `.from(table)` for Explorer API
     */
    collection(name) {
        return new CollectionRef(name, this.httpClient);
    }
    /**
     * Health check — verify the API is reachable.
     *
     * @example
     * const healthy = await gremius.ping();
     */
    async ping() {
        try {
            await this.httpClient.get('/health');
            return true;
        }
        catch {
            return false;
        }
    }
}
// ═══════════════════════════════════════════════════════════════
// Convenience Factory
// ═══════════════════════════════════════════════════════════════
/**
 * Create a Gremius client with a simple function call.
 *
 * @example
 * const gremius = createClient('http://localhost:3000', 'gremius_sk_xxx');
 * const toon = createClient('http://localhost:3000', 'gremius_sk_xxx', 'toon');
 */
export function createClient(url, apiKey, format = 'json') {
    return new GremiusClient({ url, apiKey, format });
}
// ═══════════════════════════════════════════════════════════════
// Backward Compatibility
// ═══════════════════════════════════════════════════════════════
/** @deprecated Use GremiusClient instead */
export const Gremius = GremiusClient;
// ═══════════════════════════════════════════════════════════════
// Default Export
// ═══════════════════════════════════════════════════════════════
export default GremiusClient;
//# sourceMappingURL=index.js.map