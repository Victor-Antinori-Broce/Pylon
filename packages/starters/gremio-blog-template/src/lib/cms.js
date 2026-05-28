/**
 * GremiusCMS API Client
 *
 * Typed fetch wrapper for consuming the Hono REST API.
 * Updated from Payload CMS → Hono + Drizzle backend.
 */
const API_URL = import.meta.env.PUBLIC_API_URL || import.meta.env.PUBLIC_CMS_URL || "http://localhost:3001";
async function fetchCollection(collection, options = {}) {
    const params = new URLSearchParams();
    if (options.limit)
        params.set("limit", String(options.limit));
    if (options.page)
        params.set("page", String(options.page));
    if (options.sort)
        params.set("sort", options.sort);
    if (options.search)
        params.set("search", options.search);
    if (options.status)
        params.set("status", options.status);
    if (options.featured)
        params.set("featured", options.featured);
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
async function fetchBySlug(collection, slug) {
    const url = `${API_URL}/api/${collection}/slug/${slug}`;
    const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
    });
    if (!res.ok)
        return null;
    return res.json();
}
async function fetchById(collection, id) {
    const url = `${API_URL}/api/${collection}/${id}`;
    const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
    });
    if (!res.ok)
        return null;
    return res.json();
}
// ─── Typed Collection Methods ─────────────────────────────────
export const cms = {
    games: {
        list: (opts) => fetchCollection("games", { sort: "-metacriticScore", status: "published", ...opts }),
        getBySlug: (slug) => fetchBySlug("games", slug),
        getById: (id) => fetchById("games", id),
    },
    posts: {
        list: (opts) => fetchCollection("blog-posts", {
            sort: "-publishedAt",
            status: "published",
            ...opts,
        }),
        getBySlug: (slug) => fetchBySlug("blog-posts", slug),
    },
    platforms: {
        list: () => fetchCollection("platforms", { limit: 50 }),
    },
    tags: {
        list: () => fetchCollection("tags", { limit: 100 }),
    },
    dataSets: {
        list: (opts) => fetchCollection("data-sets", opts),
        getBySlug: (slug) => fetchBySlug("data-sets", slug),
        getById: (id) => fetchById("data-sets", id),
    },
    collections: {
        list: () => fetchCollection("collections", { limit: 50 }),
    },
    dataEntries: {
        listByDataSet: async (dataSetId, limit = 500) => {
            const url = `${API_URL}/api/data-sets/${dataSetId}/entries?limit=${limit}`;
            const res = await fetch(url, {
                headers: { "Content-Type": "application/json" },
            });
            if (!res.ok)
                throw new Error(`API error: ${res.status}`);
            return res.json();
        },
    },
    streamers: {
        list: (opts) => fetchCollection("streamers", opts),
    },
    settings: async () => {
        const res = await fetch(`${API_URL}/api/settings`);
        if (!res.ok)
            return null;
        return res.json();
    },
    health: async () => {
        try {
            const res = await fetch(`${API_URL}/api/health`);
            return res.ok;
        }
        catch {
            return false;
        }
    },
};
//# sourceMappingURL=cms.js.map