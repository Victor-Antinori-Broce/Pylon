import { t as tr } from "$lib/i18n";
/**
 * Grimoire Loader v2 — Zero Config Edition
 *
 * Consumes /api/admin/registry for auto-discovered grimoire configurations.
 * Falls back to DataExplorer for any grimoire without custom views.
 *
 * Flow:
 * 1. Fetch registry from API (auto-scanned from grimoire.json files)
 * 2. Check GRIMOIRE_VIEW_REGISTRY for hardcoded custom views (legacy support)
 * 3. If custom view exists → load it
 * 4. If no custom view → use DataExplorer with auto-generated config
 */

import type { Component } from "svelte";

import { getUser } from "./auth.svelte";

import type { AdminConfig } from "./types/admin";

const API_URL = import.meta.env.VITE_API_URL ?? "";

// Legacy registry for hardcoded custom views (gradually migrating to auto-detection)
export const GRIMOIRE_VIEW_REGISTRY: Record<string, () => Promise<{ default: Component<any> }>> = {
  // These override auto-detection - useful for complex views

  // ═══ CORE GRIMOIRES ═══
  // DataSets - Core grimoire for dynamic data collections
  datasets: () => import("$views/DataSets.svelte"),
  "kon-datasets": () => import("$views/DataSets.svelte"),
  "grimoire-datasets": () => import("$views/DataSets.svelte"),

  // Media Library - File uploads and management
  "media-library": () => import("$views/Media.svelte"),
  media: () => import("$views/Media.svelte"),
  "kon-media": () => import("$views/Media.svelte"),
  "grimoire-media": () => import("$views/Media.svelte"),

  // Page Builder - Block-based layouts (Core Grimoire)
  blocks: () => import("$views/blocks/BlocksView.svelte"),
  "kon-blocks": () => import("$views/blocks/BlocksView.svelte"),
  "grimoire-blocks": () => import("$views/blocks/BlocksView.svelte"),

  // Blog - Content publishing (Core Grimoire)
  blog: () => import("$views/content/PostsView.svelte"),
  "kon-blog": () => import("$views/content/PostsView.svelte"),
  "grimoire-blog": () => import("$views/content/PostsView.svelte"),

  // ═══ FEATURE GRIMOIRES ═══

  games: () => import("$views/games/GamesView.svelte"),
  "kon-games": () => import("$views/games/GamesView.svelte"),

  // Grimoires with non-standard view paths
  academy: () => import("$views/academy/AcademyView.svelte"),
  "grimoire-academy-lms": () => import("$views/academy/AcademyView.svelte"),
  "kon-academy-lms": () => import("$views/academy/AcademyView.svelte"),
  streamers: () => import("$views/users/StreamersView.svelte"),
  "grimoire-streamers": () => import("$views/users/StreamersView.svelte"),
  "kon-streamers": () => import("$views/users/StreamersView.svelte"),
  connectors: () => import("$views/admin/connectors/ConnectorsView.svelte"),

  // ═══ DOCUMENT MANAGEMENT ═══
  dms: () => import("$views/dms/DMSView.svelte"),
  "grimoire-dms": () => import("$views/dms/DMSView.svelte"),
  "kon-dms": () => import("$views/dms/DMSView.svelte"),

  // ═══ OCR / VEKDOCS — Ajustes IA (LLM de visión) ═══
  "kon-ocr-training": () => import("$views/ocr/VisionConfigView.svelte"),
  "vision-config": () => import("$views/ocr/VisionConfigView.svelte"),
  "grimoire-vekdocs": () => import("$views/ocr/VisionConfigView.svelte"),

  // ═══ CRM CUSTOM VIEWS (Hybrid Rendering) ═══
  "grimoire-crm-dashboard": () => import("$views/crm/CrmDashboard.svelte"),
  "grimoire-crm-deal-form": () => import("$views/crm/DealForm.svelte"),
  "crm-dashboard": () => import("$views/crm/CrmDashboard.svelte"),
  "crm-deal-form": () => import("$views/crm/DealForm.svelte"),
  "kon-crm-dashboard": () => import("$views/crm/CrmDashboard.svelte"),
  "kon-crm-deal-form": () => import("$views/crm/DealForm.svelte"),

  // ═══ CONTA CUSTOM VIEWS (Hybrid Rendering) ═══
  "grimoire-conta-journal-form": () => import("$views/conta/JournalForm.svelte"),
  "grimoire-conta-reports": () => import("$views/conta/ReportsView.svelte"),
  "grimoire-conta-disbursement-form": () => import("$views/conta/DisbursementForm.svelte"),
  "grimoire-conta-template-form": () => import("$views/conta/TemplateForm.svelte"),
  "conta-journal-form": () => import("$views/conta/JournalForm.svelte"),
  "conta-reports": () => import("$views/conta/ReportsView.svelte"),
  "conta-disbursement-form": () => import("$views/conta/DisbursementForm.svelte"),
  "conta-template-form": () => import("$views/conta/TemplateForm.svelte"),
  "kon-conta-journal-form": () => import("$views/conta/JournalForm.svelte"),
  "kon-conta-reports": () => import("$views/conta/ReportsView.svelte"),
  "kon-conta-disbursement-form": () => import("$views/conta/DisbursementForm.svelte"),
  "kon-conta-template-form": () => import("$views/conta/TemplateForm.svelte"),

  // ═══ NEWSLETTER — panel completo del kon ═══
  "grimoire-newsletter-dashboard": () => import("$views/newsletter/NewsletterView.svelte"),
  "kon-newsletter-dashboard": () => import("$views/newsletter/NewsletterView.svelte"),
  "newsletter-dashboard": () => import("$views/newsletter/NewsletterView.svelte"),

  // ═══ BLOG / BLOCKS / DMS / ACADEMY / GAMES — Per-view custom registration ═══
  "grimoire-blog-posts": () => import("$views/content/PostsView.svelte"),
  "grimoire-blocks-pages": () => import("$views/blocks/BlocksView.svelte"),
  "grimoire-dms-dashboard": () => import("$views/dms/DMSView.svelte"),
  "grimoire-academy-lms-dashboard": () => import("$views/academy/AcademyView.svelte"),
  "grimoire-games-collections": () => import("$views/games/GamesView.svelte"),
  "kon-blog-posts": () => import("$views/content/PostsView.svelte"),
  "kon-blocks-pages": () => import("$views/blocks/BlocksView.svelte"),
  "kon-dms-dashboard": () => import("$views/dms/DMSView.svelte"),
  "kon-academy-lms-dashboard": () => import("$views/academy/AcademyView.svelte"),
  "kon-games-collections": () => import("$views/games/GamesView.svelte"),

  // ═══ SYSTEM TOOLS (formerly hardcoded admin routes) ═══
  // Per-view keys use {grimoireId}-{viewId} format for hybrid rendering lookup
  "system-tools": () => import("$views/system-tools/AgentsView.svelte"),
  "system-tools-agents": () => import("$views/system-tools/AgentsView.svelte"),
  agents: () => import("$views/system-tools/AgentsView.svelte"),
  "system-tools-builder": () => import("$views/system-tools/BuilderView.svelte"),
  builder: () => import("$views/system-tools/BuilderView.svelte"),
  /**
   * El editor de contenido ya no es una vista del sistema: es EL editor.
   *
   * Apuntaban a `EditorView`, una pantalla que ignoraba `?collection` e `?id` y
   * cuyo boton de guardar no tenia `onclick`. Ahora ambas claves llevan al
   * editor de verdad, que carga el post y lo guarda. `EditorView` se retiro:
   * sus dos capacidades —markdown con vista previa y bloques— viven dentro de
   * `BlogPostEditor`, como modo de escritura y como pestaña.
   */
  "system-tools-editor": () => import("$lib/components/blog/BlogPostEditor.svelte"),
  editor: () => import("$lib/components/blog/BlogPostEditor.svelte"),
};

