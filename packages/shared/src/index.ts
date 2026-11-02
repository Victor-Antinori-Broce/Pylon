export { SITE_CONFIG, BREAKPOINTS, NEON_COLORS } from "./constants";

// ═══════════════════════════════════════════════════════════════════════════
// KON API - Contratos para kons autocontenidos
// ═══════════════════════════════════════════════════════════════════════════

export { defineKon, createKonRouter, KonError, KonErrors, konSetting } from "./kon-api";

export type {
  KonCache,
  KonEvents,
  KonRealtime,
  KonAuth,
  KonStorage,
  KonDatabase,
  KonContext,
  KonRouterFactory,
  KonDefinition,
  KonRateLimit,
  // Content Publishing
  ContentTarget,
  ContentTargetInfo,
  KonContentPublishing,
  PromotionData,
  PromotionOptions,
  PromotionSource,
  PublishResult,
  // OpenAPI
  KonOpenApiSpec,
  KonOpenApiPath,
  KonOpenApiTag,
  OpenApiMethod,
} from "./kon-api";

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
  EditorialDeBloque,
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
// KON PACKAGE — Contrato para paquetes npm
// ═══════════════════════════════════════════════════════════════════════════

export type {
  KonPackage,
  KonPackageMinimal,
  KonDependencies,
  KonMountConfig,
  KonTableConfig,
  KonLifecycleHooks,
} from "./kon-package";

export { isValidKonPackage } from "./kon-package";

// Bloques → HTML. Un solo renderizador para la API y para el panel: si cada
// uno tuviera el suyo, la vista previa dejaría de ser una vista previa.
export {
  renderizarBloques,
  escaparHtml,
  urlSegura,
  urlDeIncrustacion,
  TIPOS_ESTATICOS,
  TIPOS_INTERACTIVOS,
  type BloqueDeContenido,
  type OpcionesDeRender,
  type ResultadoDeRender,
} from "./render-blocks";

// ═══════════════════════════════════════════════════════════════════════════
// ANÁLISIS DE MAZO - El vocabulario, compartido entre el cargador y la web
// ═══════════════════════════════════════════════════════════════════════════
// Lo necesitan los dos: el cargador construye con él el ESQUEMA del dataset
// editorial y la web sabe qué campos leer y cómo llamarlos. Por duplicado,
// añadir una barra la dejaría guardada y sin pintar en el otro lado.
export {
  BARRAS_DE_MAZO,
  MEDIDAS_DE_HABILIDAD,
  MEDIDAS_DE_CARTA,
  TIPOS_DE_MAZO,
  CALIFICACIONES,
  CURVAS_DE_APRENDIZAJE,
  PAPELES_DE_CARTA,
  FASES_DE_AGUANTE,
  FACTORES_DE_NOTA,
  notaPonderada,
  type MedidaDeAnalisis,
} from "./analisis-de-mazo";

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
// RLS BUILDER - Utilidades de Row Level Security para kons
// ═══════════════════════════════════════════════════════════════════════════

export {
  buildDrizzleWhere,
  buildDatasetWhere,
  checkReadAccess,
  checkWriteAccess,
  createRLSFilter,
  publishedOrOwn,
  publishedOrOwnQl,
} from "./rls-builder";

export type { RLSType, RLSRule, PolicyJson, RLSUser } from "./rls-builder";

// ── Vistas de admin agnósticas al framework ──
export {
  isValidElementName,
  isSafeAssetPath,
  isValidKonId,
  adminAssetUrl,
  resolveCustomView,
  descriptorFromView,
  createViewContext,
  CustomViewError,
} from "./admin-view";
export type { CustomViewDescriptor, ResolvedCustomView, AdminViewContext } from "./admin-view";

// ── Contrato público del Admin Registry ──
export {
  ADMIN_REGISTRY_VERSION,
  CONTRACT_HEADER,
  assertSupportedContract,
} from "./admin-registry-contract";
export type {
  AdminRegistryResponse,
  AdminRegistryKonResponse,
  AdminRegistryKon,
  AdminRegistryTable,
  AdminRegistryView,
} from "./admin-registry-contract";

// ── Registro único de tipos de campo ──
// Fuente de verdad para: qué tipos existen, cómo validan, cómo se indexan y
// cuáles se ofrecen en la paleta del admin.
export {
  FIELD_TYPES,
  FIELD_TYPE_NAMES,
  FIELD_TYPE_ALIASES,
  resolveFieldType,
  fieldTypeSpec,
  creatableFieldTypes,
  shouldIndexByDefault,
  shouldSearchByDefault,
} from "./field-types";
export type {
  FieldTypeName,
  FieldTypeSpec,
  FieldValueKind,
  FieldStringFormat,
} from "./field-types";
export type { FieldTypeAlias } from "./field-types";

