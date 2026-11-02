/**
 * Page builder — esquemas de entrada y salida de sus operaciones (SDK de kons)
 * ============================================================================
 *
 * De aquí salen el OpenAPI y las herramientas MCP de `/api/page-builder`.
 *
 * Las ENTRADAS son deliberadamente laxas en lo semántico: comprueban la forma
 * (tipos) y dejan pasar campos de más (`passthrough`), porque el contrato de
 * este kon (`page-builder`, ver `@kitsuden/shared/contratos.ts`) ya publicaba
 * sus 400 con mensaje propio («Estado no válido», «`slug` solo admite…») y
 * clientes como Inti o el panel mandan el objeto entero que leyeron. Esas
 * comprobaciones siguen en el handler; el esquema añade el 422 para lo que
 * antes reventaba (un `visibleFrom` que no es fecha llegaba a Postgres).
 *
 * Las SALIDAS describen lo que se sirve (y lo fija `contrato-inti.test.ts`).
 */
import { esquemaFecha } from "@kitsuden/engine";
import { z } from "zod";

const texto = () => z.string();
const textoONulo = () => z.string().nullable().optional();
/** Fecha servida: Postgres → `Date` → JSON = texto ISO 8601. */
const fechaServida = () => z.string().datetime({ offset: true });

export const ParamId = z.object({ id: z.string().describe("Page/block/template id (uuid; anything else is a 404)") });
export const ParamPagina = z.object({ pageId: z.string().describe("Page id (uuid)") });
export const ParamSlug = z.object({ slug: z.string() });

/** Un bloque tal como entra (al crear página o bloque). */
export const BloqueEntrada = z
  .object({
    type: texto().optional().describe("Block type (GET /block-types); unknown types are a 400"),
    name: textoONulo(),
    sortOrder: z.number().int().optional(),
    columnSpan: z.number().int().min(1).max(12).optional(),
    content: z.record(z.string(), z.unknown()).optional(),
    cssClass: textoONulo(),
    backgroundColor: textoONulo(),
    textColor: textoONulo(),
    padding: textoONulo(),
    isVisible: z.boolean().optional(),
    visibleFrom: esquemaFecha().nullable().optional(),
    visibleUntil: esquemaFecha().nullable().optional(),
  })
  .passthrough();

/** Los cambios de un bloque (PATCH): todo opcional. */
export const BloqueCambios = BloqueEntrada.partial().passthrough();

/** Una página tal como entra (crear o editar). */
export const PaginaEntrada = z
  .object({
    title: texto().optional(),
    slug: texto().optional(),
    description: textoONulo(),
    status: texto().optional().describe("draft | published | archived"),
    layout: texto().optional(),
    metaTitle: textoONulo(),
    metaDescription: textoONulo(),
    ogImageId: textoONulo(),
    cssClass: textoONulo(),
    customCss: textoONulo(),
    isHomepage: z.unknown().optional().describe("boolean (staff only)"),
    requireAuth: z.unknown().optional().describe("boolean"),
    publishedAt: esquemaFecha().nullable().optional(),
    blocks: z.array(z.unknown()).optional().describe("Blocks to create with the page"),
  })
  .passthrough();

export const PaginaDesdeBloque = z
  .object({
    blockType: texto().optional(),
    content: z.record(z.string(), z.unknown()).optional(),
    title: texto().optional(),
    slug: texto().optional(),
    status: texto().optional(),
  })
  .passthrough();

export const Reordenar = z
  .object({
    blockOrders: z
      .array(z.object({ id: z.string(), sortOrder: z.number().int() }).passthrough())
      .optional(),
  })
  .passthrough();

export const Clonar = z
  .object({ slug: z.unknown().optional(), title: z.unknown().optional() })
  .passthrough()
  .optional();

export const PlantillaEntrada = z
  .object({
    name: texto().optional(),
    description: textoONulo(),
    category: textoONulo(),
    type: texto().optional(),
    content: z.record(z.string(), z.unknown()).optional(),
    cssClass: textoONulo(),
    backgroundColor: textoONulo(),
    textColor: textoONulo(),
    padding: textoONulo(),
  })
  .passthrough();

