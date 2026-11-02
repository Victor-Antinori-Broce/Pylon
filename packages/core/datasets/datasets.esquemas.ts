/**
 * DataSets — esquemas de entrada y salida de sus operaciones (SDK de kons)
 * ============================================================================
 *
 * De aquí salen el OpenAPI y las herramientas MCP de `/api/datasets`.
 *
 * Las ENTRADAS de escritura son laxas a propósito (todo opcional y
 * `passthrough`): en este kon la autorización depende del DATASET (su
 * `policyJson`) y de la entrada (su dueño), así que se decide en el handler
 * tras cargarlos (`permiso.politica.enHandler`). Si el esquema exigiera campos,
 * una petición sin permiso recibiría un 422 en vez de su 401/403/404, y diría
 * más de lo que debe. Los 400 con mensaje propio siguen en el handler.
 */
import { z } from "zod";

import { createCalculatedFieldSchema, updateCalculatedFieldSchema } from "./datasets.calculated";
import { exportConfigSchema, importConfigSchema } from "./datasets.import-export";
import { indexConfigSchema } from "./datasets.indexes";

const fechaServida = () => z.string().datetime({ offset: true });
const libre = () => z.unknown().optional();

export const ParamId = z.object({
  id: z.string().describe("Dataset id (uuid; anything else is a 404)"),
});
export const ParamSlug = z.object({ slug: z.string() });
export const ParamEntrada = z.object({
  id: z.string().describe("Dataset id (uuid)"),
  entryId: z.string().describe("Entry id (uuid)"),
});
export const ParamCampo = z.object({
  id: z.string().describe("Dataset id (uuid)"),
  fieldId: z.string().describe("Calculated field id (uuid)"),
});

export const QueryLimite = z
  .object({ limit: z.string().optional().describe("1-200, default 50") })
  .passthrough();

export const QueryEntradas = z
  .object({
    limit: z.string().optional().describe("1-1000, default 500"),
    status: z.string().optional(),
    includeCalculated: z.enum(["true", "false"]).optional(),
    calculatedFields: z.string().optional().describe("Comma-separated calculated field names"),
    includeThumbnailUrl: z.enum(["true", "false"]).optional(),
  })
  .passthrough();

export const QueryEntrada = z
  .object({ includeThumbnailUrl: z.enum(["true", "false"]).optional() })
  .passthrough();

export const QueryBusqueda = z
  .object({
    q: z.string().optional().describe("Full-text query"),
    filtros: z
      .string()
      .optional()
      .describe("field:value, field:min..max; comma-separated (max 20)"),
    facetas: z.string().optional().describe("Comma-separated fields to count (max 8)"),
    status: z.string().optional(),
    limit: z.string().optional(),
    offset: z.string().optional(),
  })
  .passthrough();

/** Un dataset tal como entra (crear o editar). */
export const DatasetEntrada = z
  .object({
    name: z.string().optional().describe("Required when creating, max 200 chars"),
    slug: z.string().optional().describe("a-z, 0-9 and dashes; derived from the name when missing"),
    description: z.string().nullable().optional(),
    icon: z.string().nullable().optional(),
    schema: z.array(z.record(z.string(), z.unknown())).optional().describe("Field definitions"),
    fields: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Alias of `schema` (what the panel sends)"),
    displayConfig: libre(),
    policyJson: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Who reads and writes (admin only)"),
    workflowJson: libre(),
    contentConfig: libre(),
    gameId: z.string().nullable().optional(),
    sourceName: z.string().nullable().optional(),
    sourceUrl: z.string().nullable().optional(),
    sourceLicense: z.string().nullable().optional(),
    sourceVersion: z.string().nullable().optional(),
    sourceCaveats: z.string().nullable().optional(),
  })
  .passthrough()
  .optional();

/** Una entrada tal como entra. Lo editorial (estado, orden, dueño) solo lo escribe el equipo. */
export const EntradaEntrada = z
  .object({
    title: z.string().optional(),
    data: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("The entry fields, as defined by the dataset schema"),
    status: z.string().optional().describe("staff only"),
    sortOrder: z.number().optional().describe("staff only"),
    thumbnailId: z.string().nullable().optional().describe("staff only, media uuid"),
    ownerId: z.string().nullable().optional().describe("staff only"),
  })
  .passthrough();

export const EntradasEntrada = z
  .union([EntradaEntrada, z.array(EntradaEntrada).describe("Bulk: 1-1000 entries")])
  .optional();

