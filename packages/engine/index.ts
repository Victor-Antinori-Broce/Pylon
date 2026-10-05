/**
 * @kitsuden/engine — The Unstoppable Motor (Nivel 1)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * This is the beating heart of Kitsuden. Nothing here can be disabled.
 * All higher layers (Core, Kons, Grimoires) depend on these exports.
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
 *   - Kon Loader (Dynamic module mounting)
 */

// ── Auth ──
export { auth } from "../../apps/api/src/lib/auth";

// ── Database ──
export { db } from "../../apps/api/src/db";
// `buildMergedSchema` NO se reexporta aqui. Deliberado, y caro de descubrir:
//
// `apps/api/src/db/index.ts` termina con `export const db = await
// getDbInstance()` — un await de nivel superior — y esa inicializacion hace
// `await import("../lib/schema-merger")`. A su vez, `schema-merger` importa
// `db` de forma estatica. El comentario que hay alli dice que el import
// dinamico "rompe el ciclo"; solo lo rompe mientras `schema-merger` no sea
// tambien dependencia ESTATICA del mismo grafo.
//
// Esta linea lo era. Con ella, ESM enlaza `schema-merger` y programa su
// evaluacion DESPUES de `db`: `db` se queda esperando a `schema-merger`, y
// `schema-merger` esperando su turno detras de `db`. Bloqueo permanente, con
// 0% de CPU y sin una sola conexion abierta — el proceso simplemente no
// llegaba a escuchar, y `docker compose up` solo decia "unhealthy".
//
// Se quita en vez de arreglar el ciclo porque no la usaba NADIE: su unico
// consumidor, `apps/api/src/routes/graphql.ts`, la importa directamente de
// `../lib/schema-merger`. Era superficie publica de mas.
//
// La causa de fondo sigue viva: el `await` de nivel superior en `db`. Mientras
// siga ahi, cualquier modulo que vuelva a hacer `schema-merger` alcanzable de
// forma estatica desde este indice reabre el bloqueo. Hay una prueba que lo
// vigila: tests/unit/engine-import-deadlock.test.ts

// ── Security ──
export {
  buildDrizzleWhere,
  buildDatasetWhere,
  createRLSFilter,
  checkReadAccess,
  checkWriteAccess,
} from "../../apps/api/src/lib/rls-builder";
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
export { events as kitsudenEvents, hooks } from "../../apps/api/src/lib/events";
// NOTA: initFunctionDispatcher / initCronScheduler NO se re-exportan aquí.
// Son funciones de arranque del HOST (apps/api las importa directo de sus
// módulos); re-exportarlas desde la fachada creaba la arista compartida del
// mega-ciclo de imports (index → function-dispatcher → actions → handlers →
// agent-engine → agent-tools → index).

// ── Kon Loader ──
export { loadKons, loadModules } from "../../apps/api/src/lib/module-loader";

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

// ── Kon System (Auto-API & MCP Generator) ──
export {
  defineKon,
  registerKon,
  getKon,
  listKons,
  initializeKons,
  createKonAction,
} from "./src/kon";
export type {
  KonOptions,
  Kon,
  GeneratedRoute,
  GeneratedTool,
  MCPTool,
  DrizzleModel,
  InferKonSelect,
  InferKonInsert,
} from "./src/kon";

// ── Query Engine (JSON to SQL with Auto-Join) ──
export {
  parseQuery,
  validateQuery,
  getAvailableRelations,
  registerDynamicRelation,
  fieldWhiteList,
  fieldBlackList,
} from "./src/query-parser";
export type { QueryOptions, QueryResult } from "./src/query-parser";

// ── Query Translator (Fase 2 - JSON to SQL with Auto-Join) ──
export { queryTranslator, validateQueryTranslator, QueryTranslatorError } from "./src/query";
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