/** Hay sesión y no es admin (un editor): las rutas /api/admin/registry le dan 403. */
function soloStaff(): boolean {
  const u = getUser() as { role?: string } | null;
  return !!u && u.role !== "admin";
}

// Cache for registry
let registryCache: GrimoireRegistryResponse | null = null;
let registryCacheTime = 0;
const REGISTRY_CACHE_TTL = 60_000; // 1 minute

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface GrimoireAdminConfig {
  id: string;
  name: string;
  icon?: string;
  category: "core" | "content" | "data" | "system" | "esports";
  hasCustomView: boolean;
  tables: AdminTableConfig[];
  views: AdminViewConfig[];
  defaultView: string;
  /** Custom API base path (e.g., /api/directory) - if not set, uses /api/explorer */
  apiBase?: string;
}

export interface AdminTableConfig {
  name: string;
  label: string;
  icon?: string;
  description?: string;
  primaryKey?: string;
  searchableFields?: string[];
  filterableFields?: string[];
  readonly?: boolean;
}

export interface AdminViewConfig {
  id: string;
  /**
   * `element` es como un kon aporta su propia pantalla: un Web Component que
   * el admin carga en ejecucion desde el propio kon, sin compilarse contra el.
   * Faltaba aqui, asi que esas vistas se trataban como rejilla.
   */
  type: "grid" | "kanban" | "calendar" | "custom" | "element";
  /** Solo para `element`: nombre de la etiqueta. */
  element?: string;
  /** Solo para `element`: ruta del script dentro del kon. */
  src?: string;
  title: string;
  table?: string;
  component?: string;
}

