/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * OPENAPI AGGREGATOR - Dynamic OpenAPI Spec Generation from Kons
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This module aggregates OpenAPI specifications from all loaded kons
 * into a single unified API specification.
 *
 * Features:
 * - Auto-generates OpenAPI 3.0.0 spec from kon definitions
 * - Converts Zod schemas to JSON Schema
 * - Prefixes schemas with kon ID to avoid conflicts
 * - Auto-generates operationIds for code generation
 * - Supports tags, webhooks, and reusable components
 */

import { VERSION_DE_KITSUDEN, accesoADataset, camposDelSchema, type OperacionDeKon , KonDefinition, KonOpenApiPath, OpenApiMethod } from "@kitsuden/shared";
import type {
  OpenAPIObject,
  PathItemObject,
  OperationObject,
  ParameterObject,
  SchemaObject,
} from "openapi3-ts/oas30";
import type { ZodTypeAny } from "zod";

import { db } from "../db";
import { dataSets } from "../db/schema";

import { logger } from "./logger";
import { checkReadAccess, type PolicyJson, type RLSUser } from "./rls-builder";
import { componentesComunes, esquemaJson, operacionOpenApi } from "./operaciones-openapi";
import { operacionesDelNucleo } from "./operaciones-del-nucleo";
import { rutasDeKons } from "./rutas-de-kons";

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
  /** Include only specific kons (default: all) */
  includeKons?: string[];
  /** Exclude specific kons */
  excludeKons?: string[];
  /**
   * Quién pide el documento. Solo se describen los datasets que ESTA identidad
   * puede leer; sin identidad (o `null`), los de lectura pública.
   */
  usuario?: RLSUser | null;
}

/**
 * ¿Sale este dataset en el documento OpenAPI de esta identidad?
 *
 * Auditoría 2026-11-04 (F11): `/api/docs/openapi.json` no pide sesión y
 * describía TODOS los datasets —nombre, descripción, campos y opciones de sus
 * enums— incluidos los que `GET /api/data-sets` le oculta a quien pregunta. La
 * regla es la de ese listado (`crud.ts`, `puedeVerDataset`): los scopes por
 * dataset del agente deciden primero, el equipo los ve todos, y si no, la
 * política de lectura.
 */
export function datasetVisibleEnDocs(
  ds: { slug: string | null; policyJson: unknown },
  usuario: RLSUser | null | undefined
): boolean {
  const scopes = (usuario as { scopes?: unknown } | null | undefined)?.scopes;
  const acceso = accesoADataset(Array.isArray(scopes) ? (scopes as string[]) : undefined, ds.slug, "read");
  if (acceso) return acceso === "concedido";
  if (usuario?.role === "admin" || usuario?.role === "editor") return true;
  return checkReadAccess((ds.policyJson ?? null) as PolicyJson | null, usuario ?? null);
}

/**
 * Default OpenAPI info
 */
