/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * DYNAMIC DOCS ROUTER - Auto-generated API Documentation
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Provides endpoints for:
 * - /api/docs/openapi.json - Full OpenAPI spec from all grimoires
 * - /api/docs/:grimoire/openapi.json - Spec for specific grimoire
 * - /api/docs/ - Swagger UI
 * - /api/docs/modern - Scalar UI
 * - /api/docs/operations - List all available operations
 * - /api/docs/sdk - SDK download links
 */

import { Hono } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import type { AppVariables } from "../types/hono";
import { 
  generateOpenAPISpec, 
  generateGrimoireSpec, 
  listOperations 
} from "../lib/openapi-aggregator";
import { getLoadedGrimoires } from "../lib/module-loader";
import { logger } from "../lib/logger";

export const dynamicDocsRouter = new Hono<{ Variables: AppVariables }>();

// ═══════════════════════════════════════════════════════════════════════════════
// SCALAR UI (Modern)
// ═══════════════════════════════════════════════════════════════════════════════

const scalarHtml = `
<!DOCTYPE html>
<html>
  <head>
    <title>GremiusCMS API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <style>
      body { margin: 0; padding: 0; }
    </style>
  </head>
  <body>
    <script
      id="api-reference"
      type="application/json"
      data-url="/api/docs/openapi.json"
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@latest"></script>
  </body>
</html>
`;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/docs/openapi.json
 * 
 * Returns the complete OpenAPI specification from all active grimoires.
 * This spec is auto-generated from grimoire definitions.
 */
