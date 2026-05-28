/**
 * GremiusCMS API Client
 *
 * Typed fetch wrapper for consuming the Hono REST API.
 * Updated from Payload CMS → Hono + Drizzle backend.
 */
import type { Game, BlogPost, Platform, Tag, DataSet, DataEntry, Streamer, PaginatedResponse } from "@gremius/shared";
interface FetchOptions {
    limit?: number;
    page?: number;
    search?: string;
    sort?: string;
    status?: string;
    featured?: string;
}
export declare const cms: {
    games: {
        list: (opts?: FetchOptions) => Promise<PaginatedResponse<Game>>;
        getBySlug: (slug: string) => Promise<Game | null>;
        getById: (id: string) => Promise<Game | null>;
    };
    posts: {
        list: (opts?: FetchOptions) => Promise<PaginatedResponse<BlogPost>>;
        getBySlug: (slug: string) => Promise<BlogPost | null>;
    };
    platforms: {
        list: () => Promise<PaginatedResponse<Platform>>;
    };
    tags: {
        list: () => Promise<PaginatedResponse<Tag>>;
    };
    dataSets: {
        list: (opts?: FetchOptions) => Promise<PaginatedResponse<DataSet>>;
        getBySlug: (slug: string) => Promise<DataSet | null>;
        getById: (id: string) => Promise<DataSet | null>;
    };
    collections: {
        list: () => Promise<PaginatedResponse<any>>;
    };
    dataEntries: {
        listByDataSet: (dataSetId: string, limit?: number) => Promise<PaginatedResponse<DataEntry>>;
    };
    streamers: {
        list: (opts?: FetchOptions) => Promise<PaginatedResponse<Streamer>>;
    };
    settings: () => Promise<any>;
    health: () => Promise<boolean>;
};
export {};
//# sourceMappingURL=cms.d.ts.map