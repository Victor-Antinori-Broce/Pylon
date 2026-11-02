/**
 * Media — esquemas de entrada y salida de sus operaciones (SDK de kons)
 * ============================================================================
 *
 * De aquí salen el OpenAPI y las herramientas MCP de `/api/media`. Igual que
 * en el page builder, las entradas comprueban la forma y dejan pasar campos de
 * más: los 400 con mensaje propio («folderId no válido», «x and y must be
 * numbers»…) siguen en los handlers, que es lo que ya fijan los tests.
 */
import { z } from "zod";

const fechaServida = () => z.string().datetime({ offset: true });

export const ParamId = z.object({
  id: z.string().describe("Media id (uuid; anything else is a 404)"),
});
export const ParamPreset = z.object({
  id: z.string().describe("Media id (uuid)"),
  preset: z.string().describe("thumbnail | small | medium | large | hero"),
});

export const QueryLista = z
  .object({
    limit: z.string().optional().describe("1-200, default 50"),
    offset: z.string().optional(),
    folderId: z.string().optional(),
    search: z.string().optional().describe("File name contains (case-insensitive)"),
    type: z.string().optional().describe("image | video | application (MIME prefix)"),
  })
  .passthrough();

export const QuerySubida = z
  .object({
    folderId: z.string().optional().describe("Folder uuid"),
    thumbnails: z.enum(["true", "false"]).optional(),
  })
  .passthrough();

export const QueryTransformacion = z
  .object({
    w: z.string().optional().describe("Width 1-4096"),
    width: z.string().optional(),
    h: z.string().optional().describe("Height 1-4096"),
    height: z.string().optional(),
    fit: z.string().optional().describe("cover | contain | fill | inside | outside"),
    pos: z
      .string()
      .optional()
      .describe("center | top | right | bottom | left | entropy | attention"),
    position: z.string().optional(),
    f: z.string().optional().describe("jpeg | png | webp | avif | gif | auto"),
    format: z.string().optional(),
    q: z.string().optional().describe("Quality 1-100"),
    quality: z.string().optional(),
    fp: z.string().optional().describe("Focal point 'x,y', each 0-1"),
  })
  .passthrough();

export const Subida = z
  .object({ files: z.unknown().describe("One or more files in the multipart field `files`") })
  .passthrough()
  .optional();

export const CarpetaEntrada = z
  .object({
    name: z.string().optional().describe("Required, max 200 chars"),
    parentId: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  })
  .passthrough()
  .optional();

export const MedioCambios = z
  .object({
    altText: z.string().nullable().optional(),
    caption: z.string().nullable().optional(),
    filename: z.string().optional(),
    folderId: z.string().nullable().optional(),
  })
  .passthrough()
  .optional();

export const ConfigEntrada = z
  .object({ config: z.record(z.string(), z.unknown()).describe("MediaKonConfig: storage, features, limits") })
  .passthrough()
  .optional();

export const PruebaDeAlmacen = z
  .object({ storage: z.record(z.string(), z.unknown()).describe("StorageConfig to test (provider, bucket…)") })
  .passthrough()
  .optional();

export const PuntoFocalEntrada = z
  .object({
    x: z.number().optional().describe("0-1"),
    y: z.number().optional().describe("0-1"),
  })
  .passthrough()
  .optional();

// ── Salidas ──────────────────────────────────────────────────────────────────

export const Medio = z
  .object({
    id: z.guid(),
    filename: z.string(),
    originalName: z.string(),
    mimeType: z.string(),
    size: z.number().int(),
    key: z.string(),
    publicUrl: z.string().nullable(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    folderId: z.guid().nullable(),
    altText: z.string().nullable(),
    caption: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: fechaServida().nullable(),
    updatedAt: fechaServida().nullable(),
  })
  .passthrough();

export const MedioConUrl = Medio.extend({
  url: z.string().nullable(),
  thumbnails: z.record(z.string(), z.string()).optional(),
}).passthrough();

export const ListaDeMedios = z.object({
  docs: z.array(MedioConUrl),
  totalDocs: z.number().int().describe("Items in this page (not the library total)"),
});

export const ResultadoDeSubida = z.object({
  success: z.boolean().describe("true when every file was stored (201); false = partial (207)"),
  files: z.array(
    z
      .object({
        id: z.guid().optional(),
        filename: z.string(),
        mimeType: z.string().optional(),
        size: z.number().int().optional(),
        url: z.string().optional(),
        width: z.number().int().optional(),
        height: z.number().int().optional(),
        success: z.boolean(),
        error: z.string().optional(),
      })
      .passthrough()
  ),
});

export const Carpeta = z
  .object({
    id: z.guid(),
    name: z.string(),
    slug: z.string(),
    parentId: z.guid().nullable(),
    path: z.string(),
    description: z.string().nullable(),
  })
  .passthrough();

export const ListaDeCarpetas = z.object({ docs: z.array(Carpeta) });

export const Configuracion = z.object({ config: z.record(z.string(), z.unknown()) });
export const ConfiguracionGuardada = z.object({
  success: z.literal(true),
  config: z.record(z.string(), z.unknown()),
});
export const ResultadoDePrueba = z
  .object({ success: z.boolean(), message: z.string().optional() })
  .passthrough();

export const PuntoFocal = z.object({ x: z.number(), y: z.number() });
export const PuntoFocalGuardado = z.object({ success: z.literal(true), focalPoint: PuntoFocal });
export const PuntoFocalLeido = z.object({ focalPoint: PuntoFocal });
export const CacheBorrada = z.object({ success: z.literal(true), cleared: z.number().int() });
export const Exito = z.object({ success: z.literal(true) });