export {
  readDatasetCatalog,
  datasetImageUrl,
  datasetNumber,
  DATASET_MAX_ROWS,
} from "./dataset-catalog";
export type {
  DatasetCatalog,
  /**
   * `DatasetEntry` ya lo exporta `./schemas` (el inferido de zod), y reexportar
   * los dos con el mismo nombre rompía la construcción del paquete entero:
   *
   *     src/index.ts(129,3): error TS2300: Duplicate identifier 'DatasetEntry'.
   *
   * Sin `.d.ts`, quien importe `@kitsuden/shared` recibe `any` en silencio —por
   * eso el script de build lo trata como error y no como aviso—. Se desambigua
   * aquí, en el barril, sin tocar ninguno de los dos módulos: nadie importaba
   * este tipo por su nombre corto todavía.
   */
  DatasetEntry as DatasetCatalogEntry,
  DatasetField,
  DatasetReader,
} from "./dataset-catalog";

// ═══════════════════════════════════════════════════════════════════════════
// COMENTARIOS - de qué se puede comentar, declarado en un solo sitio
// ═══════════════════════════════════════════════════════════════════════════
export {
  SUJETOS_COMENTABLES,
  TIPOS_DE_SUJETO,
  esTipoDeSujeto,
  sujetoComentable,
} from "./comment-subjects";
export type { SujetoComentable, TipoDeSujeto } from "./comment-subjects";

// Direcciones del sitio público: todo en ruta, juegos en /<juego>/ y su wiki en /<juego>/wiki/
export {
  SEGMENTOS_RESERVADOS_DEL_SITIO,
  leerSegmentosReservados,
  motivoDeSlugDeJuegoInvalido,
  motivoDeSlugDeWikiInvalido,
  slugDeJuego,
} from "./sitio-publico";

// Enlaces de wiki: la misma regla para indexar (servidor) y pintar (frontend)
export { slugDePaginaWiki, extraerEnlacesWiki, renderizarEnlacesWiki } from "./wiki-enlaces";
export type { EnlaceWiki } from "./wiki-enlaces";
export { markdownSeguro } from "./render-blocks";
export { renderizarPaginaWiki } from "./wiki-enlaces";
export { URL_PUBLICA_POR_DEFECTO, urlPublicaEfectiva } from "./sitio-publico";
export { NOMBRES_DEL_SITIO_POR_DEFECTO, nombreDelSitioEfectivo } from "./sitio-publico";

// Campos de un dataset con cualquiera de las dos formas de `schema`
export { camposDelSchema } from "./field-types";

export { TIERS, TRAMOS, tramoPorPosicion } from "./tramos-de-tier";
export type { TramoDeTier } from "./tramos-de-tier";

export {
  LETRAS,
  ETIQUETAS,
  NIVELES,
  NOTA_DE_NIVELES,
  minimoParaLetra,
  nivelesDeMeta,
} from "./niveles-de-meta";
export type { NivelDeMeta, ArquetipoGraduable } from "./niveles-de-meta";

// ═══════════════════════════════════════════════════════════════════════════
// VERSIONES DE CONTRATO — lo que publica GET /api/version (Inti y otros clientes)
// ═══════════════════════════════════════════════════════════════════════════
export { CONTRATOS, SDKS, VERSION_DE_KITSUDEN } from "./contratos";
export type { NombreDeContrato, RespuestaDeVersion } from "./contratos";

// ═══════════════════════════════════════════════════════════════════════════
// ERRORES - Catálogo estable (RFC 9457) para la API, el MCP y los clientes
// ═══════════════════════════════════════════════════════════════════════════

export {
  KITSUDEN_ERRORS,
  DOCS_DE_ERRORES,
  PROBLEM_JSON,
  isKitsudenErrorCode,
  errorDocsUrl,
  errorCodeForStatus,
  errorCodeFromLegacy,
  buildProblem,
  parseRetryAfter,
} from "./errores";
export type { ErrorCatalogEntry, KitsudenErrorCode, ProblemDetails } from "./errores";

// ═══════════════════════════════════════════════════════════════════════════
// SDK DE KONS — el contrato de una operación (docs/kons/README.md)
// ═══════════════════════════════════════════════════════════════════════════

export {
  VERSION_SDK_DE_KONS,
  defineOperacion,
  comprobarOperaciones,
  esSensible,
  esSoloLectura,
  esIdempotente,
  exclusionMcp,
  erroresDeOperacion,
  nombreCortoDeKon,
  scopeFinoDeOperacion,
  nombreDeHerramienta,
  operationIdDe,
  scopeCubre,
  scopesQueConceden,
  concedePorScopes,
  costeDeOperacion,
  identidadesDeOperacion,
  denegacionDeOperacion,
  porQueSeConcede,
  esquemaFecha,
  esquemaUuid,
  ARGUMENTO_CUERPO_MCP,
  ARGUMENTO_IDEMPOTENCIA_MCP,
  parametrosDeRuta,
  guiaCorta,
  esRedireccion,
  ESTADOS_DE_REDIRECCION,
} from "./operaciones";
export type {
  GuiaDeOperacion,
  MetodoDeOperacion,
  AccesoDeOperacion,
  PermisoDeOperacion,
  SalidaDeOperacion,
  EntradaDeOperacion,
  McpDeOperacion,
  EntradaValidada,
  UsuarioDeOperacion,
  ContextoDeOperacion,
  OperacionDeKon,
  ConcesionPorScope,
  EstadoDeExito,
  EstadoDeRedireccion,
} from "./operaciones";