interface GrimoireRegistryResponse {
  success: boolean;
  /**
   * La clave se llama `kons`, no `grimoires`.
   *
   * El servidor (`apps/api/src/routes/admin-registry.ts`) devuelve `kons`; este
   * cliente leia `grimoires`, asi que obtenia `undefined` y el `.find()` de mas
   * abajo reventaba con
   *
   *     Cannot read properties of undefined (reading 'find')
   *
   * y toda pantalla de kon mostraba «Failed to Load». Es el rastro de un
   * renombrado aplicado en un lado y no en el otro: `grimoire` es la marca,
   * `kon` el nombre descriptivo, y el registro va de kons.
   */
  kons: GrimoireAdminConfig[];
  total: number;
  withCustomViews: number;
  generatedAt: string;
  error?: string;
}

export interface SidebarItem {
  path: string;
  label: string;
  icon: string;
  category: string;
  subItems?: { path: string; label: string; viewId: string }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch admin registry from API (auto-discovered grimoires)
 */
export async function fetchAdminRegistry(): Promise<GrimoireAdminConfig[]> {
  // El registro es de admin (403 al editor): sin pedirlo, se usan las vistas
  // propias del panel, que es lo que acababa haciendo igualmente.
  if (soloStaff()) return [];

  // Check cache
  if (registryCache && Date.now() - registryCacheTime < REGISTRY_CACHE_TTL) {
    return registryCache.kons ?? [];
  }

  try {
    const res = await fetch(`${API_URL}/api/admin/registry`, {
      credentials: "include",
    });

    if (!res.ok) {
      console.warn("[GrimoireLoader] Failed to fetch registry, falling back to legacy mode");
      return [];
    }

    const data: GrimoireRegistryResponse = await res.json();

    if (!data.success) {
      throw new Error(data.error || tr("grimoireLoader.errorDesconocido"));
    }

    registryCache = data;
    registryCacheTime = Date.now();
    return data.kons ?? [];
  } catch (e) {
    console.error("[GrimoireLoader] Registry fetch failed:", e);
    return [];
  }
}

/**
 * Get config for a specific grimoire
 */
export async function getGrimoireConfig(grimoireId: string): Promise<GrimoireAdminConfig | null> {
  // First check registry
  const registry = await fetchAdminRegistry();
  const fromRegistry = registry.find((g) => g.id === grimoireId);

  if (fromRegistry) {
    return fromRegistry;
  }

  // Si el listado llegó, es la fuente completa: un kon que no está en él no
  // tiene configuración de admin (los del núcleo traen vista propia), y pedirlo
  // por id solo producía un 404 en consola en cada visita a Datasets o Páginas.
  if (registry.length > 0 || soloStaff()) return null;

  // Fallback to API fetch (solo cuando el listado no se pudo cargar)
  try {
    const res = await fetch(`${API_URL}/api/admin/registry/${grimoireId}`, {
      credentials: "include",
    });

    if (res.ok) {
      const data = await res.json();
      return data.grimoire || null;
    }
  } catch (e) {
    console.error(`[GrimoireLoader] Failed to fetch config for ${grimoireId}:`, e);
  }

  return null;
}

/**
 * Auto-detect if a view exists by checking glob patterns
 * This runs at build time due to Vite's import.meta.glob
 */
function autoDetectView(grimoireId: string): boolean {
  const viewModules = import.meta.glob("/src/views/**/*.svelte", { eager: true });

  const shortId = grimoireId.replace(/^(grimoire-|kon-)/, "");
  const pascal = pascalCase(shortId);
  const pascalFull = pascalCase(grimoireId);

  const possiblePaths = [
    `/src/views/${shortId}/${pascal}View.svelte`,
    `/src/views/${shortId}/index.svelte`,
    `/src/views/${pascal}View.svelte`,
    `/src/views/${grimoireId}/${pascalFull}View.svelte`,
    `/src/views/${grimoireId}/index.svelte`,
    `/src/views/${pascalFull}View.svelte`,
    `/src/views/content/${pascal}View.svelte`,
    `/src/views/users/${pascal}View.svelte`,
  ];

  return possiblePaths.some((path) => path in viewModules);
}

/**
 * Check if grimoire has a custom view (legacy registry OR auto-detected)
 *
 * Hybrid Rendering support:
 * - If viewId is provided, checks for `{grimoireId}-{viewId}` in registry
 * - Falls back to legacy grimoire-level registry entry
 */
export function hasCustomView(grimoireId: string, viewId?: string): boolean {
  // Priority 1a: Per-view registry (new hybrid system)
  if (viewId) {
    const viewKey = `${grimoireId}-${viewId}`;
    if (viewKey in GRIMOIRE_VIEW_REGISTRY) {
      return true;
    }
  }

  // Priority 1b: Legacy hardcoded registry (full grimoire monolith)
  if (grimoireId in GRIMOIRE_VIEW_REGISTRY) {
    return true;
  }

  // Priority 2: Check cached registry (API detection)
  if (registryCache) {
    const grimoire = (registryCache.kons ?? []).find((g) => g.id === grimoireId);
    if (grimoire?.hasCustomView) return true;
  }

  // Priority 3: Auto-detect at build time
  return autoDetectView(grimoireId);
}

/**
 * Load custom view component for a grimoire
 *
 * Hybrid Rendering support:
 * - If viewId is provided, tries `{grimoireId}-{viewId}` first
 * - Falls back to legacy grimoire-level registry entry
 */
export async function loadCustomView(
  grimoireId: string,
  viewId?: string
): Promise<Component | null> {
  // Priority 1a: Per-view registry (new hybrid system)
  if (viewId) {
    const viewKey = `${grimoireId}-${viewId}`;
    const viewLoader = GRIMOIRE_VIEW_REGISTRY[viewKey];
    if (viewLoader) {
      try {
        const mod = await viewLoader();
        return mod.default;
      } catch (err) {
        console.error(`[GrimoireLoader] Failed to load view ${viewKey}:`, err);
      }
    }
  }

  // Priority 1b: Legacy registry (full grimoire monolith)
  const legacyLoader = GRIMOIRE_VIEW_REGISTRY[grimoireId];
  if (legacyLoader) {
    try {
      const mod = await legacyLoader();
      return mod.default;
    } catch (err) {
      console.error(`[GrimoireLoader] Failed to load legacy view for ${grimoireId}:`, err);
    }
  }

  // Priority 2: Auto-detected view by convention using Vite's import.meta.glob
  // This guarantees Vite statically analyzes and bundles the view components
  const viewModules = import.meta.glob("/src/views/**/*.svelte");

  const shortId = grimoireId.replace(/^(grimoire-|kon-)/, "");
  const pascal = pascalCase(shortId);
  const pascalFull = pascalCase(grimoireId);

  // Auto-detection paths - must match API's detectCustomView logic
  const possiblePaths = [
    // With short ID (e.g., formulas/FormulasView.svelte)
    `/src/views/${shortId}/${pascal}View.svelte`,
    `/src/views/${shortId}/index.svelte`,
    `/src/views/${pascal}View.svelte`,
    // With full ID (e.g., grimoire-formulas/GrimoireFormulasView.svelte)
    `/src/views/${grimoireId}/${pascalFull}View.svelte`,
    `/src/views/${grimoireId}/index.svelte`,
    `/src/views/${pascalFull}View.svelte`,
    // Special folder mappings (common conventions)
    `/src/views/content/${pascal}View.svelte`, // blog → content/PostsView.svelte
    `/src/views/users/${pascal}View.svelte`, // streamers → users/StreamersView.svelte
  ];

  for (const path of possiblePaths) {
    if (viewModules[path]) {
      try {
        const mod = (await viewModules[path]()) as { default: Component };
        return mod.default;
      } catch (err) {
        console.error(`[GrimoireLoader] Failed to load view at ${path}:`, err);
      }
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate AdminConfig from grimoire registry for DataExplorer
 *
 * @param grimoire - Grimoire config from registry
 * @param viewId - Optional: generate config for a single view only (hybrid rendering)
 */
/**
 * ── SOBRE `table: v.table || …` ────────────────────────────────────────────
 *
 * El respaldo era `grimoire.id`, y eso convertía «esta vista no dice qué tabla
 * enseña» en «la tabla se llama kon-booking». El panel pedía el esquema de una
 * tabla con el id del kon por nombre y el formulario decía
 *
 *     Could not load schema for table "kon-booking"
 *
 * — el id disfrazado de tabla que falta. Es el mismo respaldo que ya se quitó
 * de `DataExplorer`; vivía aquí también.
 *
 * Ahora cae a la PRIMERA tabla declarada por el kon, que al menos existe. Se
 * conserva `grimoire.id` como último recurso porque un kon sin tablas
 * declaradas no tiene nada mejor que ofrecer, y ahí el 404 posterior es
 * información honesta: no hay tabla que enseñar.
 */
export function generateExplorerConfig(
  grimoire: GrimoireAdminConfig,
  viewId?: string
): AdminConfig {
  // Only explorer-renderable views: DataExplorer has no branch for type "custom",
  // so a custom view left in here renders as an unrelated grid. Custom views are
  // mounted by GrimoirePage via loadCustomView(), not by DataExplorer.
  // Ni `custom` ni `element`: el explorador no sabe pintarlos y los mostraria
  // como una rejilla ajena. Los monta GrimoirePage, cada uno por su via.
  let sourceViews = grimoire.views.filter((v) => v.type !== "custom" && v.type !== "element");
  if (viewId) {
    /**
     * Si el id pedido no corresponde a ninguna vista, se dejan TODAS.
     *
     * Filtrar a cero convierte «no conozco esa vista» en «este kon no tiene
     * nada que enseñar», y a partir de ahí no hay vista activa, no hay tabla
     * activa, y el modal de alta acaba pidiendo el esquema de una tabla con el
     * nombre del kon. Cuatro pasos hasta un mensaje que acusa a una tabla que
     * nadie creó nunca.
     *
     * Quedarse con todas es lo peor que puede pasar aquí: se abre la primera
     * pestaña, que es exactamente lo que hace un kon sin vista por defecto.
     */
    const soloLaPedida = sourceViews.filter((v) => v.id === viewId);
    if (soloLaPedida.length > 0) sourceViews = soloLaPedida;
  }

  // Build views with proper typing
  const views = sourceViews.map((v) => {
    const baseView = {
      id: v.id,
      title: v.title,
    };

    switch (v.type) {
      case "kanban":
        return {
          ...baseView,
          type: "kanban" as const,
          table: v.table || grimoire.tables[0]?.name || grimoire.id,
          groupBy: (v as any).groupBy || "status", // Default grouping
        };
      case "calendar":
        return {
          ...baseView,
          type: "calendar" as const,
          table: v.table || grimoire.tables[0]?.name || grimoire.id,
          dateField: (v as any).dateField || "created_at",
          titleField: (v as any).titleField || "name",
        };
      case "grid":
      default:
        return {
          ...baseView,
          type: "grid" as const,
          table: v.table || grimoire.tables[0]?.name || grimoire.id,
          rowActions: (v as any).rowActions,
          bulkActions: (v as any).bulkActions,
          /**
           * ── ESTO SE PERDIA AQUI ───────────────────────────────────────────
           *
           * `defaultFilter` viene del `kon.json` y aqui no se copiaba. Blog
           * declara dos vistas sobre la MISMA tabla:
           *
           *     { id: "drafts",    table: "blog_posts", defaultFilter: { status: "draft" } }
           *     { id: "scheduled", table: "blog_posts", defaultFilter: { status: "scheduled" } }
           *
           * Sin el filtro las dos piden `blog_posts` entera, asi que
           * «Programados» enseñaba los borradores y «Borradores» enseñaba los
           * programados. No fallaba: enseñaba lo mismo en las dos, que es la
           * unica forma de que dos pestañas distintas parezcan estar rotas sin
           * dar un solo error.
           */
          defaultFilter: (v as any).defaultFilter,
        };
    }
  });

  return {
    name: grimoire.name,
    singularName: grimoire.tables[0]?.label || tr("dataExplorer.registro"),
    icon: grimoire.icon || "Database",
    views,
    /**
     * Sin `apiBase` NO se inventa un endpoint.
     *
     * ── EL FALLO QUE ESTO CORRIGE ────────────────────────────────────────────
     *
     * Aquí ponía `/api/explorer/${grimoire.tables[0]?.name}`: la PRIMERA tabla
     * del kon, fija, la misma para todas las vistas. Y DataExplorer la usa tal
     * cual, porque su `getEndpoint()` trata una ruta de tres segmentos como
     * definitiva:
     *
     *     if (segments.length >= 3) return base;   // /api/explorer/cursos
     *
     * Resultado: en Academy, las once pestañas pedían `cursos`. Pulsabas
     * «Temas», la pestaña se marcaba, `loadSchema()` iba a por el esquema de
     * `temas`… y los datos seguían viniendo de `cursos`. Desde fuera parecía
     * que las pestañas no hacían nada.
     *
     * Es la causa real de «no puedo moverme entre opciones dentro de cada kon»,
     * y estuvo tapada por dos intentos de arreglo en DataExplorer: allí se
     * decidía bien QUÉ tabla estaba activa, pero el endpoint que se consultaba
     * lo imponía este valor.
     *
     * Omitiéndolo, DataExplorer construye `/api/explorer/<tabla de la vista>`.
     * `apiBase` sí se respeta cuando el kon lo declara: son dos segmentos
     * (`/api/directory`) y DataExplorer le añade la tabla.
     */
    apiEndpoint: grimoire.apiBase || undefined,
  };
}

/**
 * Generate default config for grimoires not in registry
 * (Fallback for when API is unavailable)
 */
export async function generateDefaultConfig(grimoireId: string): Promise<AdminConfig> {
  // Try to get schema from API
  try {
    const res = await fetch(`${API_URL}/api/explorer/schema/${grimoireId}`, {
      credentials: "include",
    });

    if (res.ok) {
      const data = await res.json();
      const tables = data.tables || [{ name: grimoireId, label: humanize(grimoireId) }];

      return {
        name: humanize(grimoireId),
        singularName: tr("dataExplorer.registro"),
        icon: getGrimoireIcon(grimoireId),
        views: tables.map((t: any) => ({
          id: t.name,
          type: "grid" as const,
          title: t.label || humanize(t.name),
          table: t.name,
        })),
        apiEndpoint: `/api/explorer/${tables[0]?.name || grimoireId}`,
      };
    }
  } catch (e) {
    console.warn(`[GrimoireLoader] Could not fetch schema for ${grimoireId}, using defaults`);
  }

  // Ultimate fallback
  return {
    name: humanize(grimoireId),
    singularName: tr("dataExplorer.registro"),
    icon: getGrimoireIcon(grimoireId),
    views: [
      {
        id: "default",
        type: "grid" as const,
        title: tr("grimoireLoader.allRecords"),
        table: grimoireId,
      },
    ],
    apiEndpoint: `/api/explorer/${grimoireId}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SIDEBAR GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate sidebar items from registry
 */
export async function generateSidebarItems(): Promise<SidebarItem[]> {
  const registry = await fetchAdminRegistry();

  return registry.map((g) => ({
    path: `/g/${g.id}`,
    label: g.name,
    icon: g.icon || getGrimoireIcon(g.id),
    category: g.category,
    subItems:
      g.views.length > 1
        ? g.views.map((v) => ({
            path: `/g/${g.id}/${v.id}`,
            label: v.title,
            viewId: v.id,
          }))
        : undefined,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function pascalCase(str: string): string {
  return str
    .replace(/^(grimoire-|kon-)/, "")
    .replace(/[-_]/g, " ")
    .replace(/(?:^|\s)(\w)/g, (_, c) => c.toUpperCase())
    .replace(/\s/g, "");
}

function humanize(str: string): string {
  return str
    .replace(/^(grimoire-|kon-)/, "")
    .replace(/[-_]/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

/**
 * Icons keyed by bare grimoire id (no `grimoire-` / `kon-` prefix).
 *
 * The same grimoire reaches us under three ids (`games`, `kon-games`,
 * `grimoire-games`), so the lookup strips the prefix rather than listing every
 * alias — an incomplete alias list is what made `games` fall back to "Database".
 */
const GRIMOIRE_ICONS: Record<string, string> = {
  datasets: "Database",
  media: "Image",
  "media-library": "Image",
  blog: "FileText",
  blocks: "Layout",
  academy: "GraduationCap",
  "academy-lms": "GraduationCap",
  booking: "CalendarDays",
  directory: "Contact",
  crm: "Briefcase",
  conta: "Landmark",
  dms: "FileStack",
  games: "Gamepad2",
  streamers: "Tv",
  esports: "Trophy",
  agile: "Kanban",
  webhooks: "Webhook",
  connectors: "Plug",
  "ai-memories": "Brain",
};

export function getGrimoireIcon(grimoireId: string): string {
  return (
    GRIMOIRE_ICONS[grimoireId] ??
    GRIMOIRE_ICONS[grimoireId.replace(/^(grimoire-|kon-)/, "")] ??
    "Database"
  );
}

/**
 * Clear registry cache (call after grimoire changes)
 */
export function clearRegistryCache() {
  registryCache = null;
  registryCacheTime = 0;
}

/**
 * Alias for getGrimoireConfig - kept for backward compatibility
 * @deprecated Use fetchGrimoireConfig or getGrimoireConfig instead
 */
export const loadGrimoireConfig = getGrimoireConfig;

/**
 * Alias for fetchAdminRegistry - kept for naming consistency
 */
export const fetchGrimoireConfig = getGrimoireConfig;
