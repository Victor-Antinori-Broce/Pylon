/**
 * Test Utilities for Gremius API
 *
 * Helper functions for testing with Bun
 */
/**
 * Reset database state for tests
 * Truncates test tables and reseeds minimal data
 */
export declare function resetTestDatabase(): Promise<void>;
/**
 * Create a mock authenticated context for Hono tests
 */
export declare function createMockContext(options?: {
    user?: {
        id: string;
        role: string;
    };
    body?: unknown;
    params?: Record<string, string>;
    query?: Record<string, string>;
}): {
    get: (key: string) => {
        id: string;
        role: string;
    } | null | undefined;
    req: {
        json: () => Promise<{}>;
        param: (key: string) => string;
        query: (key: string) => string;
        header: () => null;
    };
    json: (data: unknown, status?: number) => {
        data: unknown;
        status: number | undefined;
    };
    text: (data: string, status?: number) => {
        data: string;
        status: number | undefined;
    };
    notFound: () => {
        data: {
            error: string;
        };
        status: number;
    };
};
/**
 * Mock fetch for external API calls in tests
 */
export declare function mockFetch(response: unknown, status?: number): () => Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
}>;
//# sourceMappingURL=test-utils.d.ts.map