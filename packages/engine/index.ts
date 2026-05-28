/**
 * @gremius/engine — The Unstoppable Motor (Nivel 1)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * This is the beating heart of Gremius. Nothing here can be disabled.
 * All higher layers (Core, Grimoires, Realms) depend on these exports.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Contents:
 *   - Auth (Better-Auth + Machine Auth / NHI)
 *   - Database (Drizzle ORM + Schema Merger)
 *   - Security (RLS Builder + Auth Guard + Permissions)
 *   - Worker Sandbox (Bun-based sandboxed function execution)
 *   - Real-time (WebSocket + Valkey Pub/Sub)
 *   - Queue (BullMQ + Valkey)
 *   - Cache (Valkey-backed query cache)
 *   - Storage (S3/MinIO file layer)
 *   - Image Optimization (WebP pipeline)
 *   - TOON (AI token optimizer middleware)
 *   - Event System (EventEmitter + Function Dispatcher + Cron)
 *   - Grimoire Loader (Dynamic module mounting)
 */

// ── Auth ──
export { auth } from "../../apps/api/src/lib/auth";

// ── Database ──
export { db } from "../../apps/api/src/db";
export { buildMergedSchema } from "../../apps/api/src/lib/schema-merger";

// ── Security ──
export { buildDrizzleWhere, buildDatasetWhere, createRLSFilter, checkReadAccess, checkWriteAccess } from "../../apps/api/src/lib/rls-builder";
export { withTransactionalRLS } from "../../apps/api/src/middleware/transactional-rls";
export { protectRoute, requireAdmin, requireScope } from "../../apps/api/src/middleware/auth-guard";

// ── Worker Sandbox ──
export { executeSandbox } from "../../apps/api/src/lib/worker-sandbox";

// ── Real-time ──
export { realtimeManager } from "../../apps/api/src/lib/realtime";

// ── Queue ──
export { emailQueue, setupWorkers } from "../../apps/api/src/lib/queue";

// ── Cache ──
export { cachedQuery, invalidateCache } from "../../apps/api/src/lib/cache";

// ── Valkey Connection ──
export {
    VALKEY_URL,
    valkeyConnection,
    getValkeyClient,
    isValkeyAvailable,
    getPublisher,
    getSubscriber,
} from "../../apps/api/src/lib/valkey";

// ── Storage (S3/MinIO) ──
export {
    s3,
    BUCKET,
    PUBLIC_URL,
    generateS3Key,
    uploadFile,
    uploadBuffer,
    deleteFile,
    fileExists,
    getFile,
    generateSignedDownloadUrl,
} from "../../apps/api/src/lib/storage";

// ── Image Optimization ──
export { optimizeImage, getImageDimensions } from "../../apps/api/src/lib/image";

// ── TOON (AI Middleware) ──
export { toonMiddleware } from "../../apps/api/src/lib/toon";

// ── Event System ──
export { events as gremiusEvents, hooks } from "../../apps/api/src/lib/events";
export { initFunctionDispatcher } from "../../apps/api/src/lib/function-dispatcher";
export { initCronScheduler } from "../../apps/api/src/lib/cron-scheduler";

// ── Grimoire Loader ──
export { loadGrimoires, loadModules } from "../../apps/api/src/lib/module-loader";

// ── Actions Layer (Unified HTTP + Events + Agents) ──
export {
    defineAction,
    defineTypedAction,
    initActions,
    shutdownActions,
    listDefinedActions,
    getAction,
    listMCPTools,
    executeMCPTool,
    parseTrigger,
    setTelemetryProvider,
    getTelemetryProvider,
} from "./src/actions";
export type {
    ActionDefinition,
    ActionContext,
    ActionResult,
    ActionRunFunction,
    ParsedTrigger,
    TriggerPrefix,
    HttpMethod,
    InputSchema,
    ActionsInitOptions,
    TelemetryProvider,
    TelemetryStepData,
} from "./src/actions";

// ── Grimoire System (Auto-API & MCP Generator) ──
export {
    defineGrimoire,
    registerGrimoire,
    getGrimoire,
    listGrimoires,
    initializeGrimoires,
    createGrimoireAction,
} from "./src/grimoire";
export type {
    GrimoireOptions,
    Grimoire,
    GeneratedRoute,
    GeneratedTool,
    MCPTool,
    DrizzleModel,
    InferGrimoireSelect,
    InferGrimoireInsert,
} from "./src/grimoire";

// ── Query Engine (JSON to SQL with Auto-Join) ──
export {
    parseQuery,
    validateQuery,
    getAvailableRelations,
    registerDynamicRelation,
    fieldWhiteList,
    fieldBlackList,
} from "./src/query-parser";
export type {
    QueryOptions,
    QueryResult,
} from "./src/query-parser";

// ── Query Translator (Fase 2 - JSON to SQL with Auto-Join) ──
export {
    queryTranslator,
    validateQueryTranslator,
    QueryTranslatorError,
} from "./src/query";
export type {
    QueryTranslatorOptions,
    QueryTranslatorResult,
    WhereFilter,
    FieldFilter,
    FilterOperator,
    LogicalOperator,
    OrderBy,
    RelationDef,
} from "./src/query";

// ── Gremius QL Engine (Prisma-style JSON to SQL Translator) ──
export {
    parseGremiusQuery,
    validateGremiusQuery,
    getAvailableRelations as getGremiusRelations,
    registerDynamicRelation as registerGremiusRelation,
    debugQuery,
    GremiusQLError,
} from "./src/translator";
export type {
    GremiusQueryOptions,
    GremiusQueryResult,
    WhereFilter as GremiusWhereFilter,
    FieldFilter as GremiusFieldFilter,
    FilterOperator as GremiusFilterOperator,
    LogicalOperator as GremiusLogicalOperator,
} from "./src/translator";

// ── Batch Processor (ACID Transactions - El Muro de Titanio) ──
export {
    BatchProcessor,
    createBatchProcessor,
    executeSingle,
    createWithChildren,
    BatchProcessorError,
} from "./src/batch";
export type {
    BatchOperation,
    BatchOperationResult,
    BatchResult,
    BatchOperationType,
} from "./src/batch";

// ── Validator Engine (Declarative Validation with If/Then) ──
export {
    validate,
    validateBatch,
    createValidator,
    composeSchemas,
    agentIdentitySchema,
    paginationSchema,
    idSchema,
    timestampSchema,
} from "./src/validator";
export type {
    ValidationRule,
    Condition,
    ValidationSchema,
    ValidationResult,
    ValidationError,
    ValidatorOptions,
} from "./src/validator";

// ── Batch API (ACID Transactions - El Muro de Titanio) ──
export type {
    BatchAction,
    BatchApiOperation,
    BatchOptions,
    BatchApiOperationResult,
    BatchApiResult,
    BatchError,
} from "./src/batch-api";