// ═══════════════════════════════════════════════════════════════════════════
// PERMISOS DE AGENTE — amplios + finos + denegaciones (docs/agents/permissions.md)
// ═══════════════════════════════════════════════════════════════════════════

export {
  PREFIJO_DENEGACION,
  esDenegacion,
  partirScopes,
  patronCubre,
  denegacionQueCubre,
  concesionQueCubre,
  concedeScope,
  agenteActuaComoUsuario,
  abreKonEntero,
  SCOPE_ACTUAR_COMO_USUARIO,
  motivoDeScopeInvalido,
  normalizarScopes,
  MAX_SCOPES_POR_AGENTE,
  ACCIONES_DE_DATASET,
  scopeDeDataset,
  accesoADataset,
  agenteEscribePorPolitica,
  PRESETS_DE_AGENTE,
  SCOPES_AMPLIOS_DEL_NUCLEO,
} from "./permisos-de-agente";
export type { AccionDeDataset, PresetDeAgente } from "./permisos-de-agente";

// ═══════════════════════════════════════════════════════════════════════════
// APROBACIÓN HUMANA — propuestas de agentes (fase F, docs/agents/approvals.md)
// ═══════════════════════════════════════════════════════════════════════════

export {
  MODOS_DE_APROBACION,
  esModoDeAprobacion,
  RETENCIONES_DE_PROPUESTA,
  esRetencionDePropuesta,
  CONFIG_DE_APROBACIONES_POR_DEFECTO,
  TTL_MIN_HORAS,
  TTL_MAX_HORAS,
  ESTADOS_DE_PROPUESTA,
  esMetodoDeEscritura,
  decidirAprobacion,
  regexDePatron,
  reglaLegadaCasa,
  motivoDeReglaInvalida,
  fusionarConfigDeAprobaciones,
  leerConfigDeAprobaciones,
  claveDeHerramientaMcp,
  herramientaMcpSensiblePorDefecto,
} from "./aprobaciones";
export type {
  ModoDeAprobacion,
  RetencionDePropuesta,
  ReglaLegadaDeAprobacion,
  ConfigDeAprobaciones,
  EstadoDePropuesta,
  MotivoDePropuesta,
} from "./aprobaciones";

// ═══════════════════════════════════════════════════════════════════════════
// FIRMANTE HUMANO DE UN AGENTE (fase F, docs/agents/approvals.md)
// ═══════════════════════════════════════════════════════════════════════════

export { ROLES_DE_FIRMANTE, puedeFirmar, firmaDeAgente } from "./firmante";
export type { FirmanteDeAgente, FirmaResuelta } from "./firmante";

// Patrones de validación sin ReDoS (auditoría 2026-10-25)
export {
  patronSeguro,
  probarPatron,
  LONGITUD_MAXIMA_DE_PATRON,
  LONGITUD_MAXIMA_A_PROBAR,
} from "./patron-seguro";

// ═══════════════════════════════════════════════════════════════════════════
// PROMOCIÓN DE CÓDIGO DE AGENTES (fase I, docs/agents/promotion.md)
// ═══════════════════════════════════════════════════════════════════════════

export {
  MODOS_DE_PROMOCION,
  esModoDePromocion,
  CONFIG_DE_PROMOCION_POR_DEFECTO,
  LIMITES_DE_CONFIG_DE_PROMOCION,
  fusionarConfigDePromocion,
  leerConfigDePromocion,
  ESTADOS_DE_VERSION,
  LIMITES_DE_CODIGO_POR_DEFECTO,
  capacidadesDe,
  hostCubre,
  diffDeCapacidades,
  toqueDeCamino,
  toqueDeScope,
  nombreDeSecreto,
  MOTIVOS_DE_RESPALDO,
  decidirPromocion,
  MAX_PRUEBAS_POR_BORRADOR,
  MAX_BYTES_DE_CODIGO,
} from "./promocion";
export type {
  ModoDePromocion,
  ConfigDePromocion,
  EstadoDeVersion,
  CapacidadesDeCodigo,
  DiffDeCapacidades,
  ToqueSensible,
  MotivoDeRespaldo,
  ResumenDePruebas,
  EntradaDeDecision,
  DecisionDePromocion,
  RespuestaSimulada,
  CasoDePrueba,
} from "./promocion";
export { escanearCodigo, MAX_BYTES_ESCANEABLES } from "./escaneo-de-codigo";
export type {
  SeveridadDeHallazgo,
  HallazgoDeEscaneo,
  LlamadaDeApi,
  InformeDeEscaneo,
  OpcionesDeEscaneo,
} from "./escaneo-de-codigo";

// Fase H3: defineModelo (un modelo → tabla, migración, REST/MCP/OpenAPI, RLS, panel)
export * from "./modelos";
export * from "./modelos-sql";