// Lo que el handler exige DE VERDAD (antes, `partial().optional()`: un cuerpo
// sin `datasets` pasaba el SDK y el `parse` del handler lo convertía en 500;
// lo encontró Schemathesis, 2026-10-26). Nada que antes funcionara se rechaza.
export const Exportar = exportConfigSchema.passthrough();
export const Importar = z
  .object({
    datasetId: z.string().min(1),
    data: z.array(z.record(z.string(), z.unknown())),
    config: importConfigSchema.partial().optional(),
  })
  .passthrough();
export const ImportarPaquete = z
  .object({
    package: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("An export package (with `datasets`)"),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()
  .optional();
export const SnapshotManual = z
  .object({
    reason: z.string().optional(),
    calculatedValues: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()
  .optional();
export const Restaurar = z
  .object({ timestamp: z.string().optional().describe("Snapshot timestamp to restore") })
  .passthrough()
  .optional();
export const CompararSnapshots = z
  .object({ snapshot1: libre(), snapshot2: libre() })
  .passthrough()
  .optional();
export const CompararEntradas = z
  .object({ entryIds: z.array(z.string()).optional().describe("2-8 entry uuids") })
  .passthrough()
  .optional();
export const AplicarIndices = z
  .object({ config: indexConfigSchema.partial().optional() })
  .passthrough()
  .optional();
export const IndicesAuto = z
  .object({ minConfidence: z.enum(["high", "medium"]).optional() })
  .passthrough()
  .optional();

export const CampoCalculadoEntrada = createCalculatedFieldSchema
  .omit({ dataSetId: true })
  .partial()
  .passthrough()
  .optional();
export const CampoCalculadoCambios = updateCalculatedFieldSchema.partial().passthrough().optional();

// ── Salidas ──────────────────────────────────────────────────────────────────

export const Dataset = z
  .object({
    id: z.guid(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    schema: z.unknown().describe("Field definitions (array, or legacy {fields})"),
    policyJson: z.record(z.string(), z.unknown()).nullable(),
    createdAt: fechaServida().nullable(),
    updatedAt: fechaServida().nullable(),
  })
  .passthrough();

export const ListaDeDatasets = z.object({ docs: z.array(Dataset), totalDocs: z.number().int() });

export const Entrada = z
  .object({
    id: z.guid(),
    dataSetId: z.guid(),
    title: z.string(),
    data: z.record(z.string(), z.unknown()),
    status: z.string(),
    sortOrder: z.number(),
    ownerId: z.string().nullable(),
    thumbnailUrl: z.string().optional(),
    createdAt: fechaServida().nullable(),
    updatedAt: fechaServida().nullable(),
  })
  .passthrough();

export const ListaDeEntradas = z.object({
  docs: z.array(
    Entrada.extend({ _calculated: z.record(z.string(), z.unknown()).optional() }).passthrough()
  ),
  totalDocs: z.number().int(),
  calculatedFields: z.array(z.record(z.string(), z.unknown())).optional(),
  dataset: z.object({ id: z.guid(), name: z.string(), slug: z.string() }),
});

export const EntradaOEntradas = z.union([Entrada, z.array(Entrada)]);

// Lo que devuelve `buscarEntradas` (ResultadoBusqueda): `data`/`total` y las
// facetas como LISTA. Antes se declaraban `docs`/`totalDocs` y un objeto; no se
// notó porque la búsqueda nunca llegaba a responder (Schemathesis, 2026-10-26).
export const Busqueda = z
  .object({
    data: z.array(Entrada),
    total: z.number().int(),
    facetas: z.array(
      z.object({
        campo: z.string(),
        valores: z.array(z.object({ valor: z.string(), cuenta: z.number().int() })),
      })
    ),
    procedencia: z.record(z.string(), z.unknown()).nullable(),
  })
  .passthrough();

export const Comparacion = z.object({
  data: z.array(z.object({ id: z.guid(), title: z.string() })),
  diferencias: z.unknown(),
});

export const Generico = z
  .record(z.string(), z.unknown())
  .describe("Result object (see the description)");
export const Exito = z.object({ success: z.literal(true) }).passthrough();

export const CampoCalculado = z
  .object({ id: z.guid(), name: z.string(), label: z.string(), type: z.string() })
  .passthrough();
export const ListaDeCamposCalculados = z.object({
  success: z.literal(true),
  fields: z.array(CampoCalculado),
});
export const CampoCalculadoSalida = z.object({ success: z.literal(true), field: CampoCalculado });
