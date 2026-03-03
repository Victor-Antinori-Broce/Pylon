/**
 * GremiusCMS — Datasets API (OpenAPI Documented)
 *
 * Proof of Concept para la autogeneración de documentación OpenAPI.
 * Este archivo demuestra cómo documentar endpoints usando @hono/zod-openapi.
 * 
 * NOTA: Usamos @hono/zod-openapi con esquemas Zod estándar (v3).
 * Los esquemas se registran manualmente para compatibilidad.
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

// Extender Zod con métodos OpenAPI
extendZodWithOpenApi(z);

// ═══════════════════════════════════════════════════════════════════════════
// Esquemas OpenAPI (registrados para documentación)
// ═══════════════════════════════════════════════════════════════════════════

// Esquema para respuestas de error
const ErrorResponseSchema = z.object({
  error: z.string().openapi({
    description: "Mensaje de error",
    example: "Dataset not found",
  }),
}).openapi("ErrorResponse");

// Esquema para un campo de dataset
const FieldDefinitionSchema = z.object({
  id: z.string().openapi({ description: "ID único del campo", example: "fld_123" }),
  key: z.string().openapi({ description: "Nombre máquina del campo", example: "title" }),
  label: z.string().openapi({ description: "Etiqueta visible", example: "Título" }),
  type: z.enum(["text", "number", "boolean", "date", "image", "url", "email", "select", "json", "richtext", "relation"]).openapi({
    description: "Tipo de campo",
    example: "text",
  }),
  helpText: z.string().optional().openapi({ description: "Texto de ayuda" }),
  order: z.number().default(0).openapi({ description: "Orden del campo", example: 0 }),
  isRequired: z.boolean().default(false).openapi({ description: "¿Es requerido?" }),
  isUnique: z.boolean().default(false).openapi({ description: "¿Es único?" }),
  defaultValue: z.string().optional().openapi({ description: "Valor por defecto" }),
  hidden: z.boolean().default(false).openapi({ description: "¿Está oculto?" }),
}).openapi("FieldDefinition");

// Esquema para definición de dataset
const DatasetDefinitionSchema = z.object({
  id: z.string().openapi({ description: "ID único del dataset", example: "550e8400-e29b-41d4-a716-446655440000" }),
  name: z.string().openapi({ description: "Nombre del dataset", example: "Blog Posts" }),
  slug: z.string().openapi({ description: "Slug único", example: "blog-posts" }),
  description: z.string().optional().openapi({ description: "Descripción del dataset" }),
  icon: z.string().optional().openapi({ description: "Emoji/icono", example: "📝" }),
  fields: z.array(FieldDefinitionSchema).openapi({ description: "Campos del dataset" }),
  createdAt: z.string().datetime().optional().openapi({ description: "Fecha de creación", example: "2024-01-15T10:30:00Z" }),
  updatedAt: z.string().datetime().optional().openapi({ description: "Fecha de actualización", example: "2024-01-15T10:30:00Z" }),
}).openapi("DatasetDefinition");

// Esquema para crear dataset
const CreateDatasetPayloadSchema = z.object({
  name: z.string().min(1).openapi({ description: "Nombre del dataset", example: "Blog Posts" }),
  slug: z.string().min(1).optional().openapi({ description: "Slug (se genera automáticamente si no se proporciona)", example: "blog-posts" }),
  description: z.string().optional().openapi({ description: "Descripción del dataset" }),
  icon: z.string().optional().openapi({ description: "Emoji/icono", example: "📝" }),
  fields: z.array(FieldDefinitionSchema).default([]).openapi({ description: "Campos del dataset" }),
  gameId: z.string().optional().openapi({ description: "ID del juego relacionado (opcional)" }),
}).openapi("CreateDatasetPayload");

// Esquema para actualizar dataset
const UpdateDatasetPayloadSchema = z.object({
  name: z.string().min(1).optional().openapi({ description: "Nombre del dataset" }),
  description: z.string().optional().openapi({ description: "Descripción del dataset" }),
  icon: z.string().optional().openapi({ description: "Emoji/icono" }),
  fields: z.array(FieldDefinitionSchema).optional().openapi({ description: "Campos del dataset" }),
}).openapi("UpdateDatasetPayload");

// Esquema para listado de datasets
const ListDatasetsResponseSchema = z.object({
  docs: z.array(DatasetDefinitionSchema).openapi({ description: "Array de datasets" }),
  totalDocs: z.number().openapi({ description: "Total de datasets disponibles", example: 42 }),
}).openapi("ListDatasetsResponse");

// ═══════════════════════════════════════════════════════════════════════════
// Router OpenAPI
// ═══════════════════════════════════════════════════════════════════════════

export const datasetsOpenAPIRouter = new OpenAPIHono();

// ── GET /datasets - Listar todos los datasets ──
const listDatasetsRoute = createRoute({
  method: "get",
  path: "/datasets",
  tags: ["Datasets"],
  summary: "Listar datasets",
  description: "Obtiene una lista de todos los datasets disponibles en el sistema",
  request: {
    query: z.object({
      limit: z.string().optional().openapi({
        description: "Número máximo de resultados",
        example: "50",
      }),
    }),
  },
  responses: {
    200: {
      description: "Lista de datasets obtenida exitosamente",
      content: {
        "application/json": {
          schema: ListDatasetsResponseSchema,
        },
      },
    },
    500: {
      description: "Error del servidor",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

datasetsOpenAPIRouter.openapi(listDatasetsRoute, async (c) => {
  // Este es un placeholder - en producción, llamaría al servicio real
  return c.json({
    docs: [],
    totalDocs: 0,
  }, 200);
});

// ── GET /datasets/:id - Obtener un dataset por ID ──
const getDatasetRoute = createRoute({
  method: "get",
  path: "/datasets/{id}",
  tags: ["Datasets"],
  summary: "Obtener dataset",
  description: "Obtiene un dataset específico por su ID",
  request: {
    params: z.object({
      id: z.string().openapi({
        description: "ID único del dataset",
        example: "550e8400-e29b-41d4-a716-446655440000",
      }),
    }),
  },
  responses: {
    200: {
      description: "Dataset encontrado",
      content: {
        "application/json": {
          schema: DatasetDefinitionSchema,
        },
      },
    },
    404: {
      description: "Dataset no encontrado",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

datasetsOpenAPIRouter.openapi(getDatasetRoute, async (c) => {
  const { id } = c.req.valid("param");
  // Placeholder - en producción, buscaría en la base de datos
  return c.json({
    error: `Dataset ${id} not found (placeholder)`,
  }, 404);
});

// ── POST /datasets - Crear un nuevo dataset ──
const createDatasetRoute = createRoute({
  method: "post",
  path: "/datasets",
  tags: ["Datasets"],
  summary: "Crear dataset",
  description: "Crea un nuevo dataset con el esquema especificado",
  request: {
    body: {
      content: {
        "application/json": {
          schema: CreateDatasetPayloadSchema,
        },
      },
      description: "Payload para crear un dataset",
      required: true,
    },
  },
  responses: {
    201: {
      description: "Dataset creado exitosamente",
      content: {
        "application/json": {
          schema: DatasetDefinitionSchema,
        },
      },
    },
    400: {
      description: "Datos inválidos",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

datasetsOpenAPIRouter.openapi(createDatasetRoute, async (c) => {
  const body = c.req.valid("json");
  // Placeholder - en producción, guardaría en la base de datos
  return c.json({
    id: "550e8400-e29b-41d4-a716-446655440000",
    ...body,
    slug: body.slug || body.name.toLowerCase().replace(/\\s+/g, "-"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, 201);
});

// ── PATCH /datasets/:id - Actualizar un dataset ──
const updateDatasetRoute = createRoute({
  method: "patch",
  path: "/datasets/{id}",
  tags: ["Datasets"],
  summary: "Actualizar dataset",
  description: "Actualiza un dataset existente parcialmente",
  request: {
    params: z.object({
      id: z.string().openapi({
        description: "ID único del dataset",
        example: "550e8400-e29b-41d4-a716-446655440000",
      }),
    }),
    body: {
      content: {
        "application/json": {
          schema: UpdateDatasetPayloadSchema,
        },
      },
      description: "Payload para actualizar un dataset",
    },
  },
  responses: {
    200: {
      description: "Dataset actualizado exitosamente",
      content: {
        "application/json": {
          schema: DatasetDefinitionSchema,
        },
      },
    },
    404: {
      description: "Dataset no encontrado",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

datasetsOpenAPIRouter.openapi(updateDatasetRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  // Placeholder
  return c.json({
    id,
    name: body?.name || "Updated Dataset",
    slug: "updated-dataset",
    fields: body?.fields || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, 200);
});

// ── DELETE /datasets/:id - Eliminar un dataset ──
const deleteDatasetRoute = createRoute({
  method: "delete",
  path: "/datasets/{id}",
  tags: ["Datasets"],
  summary: "Eliminar dataset",
  description: "Elimina permanentemente un dataset y todos sus datos",
  request: {
    params: z.object({
      id: z.string().openapi({
        description: "ID único del dataset",
        example: "550e8400-e29b-41d4-a716-446655440000",
      }),
    }),
  },
  responses: {
    200: {
      description: "Dataset eliminado exitosamente",
      content: {
        "application/json": {
          schema: z.object({
            deleted: z.boolean().openapi({ description: "Indica si se eliminó correctamente" }),
            id: z.string().openapi({ description: "ID del dataset eliminado" }),
          }).openapi("DeleteDatasetResponse"),
        },
      },
    },
    404: {
      description: "Dataset no encontrado",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

datasetsOpenAPIRouter.openapi(deleteDatasetRoute, async (c) => {
  const { id } = c.req.valid("param");
  // Placeholder
  return c.json({ deleted: true, id }, 200);
});

export default datasetsOpenAPIRouter;
