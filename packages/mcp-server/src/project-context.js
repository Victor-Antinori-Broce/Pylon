/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PROJECT CONTEXT RESOURCE - Full Project State for AI Agents
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Provides AI agents with complete project understanding including:
 * - Active grimoires and their capabilities
 * - Available endpoints and schemas
 * - Data relationships
 * - Event system
 * - Configuration
 */
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
export function registerProjectContext(server, deps) {
    const { db, schema, grimoireRegistry } = deps;
    // ═══════════════════════════════════════════════════════════════════════════════
    // FULL PROJECT CONTEXT
    // ═══════════════════════════════════════════════════════════════════════════════
    server.registerResource("project-context", "gremius://project-context", {
        title: "Gremius Project Context",
        description: "Complete project structure and capabilities for AI understanding",
        mimeType: "application/json"
    }, async (uri) => {
        try {
            // Get all datasets
            const datasets = await db.select().from(schema.dataSets);
            // Get active grimoires
            const grimoires = Object.values(grimoireRegistry || {}).map((g) => ({
                id: g.id,
                name: g.name,
                version: g.version,
                description: g.description,
                mountPath: g.mountPath || `/api/${g.id.replace(/^grimoire-/, "")}`,
                hasOpenApi: !!g.openApi,
                endpointCount: g.openApi?.paths?.length || 0,
                tables: g.tables || [],
                dependencies: g.dependencies || {},
            }));
            // Build project context
            const context = {
                meta: {
                    generatedAt: new Date().toISOString(),
                    version: "0.8.0-beta",
                    environment: process.env.NODE_ENV || "development",
                },
                architecture: {
                    type: "GremiusCMS",
                    engine: "@gremius/engine",
                    pattern: "Modular Grimoire System",
                    layers: [
                        { name: "Engine", level: 1, description: "Auth, DB, Cache, Queue - always active" },
                        { name: "Core", level: 2, description: "Datasets, Media, Webhooks - toggleable" },
                        { name: "Grimoires", level: 3, description: "Business modules - dynamically loaded" },
                    ]
                },
                grimoires: {
                    total: grimoires.length,
                    active: grimoires.map(g => ({
                        id: g.id,
                        name: g.name,
                        version: g.version,
                        mountPath: g.mountPath,
                        endpoints: g.endpointCount,
                        tables: g.tables,
                    })),
                },
                data: {
                    datasets: {
                        total: datasets.length,
                        items: datasets.map(ds => ({
                            id: ds.id,
                            name: ds.name,
                            slug: ds.slug,
                            fieldCount: ds.schema?.fields?.length || 0,
                            hasRelations: !!ds.schema?.relations && Object.keys(ds.schema.relations).length > 0,
                        })),
                    },
                },
                api: {
                    baseUrl: "/api",
                    documentation: {
                        swagger: "/api/docs/",
                        scalar: "/api/docs/modern",
                        openapi: "/api/docs/openapi.json",
                        operations: "/api/docs/operations",
                    },
                    authentication: {
                        methods: ["bearer", "cookie", "api-key"],
                        header: "Authorization: Bearer <token>",
                    },
                },
                conventions: {
                    naming: {
                        grimoires: "grimoire-{name}",
                        tables: "snake_case",
                        fields: "camelCase",
                        apiEndpoints: "kebab-case",
                    },
                    patterns: {
                        router: "Use ctx.db.instance for database access",
                        auth: "Use ctx.auth.requireAuth for protected routes",
                        cache: "Use ctx.cache for expensive operations",
                        events: "Use ctx.events.emit for async processing",
                    },
                },
                codeGeneration: {
                    grimoireTemplate: `
import { Hono } from "hono";
import { defineGrimoire } from "@gremius/shared";

export const grimoire = defineGrimoire({
  id: "grimoire-{name}",
  name: "{Name}",
  version: "1.0.0",
  openApi: {
    tags: [{ name: "{Name}", description: "..." }],
    paths: []
  },
  createRouter: (ctx) => {
    const router = new Hono();
    // Routes here
    return router;
  }
});
            `.trim(),
                }
            };
            return {
                contents: [{
                        uri: uri.href,
                        text: JSON.stringify(context, null, 2)
                    }]
            };
        }
        catch (error) {
            return {
                contents: [{
                        uri: uri.href,
                        text: JSON.stringify({
                            error: "Failed to load project context",
                            message: error.message
                        }, null, 2)
                    }]
            };
        }
    });
    // ═══════════════════════════════════════════════════════════════════════════════
    // DATASET SCHEMA RESOURCE
    // ═══════════════════════════════════════════════════════════════════════════════
    server.registerResource("dataset-schema", new ResourceTemplate("gremius://dataset/{id}/schema", {
        list: async () => {
            const datasets = await db.select().from(schema.dataSets);
            return {
                resources: datasets.map(ds => ({
                    uri: `gremius://dataset/${ds.id}/schema`,
                    name: `Schema: ${ds.name}`
                }))
            };
        }
    }), {
        title: "Dataset Schema",
        description: "Detailed schema for a specific dataset",
        mimeType: "application/json"
    }, async (uri, { id }) => {
        try {
            const [dataset] = await db
                .select()
                .from(schema.dataSets)
                .where(eq(schema.dataSets.id, id))
                .limit(1);
            if (!dataset) {
                throw new Error(`Dataset not found: ${id}`);
            }
            const schemaInfo = {
                dataset: {
                    id: dataset.id,
                    name: dataset.name,
                    slug: dataset.slug,
                    description: dataset.description,
                },
                schema: dataset.schema,
                fields: dataset.schema?.fields?.map((f) => ({
                    key: f.key,
                    type: f.type,
                    label: f.label,
                    required: f.isRequired,
                    unique: f.isUnique,
                    default: f.defaultValue,
                    helpText: f.helpText,
                })),
                relations: dataset.schema?.relations || {},
                policies: dataset.schema?.policies || {},
                queryExamples: [
                    `GET /api/datasets/${dataset.slug}/entries`,
                    `GET /api/datasets/${dataset.slug}/entries?limit=10`,
                    `POST /api/datasets/${dataset.slug}/entries`,
                ]
            };
            return {
                contents: [{
                        uri: uri.href,
                        text: JSON.stringify(schemaInfo, null, 2)
                    }]
            };
        }
        catch (error) {
            return {
                contents: [{
                        uri: uri.href,
                        text: JSON.stringify({ error: error.message }, null, 2)
                    }]
            };
        }
    });
    // ═══════════════════════════════════════════════════════════════════════════════
    // GRIMOIRE CAPABILITIES RESOURCE
    // ═══════════════════════════════════════════════════════════════════════════════
    server.registerResource("grimoire-capabilities", new ResourceTemplate("gremius://grimoire/{id}/capabilities", {
        list: async () => {
            const grimoires = Object.values(grimoireRegistry || {}).map((g) => ({
                uri: `gremius://grimoire/${g.id}/capabilities`,
                name: g.name
            }));
            return { resources: grimoires };
        }
    }), {
        title: "Grimoire Capabilities",
        description: "Available endpoints and operations for a grimoire",
        mimeType: "application/json"
    }, async (uri, { id }) => {
        try {
            const grimoire = Object.values(grimoireRegistry || {}).find((g) => g.id === id || g.id === `grimoire-${id}`);
            if (!grimoire) {
                throw new Error(`Grimoire not found: ${id}`);
            }
            const capabilities = {
                grimoire: {
                    id: grimoire.id,
                    name: grimoire.name,
                    version: grimoire.version,
                    description: grimoire.description,
                    mountPath: grimoire.mountPath || `/api/${grimoire.id.replace(/^grimoire-/, "")}`,
                },
                endpoints: grimoire.openApi?.paths?.map((p) => ({
                    method: p.method.toUpperCase(),
                    path: p.path,
                    summary: p.summary,
                    tags: p.tags,
                    requireAuth: p.requireAuth !== false,
                })) || [],
                schemas: Object.keys(grimoire.openApi?.schemas || {}),
                tables: grimoire.tables || [],
                hooks: Object.keys(grimoire.hooks || {}),
                admin: grimoire.admin || null,
            };
            return {
                contents: [{
                        uri: uri.href,
                        text: JSON.stringify(capabilities, null, 2)
                    }]
            };
        }
        catch (error) {
            return {
                contents: [{
                        uri: uri.href,
                        text: JSON.stringify({ error: error.message }, null, 2)
                    }]
            };
        }
    });
    // ═══════════════════════════════════════════════════════════════════════════════
    // API OPERATIONS RESOURCE
    // ═══════════════════════════════════════════════════════════════════════════════
    server.registerResource("api-operations", "gremius://api-operations", {
        title: "All API Operations",
        description: "Complete list of available API operations across all grimoires",
        mimeType: "application/json"
    }, async (uri) => {
        try {
            const operations = [];
            for (const grimoire of Object.values(grimoireRegistry || {})) {
                if (!grimoire.openApi?.paths)
                    continue;
                const mountPath = grimoire.mountPath || `/api/${grimoire.id.replace(/^grimoire-/, "")}`;
                for (const path of grimoire.openApi.paths) {
                    operations.push({
                        operationId: path.operationId || `${grimoire.id}_${path.method}_${path.path.replace(/\//g, "_")}`,
                        grimoire: grimoire.id,
                        grimoireName: grimoire.name,
                        method: path.method.toUpperCase(),
                        path: `${mountPath}${path.path}`,
                        fullPath: `/api${mountPath}${path.path}`,
                        summary: path.summary,
                        description: path.description,
                        tags: path.tags || [grimoire.name],
                        requireAuth: path.requireAuth !== false,
                    });
                }
            }
            return {
                contents: [{
                        uri: uri.href,
                        text: JSON.stringify({
                            totalOperations: operations.length,
                            operations: operations.sort((a, b) => a.grimoire.localeCompare(b.grimoire) ||
                                a.path.localeCompare(b.path))
                        }, null, 2)
                    }]
            };
        }
        catch (error) {
            return {
                contents: [{
                        uri: uri.href,
                        text: JSON.stringify({ error: error.message }, null, 2)
                    }]
            };
        }
    });
    // ═══════════════════════════════════════════════════════════════════════════════
    // DEVELOPMENT GUIDE RESOURCE
    // ═══════════════════════════════════════════════════════════════════════════════
    server.registerResource("development-guide", "gremius://dev-guide", {
        title: "Development Guide",
        description: "Guide for AI agents working with Gremius",
        mimeType: "text/markdown"
    }, async (uri) => {
        const guide = `# Gremius Development Guide for AI Agents

## Quick Start

### 1. Explore the Project
\`\`\`
Resource: gremius://project-context
Resource: gremius://api-operations
\`\`\`

### 2. Check Available Datasets
\`\`\`
Tool: gremius_list_datasets
Resource: gremius://dataset/{id}/schema
\`\`\`

### 3. Query Data
\`\`\`
Tool: gremius_intelligent_query
  dataset: "games"
  query: "games released in 2024 with rating above 8"
\`\`\`

## Creating a Grimoire

### Option 1: Generate Template
\`\`\`
Tool: gremius_generate_grimoire
  name: "inventory-management"
  features: ["crud", "relations", "webhooks"]
  dataModel: "Products with categories, suppliers, and stock tracking"
\`\`\`

### Option 2: Manual Creation
Create files in \`packages/grimoires/grimoire-{name}/\`:

1. **index.ts** - Main grimoire definition
2. **schema.ts** - Database schema
3. **grimoire.json** - Metadata
4. **package.json** - Dependencies

### Grimoire Structure
\`\`\`typescript
import { Hono } from "hono";
import { defineGrimoire } from "@gremius/shared";

export const grimoire = defineGrimoire({
  id: "grimoire-my-feature",
  name: "My Feature",
  version: "1.0.0",
  
  // OpenAPI documentation
  openApi: {
    tags: [{ name: "My Feature", description: "..." }],
    schemas: { /* Zod schemas */ },
    paths: [ /* Endpoint definitions */ ]
  },
  
  createRouter: (ctx) => {
    const router = new Hono();
    
    // Use injected context
    router.get("/", async (c) => {
      const data = await ctx.db.instance.select().from(myTable);
      return c.json({ data });
    });
    
    return router;
  }
});
\`\`\`

## Best Practices

1. **Always use context injection** - Never import from apps/api/
2. **Define OpenAPI specs** - For auto-generated documentation
3. **Add authentication** - Use ctx.auth.requireAuth for protected routes
4. **Handle errors** - Return proper HTTP status codes
5. **Use transactions** - For multi-step operations

## Common Patterns

### Database Query
\`\`\`typescript
const results = await ctx.db.instance
  .select()
  .from(myTable)
  .where(eq(myTable.status, "active"))
  .limit(50);
\`\`\`

### With Caching
\`\`\`typescript
const cacheKey = \`myfeature:list:\${userId}\`;
let data = await ctx.cache.get(cacheKey);

if (!data) {
  data = await fetchFromDb();
  await ctx.cache.set(cacheKey, data, 300); // 5 minutes
}
\`\`\`

### Emit Events
\`\`\`typescript
ctx.events.emit("myfeature:created", { id: newItem.id });
\`\`\`
`;
        return {
            contents: [{
                    uri: uri.href,
                    text: guide
                }]
        };
    });
}
// Import helpers
import { eq } from "drizzle-orm";
export default { registerProjectContext };
//# sourceMappingURL=project-context.js.map