export const QueryListaDePaginas = z
  .object({
    status: texto().optional().describe("draft | published | archived (only staff see non-published)"),
    limit: texto().optional().describe("1-100, default 50"),
    offset: texto().optional(),
    layout: texto().optional(),
    search: texto().optional().describe("Title contains (max 200 chars)"),
  })
  .passthrough();

export const QueryPagina = z
  .object({ include_blocks: z.enum(["true", "false"]).optional() })
  .passthrough();

export const QueryPlantillas = z
  .object({ category: texto().optional(), type: texto().optional() })
  .passthrough();

// ── Salidas ──────────────────────────────────────────────────────────────────

export const Bloque = z
  .object({
    id: z.guid(),
    pageId: z.guid(),
    type: z.string(),
    name: z.string().nullable(),
    sortOrder: z.number().int(),
    columnSpan: z.number().int(),
    content: z.record(z.string(), z.unknown()),
    cssClass: z.string().nullable(),
    backgroundColor: z.string().nullable(),
    textColor: z.string().nullable(),
    padding: z.string().nullable(),
    isVisible: z.boolean(),
    visibleFrom: fechaServida().nullable(),
    visibleUntil: fechaServida().nullable(),
    createdAt: fechaServida(),
    updatedAt: fechaServida(),
  })
  .passthrough();

export const Pagina = z
  .object({
    id: z.guid(),
    title: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    status: z.enum(["draft", "published", "archived"]),
    metaTitle: z.string().nullable(),
    metaDescription: z.string().nullable(),
    ogImageId: z.string().nullable(),
    layout: z.string(),
    cssClass: z.string().nullable(),
    customCss: z.string().nullable(),
    publishedAt: fechaServida().nullable(),
    isHomepage: z.boolean(),
    requireAuth: z.boolean(),
    createdAt: fechaServida(),
    updatedAt: fechaServida(),
  })
  .passthrough();

export const PaginaConBloques = Pagina.extend({ blocks: z.array(Bloque) }).passthrough();

export const ListaDePaginas = z.object({
  docs: z.array(
    Pagina.pick({
      id: true,
      title: true,
      slug: true,
      description: true,
      status: true,
      layout: true,
      isHomepage: true,
      publishedAt: true,
      updatedAt: true,
    })
  ),
  totalDocs: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export const PaginaRenderizada = z.object({
  page: z
    .object({
      id: z.guid(),
      title: z.string(),
      slug: z.string(),
      description: z.string().nullable(),
      metaTitle: z.string().nullable(),
      metaDescription: z.string().nullable(),
      layout: z.string(),
      cssClass: z.string().nullable(),
      customCss: z.string().nullable(),
      publishedAt: fechaServida().nullable(),
    })
    .passthrough(),
  blocks: z.array(
    z
      .object({
        id: z.guid(),
        type: z.string(),
        content: z.record(z.string(), z.unknown()),
        columnSpan: z.number().int(),
        mediaUrls: z.record(z.string(), z.unknown()).optional().describe("Transform URLs for media blocks"),
      })
      .passthrough()
  ),
});

export const Plantilla = z
  .object({
    id: z.guid(),
    name: z.string(),
    description: z.string().nullable(),
    category: z.string(),
    type: z.string(),
    content: z.record(z.string(), z.unknown()),
    usageCount: z.number().int(),
  })
  .passthrough();

export const ListaDePlantillas = z.object({ docs: z.array(Plantilla) });

export const TiposDeBloque = z.object({
  blockTypes: z.array(
    z
      .object({
        type: z.string(),
        name: z.string(),
        category: z.string(),
        icon: z.string(),
        description: z.string(),
        schema: z.record(z.string(), z.unknown()).describe("Field descriptors of the block content"),
      })
      .passthrough()
  ),
});

export const PaginaDesdeBloqueSalida = z.object({
  data: z.object({ id: z.guid(), slug: z.string(), title: z.string(), status: z.string() }),
  creada: z.boolean().describe("false when an existing page with that slug was updated (200)"),
});

export const Exito = z.object({ success: z.literal(true) }).passthrough();