const DEFAULT_INFO = {
  title: "Kitsuden API",
  version: "0.8.0-beta",
  description: `🚀 Kitsuden - Auto-generated API from active kons

## Features

- **Dynamic Datasets**: CRUD operations with flexible schemas
- **Content Management**: Blog, Media, Pages with SEO support
- **Real-time**: WebSocket subscriptions for live updates
- **AI-Native**: MCP Server integration for AI agents
- **Multi-tenant**: Row-Level Security by default

## Authentication

Three methods supported:
1. **Session Cookie** - For web users (Better-Auth)
2. **Agent Token** - For AI agents and machine integrations (kitsuden_agent_*) — recommended
3. **Legacy API Key** - Bearer token (kitsuden_sk_*) — **DEPRECATED**, sunset 2026-08-01. Migrate to kitsuden_agent_*

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
    return esquemaJson(zodSchema) as SchemaObject;
  } catch (error) {
    logger.error({ error, name }, "Failed to convert Zod schema to JSON Schema");
    return { type: "object", description: "Schema conversion failed" };
  }
}

/**
 * Convierte el esquema zod de un cuerpo descubierto a JSON Schema en línea.
 * Si el esquema no es de zod 4 (un kon con otra versión), cae al genérico.
 */
function zodToOpenApiSchemaInline(schema: unknown): SchemaObject {
  try {
    return esquemaJson(schema as ZodTypeAny) as SchemaObject;
  } catch (error) {
    logger.warn({ error }, "No se pudo convertir un esquema zod a JSON Schema");
    return { type: "object", description: "No se pudo convertir el esquema de esta ruta." };
  }
}

/**
 * Añade al spec las rutas DESCUBIERTAS de los kons montados.
 *
 * ── POR QUE ────────────────────────────────────────────────────────────────
 *
 * Hasta ahora solo salía lo declarado a mano en `openApi.paths`, y ningún kon
 * lo declaró: el contrato publicado tenía cero rutas de dominio. Esto las lee
 * del router real (ver `rutas-de-kons.ts`), así que una ruta nueva se documenta
 * sola.
 *
 * Los caminos se publican SIN el prefijo `/api`, porque la URL del servidor ya
 * lo lleva: igual que `/items/...`. Con prefijo, un cliente generado llamaría a
 * `/api/api/esports/...`.
 */
function añadirRutasDescubiertas(
  spec: OpenAPIObject,
  kons: KonDefinition[],
  addedTags: Set<string>,
  filtro: { includeKons?: string[]; excludeKons: string[] }
): void {
  const konPorId = new Map(kons.map((k) => [k.id, k]));
  const usados = new Set<string>();

  for (const ruta of rutasDeKons()) {
    if (filtro.includeKons && !filtro.includeKons.includes(ruta.konId)) continue;
    if (filtro.excludeKons.includes(ruta.konId)) continue;
    // Un comodín (`/admin-asset/*`) no se puede expresar como camino OpenAPI.
    if (ruta.path.includes("*")) continue;

    const metodo = ruta.method.toLowerCase();
    if (!["get", "post", "put", "patch", "delete"].includes(metodo)) continue;

    // ── Operación del SDK de kons: la declaración manda (esquemas de entrada
    // y salida, errores, scope, MCP). Nada de deducirlo de los middlewares.
    if (ruta.operacion) {
      const { konId, declaracion } = ruta.operacion;
      const generada = operacionOpenApi(
        konId,
        ruta.mountPath,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- la declaración viaja como unknown por los metadatos de ruta
        declaracion as OperacionDeKon<any, any, any>
      );
      if (!addedTags.has(konId)) {
        const kon = konPorId.get(konId);
        spec.tags!.push({ name: konId, description: kon?.description ?? kon?.name ?? konId });
        addedTags.add(konId);
      }
      usados.add(String(generada.operacion.operationId));
      const item = (spec.paths![generada.camino] ??= {}) as PathItemObject & Record<string, unknown>;
      if (!item[generada.metodo]) item[generada.metodo] = generada.operacion as unknown as OperationObject;
      continue;
    }

    const camino =
      ruta.path.replace(/^\/api(?=\/|$)/, "").replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}") || "/";

    const tag = ruta.konId;
    if (!addedTags.has(tag)) {
      const kon = konPorId.get(ruta.konId);
      spec.tags!.push({ name: tag, description: kon?.description ?? kon?.name ?? ruta.konId });
      addedTags.add(tag);
    }

    const base =
      ruta.operationId ??
      `${ruta.konId.replace(/^kon-/, "")}_${metodo}_${
        ruta.relativePath.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "root"
      }`;
    let operationId = base;
    for (let n = 2; usados.has(operationId); n++) operationId = `${base}_${n}`;
    usados.add(operationId);

    const parameters: ParameterObject[] = [];
    const deParams = ruta.validation.find((v) => v.target === "param");
    const propsParams = deParams
      ? (zodToOpenApiSchemaInline(deParams.schema).properties ?? {})
      : {};
    for (const [, nombre] of ruta.path.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)) {
      parameters.push({
        name: nombre,
        in: "path",
        required: true,
        schema: (propsParams[nombre] as SchemaObject) ?? { type: "string" },
      });
    }
    const deQuery = ruta.validation.find((v) => v.target === "query");
    if (deQuery) {
      const q = zodToOpenApiSchemaInline(deQuery.schema);
      for (const [nombre, esquema] of Object.entries(q.properties ?? {})) {
        parameters.push({
          name: nombre,
          in: "query",
          required: q.required?.includes(nombre) ?? false,
          schema: esquema as SchemaObject,
        });
      }
    }

    const operation: OperationObject = {
      operationId,
      summary: ruta.summary ?? `${ruta.method} ${camino}`,
      tags: [tag, ...(ruta.tags ?? [])],
      ...(parameters.length > 0 ? { parameters } : {}),
      responses: { "200": { description: "OK" } },
    };

    const notas: string[] = [];
    if (ruta.description) notas.push(ruta.description);

    const cuerpo = ruta.validation.find((v) => v.target === "json" || v.target === "form");
    if (cuerpo) {
      operation.requestBody = {
        required: true,
        content: {
          [cuerpo.target === "form" ? "multipart/form-data" : "application/json"]: {
            schema: zodToOpenApiSchemaInline(cuerpo.schema),
          },
        },
      };
      operation.responses["422"] = {
        description:
          "Validación fallida o campos desconocidos. `error.details.unknownKeys` dice cuál " +
          "sobra y `didYouMean` el nombre correcto.",
      };
      notas.push("Los campos que no están en el esquema se RECHAZAN con 422; no se ignoran.");
    }

    if (ruta.auth === "required") {
      operation.security = [{ bearerAuth: [] }, { cookieAuth: [] }];
      operation.responses["401"] = {
        description:
          "Falta credencial: cookie de sesión o `Authorization: Bearer kitsuden_agent_*`.",
      };
    } else if (ruta.auth === "optional") {
      operation.security = [{}, { bearerAuth: [] }, { cookieAuth: [] }];
    } else {
      operation.security = [];
    }

    if (ruta.section) {
      (operation as unknown as Record<string, unknown>)["x-kitsuden-section"] = ruta.section;
      operation.responses["409"] = {
        description: `La sección «${ruta.section}» del kon está apagada; la respuesta dice cómo encenderla.`,
      };
      notas.push(`Requiere la sección «${ruta.section}» encendida.`);
    }

    if (notas.length > 0) operation.description = notas.join("\n\n");

    const item = (spec.paths![camino] ??= {}) as PathItemObject & Record<string, unknown>;
    if (!item[metodo]) item[metodo] = operation;
  }
}

/**
 * Convert a kon path definition to OpenAPI PathItemObject
 */
function convertPathToOpenApi(
  kon: KonDefinition,
  pathDef: KonOpenApiPath
): { method: OpenApiMethod; pathItem: OperationObject } {
  const method = pathDef.method.toLowerCase() as OpenApiMethod;
  const konPrefix = kon.id.replace(/^kon-/, "");

  // Generate operationId if not provided
  const operationId =
    pathDef.operationId || `${konPrefix}_${method}_${pathDef.path.replace(/[^a-zA-Z0-9]/g, "_")}`;

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
    tags: pathDef.tags || [kon.name],
    parameters: parameters.length > 0 ? parameters : undefined,
    requestBody,
    responses,
    security: pathDef.requireAuth !== false ? [{ bearerAuth: [] }, { cookieAuth: [] }] : undefined,
  };

  // Clean undefined values
  Object.keys(operation).forEach((key) => {
    if (operation[key as keyof OperationObject] === undefined) {
      delete operation[key as keyof OperationObject];
    }
  });

  return { method, pathItem: operation };
}

