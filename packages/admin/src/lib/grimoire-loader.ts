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
import type { AdminConfig } from "./types/admin";

const API_URL = import.meta.env.VITE_API_URL ?? "";

// Legacy registry for hardcoded custom views (gradually migrating to auto-detection)
export const GRIMOIRE_VIEW_REGISTRY: Record<string, () => Promise<{ default: Component<any> }>> = {
  // These override auto-detection - useful for complex views
  
  // ═══ CORE GRIMOIRES ═══
  // DataSets - Core grimoire for dynamic data collections
  datasets: () => import("$views/DataSets.svelte"),
  "grimoire-datasets": () => import("$views/DataSets.svelte"),
  
  // Media Library - File uploads and management
  "media-library": () => import("$views/Media.svelte"),
  media: () => import("$views/Media.svelte"),
  "grimoire-media": () => import("$views/Media.svelte"),
  
  // Page Builder - Block-based layouts (Core Grimoire)
  blocks: () => import("$views/blocks/BlocksView.svelte"),
  "grimoire-blocks": () => import("$views/blocks/BlocksView.svelte"),
  
  // Blog - Content publishing (Core Grimoire)
  blog: () => import("$views/content/PostsView.svelte"),
  "grimoire-blog": () => import("$views/content/PostsView.svelte"),
  
  // ═══ FEATURE GRIMOIRES ═══

  games: () => import("$views/games/GamesView.svelte"),
  
  // Grimoires with non-standard view paths
  academy: () => import("$views/academy/AcademyView.svelte"),
  "grimoire-academy-lms": () => import("$views/academy/AcademyView.svelte"),
  streamers: () => import("$views/users/StreamersView.svelte"),
  "grimoire-streamers": () => import("$views/users/StreamersView.svelte"),
  connectors: () => import("$views/admin/connectors/ConnectorsView.svelte"),
  
  // ═══ DOCUMENT MANAGEMENT ═══
  dms: () => import("$views/dms/DMSView.svelte"),
  "grimoire-dms": () => import("$views/dms/DMSView.svelte"),
  
  // ═══ CRM CUSTOM VIEWS (Hybrid Rendering) ═══
  "grimoire-crm-dashboard": () => import("$views/crm/CrmDashboard.svelte"),
  "grimoire-crm-deal-form": () => import("$views/crm/DealForm.svelte"),
  "crm-dashboard": () => import("$views/crm/CrmDashboard.svelte"),
  "crm-deal-form": () => import("$views/crm/DealForm.svelte"),

  // ═══ CONTA CUSTOM VIEWS (Hybrid Rendering) ═══
  "grimoire-conta-journal-form": () => import("$views/conta/JournalForm.svelte"),
  "grimoire-conta-reports": () => import("$views/conta/ReportsView.svelte"),
  "grimoire-conta-disbursement-form": () => import("$views/conta/DisbursementForm.svelte"),
  "grimoire-conta-template-form": () => import("$views/conta/TemplateForm.svelte"),
  "conta-journal-form": () => import("$views/conta/JournalForm.svelte"),
  "conta-reports": () => import("$views/conta/ReportsView.svelte"),
  "conta-disbursement-form": () => import("$views/conta/DisbursementForm.svelte"),
  "conta-template-form": () => import("$views/conta/TemplateForm.svelte"),

  // ═══ BLOG / BLOCKS / DMS / ACADEMY / GAMES — Per-view custom registration ═══
  "grimoire-blog-posts": () => import("$views/content/PostsView.svelte"),
  "grimoire-blocks-pages": () => import("$views/blocks/BlocksView.svelte"),
  "grimoire-dms-dashboard": () => import("$views/dms/DMSView.svelte"),
  "grimoire-academy-lms-dashboard": () => import("$views/academy/AcademyView.svelte"),
  "grimoire-games-collections": () => import("$views/games/GamesView.svelte"),

  // ═══ SYSTEM TOOLS (formerly hardcoded admin routes) ═══
  // Per-view keys use {grimoireId}-{viewId} format for hybrid rendering lookup
  "system-tools": () => import("$views/system-tools/AgentsView.svelte"),
  "system-tools-agents": () => import("$views/system-tools/AgentsView.svelte"),
  "agents": () => import("$views/system-tools/AgentsView.svelte"),
  "system-tools-builder": () => import("$views/system-tools/BuilderView.svelte"),
  "builder": () => import("$views/system-tools/BuilderView.svelte"),
  "system-tools-editor": () => import("$views/EditorView.svelte"),
  "editor": () => import("$views/EditorView.svelte"),
};

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
  type: "grid" | "kanban" | "calendar" | "custom";
  title: string;
  table?: string;
  component?: string;
}

interface GrimoireRegistryResponse {
  success: boolean;
  grimoires: GrimoireAdminConfig[];
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
  // Check cache
  if (registryCache && Date.now() - registryCacheTime < REGISTRY_CACHE_TTL) {
    return registryCache.grimoires;
  }

