// @ts-nocheck
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * API DOCUMENTATION - Swagger UI & Scalar
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Provides interactive API documentation at /api/docs
 */

import { Hono } from "hono";
import { swaggerUI } from "@hono/swagger-ui";
import type { AppVariables } from "../types/hono";

export const docsRoutes = new Hono<{ Variables: AppVariables }>();

// ═══════════════════════════════════════════════════════════════════════════════
// OPENAPI SPECIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

const openAPIConfig = {
  openapi: "3.0.0",
  info: {
    title: "GremiusCMS API",
    version: "0.5.0",
    description: `🚀 API oficial de GremiusCMS - Headless CMS + BaaS

## Características Principales

- **Datasets**: CRUD dinámico con schema flexible
- **Query Language**: Búsquedas avanzadas con filtros
- **Real-time**: WebSockets para actualizaciones en vivo
- **AI-Native**: MCP Server + Agent capabilities
- **Multi-tenant**: RLS (Row Level Security) por defecto

## Autenticación

Tres métodos soportados:
1. **Session Cookie** (Better-Auth) - Para usuarios humanos
2. **API Key** (Bearer token) - Para integraciones
3. **Agent Token** (grm_agent_*) - Para agents AI

\`\`\`
Authorization: Bearer your_token_here
\`\`\`

## Rate Limiting

- Default: 300 requests/minuto
- Auth endpoints: 5 requests/5 minutos
- MCP endpoints: 200 requests/minuto

Headers incluidos:
- \`X-RateLimit-Limit\`
- \`X-RateLimit-Remaining\`
- \`X-RateLimit-Reset\`

## SDKs Oficiales

- JavaScript/TypeScript: \`@gremius/sdk\`
- Python: \`gremius-python\`
- CLI: \`gremius-cli\`

## Links

- [Documentación](https://docs.gremius.dev)
- [GitHub](https://github.com/gremius/gremius-cms)
- [Support](https://discord.gg/gremius)
`,
    contact: {
      name: "Gremius Team",
      url: "https://gremius.dev",
      email: "support@gremius.dev",
    },
    license: {
      name: "MIT",
      url: "https://opensource.org/licenses/MIT",
    },
  },
  servers: [
    {
      url: "{protocol}://{host}/api",
      description: "Dynamic server",
      variables: {
        protocol: {
          enum: ["http", "https"],
          default: "https",
        },
        host: {
          default: "api.gremius.dev",
        },
      },
    },
    {
      url: "http://localhost:3001/api",
      description: "Local development",
    },
  ],
  tags: [
    {
      name: "Auth",
      description: "Autenticación y autorización",
    },
    {
      name: "Datasets",
      description: "Gestión de colecciones de datos",
    },
    {
      name: "Entries",
      description: "Operaciones CRUD sobre entries",
    },
    {
      name: "Query",
      description: "Búsquedas avanzadas con Gremius QL",
    },
    {
      name: "Batch",
      description: "Operaciones transaccionales en lote",
    },
    {
      name: "Media",
      description: "Gestión de archivos y optimización",
    },
    {
      name: "Grimoires",
      description: "Módulos funcionales del sistema",
    },
    {
      name: "Agents",
      description: "AI Agents y MCP Server",
    },
    {
      name: "Webhooks",
      description: "Eventos HTTP callbacks",
    },
    {
      name: "System",
      description: "Health checks y métricas",
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCALAR API REFERENCE (Moderno, mejor UI)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scalar API Reference - UI moderna para documentación OpenAPI
 * Más bonita y funcional que Swagger UI tradicional
 */
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
// SWAGGER UI (Clásica, familiar)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Swagger UI - La documentación OpenAPI clásica
 * Familiar para muchos developers
 */
docsRoutes.get("/", swaggerUI({
  url: "/api/docs/openapi.json",
  title: "GremiusCMS API Documentation",
}));

// ═══════════════════════════════════════════════════════════════════════════════
// SCALAR REFERENCE
// ═══════════════════════════════════════════════════════════════════════════════

docsRoutes.get("/modern", (c) => {
  return c.html(scalarHtml);
});

// ═══════════════════════════════════════════════════════════════════════════════
// OPENAPI JSON SPEC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/docs/openapi.json
 * 
 * Retorna la especificación OpenAPI completa.
 * Usado por Swagger UI y Scalar.
 */
docsRoutes.get("/openapi.json", async (c) => {
  // En producción, esto vendría de los schemas Zod de cada ruta
  // Por ahora retornamos la configuración base
  const spec = {
    ...openAPIConfig,
    paths: {
      "/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Login de usuario",
          description: "Autentica un usuario y retorna sesión/cookies",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string", minLength: 8 },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Login exitoso",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      user: { $ref: "#/components/schemas/User" },
                      session: { type: "object" },
                    },
                  },
                },
              },
            },
            "401": { description: "Credenciales inválidas" },
            "429": { description: "Rate limit excedido" },
          },
        },
      },
      
      "/datasets": {
        get: {
          tags: ["Datasets"],
          summary: "Listar datasets",
          description: "Obtiene todos los datasets accesibles para el usuario",
          parameters: [
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 50 },
            },
            {
              name: "offset",
              in: "query",
              schema: { type: "integer", default: 0 },
            },
          ],
          responses: {
            "200": {
              description: "Lista de datasets",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Dataset" },
                      },
                      total: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ["Datasets"],
          summary: "Crear dataset",
          description: "Crea un nuevo dataset con schema definido",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DatasetInput" },
              },
            },
          },
          responses: {
            "201": { description: "Dataset creado" },
            "400": { description: "Schema inválido" },
          },
        },
      },
      
      "/datasets/{id}/entries": {
        get: {
          tags: ["Entries"],
          summary: "Listar entries",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "lang",
              in: "query",
              description: "Idioma para campos i18n",
              schema: { type: "string", default: "en" },
            },
            {
              name: "expand",
              in: "query",
              description: "Relaciones a expandir (comma-separated)",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Lista de entries" },
          },
        },
      },
      
      "/query": {
        post: {
          tags: ["Query"],
          summary: "Gremius Query Language",
          description: "Ejecuta queries complejos con filtros, sorting y pagination",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    dataset: { type: "string" },
                    select: { type: "array", items: { type: "string" } },
                    where: { type: "object" },
                    orderBy: { type: "object" },
                    limit: { type: "integer" },
                    offset: { type: "integer" },
                    expand: { type: "array", items: { type: "string" } },
                  },
                },
                example: {
                  dataset: "products",
                  where: {
                    AND: [
                      { price: { gte: 10 } },
                      { category: { in: ["electronics", "gaming"] } },
                    ],
                  },
                  orderBy: { createdAt: "desc" },
                  limit: 20,
                  expand: ["category", "tags"],
                },
              },
            },
          },
          responses: {
            "200": { description: "Resultados de la query" },
          },
        },
      },
      
      "/batch": {
        post: {
          tags: ["Batch"],
          summary: "Operaciones en lote",
          description: "Ejecuta múltiples operaciones en una transacción ACID",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["operations"],
                  properties: {
                    transaction: { type: "boolean", default: true },
                    operations: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          op: { enum: ["create", "update", "delete", "upsert"] },
                          dataset: { type: "string" },
                          data: { type: "object" },
                          where: { type: "object" },
                          alias: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Operaciones completadas" },
            "400": { description: "Error en alguna operación (rollback)" },
          },
        },
      },
      
      "/health": {
        get: {
          tags: ["System"],
          summary: "Health check",
          description: "Verifica el estado del sistema y sus dependencias",
          responses: {
            "200": {
              description: "Sistema saludable",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { enum: ["healthy", "degraded"] },
                      uptime: { type: "string" },
                      checks: { type: "object" },
                    },
                  },
                },
              },
            },
            "503": { description: "Sistema degradado" },
          },
        },
      },
      
    },
    components: {
      schemas: {
        User: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
            name: { type: "string" },
            role: { enum: ["admin", "editor", "viewer"] },
          },
        },
        Dataset: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            slug: { type: "string" },
            schema: { type: "object" },
            entriesCount: { type: "integer" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        DatasetInput: {
          type: "object",
          required: ["name", "fields"],
          properties: {
            name: { type: "string" },
            slug: { type: "string" },
            description: { type: "string" },
            fields: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: { type: "string" },
                  type: { type: "string" },
                  label: { type: "string" },
                  required: { type: "boolean" },
                },
              },
            },
          },
        },
      },
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Token de sesión o API key",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "session",
          description: "Cookie de sesión (Better-Auth)",
        },
      },
    },
    security: [
      { bearerAuth: [] },
      { cookieAuth: [] },
    ],
  };

  return c.json(spec);
});

