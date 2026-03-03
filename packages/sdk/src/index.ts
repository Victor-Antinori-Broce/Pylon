/**
 * @gremius/sdk — Universal SDK for GremiusCMS
 *
 * The official JavaScript/TypeScript SDK for Gremius BaaS.
 * CRUD in 3 lines of code. Edge-ready. Type-safe.
 *
 * @example
 * ```typescript
 * import { GremiusClient } from '@gremius/sdk';
 *
 * const gremius = new GremiusClient({
 *   url: 'https://api.midominio.com',
 *   apiKey: 'gremius_sk_123'
 * });
 *
 * // Read
 * const posts = await gremius.collection('posts').get();
 *
 * // Create
 * const newPost = await gremius.collection('posts').insert({ title: 'Hola Mundo' });
 *
 * // Update & Delete
 * await gremius.collection('posts').update(newPost.id, { title: 'Editado' });
 * await gremius.collection('posts').delete(newPost.id);
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
}

export interface ListResponse<T> {
  docs: T[];
  totalDocs: number;
  totalPages?: number;
  page?: number;
  limit?: number;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
}

export interface GetOptions {
  limit?: number;
  page?: number;
  status?: string;
  sort?: string;
}

// ═══════════════════════════════════════════════════════════════
// HTTP Client
// ═══════════════════════════════════════════════════════════════

class HttpClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: GremiusClientConfig) {
    this.baseUrl = config.url.replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}/api${path}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(error.error || error.message || `Request failed: ${res.status}`);
    }

    // Handle 204 No Content
    if (res.status === 204) {
      return undefined as T;
    }

    return res.json();
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}

// ═══════════════════════════════════════════════════════════════
// Collection Reference — The Magic ✨
// ═══════════════════════════════════════════════════════════════

export class CollectionRef<T extends Record<string, unknown> = Record<string, unknown>> {
  constructor(
    private collectionName: string,
    private client: HttpClient
  ) {}

  /**
   * Get all entries from the collection.
   * @param options - Query options (limit, page, status, sort)
   * @returns Promise with array of entries
   *
   * @example
   * const posts = await gremius.collection('posts').get();
   * const paged = await gremius.collection('posts').get({ limit: 10, page: 2 });
   */
  async get(options: GetOptions = {}): Promise<ListResponse<T>> {
    const params = new URLSearchParams();
    if (options.limit) params.set("limit", String(options.limit));
    if (options.page) params.set("page", String(options.page));
    if (options.status) params.set("status", options.status);
    if (options.sort) params.set("sort", options.sort);

    const query = params.toString();
    const path = `/datasets/${this.collectionName}/entries${query ? `?${query}` : ""}`;

    return this.client.get<ListResponse<T>>(path);
  }

  /**
   * Get a single entry by ID.
   * @param id - The entry ID
   * @returns Promise with the entry or null if not found
   *
   * @example
   * const post = await gremius.collection('posts').getById('123');
   */
  async getById(id: string): Promise<T | null> {
    try {
      // Note: The API uses dataset ID, not slug for getById
      // We need to first resolve the dataset slug to ID or use a different endpoint
      // For now, we'll fetch all and filter (not ideal, but works for MVP)
      const response = await this.get({ limit: 1 });
      const datasetId = response.docs[0]?.dataSetId as string;
      if (!datasetId) return null;
      
      return this.client.get<T>(`/datasets/${datasetId}/entries/${id}`);
    } catch {
      return null;
    }
  }

  /**
   * Insert a new entry into the collection.
   * @param data - The data to insert (partial, without ID)
   * @returns Promise with the created entry
   *
   * @example
   * const newPost = await gremius.collection('posts').insert({ title: 'Hello' });
   */
  async insert(data: Omit<T, 'id'>): Promise<T> {
    // First, we need to resolve the collection name to a dataset ID
    // The API expects POST /datasets/:id/entries
    // We'll use the slug-based endpoint approach
    const response = await this.client.post<T>(
      `/datasets/slug/${this.collectionName}/entries`,
      data
    );
    return response;
  }

  /**
   * Update an existing entry.
   * @param id - The entry ID to update
   * @param data - Partial data to update
   * @returns Promise with the updated entry
   *
   * @example
   * await gremius.collection('posts').update('123', { title: 'Updated' });
   */
  async update(id: string, data: Partial<Omit<T, 'id'>>): Promise<T> {
    // We need the dataset ID. For now, we'll need to resolve it.
    // This is a simplification - in production, you might want to cache dataset IDs
    const listResponse = await this.get({ limit: 1 });
    const datasetId = listResponse.docs[0]?.dataSetId as string;
    
    if (!datasetId) {
      throw new Error(`Cannot resolve dataset ID for collection: ${this.collectionName}`);
    }

    return this.client.patch<T>(`/datasets/${datasetId}/entries/${id}`, data);
  }

  /**
   * Delete an entry by ID.
   * @param id - The entry ID to delete
   * @returns Promise that resolves when deleted
   *
   * @example
   * await gremius.collection('posts').delete('123');
   */
  async delete(id: string): Promise<void> {
    const listResponse = await this.get({ limit: 1 });
    const datasetId = listResponse.docs[0]?.dataSetId as string;
    
    if (!datasetId) {
      throw new Error(`Cannot resolve dataset ID for collection: ${this.collectionName}`);
    }

    await this.client.delete<void>(`/datasets/${datasetId}/entries/${id}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// Main SDK Class
// ═══════════════════════════════════════════════════════════════

export class GremiusClient {
  private httpClient: HttpClient;

  /**
   * Create a new Gremius SDK client.
   * @param config - Configuration object with url and optional apiKey
   *
   * @example
   * const gremius = new GremiusClient({
   *   url: 'https://api.example.com',
   *   apiKey: 'gremius_sk_xxx'
   * });
   */
  constructor(config: GremiusClientConfig) {
    this.httpClient = new HttpClient(config);
  }

  /**
   * Access a collection (dataset) for CRUD operations.
   * @param name - The collection/dataset name (slug)
   * @returns CollectionRef for chaining operations
   *
   * @example
   * const posts = gremius.collection('posts');
   * const all = await posts.get();
   * const created = await posts.insert({ title: 'New Post' });
   */
  collection<T extends Record<string, unknown> = Record<string, unknown>>(
    name: string
  ): CollectionRef<T> {
    return new CollectionRef<T>(name, this.httpClient);
  }
}

// ═══════════════════════════════════════════════════════════════
// Backwards Compatibility
// ═══════════════════════════════════════════════════════════════

/**
 * @deprecated Use GremiusClient instead
 */
export const Gremius = GremiusClient;

// ═══════════════════════════════════════════════════════════════
// Default Export
// ═══════════════════════════════════════════════════════════════

export default GremiusClient;
