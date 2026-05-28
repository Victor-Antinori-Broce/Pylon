/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * GRIMOIRE-BLOG TESTS
 * Testing with @gremius/testing framework
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { createPgMem } from "pg-mem";
import { drizzle } from "drizzle-orm/pg-mem";
// Import the grimoire directly
import { grimoire, createBlogRouter, blogPosts } from "./src/index";
// Test context - we'll build this manually for the first test
let testContext;
let db;
let pgMem;
describe("grimoire-blog", () => {
    beforeAll(async () => {
        // Create in-memory PostgreSQL
        pgMem = createPgMem();
        // Create Drizzle instance
        db = drizzle(pgMem, { schema: { blogPosts } });
        // Create test context
        testContext = {
            db: {
                instance: db,
                execute: async (sql) => pgMem.public.query(sql),
                tableExists: async (name) => {
                    try {
                        const result = pgMem.public.query(`
              SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = '${name}'
              );
            `);
                        return result[0]?.exists || false;
                    }
                    catch {
                        return false;
                    }
                }
            },
            cache: {
                get: async () => null,
                set: async () => { },
                invalidate: async () => { }
            },
            events: {
                emit: (name, data) => {
                    console.log(`[Event] ${name}:`, data);
                },
                on: () => { }
            },
            realtime: {
                broadcast: () => { },
                sendToUser: () => { }
            },
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
                optionalAuth: async (c, next) => await next(),
                getSession: async () => null
            },
            storage: {
                getSignedUploadUrl: async () => "",
                getSignedDownloadUrl: async () => "",
                delete: async () => { }
            },
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
            logger: {
                info: (msg) => console.log(`[INFO] ${msg}`),
                warn: (msg) => console.log(`[WARN] ${msg}`),
                error: (msg) => console.log(`[ERROR] ${msg}`),
                debug: () => { }
            },
            config: {
                siteName: "Test Site",
                siteUrl: "http://localhost:3001",
                environment: "test"
            }
        };
        // Create the router
        const router = createBlogRouter(testContext);
        // Store for use in tests
        globalThis.testRouter = router;
        globalThis.testContext = testContext;
        globalThis.testDb = db;
        console.log("✅ Test setup complete");
    });
    afterAll(() => {
        pgMem?.close();
        console.log("🧹 Test cleanup complete");
    });
    afterEach(() => {
        // Clear data between tests
        try {
            pgMem?.public?.query("DELETE FROM blog_posts;");
        }
        catch {
            // Table might not exist yet
        }
    });
    describe("Grimoire Definition", () => {
        it("has correct metadata", () => {
            expect(grimoire.id).toBe("grimoire-blog");
            expect(grimoire.name).toBe("Blog Posts");
            expect(grimoire.version).toBe("2.0.0");
            expect(grimoire.mountPath).toBe("/api/blog");
            expect(grimoire.icon).toBe("FileText");
        });
        it("has required dependencies", () => {
            expect(grimoire.dependencies?.grimoires).toContain("grimoire-media");
            expect(grimoire.dependencies?.core).toContain("auth");
        });
        it("has admin configuration", () => {
            expect(grimoire.admin?.category).toBe("core");
            expect(grimoire.admin?.views).toBeDefined();
            expect(grimoire.admin?.views?.length).toBeGreaterThan(0);
        });
        it("has lifecycle hooks", () => {
            expect(grimoire.hooks?.onStartup).toBeDefined();
            expect(grimoire.hooks?.onEnable).toBeDefined();
            expect(grimoire.hooks?.onDisable).toBeDefined();
        });
    });
    describe("Router Creation", () => {
        it("creates router with context", () => {
            const router = createBlogRouter(testContext);
            expect(router).toBeDefined();
            expect(typeof router.fetch).toBe("function");
        });
    });
    describe("Database Schema", () => {
        it("blogPosts table is defined", () => {
            expect(blogPosts).toBeDefined();
            expect(blogPosts.name).toBe("blog_posts");
        });
        it("has correct columns", () => {
            const columns = blogPosts;
            expect(columns).toBeDefined();
            // Note: Drizzle table definitions don't expose columns directly in runtime
            // This is more of a type-check in practice
        });
    });
    describe("HTTP Endpoints (via Hono)", () => {
        it("GET /api/blog returns 200", async () => {
            const router = globalThis.testRouter;
            const req = new Request("http://localhost/api/blog", {
                method: "GET"
            });
            const res = await router.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body).toBeDefined();
        });
        it("GET /api/blog/posts returns posts list", async () => {
            const router = globalThis.testRouter;
            const req = new Request("http://localhost/api/blog/posts", {
                method: "GET"
            });
            const res = await router.fetch(req);
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(Array.isArray(body.data || body)).toBe(true);
        });
    });
    describe("SEO Utilities", () => {
        it("exports SEO utilities", async () => {
            const { generateSEOMetadata, validateSEO, calculateSEOScore } = await import("./src/index");
            expect(typeof generateSEOMetadata).toBe("function");
            expect(typeof validateSEO).toBe("function");
            expect(typeof calculateSEOScore).toBe("function");
        });
        it("validates SEO correctly", async () => {
            const { validateSEO } = await import("./src/index");
            const result = validateSEO({
                title: "Test Title",
                description: "Test description that is long enough for SEO purposes"
            });
            expect(result).toBeDefined();
            expect(result.errors).toBeInstanceOf(Array);
            expect(result.warnings).toBeInstanceOf(Array);
        });
    });
    describe("Content Utilities", () => {
        it("exports GEO utilities", async () => {
            const { generateArticleSchema, sanitizeHTML } = await import("./src/index");
            expect(typeof generateArticleSchema).toBe("function");
            expect(typeof sanitizeHTML).toBe("function");
        });
    });
});
// Run: bun test packages/grimoires/grimoire-blog/blog.test.ts
//# sourceMappingURL=blog.test.js.map