dynamicDocsRouter.get("/openapi.json", async (c) => {
  try {
    const grimoires = await getLoadedGrimoires();
    const spec = await generateOpenAPISpec(grimoires, {
      servers: [
        { 
          url: `${new URL(c.req.url).origin}/api`, 
          description: "Current server" 
        },
        { 
          url: "http://localhost:3001/api", 
          description: "Local development" 
        },
      ],
    });
    
    return c.json(spec);
  } catch (error) {
    logger.error("Failed to generate OpenAPI spec", { error });
    return c.json({ 
      error: "Failed to generate OpenAPI spec",
      message: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

/**
 * GET /api/docs/:grimoire/openapi.json
 * 
 * Returns OpenAPI specification for a specific grimoire.
 */
dynamicDocsRouter.get("/:grimoire/openapi.json", async (c) => {
  try {
    const grimoireId = c.req.param("grimoire");
    const grimoires = await getLoadedGrimoires();
    const grimoire = grimoires.find(g => 
      g.id === grimoireId || 
      g.id === `grimoire-${grimoireId}`
    );
    
    if (!grimoire) {
      return c.json({ 
        error: "Grimoire not found",
        available: grimoires.map(g => ({ id: g.id, name: g.name }))
      }, 404);
    }
    
    const spec = await generateGrimoireSpec(grimoire);
    
    if (!spec) {
      return c.json({ 
        error: "Grimoire does not expose OpenAPI spec",
        grimoire: grimoire.name
      }, 404);
    }
    
    // Add server URL
    spec.servers = [
      { 
        url: `${new URL(c.req.url).origin}/api`, 
        description: "Current server" 
      }
    ];
    
    return c.json(spec);
  } catch (error) {
    logger.error("Failed to generate grimoire spec", { error });
    return c.json({ 
      error: "Failed to generate grimoire spec",
      message: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

/**
 * GET /api/docs/operations
 * 
 * List all available operations across all grimoires.
 * Useful for code generation and discovery.
 */
dynamicDocsRouter.get("/operations", async (c) => {
  try {
    const grimoires = await getLoadedGrimoires();
    const operations = listOperations(grimoires);
    
    const query = c.req.query();
    let filtered = operations;
    
    // Filter by grimoire
    if (query.grimoire) {
      filtered = filtered.filter(op => 
        op.grimoireId === query.grimoire ||
        op.grimoireId === `grimoire-${query.grimoire}`
      );
    }
    
    // Filter by tag
    if (query.tag) {
      filtered = filtered.filter(op => 
        op.tags.some(t => t.toLowerCase() === query.tag!.toLowerCase())
      );
    }
    
    // Filter by method
    if (query.method) {
      filtered = filtered.filter(op => 
        op.method.toLowerCase() === query.method!.toLowerCase()
      );
    }
    
    // Search
    if (query.search) {
      const search = query.search.toLowerCase();
      filtered = filtered.filter(op =>
        op.operationId.toLowerCase().includes(search) ||
        op.summary.toLowerCase().includes(search) ||
        op.path.toLowerCase().includes(search)
      );
    }
    
    return c.json({
      total: operations.length,
      filtered: filtered.length,
      operations: filtered,
    });
  } catch (error) {
    logger.error("Failed to list operations", { error });
    return c.json({ 
      error: "Failed to list operations",
      message: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

/**
 * GET /api/docs/
 * 
 * Swagger UI - Classic API documentation.
 */
dynamicDocsRouter.get("/", swaggerUI({
  url: "/api/docs/openapi.json",
  title: "GremiusCMS API Documentation",
}));

/**
 * GET /api/docs/modern
 * 
 * Scalar API Reference - Modern, beautiful documentation.
 */
dynamicDocsRouter.get("/modern", (c) => {
  return c.html(scalarHtml);
});

/**
 * GET /api/docs/grimoires
 * 
 * List all grimoires with their OpenAPI status.
 */
dynamicDocsRouter.get("/grimoires", async (c) => {
  try {
    const grimoires = await getLoadedGrimoires();
    
    const grimoireList = grimoires.map(g => ({
      id: g.id,
      name: g.name,
      version: g.version,
      description: g.description,
      hasOpenApi: !!g.openApi,
      endpointCount: g.openApi?.paths.length || 0,
      schemaCount: Object.keys(g.openApi?.schemas || {}).length,
      tags: g.openApi?.tags?.map(t => t.name) || [g.name],
      docsUrl: `/api/docs/${g.id.replace(/^grimoire-/, "")}/openapi.json`,
    }));
    
    return c.json({
      total: grimoires.length,
      withOpenApi: grimoires.filter(g => !!g.openApi).length,
      grimoires: grimoireList,
    });
  } catch (error) {
    logger.error("Failed to list grimoires", { error });
    return c.json({ 
      error: "Failed to list grimoires",
      message: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

/**
 * GET /api/docs/sdk
 * 
 * SDK download links and generation info.
 */
dynamicDocsRouter.get("/sdk", async (c) => {
  const baseUrl = new URL(c.req.url).origin;
  
  return c.json({
    sdks: [
      {
        name: "TypeScript/JavaScript",
        package: "@gremius/sdk",
        install: "npm install @gremius/sdk",
        generator: "openapi-generator-cli -g typescript-fetch",
        downloadUrl: `${baseUrl}/api/docs/sdk/typescript.zip`,
      },
      {
        name: "Python",
        package: "gremius",
        install: "pip install gremius",
        generator: "openapi-generator-cli -g python",
        downloadUrl: `${baseUrl}/api/docs/sdk/python.zip`,
      },
      {
        name: "Go",
        package: "github.com/gremius/go-sdk",
        install: "go get github.com/gremius/go-sdk",
        generator: "openapi-generator-cli -g go",
        downloadUrl: `${baseUrl}/api/docs/sdk/go.zip`,
      },
    ],
    generateCommand: "gremius generate-sdk --lang <language> --output ./sdk",
    openapiUrl: `${baseUrl}/api/docs/openapi.json`,
  });
});

/**
 * GET /api/docs/postman.json
 * 
 * Export a Postman collection.
 */
dynamicDocsRouter.get("/postman.json", async (c) => {
  try {
    const grimoires = await getLoadedGrimoires();
    const operations = listOperations(grimoires);
    
    const collection = {
      info: {
        name: "GremiusCMS API",
        description: "Auto-generated Postman collection from grimoires",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/",
        version: "0.8.0-beta",
      },
      item: operations.map(op => ({
        name: op.summary,
        request: {
          method: op.method,
          header: [
            {
              key: "Authorization",
              value: "Bearer {{apiKey}}",
              type: "text",
            },
            {
              key: "Content-Type",
              value: "application/json",
              type: "text",
            },
          ],
          url: {
            raw: `{{baseUrl}}${op.path}`,
            host: ["{{baseUrl}}"],
            path: op.path.split("/").filter(Boolean),
          },
          description: `${op.operationId}\n\nTags: ${op.tags.join(", ")}`,
        },
      })),
      variable: [
        {
          key: "baseUrl",
          value: "http://localhost:3001/api",
          type: "string",
        },
        {
          key: "apiKey",
          value: "your_api_key_here",
          type: "string",
        },
      ],
    };
    
    return c.json(collection);
  } catch (error) {
    logger.error("Failed to generate Postman collection", { error });
    return c.json({ 
      error: "Failed to generate Postman collection",
      message: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

export default dynamicDocsRouter;
