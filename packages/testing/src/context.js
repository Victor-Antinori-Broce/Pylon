/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TEST CONTEXT - Creates isolated GrimoireContext for testing
 * ═══════════════════════════════════════════════════════════════════════════════
 */
/**
 * Create a mock GrimoireContext for testing
 * This mimics the real context but with isolated/in-memory implementations
 */
export async function createTestContext(sandboxId, databaseStrategy = "memory") {
    // In-memory storage for this sandbox
    const memoryStore = new Map();
    const eventListeners = new Map();
    const context = {
        sandboxId,
        // Mock database - in real implementation this would connect to test DB
        db: {
            instance: createMockDrizzle(memoryStore),
            execute: async (sql) => {
                console.log(`[TestDB:${sandboxId}] Execute:`, sql);
                return [];
            },
            tableExists: async (tableName) => {
                return memoryStore.has(`table:${tableName}`);
            }
        },
        // Mock cache
        cache: {
            get: async (key) => {
                const value = memoryStore.get(`cache:${key}`);
                return value ? JSON.parse(value) : null;
            },
            set: async (key, value, ttlSeconds) => {
                memoryStore.set(`cache:${key}`, JSON.stringify(value));
            },
            invalidate: async (pattern) => {
                // Simple implementation - in real would use pattern matching
                for (const key of memoryStore.keys()) {
                    if (key.startsWith(`cache:${pattern.replace('*', '')}`)) {
                        memoryStore.delete(key);
                    }
                }
            }
        },
        // Event system
        events: {
            emit: (event, data) => {
                const listeners = eventListeners.get(event) || [];
                listeners.forEach(fn => fn(data));
            },
            on: (event, handler) => {
                if (!eventListeners.has(event)) {
                    eventListeners.set(event, []);
                }
                eventListeners.get(event).push(handler);
            }
        },
        // Mock realtime
        realtime: {
            broadcast: (channel, message) => {
                // No-op in tests
            },
            sendToUser: (userId, message) => {
                // No-op in tests
            }
        },
        // Mock auth
        auth: {
            requireAuth: async (c, next) => {
                const user = c.get("testUser");
                if (!user) {
                    return c.json({ error: "Unauthorized" }, 401);
                }
                await next();
            },
            requireRole: (roles) => async (c, next) => {
                const user = c.get("testUser");
                if (!user || !roles.includes(user.role)) {
                    return c.json({ error: "Forbidden" }, 403);
                }
                await next();
            },
            optionalAuth: async (c, next) => {
                await next();
            },
            getSession: async (headers) => {
                return null;
            }
        },
        // Mock storage
        storage: {
            getSignedUploadUrl: async (key, contentType) => {
                return `https://test-storage.gremius.local/upload/${key}`;
            },
            getSignedDownloadUrl: async (key) => {
                return `https://test-storage.gremius.local/download/${key}`;
            },
            delete: async (key) => {
                // No-op
            }
        },
        // Mock content publishing
        contentPublishing: {
            getAvailableTargets: () => [],
            hasTarget: () => false,
            register: () => { },
            unregister: () => { },
            promote: async () => ({
                contentId: "test",
                targetId: "test",
                slug: "test",
                url: "/test",
                status: "published",
                createdAt: new Date()
            }),
            unpublish: async () => { },
            getPublishedUrl: () => "/test"
        },
        // Logger
        logger: {
            info: (message, meta) => {
                console.log(`[Test:${sandboxId}] INFO:`, message, meta || "");
            },
            warn: (message, meta) => {
                console.log(`[Test:${sandboxId}] WARN:`, message, meta || "");
            },
            error: (message, meta) => {
                console.log(`[Test:${sandboxId}] ERROR:`, message, meta || "");
            },
            debug: (message, meta) => {
                // Silent in tests unless DEBUG=true
                if (process.env.DEBUG) {
                    console.log(`[Test:${sandboxId}] DEBUG:`, message, meta || "");
                }
            }
        },
        // Config
        config: {
            siteName: "Test Site",
            siteUrl: "http://localhost:3001",
            environment: "test"
        }
    };
    return context;
}
/**
 * Create a mock Drizzle instance
 * In production, this would be a real database connection
 */
function createMockDrizzle(memoryStore) {
    return {
        select: () => ({
            from: (table) => ({
                where: (condition) => ({
                    limit: (n) => ({
                        orderBy: () => Promise.resolve([])
                    }),
                    orderBy: () => Promise.resolve([])
                }),
                limit: (n) => Promise.resolve([]),
                orderBy: () => Promise.resolve([])
            })
        }),
        insert: (table) => ({
            values: (data) => ({
                returning: () => {
                    const id = `mock-${Date.now()}`;
                    const record = { id, ...data };
                    const tableName = typeof table === 'object' ? table.name : table;
                    if (!memoryStore.has(`table:${tableName}`)) {
                        memoryStore.set(`table:${tableName}`, []);
                    }
                    memoryStore.get(`table:${tableName}`).push(record);
                    return Promise.resolve([record]);
                }
            })
        }),
        update: (table) => ({
            set: (data) => ({
                where: (condition) => ({
                    returning: () => Promise.resolve([{ id: "mock", ...data }])
                })
            })
        }),
        delete: (table) => ({
            where: (condition) => Promise.resolve({ count: 1 })
        })
    };
}
export default { createTestContext };
//# sourceMappingURL=context.js.map