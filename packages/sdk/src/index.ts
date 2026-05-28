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
 *   apiKey: 'grm_agent_xxx'  // Agent NHI token (recommended)
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
// Types & Configuration
// ═══════════════════════════════════════════════════════════════

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
  columns?: Array<{ field: string; type: string; editable: boolean }>;
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

// ═══════════════════════════════════════════════════════════════
// TOON Parser
// ═══════════════════════════════════════════════════════════════

const TOON_MIME = 'application/vnd.toon';

/**
 * Parse TOON format into JavaScript objects.
 * TOON format: key:value lines, separated by --- for arrays.
 */
function parseTOON(toonString: string): any {
  const records = toonString.split('\n---\n');

  if (records.length === 1) {
    return parseTOONRecord(records[0]);
  }

  return records
    .filter(r => r.trim())
    .map(r => parseTOONRecord(r));
}

function parseTOONRecord(record: string): Record<string, any> {
  const obj: Record<string, any> = {};
  const lines = record.trim().split('\n');

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    // Skip type hints
    if (key.startsWith('~')) continue;

    // Handle nested paths: user.name → { user: { name: value } }
    setNestedValue(obj, key, parseValue(value));
  }

  return obj;
}

function setNestedValue(obj: Record<string, any>, path: string, value: any): void {
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

function parseValue(value: string): any {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '') return null;
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;
  return value;
}

// ═══════════════════════════════════════════════════════════════
// HTTP Client
// ═══════════════════════════════════════════════════════════════

class HttpClient {
  private baseUrl: string;
  private apiKey?: string;
  private format: 'json' | 'toon';

  constructor(config: GremiusClientConfig) {
    this.baseUrl = config.url.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.format = config.format || 'json';
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    overrideFormat?: 'json' | 'toon'
  ): Promise<T> {
    const format = overrideFormat || this.format;
    let url = `${this.baseUrl}/api${path}`;

    // Add format=toon as query param for TOON mode
    if (format === 'toon') {
      const sep = url.includes('?') ? '&' : '?';
      url += `${sep}format=toon`;
    }

    const headers: Record<string, string> = {
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
      throw new GremiusError(
        error.error || error.message || `Request failed: ${res.status}`,
        res.status
      );
    }

    // Handle 204 No Content
    if (res.status === 204) {
      return undefined as T;
    }

    // Parse response based on content type
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes(TOON_MIME)) {
      const text = await res.text();
      return parseTOON(text) as T;
    }

    return res.json();
  }

  get<T>(path: string, format?: 'json' | 'toon'): Promise<T> {
    return this.request<T>('GET', path, undefined, format);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body, 'json'); // Always JSON for writes
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body, 'json');
  }

  del<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path, undefined, 'json');
  }
}

// ═══════════════════════════════════════════════════════════════
// Error Class
// ═══════════════════════════════════════════════════════════════

export class GremiusError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'GremiusError';
  }
}

// ═══════════════════════════════════════════════════════════════
// Table Reference — Explorer-based CRUD
// ═══════════════════════════════════════════════════════════════

export class TableRef<T extends Record<string, unknown> = Record<string, unknown>> {
  constructor(
    private tableName: string,
    private client: HttpClient
  ) { }

  /**
   * List records with pagination, sorting, and filtering.
   * @example
   * const games = await gremius.from('games').list();
   * const filtered = await gremius.from('games').list({ limit: 10, sort: 'title', dir: 'asc' });
   */
  async list(options: ListOptions = {}): Promise<ListResponse<T>> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.page) params.set('page', String(options.page));
    if (options.sort) params.set('sort', options.sort);
    if (options.dir) params.set('dir', options.dir);
    if (options.filter_field) params.set('filter_field', options.filter_field);
    if (options.filter_op) params.set('filter_op', options.filter_op);
    if (options.filter_value) params.set('filter_value', options.filter_value);

    const query = params.toString();
    return this.client.get<ListResponse<T>>(
      `/explorer/${this.tableName}${query ? `?${query}` : ''}`
    );
  }

  /**
   * Get a single record by ID.
   * @example
   * const game = await gremius.from('games').get('uuid-123');
   */
  async get(id: string): Promise<T> {
    // Explorer doesn't have a single-record GET, so we use filter
    const result = await this.list({ filter_field: 'id', filter_op: 'equals', filter_value: id, limit: 1 });
    const record = result.data?.[0];
    if (!record) throw new GremiusError('Record not found', 404);
    return record;
  }

  /**
   * Create a new record.
   * @example
   * const newGame = await gremius.from('games').create({ title: 'New Game', slug: 'new-game' });
   */
  async create(data: Partial<T>): Promise<T> {
    return this.client.post<T>(`/explorer/${this.tableName}`, data);
  }

  /**
   * Update an existing record.
   * @example
   * await gremius.from('games').update('uuid-123', { status: 'published' });
   */
  async update(id: string, data: Partial<T>): Promise<T> {
    return this.client.patch<T>(`/explorer/${this.tableName}/${id}`, data);
  }

  /**
   * Delete a record.
   * @example
   * await gremius.from('games').delete('uuid-123');
   */
  async delete(id: string): Promise<void> {
    await this.client.del<void>(`/explorer/${this.tableName}/${id}`);
  }

  /**
   * Get dropdown options for this table (id → display name pairs).
   * Useful for FK resolution.
   * @example
   * const options = await gremius.from('platforms').options();
   */
  async options(): Promise<OptionItem[]> {
    const result = await this.client.get<{ options: OptionItem[] }>(
      `/explorer/${this.tableName}/options`
    );
    return result.options;
  }
}

