/**
 * @kitsuden/engine/framework — Las capas PURAS del framework
 * ============================================================================
 *
 * Publicado como `kitsuden/framework`.
 *
 * POR QUÉ EXISTE: el index del engine (`kitsuden/engine`) re-exporta módulos del
 * host (db, auth, storage, queue…), así que importarlo ARRANCA la base de
 * datos. Eso está bien dentro del servidor, pero es inaceptable para el autor
 * de un kon que solo quiere `repo`, `can` o `validateRequest`.
 *
 * Este entry point expone únicamente las capas sin infraestructura: se importa
 * en milisegundos, no abre conexiones y no necesita DATABASE_URL.
 *
 *   import { definePolicy, can, validateRequest, AppError } from "kitsuden/framework";
 *
 * NOTA sobre `repo`: vive en `kitsuden/engine` porque resuelve la conexión por
 * defecto del host. Desde un kon usa siempre la forma inyectada
 * `repo(tabla, { db: ctx.db.instance })`, que es la que recomienda el
 * generador `kitsuden create-kon`.
 */

// ── Autorización (deny-by-default) ──
export {
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
// Agentes en las políticas y la RLS de los kons (arreglos de la fase D)
export {
  actorEfectivo,
  agentePuede,
  agentePuedeEnKon,
  esAdminEfectivo,
  esAgente,
  esStaffEfectivo,
} from "./src/actor-efectivo";
export type { ActorEfectivo, QuienPregunta } from "./src/actor-efectivo";

// ── Zod: la versión única del monorepo (kitsuden2.md C1) ──
export { z } from "./zod";

// ── Validación (FormRequest) ──
export { validateRequest, validated, parseOrThrow } from "./src/validation";

// ── Errores (envelope uniforme) ──
export { AppError, ErrorCode, toErrorEnvelope, respondError } from "./src/errors";

// ── DI request-scoped ──
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

// ── Interceptors (modelo cebolla) ──
export {
  applyInterceptors,
  timingInterceptor,
  responseEnvelope,
  cacheControl,
  maskFields,
} from "./src/interceptors";
export type { Interceptor, InterceptorContext } from "./src/interceptors";

// ── Code Graph (determinista, sin IA) ──
export {
  indexFiles,
  indexRepo,
  findSymbol,
  references,
  outline,
  pathBetween,
  communities,
  searchCode,
  renderGraphHtml,
  renameSymbol,
  replaceSymbolBody,
  safeDeleteSymbol,
  insertBeforeSymbol,
  buildSemanticIndex,
  semanticSearch,
  commitSearch,
  fileHistory,
  commitShow,
} from "./src/code-graph";
export type {
  CodeGraph,
  CodeSymbol,
  SourceFileInput,
  EditResult,
  SemanticHit,
  CodeEmbeddingProvider,
} from "./src/code-graph";

// ── System Map ──
export { buildSystemMap } from "./src/system-map";

// ── Mail — un kon puede definir y registrar sus propios correos ──
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
  htmlToText,
  memoryDriver,
} from "./src/mail";
export type { Mailable, MailContext, SentMessage, Envelope, Content } from "./src/mail";

// ── LLM (puro: caché semántica y salida estructurada) ──
export {
  SemanticCache,
  memoryStore as llmMemoryStore,
  generateStructured,
  extractJson,
} from "./src/llm";
export type { CacheStore, StructuredProvider, StructuredResult } from "./src/llm";

// ── Brain: índice de árbol (determinista, sin IA para construir) ──
export {
  buildContentTree,
  retrieveFromTree,
  renderIndex as renderTreeIndex,
  readNode as readTreeNode,
} from "./src/brain/content-tree";
export type {
  ContentTree,
  TreeNode,
  BranchSelector,
  RetrievedSection,
} from "./src/brain/content-tree";