// ═══════════════════════════════════════════════════════════════════════════════
// REDIRECTS
// ═══════════════════════════════════════════════════════════════════════════════

// /api/swagger → /api/docs (para compatibilidad)
docsRoutes.get("/swagger", (c) => c.redirect("/api/docs"));

// ═══════════════════════════════════════════════════════════════════════════════
// POSTMAN COLLECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/docs/postman.json
 * 
 * Exporta una colección de Postman lista para importar.
 */
docsRoutes.get("/postman.json", (c) => {
  const collection = {
    info: {
      name: "GremiusCMS API",
      description: "Colección oficial de Postman para GremiusCMS",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/",
    },
    item: [
      {
        name: "Auth",
        item: [
          {
            name: "Login",
            request: {
              method: "POST",
              header: [{ key: "Content-Type", value: "application/json" }],
              url: { raw: "{{baseUrl}}/auth/login", host: ["{{baseUrl}}"], path: ["auth", "login"] },
              body: {
                mode: "raw",
                raw: JSON.stringify({ email: "user@example.com", password: "password" }, null, 2),
              },
            },
          },
        ],
      },
      {
        name: "Datasets",
        item: [
          {
            name: "List Datasets",
            request: {
              method: "GET",
              url: { raw: "{{baseUrl}}/datasets", host: ["{{baseUrl}}"], path: ["datasets"] },
            },
          },
        ],
      },
    ],
    variable: [
      { key: "baseUrl", value: "http://localhost:3001/api" },
    ],
  };

  return c.json(collection);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SDK DOWNLOAD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/docs/sdk
 * 
 * Links para descargar SDKs oficiales.
 */
docsRoutes.get("/sdk", (c) => {
  return c.json({
    sdks: [
      {
        name: "JavaScript / TypeScript",
        package: "@gremius/sdk",
        install: "npm install @gremius/sdk",
        repo: "https://github.com/gremius/sdk-js",
        docs: "https://docs.gremius.dev/sdks/javascript",
      },
      {
        name: "Python",
        package: "gremius",
        install: "pip install gremius",
        repo: "https://github.com/gremius/sdk-python",
        docs: "https://docs.gremius.dev/sdks/python",
      },
      {
        name: "CLI",
        package: "@gremius/cli",
        install: "npm install -g @gremius/cli",
        repo: "https://github.com/gremius/cli",
        docs: "https://docs.gremius.dev/cli",
      },
    ],
  });
});
