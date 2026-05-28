// @ts-nocheck
/**
 * Test Utilities for Gremius API
 *
 * Helper functions for testing with Bun
 */
import { db } from '../db';
/**
 * Reset database state for tests
 * Truncates test tables and reseeds minimal data
 */
export async function resetTestDatabase() {
    // Add tables that need cleanup for tests
    const tablesToClean = [
        'data_entries',
        'data_sets',
        'api_keys',
        'gremius_functions',
        'function_executions'
    ];
    for (const table of tablesToClean) {
        try {
            await db.execute(`TRUNCATE TABLE ${table} CASCADE`);
        }
        catch {
            // Table might not exist, ignore
        }
    }
}
/**
 * Create a mock authenticated context for Hono tests
 */
export function createMockContext(options = {}) {
    return {
        get: (key) => {
            if (key === 'user')
                return options.user || null;
            if (key === 'tx')
                return null;
            return undefined;
        },
        req: {
            json: async () => options.body || {},
            param: (key) => options.params?.[key] || '',
            query: (key) => options.query?.[key] || '',
            header: () => null
        },
        json: (data, status) => ({ data, status }),
        text: (data, status) => ({ data, status }),
        notFound: () => ({ data: { error: 'Not found' }, status: 404 })
    };
}
/**
 * Mock fetch for external API calls in tests
 */
export function mockFetch(response, status = 200) {
    return () => Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: async () => response,
        text: async () => JSON.stringify(response)
    });
}
//# sourceMappingURL=test-utils.js.map