// ── Kitsuden QL Engine (Prisma-style JSON to SQL Translator) ──
export {
  parseKitsudenQuery,
  validateKitsudenQuery,
  getAvailableRelations as getKitsudenRelations,
  registerDynamicRelation as registerKitsudenRelation,
  debugQuery,
  KitsudenQLError,
} from "./src/translator";
export type {
  KitsudenQueryOptions,
  KitsudenQueryResult,
  WhereFilter as KitsudenWhereFilter,
  FieldFilter as KitsudenFieldFilter,
  FilterOperator as KitsudenFilterOperator,
  LogicalOperator as KitsudenLogicalOperator,
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

// ── KITSUDEN Brain (Self-Aware Knowledge Layer) ──
export {
  initKitsudenBrain,
  shutdownKitsudenBrain,
  scanProjectKnowledge,
  getBrainIndex,
  getKnowledgeGraph,
  getBrainNeighborhood,
  addBrainNoteWithConnections,
  upsertBrainNote,
  listBrainNotes,
  getBrainNote,
  deleteBrainNote,
  createBrainConnection,
  listBrainConnections,
  searchSimilarBrainNotes,
  generateWiki,
  generateLlms,
  buildKnowledgeGraph,
  neighborhoodGraph,
  discoverConnections,
  scoreConnection,
  createLocalEmbeddingProvider,
  embedTextLocal,
  cosineSimilarity,
  // Segundo Cerebro (Karpathy): sources / author / operations / schema
  captureSource,
  listSources,
  getSource,
  deleteSource,
  hashContent,
  extractSignals,
  summarize,
  keywords,
  headings,
  links,
  suggestBacklinks,
  resolveAuthor,
  createInstructionAuthor,
  createApiAuthor,
  createCliAuthor,
  buildAuthorPrompt,
  capture,
  syncBrain,
  lint,
  digest,
  generateBrainSchemaDoc,
} from "./src/brain";
// ── Cross-cutting: errores, autorización (policies/gates), validación ──
// Viven en el engine para que app y kons (plugins) compartan las mismas capas.
export { AppError, ErrorCode, messageOf, toErrorEnvelope, respondError } from "./src/errors";
export type { ErrorCodeValue, ErrorEnvelope } from "./src/errors";

// Condiciones de base de datos que comprueban en vez de castear.
// `eqEnum` sustituye al `eq(col, valor as any)` que estaba repetido 25 veces:
// con un valor fuera del enum, Postgres no devuelve cero filas — falla.
export { condicionDeEscritura, eqEnum } from "./src/db-conditions";
export {
  scopeConcede,
  definePolicy,
  defineGate,
  can,
  authorize,
  policyMap,
  resetAuthz,
  requireGate,
  requirePolicy,
} from "./src/authz";
export type { AuthzUser, PolicyRule, GateRule } from "./src/authz";
export { validateRequest, validated, parseOrThrow, esUuid } from "./src/validation";
export type { ValidationTarget } from "./src/validation";
export { buscarCamposDesconocidos, claveParecida } from "./src/validation";
export type { CampoDesconocido } from "./src/validation";
export { ROUTE_META, withRouteMeta, describeRoute, readRouteMeta } from "./src/route-meta";
export type { RouteMeta, RouteValidationMeta } from "./src/route-meta";

// ── Synced State (estado en vivo servidor↔panel↔gráfico, estilo replicant) ──
export {
  defineSyncedState,
  getSyncedState,
  listSyncedStateKeys,
  setStateTransport,
  setStateStore,
  resetSyncedState,
  stateChannel,
  createMemoryStateStore,
  SyncedState,
} from "./src/state";
export type {
  StateTransport,
  StateStore,
  SyncedStateOptions,
  SyncedStateMessage,
  Unsubscribe,
} from "./src/state";

// ── Request-scoped DI (tx de RLS + servicios por request, estilo Nest) ──
export {
  runInRequestScope,
  useRequest,
  useUser,
  setRequestTx,
  clearRequestTx,
  provideRequestService,
  resolveExecutor,
} from "./src/request-scope";
export type { RequestScope } from "./src/request-scope";

// ── ORM sugar: repositorio chainable sobre Drizzle (respeta RLS) ──
export { repo, esSintaxisDeEntradaInvalida } from "./src/repository";
export type { Repository, RepositoryOptions, PaginatedResult } from "./src/repository";

// ── Interceptors (before/after/onError componibles, estilo Nest) ──
export {
  applyInterceptors,
  timingInterceptor,
  responseEnvelope,
  cacheControl,
  maskFields,
} from "./src/interceptors";
export type { Interceptor, InterceptorContext } from "./src/interceptors";

export { buildSystemMap } from "./src/system-map";
export type {
  SystemMap,
  SystemMapNode,
  SystemMapEdge,
  SystemMapDatabase,
  SystemMapOptions,
  SystemNodeType,
} from "./src/system-map";
export type {
  BrainConfig,
  BrainIndex,
  BrainNote,
  BrainNoteInput,
  BrainNoteCategory,
  BrainNoteSource,
  BrainConnection,
  BrainConnectionInput,
  BrainScanResult,
  KnowledgeGraph,
  KnowledgeGraphNode,
  KnowledgeGraphEdge,
  EmbeddingProvider,
  ScannedEntity,
  // Segundo Cerebro
  BrainSource,
  BrainSourceInput,
  BrainSourceType,
  ExtractionResult,
  WikiAuthor,
  AuthorTask,
  AuthorResult,
  AuthorMode,
  CaptureResult,
  SyncResult,
  LintReport,
  DigestResult,
  BrainSchemaOptions,
} from "./src/brain";

// ── Code Graph (Graphify + Serena + Sourcegraph como funciones del sistema) ──
export {
  indexFiles,
  indexRepo,
  findSymbol,
  references,
  outline,
  pathBetween,
  communities,
  searchCode,
  commitSearch,
  fileHistory,
  commitShow,
} from "./src/code-graph";

export type {
  SourceFileInput,
  CodeSymbol,
  CodeSymbolKind,
  CodeGraph,
  CodeGraphFile,
  CodeGraphEdge,
  CodeEdgeRelation,
  IndexRepoOptions,
  SymbolMatch,
  SymbolReferences,
  FileOutline,
  Community,
  CodeSearchHit,
  CodeSearchOptions,
  CommitInfo,
  CommitDetail,
  CommitSearchOptions,
} from "./src/code-graph";

// ── Code Graph: visualización, edición semántica y búsqueda por significado ──
export {
  renderGraphHtml,
  renameSymbol,
  replaceSymbolBody,
  safeDeleteSymbol,
  insertBeforeSymbol,
  loadFiles as loadCodeFiles,
  buildSemanticIndex,
  semanticSearch,
} from "./src/code-graph";

export type {
  VisualizeOptions,
  FileEdit,
  EditResult,
  EditOptions,
  CodeEmbeddingProvider,
  SemanticHit,
  SemanticIndex,
  BuildIndexOptions,
} from "./src/code-graph";

// ── Mail (Mailables + drivers + outbox de tests + layout compartido) ──
export {
  Mailer,
  mail,
  layout,
  heading,
  paragraph,
  button,
  panel,
  code as mailCode,
  table as mailTable,
  esc as mailEsc,
  htmlToText,
  logDriver,
  memoryDriver,
  smtpDriver,
  resendDriver,
  driverFromEnv,
  formatAddress,
  addressEmail,
} from "./src/mail";

export type {
  Address,
  Attachment,
  Envelope,
  Content,
  Mailable,
  MailContext,
  SentMessage,
  MailDriver,
  MailerOptions,
  SendResult,
  MemoryDriver,
} from "./src/mail";

// ── LLM: caché semántica + salida estructurada garantizada ──
export {
  SemanticCache,
  memoryStore as llmMemoryStore,
  cosine as cosineSimilarityVec,
  generateStructured,
  extractJson,
  toJsonSchema,
} from "./src/llm";

export type {
  CacheStore,
  EmbeddingProvider as LLMEmbeddingProvider,
  CachedResponse,
  SemanticCacheOptions,
  CacheHit,
  CacheStats,
  StructuredProvider,
  StructuredRequest,
  StructuredMode,
  StructuredResult,
  StructuredOptions,
} from "./src/llm";

// ── Brain: índice de árbol (recuperación por razonamiento, estilo PageIndex) ──
export {
  buildContentTree,
  retrieveFromTree,
  renderIndex as renderTreeIndex,
  readNode as readTreeNode,
  findNode as findTreeNode,
  pathOf as treePathOf,
} from "./src/brain";

export type {
  ContentTree,
  TreeNode,
  TreePath,
  BranchSelector,
  RetrieveOptions,
  RetrievedSection,
} from "./src/brain";

// ── Compilador de campos → Zod ──
// Único camino de validación para cualquier vocabulario de campos del repo:
// datasets, campos personalizados de un kon, o columnas SQL.
export {
  normalizeField,
  normalizeFields,
  normalizeCondition,
  isFieldVisible,
  buildObjectValidator,
  buildFieldValidator,
  validateAgainstFields,
  extractOptionValues,
} from "./src/field-compiler";

export type { NormalizedField, FieldCondition } from "./src/field-compiler";

// ── Enlaces polimórficos entre entidades de cualquier kon ──
// La arista que faltaba: un kon relaciona lo suyo con lo de otro SIN depender
// de él. El motor nunca conoce una tabla concreta — quien llama aporta los
// cargadores. Ver src/links.ts para los dos costes (sin FK, y RLS que no puede
// seguir la arista) y cómo se pagan.
export { link, unlink, unlinkAll, neighbors, resolveNeighbors } from "./src/links";
export type { EntityRef, LinkRow, LinkOptions, NeighborQuery } from "./src/links";

// ── Contrato HTTP para kons ──
// Un kon no puede importar de apps/api (aislamiento de plugins), así que el
// engine declara la forma MÍNIMA del contexto de Hono que el host garantiza.
// Sin esto, cada manejador acaba con `(c as any).get("user")`.
export type { KonUser, KonVariables, KonEnv, KonRouteContext } from "./src/http";
export { requireUser } from "./src/http";
