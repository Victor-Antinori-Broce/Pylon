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
2. **API Key** - Bearer token for integrations
3. **Agent Token** - For AI agents (grm_agent_*)

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
    logger.error("Failed to convert Zod schema to JSON Schema", { error, name });
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
  
  logger.info("Generating OpenAPI spec", { 
    totalGrimoires: grimoires.length, 
    includedGrimoires: filteredGrimoires.length 
  });
  
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
  
  // Process each grimoire
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
    if (grimoire.openApi.webhooks) {
      if (!spec.webhooks) {
        spec.webhooks = {};
      }
      
      for (const [webhookName, webhookDef] of Object.entries(grimoire.openApi.webhooks)) {
        const prefixedName = `${grimoirePrefix}_${webhookName}`;
        spec.webhooks[prefixedName] = {
          post: {
            summary: webhookDef.post.summary,
            description: webhookDef.post.description,
            requestBody: {
              content: {
                "application/json": {
                  schema: zodToOpenApiSchema(
                    webhookDef.post.requestBody.content["application/json"].schema,
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

export default {
  generateOpenAPISpec,
  generateGrimoireSpec,
  getOperationId,
  listOperations,
};