  try {
    const res = await fetch(`${API_URL}/api/admin/registry`, {
      credentials: "include"
    });

    if (!res.ok) {
      console.warn("[GrimoireLoader] Failed to fetch registry, falling back to legacy mode");
      return [];
    }

    const data: GrimoireRegistryResponse = await res.json();

    if (!data.success) {
      throw new Error(data.error || "Unknown error");
    }

    registryCache = data;
    registryCacheTime = Date.now();
    return data.grimoires;
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
  const fromRegistry = registry.find(g => g.id === grimoireId);

  if (fromRegistry) {
    return fromRegistry;
  }

  // Fallback to API fetch
  try {
    const res = await fetch(`${API_URL}/api/admin/registry/${grimoireId}`, {
      credentials: "include"
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
  const viewModules = import.meta.glob('/src/views/**/*.svelte', { eager: true });

  const shortId = grimoireId.replace(/^grimoire-/, "");
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

  return possiblePaths.some(path => path in viewModules);
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
    const grimoire = registryCache.grimoires.find(g => g.id === grimoireId);
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
export async function loadCustomView(grimoireId: string, viewId?: string): Promise<Component | null> {
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
  const viewModules = import.meta.glob('/src/views/**/*.svelte');

  const shortId = grimoireId.replace(/^grimoire-/, "");
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
    `/src/views/content/${pascal}View.svelte`,  // blog → content/PostsView.svelte
    `/src/views/users/${pascal}View.svelte`,    // streamers → users/StreamersView.svelte
  ];

  for (const path of possiblePaths) {
    if (viewModules[path]) {
      try {
        const mod = await viewModules[path]() as { default: Component };
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
export function generateExplorerConfig(grimoire: GrimoireAdminConfig, viewId?: string): AdminConfig {
  // Include ALL views (custom + explorer), optionally filter to single view
  let sourceViews = grimoire.views;
  if (viewId) {
    sourceViews = sourceViews.filter(v => v.id === viewId);
  }

  // Build views with proper typing
  const views = sourceViews.map(v => {
    const baseView = {
      id: v.id,
      title: v.title,
    };

    switch (v.type) {
      case "kanban":
        return {
          ...baseView,
          type: "kanban" as const,
          table: v.table || grimoire.id,
          groupBy: (v as any).groupBy || "status" // Default grouping
        };
      case "calendar":
        return {
          ...baseView,
          type: "calendar" as const,
          table: v.table || grimoire.id,
          dateField: (v as any).dateField || "created_at",
          titleField: (v as any).titleField || "name"
        };
      case "custom":
        return {
          ...baseView,
          type: "custom" as const,
          component: (v as any).component || "",
          props: (v as any).props || {},
        };
      case "grid":
      default:
        return {
          ...baseView,
          type: "grid" as const,
          table: v.table || grimoire.id,
          rowActions: (v as any).rowActions,
          bulkActions: (v as any).bulkActions
        };
    }
  });

  return {
    name: grimoire.name,
    singularName: grimoire.tables[0]?.label || "Record",
    icon: grimoire.icon || "Database",
    views,
    apiEndpoint: grimoire.apiBase || `/api/explorer/${grimoire.tables[0]?.name || grimoire.id}`
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
      credentials: "include"
    });

    if (res.ok) {
      const data = await res.json();
      const tables = data.tables || [{ name: grimoireId, label: humanize(grimoireId) }];

      return {
        name: humanize(grimoireId),
        singularName: "Record",
        icon: getGrimoireIcon(grimoireId),
        views: tables.map((t: any) => ({
          id: t.name,
          type: "grid" as const,
          title: t.label || humanize(t.name),
          table: t.name
        })),
        apiEndpoint: `/api/explorer/${tables[0]?.name || grimoireId}`
      };
    }
  } catch (e) {
    console.warn(`[GrimoireLoader] Could not fetch schema for ${grimoireId}, using defaults`);
  }

  // Ultimate fallback
  return {
    name: humanize(grimoireId),
    singularName: "Record",
    icon: getGrimoireIcon(grimoireId),
    views: [{
      id: "default",
      type: "grid" as const,
      title: "All Records",
      table: grimoireId
    }],
    apiEndpoint: `/api/explorer/${grimoireId}`
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

  return registry.map(g => ({
    path: `/g/${g.id}`,
    label: g.name,
    icon: g.icon || getGrimoireIcon(g.id),
    category: g.category,
    subItems: g.views.length > 1
      ? g.views.map(v => ({
        path: `/g/${g.id}/${v.id}`,
        label: v.title,
        viewId: v.id
      }))
      : undefined
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function pascalCase(str: string): string {
  return str
    .replace(/^grimoire-/, "")
    .replace(/[-_]/g, " ")
    .replace(/(?:^|\s)(\w)/g, (_, c) => c.toUpperCase())
    .replace(/\s/g, "");
}

function humanize(str: string): string {
  return str
    .replace(/^grimoire-/, "")
    .replace(/[-_]/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

export function getGrimoireIcon(grimoireId: string): string {
  const icons: Record<string, string> = {
    "datasets": "Database",
    "media-library": "Image",
    "blog": "FileText",
    "webhooks": "Webhook",
    "connectors": "Plug",
    "blocks": "Layout",
    "grimoire-blocks": "Layout",
    "grimoire-blog": "FileText",
    "academy": "GraduationCap",
    "booking": "CalendarDays",
    "directory": "Contact",
    "crm": "Briefcase",
    "dms": "FileStack",
    "grimoire-games": "Gamepad2",
    "grimoire-streamers": "Tv",
    "grimoire-esports": "Trophy",
    "ai-memories": "Brain"
  };

  return icons[grimoireId] || "Database";
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
