/**
 * Kitsuden — Code Graph
 * ============================================================================
 * Grafo de código determinista (sin IA): indexer de símbolos + queries de
 * navegación semántica + historia git. Las ventajas de Graphify, Serena y
 * Sourcegraph MCP como funciones del sistema.
 */

export {
  indexFiles,
  indexRepo,
  type SourceFileInput,
  type CodeSymbol,
  type CodeSymbolKind,
  type CodeGraph,
  type CodeGraphFile,
  type CodeGraphEdge,
  type CodeEdgeRelation,
  type IndexRepoOptions,
} from "./indexer";

export {
  findSymbol,
  references,
  outline,
  pathBetween,
  communities,
  searchCode,
  type SymbolMatch,
  type SymbolReferences,
  type FileOutline,
  type Community,
  type CodeSearchHit,
  type CodeSearchOptions,
} from "./queries";

export {
  commitSearch,
  fileHistory,
  commitShow,
  type CommitInfo,
  type CommitDetail,
  type CommitSearchOptions,
} from "./git-history";

// ── Visualización interactiva (HTML autocontenido, sin CDN) ──
export { renderGraphHtml, type VisualizeOptions } from "./visualize";

// ── Edición semántica (dry-run por defecto) ──
export {
  renameSymbol,
  replaceSymbolBody,
  safeDeleteSymbol,
  insertBeforeSymbol,
  loadFiles,
  type FileEdit,
  type EditResult,
  type EditOptions,
} from "./edit";

// ── Búsqueda semántica por embeddings (proveedor inyectado) ──
export {
  buildSemanticIndex,
  semanticSearch,
  type CodeEmbeddingProvider,
  type SemanticHit,
  type SemanticIndex,
  type BuildIndexOptions,
} from "./semantic";