// ═══════════════════════════════════════════════════════════════
// Collection Reference — DataSets API (backward compat)
// ═══════════════════════════════════════════════════════════════

export class CollectionRef<T extends Record<string, unknown> = Record<string, unknown>> {
  constructor(
    private collectionName: string,
    private client: HttpClient
  ) { }

  async get(options: { limit?: number; page?: number; status?: string; sort?: string } = {}): Promise<{ docs: T[]; totalDocs: number }> {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.page) params.set('page', String(options.page));
    if (options.status) params.set('status', options.status);
    if (options.sort) params.set('sort', options.sort);
    const query = params.toString();
    return this.client.get<{ docs: T[]; totalDocs: number }>(
      `/datasets/${this.collectionName}/entries${query ? `?${query}` : ''}`
    );
  }

  async insert(data: Partial<T>): Promise<T> {
    return this.client.post<T>(`/datasets/slug/${this.collectionName}/entries`, data);
  }
}

// ═══════════════════════════════════════════════════════════════
// Modules API
// ═══════════════════════════════════════════════════════════════

class ModulesAPI {
  constructor(private client: HttpClient) { }

  /** List all modules with their status */
  async list(): Promise<ModuleInfo[]> {
    const result = await this.client.get<{ docs: ModuleInfo[] }>('/modules');
    return result.docs;
  }

  /** Toggle a module on/off */
  async toggle(key: string): Promise<ModuleInfo> {
    return this.client.post<ModuleInfo>(`/modules/${key}/toggle`, {});
  }

  /** Get modules that are currently enabled */
  async enabled(): Promise<ModuleInfo[]> {
    const all = await this.list();
    return all.filter(m => m.enabled);
  }
}

// ═══════════════════════════════════════════════════════════════
// Main SDK Class
// ═══════════════════════════════════════════════════════════════

export class GremiusClient {
  private httpClient: HttpClient;

  /** Module management API */
  public readonly modules: ModulesAPI;

  /**
   * Create a new Gremius SDK client.
   *
   * @example
   * // JSON mode (default)
   * const gremius = new GremiusClient({ url: 'http://localhost:3000', apiKey: 'grm_agent_xxx' });
   *
   * // TOON mode (for AI agents — 60% fewer tokens)
   * const agent = new GremiusClient({ url: 'http://localhost:3000', apiKey: 'grm_agent_xxx', format: 'toon' });
   */
  constructor(config: GremiusClientConfig) {
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
  from<T extends Record<string, unknown> = Record<string, unknown>>(
    table: string
  ): TableRef<T> {
    return new TableRef<T>(table, this.httpClient);
  }

  /**
   * Get schema information for a table.
   * Returns column types, editability, and relation info.
   *
   * @example
   * const schema = await gremius.schema('games');
   * console.log(schema.columns); // [{ name: 'title', type: 'text', editable: true }, ...]
   */
  async schema(table: string): Promise<SchemaInfo> {
    return this.httpClient.get<SchemaInfo>(`/explorer/schema/grimoires/${table}`);
  }

  /**
   * List all available tables.
   *
   * @example
   * const tables = await gremius.tables();
   */
  async tables(): Promise<Array<{ key: string; label: string; icon: string; rowCount: number }>> {
    const result = await this.httpClient.get<{ tables: any[] }>('/explorer/tables');
    return result.tables;
  }

  /**
   * Access a dataset collection (backward compatibility).
   * For new code, use `.from()` instead.
   *
   * @deprecated Use `.from(table)` for Explorer API
   */
  collection<T extends Record<string, unknown> = Record<string, unknown>>(
    name: string
  ): CollectionRef<T> {
    return new CollectionRef<T>(name, this.httpClient);
  }

  /**
   * Health check — verify the API is reachable.
   *
   * @example
   * const healthy = await gremius.ping();
   */
  async ping(): Promise<boolean> {
    try {
      await this.httpClient.get('/health');
      return true;
    } catch {
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
 * const gremius = createClient('http://localhost:3000', 'grm_agent_xxx');
 * const toon = createClient('http://localhost:3000', 'grm_agent_xxx', 'toon');
 */
export function createClient(
  url: string,
  apiKey?: string,
  format: 'json' | 'toon' = 'json'
): GremiusClient {
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
