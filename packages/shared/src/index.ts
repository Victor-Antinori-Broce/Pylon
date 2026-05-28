export { SITE_CONFIG, BREAKPOINTS, NEON_COLORS } from "./constants";

// ═══════════════════════════════════════════════════════════════════════════
// GRIMOIRE API - Contratos para grimoires autocontenidos
// ═══════════════════════════════════════════════════════════════════════════

export {
  defineGrimoire,
  createGrimoireRouter,
  GrimoireError,
  GrimoireErrors,
} from "./grimoire-api";

export type {
  GrimoireCache,
  GrimoireEvents,
  GrimoireRealtime,
  GrimoireAuth,
  GrimoireStorage,
  GrimoireDatabase,
  GrimoireContext,
  GrimoireRouterFactory,
  GrimoireDefinition,
  // Content Publishing
  ContentTarget,
  ContentTargetInfo,
  GrimoireContentPublishing,
  PromotionData,
  PromotionOptions,
  PromotionSource,
  PublishResult,
  // OpenAPI
  GrimoireOpenApiSpec,
  GrimoireOpenApiPath,
  GrimoireOpenApiTag,
  OpenApiMethod,
} from "./grimoire-api";

// ═══════════════════════════════════════════════════════════════════════════
// UTILIDADES Y TIPOS COMPARTIDOS
// ═══════════════════════════════════════════════════════════════════════════

export {
  formatDate,
  truncate,
  buildCmsUrl,
  buildApiUrl,
  gameJsonLd,
  articleJsonLd,
  createPaginatedResponse,
} from "./utils";

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

// ═══════════════════════════════════════════════════════════════════════════
// GRIMOIRE PACKAGE — Contrato para paquetes npm
// ═══════════════════════════════════════════════════════════════════════════

export type {
  GrimoirePackage,
  GrimoirePackageMinimal,
  GrimoireDependencies,
  GrimoireMountConfig,
  GrimoireTableConfig,
  GrimoireLifecycleHooks,
} from "./grimoire-package";

export { isValidGrimoirePackage } from "./grimoire-package";

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

// ═══════════════════════════════════════════════════════════════════════════
// RLS BUILDER - Utilidades de Row Level Security para grimoires
// ═══════════════════════════════════════════════════════════════════════════

export {
  buildDrizzleWhere,
  buildDatasetWhere,
  checkReadAccess,
  checkWriteAccess,
  createRLSFilter,
} from "./rls-builder";

export type {
  RLSType,
  RLSRule,
  PolicyJson,
  RLSUser,
} from "./rls-builder";
