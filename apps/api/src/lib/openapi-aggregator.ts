/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * OPENAPI AGGREGATOR - Dynamic OpenAPI Spec Generation from Grimoires
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This module aggregates OpenAPI specifications from all loaded grimoires
 * into a single unified API specification.
 * 
 * Features:
 * - Auto-generates OpenAPI 3.0.0 spec from grimoire definitions
 * - Converts Zod schemas to JSON Schema
 * - Prefixes schemas with grimoire ID to avoid conflicts
 * - Auto-generates operationIds for code generation
 * - Supports tags, webhooks, and reusable components
 */

import type { OpenAPIObject, PathItemObject, OperationObject, ParameterObject, SchemaObject } from "openapi3-ts/oas30";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";
import type { GrimoireDefinition, GrimoireOpenApiPath, OpenApiMethod } from "@gremius/shared";
import { logger } from "./logger";
import { db } from "../db";
import { dataSets } from "../db/schema";

/**
 * Options for generating OpenAPI specification
 */
export interface OpenApiAggregatorOptions {
  /** API title */
  title?: string;
  /** API version */
  version?: string;
  /** API description */
  description?: string;
  /** Server URLs */
  servers?: Array<{ url: string; description?: string }>;
  /** Include only specific grimoires (default: all) */
  includeGrimoires?: string[];
  /** Exclude specific grimoires */
  excludeGrimoires?: string[];
}

/**
 * Default OpenAPI info
 */
const DEFAULT_INFO = {
  title: "GremiusCMS API",
  version: "0.8.0-beta",
  description: `🚀 GremiusCMS - Auto-generated API from active grimoires

## Features

- **Dynamic Datasets**: CRUD operations with flexible schemas
- **Content Management**: Blog, Media, Pages with SEO support
- **Real-time**: WebSocket subscriptions for live updates
- **AI-Native**: MCP Server integration for AI agents
- **Multi-tenant**: Row-Level Security by default

## Authentication

Three methods supported:
1. **Session Cookie** - For web users (Better-Auth)
2. **Agent Token** - For AI agents and machine integrations (grm_agent_*) — recommended
3. **Legacy API Key** - Bearer token (gremius_sk_*) — **DEPRECATED**, sunset 2026-08-01. Migrate to grm_agent_*

\`\`\`
Authorization: Bearer your_token_here
\`\`\`
`,
};

/**
 * Convert Zod schema to JSON Schema object
 */
function zodToOpenApiSchema(zodSchema: ZodTypeAny, name?: string): SchemaObject {
  try {
    const jsonSchema = zodToJsonSchema(zodSchema, {
      name: name || "Schema",
      $refStrategy: "none", // Inline all references
    });
    
    // Remove the $schema property if present
    const { $schema, ...schemaWithoutMeta } = jsonSchema as any;
    
    return schemaWithoutMeta as SchemaObject;
  } catch (error) {
    logger.error({ error, name }, "Failed to convert Zod schema to JSON Schema");
    return { type: "object", description: "Schema conversion failed" };
  }
}

/**
 * Convert a grimoire path definition to OpenAPI PathItemObject
 */
function convertPathToOpenApi(
  grimoire: GrimoireDefinition,
  pathDef: GrimoireOpenApiPath
): { method: OpenApiMethod; pathItem: OperationObject } {
  const method = pathDef.method.toLowerCase() as OpenApiMethod;
  const grimoirePrefix = grimoire.id.replace(/^grimoire-/, "");
  
  // Generate operationId if not provided
  const operationId = pathDef.operationId || 
    `${grimoirePrefix}_${method}_${pathDef.path.replace(/[^a-zA-Z0-9]/g, "_")}`;
  
  // Build parameters
  const parameters: ParameterObject[] = [];
  
  // Path parameters
  if (pathDef.params) {
    const paramSchema = zodToOpenApiSchema(pathDef.params, "Params");
    if (paramSchema.properties) {
      Object.entries(paramSchema.properties).forEach(([name, schema]) => {
        parameters.push({
          name,
          in: "path",
          required: paramSchema.required?.includes(name) ?? false,
          schema: schema as SchemaObject,
        });
      });
    }
  }
  
  // Query parameters
  if (pathDef.query) {
    const querySchema = zodToOpenApiSchema(pathDef.query, "Query");
    if (querySchema.properties) {
      Object.entries(querySchema.properties).forEach(([name, schema]) => {
        parameters.push({
          name,
          in: "query",
          required: querySchema.required?.includes(name) ?? false,
          schema: schema as SchemaObject,
          description: (schema as any).description,
        });
      });
    }
  }
  
  // Build request body
  let requestBody: OperationObject["requestBody"] = undefined;
  if (pathDef.body) {
    requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: zodToOpenApiSchema(pathDef.body, "RequestBody"),
        },
      },
    };
  }
  
  // Build responses
  const responses: OperationObject["responses"] = {};
  for (const [statusCode, responseDef] of Object.entries(pathDef.responses)) {
    responses[statusCode] = {
      description: responseDef.description,
      content: {
        "application/json": {
          schema: zodToOpenApiSchema(responseDef.schema, `Response${statusCode}`),
        },
      },
    };
  }
  
  // Build operation
  const operation: OperationObject = {
    operationId,
    summary: pathDef.summary,
    description: pathDef.description,
    tags: pathDef.tags || [grimoire.name],
    parameters: parameters.length > 0 ? parameters : undefined,
    requestBody,
    responses,
    security: pathDef.requireAuth !== false ? [{ bearerAuth: [] }, { cookieAuth: [] }] : undefined,
  };
  
  // Clean undefined values
  Object.keys(operation).forEach(key => {
    if (operation[key as keyof OperationObject] === undefined) {
      delete operation[key as keyof OperationObject];
    }
  });
  
  return { method, pathItem: operation };
}

