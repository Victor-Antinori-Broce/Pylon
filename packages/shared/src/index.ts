export { SITE_CONFIG, BREAKPOINTS, NEON_COLORS } from "./constants";
export type {
  PageBlock,
  Game,
  BlogPost,
  DataSet,
  DataEntry,
  Platform,
  Tag,
  Streamer,
  SiteSettings,
  SEOMeta,
  MediaItem,
  PaginatedResponse,
} from "./types";
export { formatDate, truncate, buildCmsUrl, buildApiUrl, gameJsonLd, articleJsonLd } from "./utils";

// ═══════════════════════════════════════════════════════════════════════════
// EL PUENTE ZOD - Exportaciones del Sistema de Validación Unificado
// ═══════════════════════════════════════════════════════════════════════════

export {
  // Esquemas Zod
  FieldTypeSchema,
  RelationTypeSchema,
  RelationTargetSchema,
  RelationConfigSchema,
  SelectOptionSchema,
  FieldDefinitionSchema,
  DatasetPolicySchema,
  DatasetWorkflowSchema,
  DatasetDefinitionSchema,
  DatasetEntrySchema,
  CreateDatasetPayloadSchema,
  UpdateDatasetPayloadSchema,
  // Helpers
  validateDatasetDefinition,
  safeValidateDataset,
  generateFieldId,
  createEmptyField,
} from "./schemas";

export type {
  // Tipos inferidos de Zod
  FieldType,
  RelationType,
  RelationTarget,
  RelationConfig,
  SelectOption,
  FieldDefinition,
  DatasetPolicy,
  DatasetWorkflow,
  DatasetDefinition,
  DatasetEntry,
  CreateDatasetPayload,
  UpdateDatasetPayload,
} from "./schemas";