/**
 * Convert kon path to full API path
 */
function getFullPath(kon: KonDefinition, path: string): string {
  const mountPath = kon.mountPath || `/api/${kon.id.replace(/^kon-/, "")}`;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  // Replace :param with {param} for OpenAPI
  const openApiPath = cleanPath.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, "{$1}");
  return `${mountPath}${openApiPath}`;
}

/**
 * Generate complete OpenAPI specification from kons
 */
export async function generateOpenAPISpec(
  kons: KonDefinition[],
  options: OpenApiAggregatorOptions = {}
): Promise<OpenAPIObject> {
  const {
    title = DEFAULT_INFO.title,
    version = VERSION_DE_KITSUDEN,
    description = DEFAULT_INFO.description,
    servers = [
      { url: "http://localhost:3001/api", description: "Local development" },
      {
        url: "{protocol}://{host}/api",
        description: "Production",
        variables: {
          protocol: { default: "https", enum: ["https", "http"] },
          host: { default: "localhost:3000" },
        },
      },
    ],
    includeKons,
    excludeKons = [],
    usuario = null,
  } = options;

  // Filter kons
  const filteredKons = kons.filter((g) => {
    if (includeKons && !includeKons.includes(g.id)) return false;
    if (excludeKons.includes(g.id)) return false;
    return g.openApi !== undefined;
  });

  logger.info(
    {
      totalKons: kons.length,
      includedKons: filteredKons.length,
    },
    "Generating OpenAPI spec"
  );

  // Initialize spec
  const spec: OpenAPIObject = {
    // 3.1: los esquemas son JSON Schema de verdad (los del SDK de kons salen
    // de zod tal cual). Lo valida tests/unit/cobertura-de-operaciones.test.ts
    // con un validador real.
    openapi: "3.1.0",
    info: {
      title,
      version,
      description,
      contact: {
        name: "Kitsuden Team",
        url: "https://kitsuden.dev",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers,
    paths: {},
    components: {
      // `Problem`: el cuerpo de error (RFC 9457) al que apuntan las
      // respuestas de error de las operaciones del SDK.
      schemas: { ...(componentesComunes().schemas as Record<string, SchemaObject>) },
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
    /** Lista de campos u objeto `{fields}`: se lee con `camposDelSchema`. */
    schema: unknown;
  }> = [];

  try {
    // Sin caché a propósito: el documento depende de quién lo pide.
    const todos = await db
      .select({
        id: dataSets.id,
        name: dataSets.name,
        slug: dataSets.slug,
        description: dataSets.description,
        schema: dataSets.schema,
        policyJson: dataSets.policyJson,
      })
      .from(dataSets);
    datasets = todos.filter((ds) => datasetVisibleEnDocs(ds, usuario));
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
    // `data_sets.schema` tiene dos formas (lista de campos u objeto `{fields}`)
    // y puede venir vacía como `{}`. Iterarla tal cual tumbaba el documento
    // entero con 500 «{} is not iterable». `camposDelSchema` normaliza las dos.
    for (const campo of camposDelSchema(ds.schema)) {
      const nombre = campo.fieldName ?? campo.name;
      const tipo = campo.fieldType ?? campo.type;
      if (typeof nombre !== "string" || typeof tipo !== "string") continue;
      const prop = datasetFieldTypeToJsonSchema(
        tipo,
        typeof campo.options === "string" ? campo.options : undefined
      );
      if (prop) {
        properties[nombre] = prop;
        if (campo.required) required.push(nombre);
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
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
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
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
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
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
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
    description: "Standard REST interface for any collection (datasets or kon tables)",
  });
  addedTags.add("Unified Items");

  const itemsTag = "Unified Items";

  spec.paths!["/items/{collection}"] = {
    get: {
      operationId: "items_list",
      summary: "List items in a collection",
      description: "Works for both datasets (JSONB) and native kon tables.",
      tags: [itemsTag],
      parameters: [
        {
          name: "collection",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "Dataset slug or table name",
        },
        { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
        { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        {
          name: "sort",
          in: "query",
          schema: { type: "string" },
          description: "e.g. -createdAt or name",
        },
        {
          name: "where",
          in: "query",
          schema: { type: "string" },
          description: "JSON filter object",
        },
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
      parameters: [{ name: "collection", in: "path", required: true, schema: { type: "string" } }],
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
  // Process each kon
  // ═══════════════════════════════════════════════════════════════════════════
  // Las rutas que los kons tienen MONTADAS, se hayan declarado o no.
  añadirRutasDescubiertas(spec, kons, addedTags, { includeKons, excludeKons });

  // Las operaciones del SDK que monta el núcleo (permisos de agentes,
  // aprobación humana, estado de las propuestas): no son de un kon montado.
  for (const { konId, mountPath, descripcion, operaciones } of operacionesDelNucleo()) {
    if (includeKons && !includeKons.includes(konId)) continue;
    if (excludeKons.includes(konId)) continue;
    if (!addedTags.has(konId)) {
      spec.tags!.push({ name: konId, description: descripcion });
      addedTags.add(konId);
    }
    for (const op of operaciones) {
      const g = operacionOpenApi(konId, mountPath, op);
      const item = (spec.paths![g.camino] ??= {}) as PathItemObject & Record<string, unknown>;
      if (!item[g.metodo]) item[g.metodo] = g.operacion as unknown as OperationObject;
    }
  }

  for (const kon of filteredKons) {
    if (!kon.openApi) continue;

    const konPrefix = kon.id.replace(/^kon-/, "");

    // Add tags
    if (kon.openApi.tags) {
      for (const tag of kon.openApi.tags) {
        if (!addedTags.has(tag.name)) {
          spec.tags!.push(tag);
          addedTags.add(tag.name);
        }
      }
    }

    // Add default tag for kon
    if (!addedTags.has(kon.name)) {
      spec.tags!.push({
        name: kon.name,
        description: kon.description || `${kon.name} endpoints`,
      });
      addedTags.add(kon.name);
    }

    // Register schemas (with kon prefix to avoid conflicts)
    if (kon.openApi.schemas) {
      for (const [schemaName, zodSchema] of Object.entries(kon.openApi.schemas)) {
        const prefixedName = `${konPrefix}_${schemaName}`;
        spec.components!.schemas![prefixedName] = zodToOpenApiSchema(zodSchema, prefixedName);
      }
    }

    // Register paths
    for (const pathDef of kon.openApi.paths) {
      const fullPath = getFullPath(kon, pathDef.path);
      const { method, pathItem } = convertPathToOpenApi(kon, pathDef);

      if (!spec.paths![fullPath]) {
        spec.paths![fullPath] = {};
      }

      (spec.paths![fullPath] as PathItemObject)[method] = pathItem;
    }

    // Register webhooks
    if ((kon.openApi as any).webhooks) {
      if (!(spec as any).webhooks) {
        (spec as any).webhooks = {};
      }

      for (const [webhookName, webhookDef] of Object.entries((kon.openApi as any).webhooks)) {
        const prefixedName = `${konPrefix}_${webhookName}`;
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
 * Generate OpenAPI spec for a single kon
 */
export async function generateKonSpec(
  kon: KonDefinition,
  /** Quién lo pide: ver `OpenApiAggregatorOptions.usuario`. */
  usuario: RLSUser | null = null
): Promise<OpenAPIObject | null> {
  // Antes devolvía `null` para todo kon sin declaración manual, que eran todos.
  const tieneRutas = rutasDeKons().some((r) => r.konId === kon.id);
  if (!kon.openApi && !tieneRutas) {
    return null;
  }

  return generateOpenAPISpec([kon], {
    includeKons: [kon.id],
    title: `${kon.name} API`,
    description: kon.description || `${kon.name} endpoints`,
    usuario,
  });
}

/**
 * Get operation ID for a specific endpoint
 */
export function getOperationId(
  kon: KonDefinition,
  method: string,
  path: string
): string | undefined {
  if (!kon.openApi) return undefined;

  const pathDef = kon.openApi.paths.find(
    (p) => p.method === method.toLowerCase() && p.path === path
  );

  if (!pathDef) return undefined;

  const konPrefix = kon.id.replace(/^kon-/, "");
  return (
    pathDef.operationId ||
    `${konPrefix}_${method.toLowerCase()}_${path.replace(/[^a-zA-Z0-9]/g, "_")}`
  );
}

/**
 * List all available operations across kons
 */
export function listOperations(kons: KonDefinition[]): Array<{
  konId: string;
  operationId: string;
  method: string;
  path: string;
  summary: string;
  tags: string[];
}> {
  const operations: Array<{
    konId: string;
    operationId: string;
    method: string;
    path: string;
    summary: string;
    tags: string[];
  }> = [];

  for (const kon of kons) {
    if (!kon.openApi) continue;

    const konPrefix = kon.id.replace(/^kon-/, "");

    for (const path of kon.openApi.paths) {
      operations.push({
        konId: kon.id,
        operationId:
          path.operationId ||
          `${konPrefix}_${path.method}_${path.path.replace(/[^a-zA-Z0-9]/g, "_")}`,
        method: path.method.toUpperCase(),
        path: getFullPath(kon, path.path),
        summary: path.summary,
        tags: path.tags || [kon.name],
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
  generateKonSpec,
  getOperationId,
  listOperations,
};