/**
 * Convert grimoire path to full API path
 */
function getFullPath(grimoire: GrimoireDefinition, path: string): string {
  const mountPath = grimoire.mountPath || `/api/${grimoire.id.replace(/^grimoire-/, "")}`;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  // Replace :param with {param} for OpenAPI
  const openApiPath = cleanPath.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, "{$1}");
  return `${mountPath}${openApiPath}`;
}

/**
 * Generate complete OpenAPI specification from grimoires
 */
export async function generateOpenAPISpec(
  grimoires: GrimoireDefinition[],
  options: OpenApiAggregatorOptions = {}
): Promise<OpenAPIObject> {
  const { 
    title = DEFAULT_INFO.title,
    version = DEFAULT_INFO.version,
    description = DEFAULT_INFO.description,
    servers = [
      { url: "http://localhost:3001/api", description: "Local development" },
      { url: "{protocol}://{host}/api", description: "Production" },
    ],
    includeGrimoires,
    excludeGrimoires = [],
  } = options;
  
  // Filter grimoires
  const filteredGrimoires = grimoires.filter(g => {
    if (includeGrimoires && !includeGrimoires.includes(g.id)) return false;
    if (excludeGrimoires.includes(g.id)) return false;
    return g.openApi !== undefined;
  });
  
  logger.info({ 
    totalGrimoires: grimoires.length, 
    includedGrimoires: filteredGrimoires.length 
  }, "Generating OpenAPI spec");
  
  // Initialize spec
  const spec: OpenAPIObject = {
    openapi: "3.0.0",
    info: {
      title,
      version,
      description,
      contact: {
        name: "Gremius Team",
        url: "https://gremius.dev",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers,
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "API Key or Session JWT",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "session",
          description: "Better-Auth session cookie",
        },
      },
    },
    tags: [],
  };
  
  const addedTags = new Set<string>();

  // ═══════════════════════════════════════════════════════════════════════════
  // DYNAMIC DATASET SCHEMAS — Auto-discover from data_sets table
  // ═══════════════════════════════════════════════════════════════════════════
  let datasets: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    schema: Array<{
      fieldName: string;
      fieldType: string;
      required?: boolean;
      options?: string;
      defaultValue?: string;
    }> | null;
  }> = [];

  try {
    datasets = await db.select({
      id: dataSets.id,
      name: dataSets.name,
      slug: dataSets.slug,
      description: dataSets.description,
      schema: dataSets.schema,
    }).from(dataSets);
  } catch (err) {
    logger.warn({ err }, "Could not fetch datasets for OpenAPI spec");
  }

  if (datasets.length > 0) {
    spec.tags!.push({
      name: "Datasets",
      description: `Auto-generated endpoints for ${datasets.length} dataset(s)`,
    });
    addedTags.add("Datasets");
  }

  for (const ds of datasets) {
    const schemaName = `Dataset_${ds.slug}`;
    const properties: Record<string, SchemaObject> = {};
    const required: string[] = ["id"];

    // ID is always present
    properties.id = { type: "string", format: "uuid", readOnly: true };

    // Build properties from dataset schema
    for (const field of (ds.schema || [])) {
      const prop = datasetFieldTypeToJsonSchema(field.fieldType, field.options);
      if (prop) {
        properties[field.fieldName] = prop;
        if (field.required) required.push(field.fieldName);
      }
    }

    // Timestamps
    properties.createdAt = { type: "string", format: "date-time", readOnly: true };
    properties.updatedAt = { type: "string", format: "date-time", readOnly: true };

    spec.components!.schemas![schemaName] = {
      type: "object",
      description: ds.description || `${ds.name} dataset schema`,
      properties,
      required,
    } as SchemaObject;

    // Per-dataset paths
    const dsTag = "Datasets";
    const dsPath = `/items/${ds.slug}`;
    const dsItemPath = `/items/${ds.slug}/{id}`;

    spec.paths![dsPath] = {
      get: {
        operationId: `dataset_${ds.slug}_list`,
        summary: `List ${ds.name}`,
        description: `Paginated list of items in the "${ds.name}" dataset.`,
        tags: [dsTag],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          { name: "sort", in: "query", schema: { type: "string" } },
          { name: "where", in: "query", schema: { type: "string" }, description: "JSON filter" },
        ],
        responses: {
          "200": {
            description: `Paginated list of ${ds.name}`,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    docs: { type: "array", items: { $ref: `#/components/schemas/${schemaName}` } },
                    totalDocs: { type: "integer" },
                    page: { type: "integer" },
                    limit: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        operationId: `dataset_${ds.slug}_create`,
        summary: `Create ${ds.name}`,
        tags: [dsTag],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${schemaName}` },
            },
          },
        },
        responses: {
          "201": { description: `${ds.name} created` },
        },
      },
    };

    spec.paths![dsItemPath] = {
      get: {
        operationId: `dataset_${ds.slug}_get`,
        summary: `Get a ${ds.name}`,
        tags: [dsTag],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: `${ds.name} item`,
            content: {
              "application/json": {
                schema: { $ref: `#/components/schemas/${schemaName}` },
              },
            },
          },
          "404": { description: "Not found" },
        },
      },
      patch: {
        operationId: `dataset_${ds.slug}_update`,
        summary: `Update a ${ds.name}`,
        tags: [dsTag],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${schemaName}` },
            },
          },
        },
        responses: {
          "200": { description: `${ds.name} updated` },
          "404": { description: "Not found" },
        },
      },
      delete: {
        operationId: `dataset_${ds.slug}_delete`,
        summary: `Delete a ${ds.name}`,
        tags: [dsTag],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: `${ds.name} deleted` },
          "404": { description: "Not found" },
        },
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UNIFIED ITEMS API — Static paths for /api/items/{collection}
  // ═══════════════════════════════════════════════════════════════════════════
  spec.tags!.push({
    name: "Unified Items",
    description: "Standard REST interface for any collection (datasets or grimoire tables)",
  });
  addedTags.add("Unified Items");

  const itemsTag = "Unified Items";

  spec.paths!["/items/{collection}"] = {
    get: {
      operationId: "items_list",
      summary: "List items in a collection",
      description: "Works for both datasets (JSONB) and native grimoire tables.",
      tags: [itemsTag],
      parameters: [
        { name: "collection", in: "path", required: true, schema: { type: "string" }, description: "Dataset slug or table name" },
        { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
        { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        { name: "sort", in: "query", schema: { type: "string" }, description: "e.g. -createdAt or name" },
        { name: "where", in: "query", schema: { type: "string" }, description: "JSON filter object" },
      ],
      responses: {
        "200": { description: "Paginated list of items" },
        "404": { description: "Collection not found" },
      },
    },
    post: {
      operationId: "items_create",
      summary: "Create an item in a collection",
      tags: [itemsTag],
      parameters: [
        { name: "collection", in: "path", required: true, schema: { type: "string" } },
      ],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: {
        "201": { description: "Item created" },
        "404": { description: "Collection not found" },
      },
    },
  };

  spec.paths!["/items/{collection}/{id}"] = {
    get: {
      operationId: "items_get",
      summary: "Get a single item",
      tags: [itemsTag],
      parameters: [
        { name: "collection", in: "path", required: true, schema: { type: "string" } },
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "Item found" },
        "404": { description: "Item not found" },
      },
    },
    patch: {
      operationId: "items_update",
      summary: "Update an item",
      tags: [itemsTag],
      parameters: [
        { name: "collection", in: "path", required: true, schema: { type: "string" } },
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: {
        "200": { description: "Item updated" },
        "404": { description: "Item not found" },
      },
    },
    delete: {
      operationId: "items_delete",
      summary: "Delete an item",
      tags: [itemsTag],
      parameters: [
        { name: "collection", in: "path", required: true, schema: { type: "string" } },
        { name: "id", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "Item deleted" },
        "404": { description: "Item not found" },
      },
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Process each grimoire
  // ═══════════════════════════════════════════════════════════════════════════
  for (const grimoire of filteredGrimoires) {
    if (!grimoire.openApi) continue;
    
    const grimoirePrefix = grimoire.id.replace(/^grimoire-/, "");
    
    // Add tags
    if (grimoire.openApi.tags) {
      for (const tag of grimoire.openApi.tags) {
        if (!addedTags.has(tag.name)) {
          spec.tags!.push(tag);
          addedTags.add(tag.name);
        }
      }
    }
    
    // Add default tag for grimoire
    if (!addedTags.has(grimoire.name)) {
      spec.tags!.push({
        name: grimoire.name,
        description: grimoire.description || `${grimoire.name} endpoints`,
      });
      addedTags.add(grimoire.name);
    }
    
    // Register schemas (with grimoire prefix to avoid conflicts)
    if (grimoire.openApi.schemas) {
      for (const [schemaName, zodSchema] of Object.entries(grimoire.openApi.schemas)) {
        const prefixedName = `${grimoirePrefix}_${schemaName}`;
        spec.components!.schemas![prefixedName] = zodToOpenApiSchema(zodSchema, prefixedName);
      }
    }
    
    // Register paths
    for (const pathDef of grimoire.openApi.paths) {
      const fullPath = getFullPath(grimoire, pathDef.path);
      const { method, pathItem } = convertPathToOpenApi(grimoire, pathDef);
      
      if (!spec.paths![fullPath]) {
        spec.paths![fullPath] = {};
      }
      
      (spec.paths![fullPath] as PathItemObject)[method] = pathItem;
    }
    
    // Register webhooks
    if ((grimoire.openApi as any).webhooks) {
      if (!(spec as any).webhooks) {
        (spec as any).webhooks = {};
      }
      
      for (const [webhookName, webhookDef] of Object.entries((grimoire.openApi as any).webhooks)) {
        const prefixedName = `${grimoirePrefix}_${webhookName}`;
        (spec as any).webhooks[prefixedName] = {
          post: {
            summary: (webhookDef as any).post.summary,
            description: (webhookDef as any).post.description,
            requestBody: {
              content: {
                "application/json": {
                  schema: zodToOpenApiSchema(
                    (webhookDef as any).post.requestBody.content["application/json"].schema,
                    `${prefixedName}_Payload`
                  ),
                },
              },
            },
          },
        };
      }
    }
  }
  
  return spec;
}

/**
 * Generate OpenAPI spec for a single grimoire
 */
export async function generateGrimoireSpec(
  grimoire: GrimoireDefinition
): Promise<OpenAPIObject | null> {
  if (!grimoire.openApi) {
    return null;
  }
  
  return generateOpenAPISpec([grimoire], {
    title: `${grimoire.name} API`,
    description: grimoire.description || `${grimoire.name} endpoints`,
  });
}

/**
 * Get operation ID for a specific endpoint
 */
export function getOperationId(
  grimoire: GrimoireDefinition,
  method: string,
  path: string
): string | undefined {
  if (!grimoire.openApi) return undefined;
  
  const pathDef = grimoire.openApi.paths.find(
    p => p.method === method.toLowerCase() && p.path === path
  );
  
  if (!pathDef) return undefined;
  
  const grimoirePrefix = grimoire.id.replace(/^grimoire-/, "");
  return pathDef.operationId || `${grimoirePrefix}_${method.toLowerCase()}_${path.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

/**
 * List all available operations across grimoires
 */
export function listOperations(grimoires: GrimoireDefinition[]): Array<{
  grimoireId: string;
  operationId: string;
  method: string;
  path: string;
  summary: string;
  tags: string[];
}> {
  const operations: Array<{
    grimoireId: string;
    operationId: string;
    method: string;
    path: string;
    summary: string;
    tags: string[];
  }> = [];
  
  for (const grimoire of grimoires) {
    if (!grimoire.openApi) continue;
    
    const grimoirePrefix = grimoire.id.replace(/^grimoire-/, "");
    
    for (const path of grimoire.openApi.paths) {
      operations.push({
        grimoireId: grimoire.id,
        operationId: path.operationId || `${grimoirePrefix}_${path.method}_${path.path.replace(/[^a-zA-Z0-9]/g, "_")}`,
        method: path.method.toUpperCase(),
        path: getFullPath(grimoire, path.path),
        summary: path.summary,
        tags: path.tags || [grimoire.name],
      });
    }
  }
  
  return operations;
}

/**
 * Convert a dataset field type to JSON Schema property
 */
function datasetFieldTypeToJsonSchema(
  fieldType: string,
  options?: string
): SchemaObject | undefined {
  switch (fieldType) {
    case "text":
    case "email":
    case "url":
    case "richtext":
      return { type: "string" };
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "date":
      return { type: "string", format: "date-time" };
    case "select":
      if (options) {
        return { type: "string", enum: options.split(",").map((o) => o.trim()) };
      }
      return { type: "string" };
    case "json":
      return { type: "object" };
    case "image":
      return { type: "string", format: "uri", description: "Image URL" };
    case "relation":
      return { type: "string", format: "uuid", description: "Related item ID" };
    case "kpi":
      return { type: "number", description: "KPI value" };
    default:
      return { type: "string" };
  }
}

export default {
  generateOpenAPISpec,
  generateGrimoireSpec,
  getOperationId,
  listOperations,
};
