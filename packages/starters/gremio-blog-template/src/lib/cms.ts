/**
 * GremiusCMS API Client
 *
 * Typed fetch wrapper for consuming the Hono REST API.
 * Updated from Payload CMS → Hono + Drizzle backend.
 */

import type {
  Game,
  BlogPost,
  Platform,
  Tag,
  DataSet,
  DataEntry,
  Streamer,
  PaginatedResponse,
} from "@gremius/shared";

const API_URL = import.meta.env.PUBLIC_API_URL || import.meta.env.PUBLIC_CMS_URL || "http://localhost:3001";

// ─── Generic Fetch ────────────────────────────────────────────

interface FetchOptions {
  limit?: number;
  page?: number;
  search?: string;
  sort?: string;
  status?: string;
  featured?: string;
}

async function fetchCollection<T>(
  collection: string,
  options: FetchOptions = {}
): Promise<PaginatedResponse<T>> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.page) params.set("page", String(options.page));
  if (options.sort) params.set("sort", options.sort);
  if (options.search) params.set("search", options.search);
  if (options.status) params.set("status", options.status);
  if (options.featured) params.set("featured", options.featured);

  const qs = params.toString();
  const url = `${API_URL}/api/${collection}${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText} → ${url}`);
  }

  return res.json();
}

async function fetchBySlug<T>(
  collection: string,
  slug: string
): Promise<T | null> {
  const url = `${API_URL}/api/${collection}/slug/${slug}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) return null;
  return res.json();
}

async function fetchById<T>(
  collection: string,
  id: string
): Promise<T | null> {
  const url = `${API_URL}/api/${collection}/${id}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) return null;
  return res.json();
}

// ─── Typed Collection Methods ─────────────────────────────────

export const cms = {
  games: {
    list: (opts?: FetchOptions) =>
      fetchCollection<Game>("games", { sort: "-metacriticScore", status: "published", ...opts }),
    getBySlug: (slug: string) => fetchBySlug<Game>("games", slug),
    getById: (id: string) => fetchById<Game>("games", id),
  },

  posts: {
    list: (opts?: FetchOptions) =>
      fetchCollection<BlogPost>("blog-posts", {
        sort: "-publishedAt",
        status: "published",
        ...opts,
      }),
    getBySlug: (slug: string) => fetchBySlug<BlogPost>("blog-posts", slug),
  },

  platforms: {
    list: () => fetchCollection<Platform>("platforms", { limit: 50 }),
  },

  tags: {
    list: () => fetchCollection<Tag>("tags", { limit: 100 }),
  },

  dataSets: {
    list: (opts?: FetchOptions) =>
      fetchCollection<DataSet>("data-sets", opts),
    getBySlug: (slug: string) => fetchBySlug<DataSet>("data-sets", slug),
    getById: (id: string) => fetchById<DataSet>("data-sets", id),
  },

  collections: {
    list: () => fetchCollection<any>("collections", { limit: 50 }),
  },

  dataEntries: {
    listByDataSet: async (dataSetId: string, limit = 500): Promise<PaginatedResponse<DataEntry>> => {
      const url = `${API_URL}/api/data-sets/${dataSetId}/entries?limit=${limit}`;
      const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    },
  },

  streamers: {
    list: (opts?: FetchOptions) =>
      fetchCollection<Streamer>("streamers", opts),
  },

  settings: async () => {
    const res = await fetch(`${API_URL}/api/settings`);
    if (!res.ok) return null;
    return res.json();
  },

  health: async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/api/health`);
      return res.ok;
    } catch {
      return false;
    }
  },
};
