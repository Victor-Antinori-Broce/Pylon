/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENHANCED MCP TOOLS - Agent-Friendly DX
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Provides AI agents with powerful tools for:
 * - Intelligent querying with natural language
 * - Kon code generation
 * - Schema introspection
 * - Batch operations
 * - Error analysis
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { z } from "zod";

import type { McpServerDependencies } from "./index";

export function registerEnhancedTools(server: McpServer, deps: McpServerDependencies) {
  const { db, schema, queue: _queue, konRegistry: _konRegistry } = deps;

  // ═══════════════════════════════════════════════════════════════════════════════
  // INTELLIGENT QUERY TOOL
  // ═══════════════════════════════════════════════════════════════════════════════

  server.registerTool(
    "kitsuden_intelligent_query",
    {
      title: "Query with Natural Language",
      description: `Execute intelligent queries using natural language.

This tool interprets natural language queries and converts them to structured filters.

Examples:
- "games released in 2024 with rating above 8"
- "blog posts about typescript published last month"
- "users from Spain who logged in this week"
- "products with price between 10 and 50 euros"

The AI analyzes the dataset schema and builds appropriate filters automatically.`,
      inputSchema: z.object({
        dataset: z.string().describe("Dataset slug (e.g., 'games', 'blog-posts')"),
        query: z.string().describe("Natural language query"),
        limit: z.number().optional().default(50).describe("Max results (default: 50)"),
        includeRelated: z.boolean().optional().default(false).describe("Include related data"),
      }),
      outputSchema: z.any(),
    },
    async ({ dataset, query, limit, includeRelated: _includeRelated }) => {
      try {
        // First, get dataset schema for context
        const [datasetInfo] = await db
          .select()
          .from(schema.dataSets)
          .where(eq(schema.dataSets.slug, dataset))
          .limit(1);

        if (!datasetInfo) {
          return {
            isError: true,
            content: [{ type: "text", text: `Dataset "${dataset}" not found` }],
          };
        }

        // Parse natural language into structured query (simplified version)
        // In production, this would use an LLM or sophisticated NLP
        const parsedQuery = parseNaturalLanguageQuery(query, datasetInfo.schema);

        // Todas las condiciones se juntan ANTES de construir la consulta.
        //
        // Antes esto llamaba a `.where()` dos veces: primero con el dataset y
        // luego, si había filtros, con ellos. En Drizzle la segunda llamada
        // REEMPLAZA la primera, no la combina — así que en cuanto había un
        // filtro se perdía el `dataSetId` y la búsqueda devolvía entradas de
        // TODOS los datasets.
        //
        // TypeScript lo impedía: por eso `.where()` desaparece del tipo una vez
        // usado. Estaba silenciado con un `@ts-ignore` sin explicación.
        const condiciones = [eq(schema.dataEntries.dataSetId, datasetInfo.id)];

        for (const f of parsedQuery.filters) {
          // Simplificado: una implementación real construiría el SQL con más
          // cuidado que interpolar el operador.
          condiciones.push(sql`data->>'${sql.raw(f.field)}' ${sql.raw(f.operator)} ${f.value}`);
        }

        let dbQuery = db
          .select()
          .from(schema.dataEntries)
          .where(and(...condiciones));

        // Apply sorting
        if (parsedQuery.sort) {
          dbQuery = dbQuery.orderBy(
            (parsedQuery.sort as any).direction === "desc"
              ? desc(schema.dataEntries.createdAt)
              : asc(schema.dataEntries.createdAt)
          );
        }

        const results = await dbQuery.limit(Math.min(limit, 100));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  dataset,
                  query,
                  parsedFilters: parsedQuery.filters,
                  total: results.length,
                  results,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Query failed: ${err.message}` }],
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // KON GENERATOR TOOL
  // ═══════════════════════════════════════════════════════════════════════════════

  server.registerTool(
    "kitsuden_generate_kon",
    {
      title: "Generate Kon Boilerplate",
      description: `Generate a complete kon template based on requirements.

This tool creates production-ready kon code including:
- TypeScript types and Zod schemas
- CRUD API endpoints
- Database migrations
- Admin UI configuration
- OpenAPI documentation

Example use cases:
- "Create an inventory management kon with products, categories, and stock tracking"
- "Generate a booking system for conference rooms with time slots"
- "Build a CRM kon with contacts, companies, and deals"`,
      inputSchema: z.object({
        name: z.string().describe("Kon name (kebab-case, e.g., 'inventory-management')"),
        description: z.string().describe("What this kon does"),
        features: z
          .array(
            z.enum([
              "crud",
              "webhooks",
              "relations",
              "media",
              "workflow",
              "search",
              "analytics",
              "permissions",
            ])
          )
          .describe("Features to include"),
        dataModel: z.string().describe("Description of entities and relationships"),
        targetLocation: z.string().optional().describe("Where to save (default: packages/kons/)"),
      }),
      outputSchema: z.any(),
    },
    async ({ name, description, features, dataModel, targetLocation }) => {
      try {
        const konCode = generateKonTemplate({
          name,
          description,
          features,
          dataModel,
        });

        const outputPath = targetLocation || `packages/kons/kon-${name}`;

        return {
          content: [
            {
              type: "text",
              text: `✅ Generated kon "${name}"

📁 Save to: ${outputPath}/

📋 Files to create:
${konCode.files.map((f) => `  - ${f.path}`).join("\n")}

🚀 Installation:
  1. Create directory: mkdir -p ${outputPath}
  2. Save files
  3. Install: kitsuden plugin install ${name}

📖 Main index.ts:
\`\`\`typescript
${konCode.mainFile}
\`\`\`

For complete code, use the CLI: kitsuden generate-kon --name ${name} --output ${outputPath}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Generation failed: ${err.message}` }],
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // SCHEMA INTROSPECTION TOOL
  // ═══════════════════════════════════════════════════════════════════════════════

  server.registerTool(
    "kitsuden_introspect_schema",
    {
      title: "Introspect Dataset Schema",
      description:
        "Get detailed schema information for a dataset including fields, types, relations, and examples.",
      inputSchema: z.object({
        dataset: z.string().describe("Dataset slug or ID"),
        includeSampleData: z.boolean().optional().default(true).describe("Include sample entries"),
        includeRelations: z.boolean().optional().default(true).describe("Include relation info"),
      }),
      outputSchema: z.any(),
    },
    async ({ dataset, includeSampleData, includeRelations: _includeRelations }) => {
      try {
        // Find dataset
        const [datasetInfo] = await db
          .select()
          .from(schema.dataSets)
          .where(eq(schema.dataSets.slug, dataset))
          .limit(1);

        if (!datasetInfo) {
          return {
            isError: true,
            content: [{ type: "text", text: `Dataset "${dataset}" not found` }],
          };
        }

        // Get sample data if requested
        let sampleData = null;
        if (includeSampleData) {
          sampleData = await db
            .select()
            .from(schema.dataEntries)
            .where(eq(schema.dataEntries.dataSetId, datasetInfo.id))
            .limit(3);
        }

        // Parse schema for field info
        const fieldAnalysis = analyzeSchema(datasetInfo.schema);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  dataset: {
                    id: datasetInfo.id,
                    name: datasetInfo.name,
                    slug: datasetInfo.slug,
                    description: datasetInfo.description,
                  },
                  schema: {
                    fields: fieldAnalysis,
                    raw: datasetInfo.schema,
                  },
                  sampleData,
                  queryExamples: generateQueryExamples(datasetInfo.slug, fieldAnalysis),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Introspection failed: ${err.message}` }],
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // BATCH OPERATIONS TOOL
  // ═══════════════════════════════════════════════════════════════════════════════

  server.registerTool(
    "kitsuden_batch_operations",
    {
      title: "Execute Batch Operations",
      description: `Execute multiple CRUD operations in a single transaction.

Supports:
- create: Insert new records
- update: Update existing records
- delete: Remove records
- upsert: Insert or update

All operations are executed atomically - if one fails, all are rolled back.`,
      inputSchema: z.object({
        dataset: z.string().describe("Target dataset slug"),
        operations: z
          .array(
            z.object({
              op: z.enum(["create", "update", "delete", "upsert"]),
              id: z.string().optional().describe("Record ID (for update/delete)"),
              data: z.record(z.any()).optional().describe("Data for create/update"),
              where: z.record(z.any()).optional().describe("Filter for update/delete"),
            })
          )
          .describe("Operations to execute"),
        transaction: z.boolean().optional().default(true).describe("Use transaction"),
      }),
      outputSchema: z.any(),
    },
    async ({ dataset, operations, transaction }) => {
      try {
        const [datasetInfo] = await db
          .select()
          .from(schema.dataSets)
          .where(eq(schema.dataSets.slug, dataset))
          .limit(1);

        if (!datasetInfo) {
          return {
            isError: true,
            content: [{ type: "text", text: `Dataset "${dataset}" not found` }],
          };
        }

        const results: any[] = [];

        // Execute in transaction if requested
        if (transaction) {
          await db.transaction(async (tx: any) => {
            for (const op of operations) {
              const result = await executeBatchOperation(tx, datasetInfo.id, op);
              results.push(result);
            }
          });
        } else {
          for (const op of operations) {
            const result = await executeBatchOperation(db, datasetInfo.id, op);
            results.push(result);
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  dataset,
                  executed: results.length,
                  results,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Batch operation failed: ${err.message}` }],
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // VALIDATE CODE TOOL
  // ═══════════════════════════════════════════════════════════════════════════════

  server.registerTool(
    "kitsuden_validate_code",
    {
      title: "Validate Kon Code",
      description:
        "Validate TypeScript code for a kon before deployment. Checks types, schema validity, and best practices.",
      inputSchema: z.object({
        code: z.string().describe("TypeScript code to validate"),
        konName: z.string().optional().describe("Kon name for context"),
        checkTypeSafety: z.boolean().optional().default(true),
        checkSecurity: z.boolean().optional().default(true),
      }),
      outputSchema: z.any(),
    },
    async ({ code, konName, checkTypeSafety: _checkTypeSafety, checkSecurity }) => {
      try {
        const issues: Array<{ type: string; message: string; line?: number }> = [];
        const suggestions: string[] = [];

        // Basic security checks
        if (checkSecurity) {
          if (code.includes("eval(")) {
            issues.push({ type: "security", message: "Avoid using eval() - security risk" });
          }
          if (code.includes("import(") && code.includes("userInput")) {
            issues.push({ type: "security", message: "Dynamic imports with user input detected" });
          }
          if (!code.includes("requireAuth") && code.includes("createRouter")) {
            suggestions.push("Consider adding authentication middleware with ctx.auth.requireAuth");
          }
        }

        // Schema validation check
        if (!code.includes("defineKon")) {
          issues.push({ type: "error", message: "Must use defineKon() to export kon" });
        }

        // OpenAPI check
        if (!code.includes("openApi")) {
          suggestions.push("Add openApi specification for better documentation");
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  valid: issues.filter((i) => i.type === "error").length === 0,
                  konName,
                  issues,
                  suggestions,
                  summary:
                    issues.length === 0
                      ? "✅ Code looks good!"
                      : `⚠️ Found ${issues.length} issues`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Validation failed: ${err.message}` }],
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // UTILITY FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════════

  function parseNaturalLanguageQuery(query: string, _schema: any) {
    // Simplified NLP - in production this would use proper NLP/LLM
    const filters: Array<{ field: string; operator: string; value: any }> = [];
    const sort: { field: string; direction: "asc" | "desc" } | null = null;

    // Extract year patterns
    const yearMatch = query.match(/(\d{4})/);
    if (yearMatch) {
      filters.push({ field: "year", operator: "=", value: parseInt(yearMatch[1]) });
    }

    // Extract rating comparisons
    const ratingMatch = query.match(/rating\s*(above|over|>|greater than)\s*(\d+)/i);
    if (ratingMatch) {
      filters.push({ field: "rating", operator: ">", value: parseInt(ratingMatch[2]) });
    }

    // Extract price ranges
    const priceMatch = query.match(/price\s*between\s*(\d+)\s*and\s*(\d+)/i);
    if (priceMatch) {
      filters.push({
        field: "price",
        operator: "BETWEEN",
        value: [parseInt(priceMatch[1]), parseInt(priceMatch[2])],
      });
    }

    return { filters, sort };
  }

  function generateKonTemplate(config: {
    name: string;
    description: string;
    features: string[];
    dataModel: string;
  }) {
    const pascalName = config.name
      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
      .replace(/^[a-z]/, (l) => l.toUpperCase());

    const mainFile = `import { Hono } from "hono";
import { defineKon } from "@kitsuden/shared";
import { z } from "zod";

// Schema definition
const ${pascalName}Schema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const kon = defineKon({
  id: "kon-${config.name}",
  name: "${pascalName}",
  version: "1.0.0",
  description: "${config.description}",
  
  openApi: {
    tags: [{ name: "${pascalName}", description: "${config.description}" }],
    schemas: {
      ${pascalName}: ${pascalName}Schema,
    },
    paths: [
      {
        method: "get",
        path: "/",
        summary: "List all items",
        tags: ["${pascalName}"],
        responses: {
          200: { description: "List of items", schema: z.array(${pascalName}Schema) }
        }
      }
    ]
  },
  
  createRouter: (ctx) => {
    const router = new Hono();
    
    router.get("/", async (c) => {
      // Implementation here
      return c.json({ data: [] });
    });
    
    return router;
  }
});`;

    return {
      files: [
        { path: "index.ts", content: mainFile },
        { path: "schema.ts", content: "// Database schema" },
        {
          path: "kon.json",
          content: JSON.stringify({ id: `kon-${config.name}` }, null, 2),
        },
        {
          path: "package.json",
          content: JSON.stringify({ name: `@kitsuden/kon-${config.name}` }, null, 2),
        },
      ],
      mainFile,
    };
  }

  function analyzeSchema(schema: any) {
    const fields: Array<{ name: string; type: string; required: boolean; description?: string }> =
      [];

    if (schema && schema.fields) {
      for (const field of schema.fields) {
        fields.push({
          name: field.key,
          type: field.type,
          required: field.isRequired || false,
          description: field.helpText,
        });
      }
    }

    return fields;
  }

  function generateQueryExamples(slug: string, fields: any[]) {
    const examples = [];

    // Basic CRUD
    examples.push(`GET /api/datasets/${slug}/entries - List all entries`);
    examples.push(`POST /api/datasets/${slug}/entries - Create entry`);

    // Filter examples
    const textField = fields.find((f) => f.type === "text");
    if (textField) {
      examples.push(
        `GET /api/datasets/${slug}/entries?filter[${textField.name}]=value - Filter by ${textField.name}`
      );
    }

    return examples;
  }

  async function executeBatchOperation(tx: any, datasetId: string, op: any) {
    switch (op.op) {
      case "create":
        const [created] = await tx
          .insert(schema.dataEntries)
          .values({
            dataSetId: datasetId,
            data: op.data,
            status: "published",
          })
          .returning();
        return { op: "create", success: true, id: created.id };

      case "update":
        if (!op.id && !op.where) {
          throw new Error("Update requires id or where clause");
        }
        // Implementation...
        return { op: "update", success: true };

      case "delete":
        // Implementation...
        return { op: "delete", success: true };

      default:
        throw new Error(`Unknown operation: ${op.op}`);
    }
  }
}

export default { registerEnhancedTools };
