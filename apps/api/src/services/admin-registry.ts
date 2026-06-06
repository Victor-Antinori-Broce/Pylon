/**
 * Admin Registry Service — Zero Config Grimoire Registration
 *
 * Auto-discovers admin configuration from grimoires and realms:
 * 1. Scans grimoire.json for admin.tables[]
 * 2. Scans realm.json for realm-specific grimoires (DYNAMIC)
 * 3. Detects custom views by checking for .svelte files
 * 4. Generates default DataExplorer config for tables without custom UI
 * 5. Exposes unified registry at /api/admin/registry
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { scanPackages, GremiusManifest } from "./scanner";
import { introspectTable, type IntrospectedColumn } from "./schema-introspector";

// Resolve workspace root (Docker vs dev)
function getPackagesRoot(): string {
  const cwdCheck = join(process.cwd(), "packages", "grimoires", "package.json");
  const root = existsSync(cwdCheck) ? process.cwd() : join(process.cwd(), "../../");
  return join(root, "packages");
}

// @ts-ignore - Reserved for future use
const _ADMIN_VIEWS_PATH = "../../../packages/admin/src/views";

/**
 * Realm manifest structure
 */
interface RealmManifest {
  id: string;
  name: string;
  description?: string;
  version: string;
  type: "realm";
  grimoires: string[];
  optional_grimoires?: string[];
  config?: {
    theme?: {
      css_entry?: string;
      primary_color?: string;
      accent_color?: string;
    };
  };
  /** Per-grimoire admin overrides */
  grimoireConfig?: Record<
    string,
    {
      displayName?: string;
      hiddenTables?: string[];
      extraViews?: Array<{
        id: string;
        type: "grid" | "kanban" | "calendar" | "custom";
        title: string;
        table?: string;
      }>;
      defaultView?: string;
    }
  >;
  /** Seed configuration */
  seed?: {
    sql?: string;
    datasets?: string;
    runOnce?: boolean;
  };
}

/**
 * Dynamic realm info with its grimoires
 */
interface RealmInfo {
  id: string;
  name: string;
  description?: string;
  grimoires: string[];
  optionalGrimoires: string[];
}

/** Admin table configuration */
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

/** Admin view configuration */
export interface AdminViewConfig {
  id: string;
  type: "grid" | "kanban" | "calendar" | "custom";
  title: string;
  table?: string;
  component?: string; // For custom views: path to .svelte file
  // Extra props forwarded from grimoire.json admin.views declarations
  groupBy?: string;
  dateField?: string;
  titleField?: string;
  icon?: string;
  [key: string]: any;
}

/** Grimoire admin configuration */
export interface GrimoireAdminConfig {
  id: string;
  name: string;
  icon?: string;
  category: "core" | "content" | "data" | "esports";
  hasCustomView: boolean;
  tables: AdminTableConfig[];
  views: AdminViewConfig[];
  defaultView: string;
  /** Custom API base path (e.g., /api/directory) - if not set, uses /api/explorer */
  apiBase?: string;
}

/** Core module with custom view */
interface CoreModuleWithView {
  id: string;
  name: string;
  category: GrimoireAdminConfig["category"];
  tables?: string[];
}

// Cache para evitar lecturas de disco frecuentes
let registryCache: GrimoireAdminConfig[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 1 minuto en desarrollo

/**
 * Core modules with custom admin views
 * These are loaded from apps/api/src/modules/, not packages/grimoires/
 *
 * NOTE: Webhooks and Workers are part of the Actions Engine (framework level),
 * not Grimoires. They are managed through the Actions UI at /actions.
 *
 * This list is intentionally empty as all current core features are either:
 * - Grimoires (DataSets, Media, Blocks)
 * - Engine features (Actions with Webhooks/Workers)
 * - Settings features (Connectors)
 */
const CORE_MODULES_WITH_VIEWS: CoreModuleWithView[] = [
  // Empty - all core features are now proper Grimoires or Engine features
];

/**
 * Scan all available realms and their grimoires
 * This is DYNAMIC - no hardcoded realm data needed
 */
async function scanRealms(): Promise<RealmInfo[]> {
  const realmsDir = join(getPackagesRoot(), "realms");
  const realms: RealmInfo[] = [];

  try {
    const entries = await readdir(realmsDir, { withFileTypes: true });
    const realmDirs = entries.filter(
      (e: { isDirectory: () => boolean; name: string }) =>
        e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules"
    );

    for (const dir of realmDirs) {
      // Try realm.json first, then legacy gremius.json
      const realmJsonPath = join(realmsDir, dir.name, "realm.json");
      const legacyPath = join(realmsDir, dir.name, "gremius.json");

      let manifest: RealmManifest | null = null;

      // Try realm.json
      const realmFile = Bun.file(realmJsonPath);
      if (await realmFile.exists()) {
        try {
          manifest = (await realmFile.json()) as RealmManifest;
        } catch {
          console.warn(`[AdminRegistry] Failed to parse ${realmJsonPath}`);
        }
      }

      // Fallback to gremius.json
      if (!manifest) {
        const legacyFile = Bun.file(legacyPath);
        if (await legacyFile.exists()) {
          try {
            manifest = (await legacyFile.json()) as RealmManifest;
          } catch {
            console.warn(`[AdminRegistry] Failed to parse ${legacyPath}`);
          }
        }
      }

      if (manifest && manifest.id) {
        realms.push({
          id: manifest.id,
          name: manifest.name || manifest.id,
          description: manifest.description,
          grimoires: manifest.grimoires || [],
          optionalGrimoires: manifest.optional_grimoires || [],
        });
      }
    }
  } catch (err) {
    // Realms directory might not exist
    console.log("[AdminRegistry] No realms directory found or error scanning:", err);
  }

  return realms;
}

/**
 * Extract admin views from grimoire manifest (Hybrid Rendering support).
 * Reads grimoire.json `admin.views` as the primary source.
 * Returns empty array if no admin.views declared — caller should fallback.
 */
function extractViewsFromManifest(grimoire: GremiusManifest): AdminViewConfig[] {
  const adminConfig = (grimoire as any).admin;
  if (!adminConfig || !Array.isArray(adminConfig.views)) {
    return [];
  }

  const views: AdminViewConfig[] = [];

  for (const raw of adminConfig.views) {
    if (!raw.id || !raw.type) continue;

    // Normalize unknown/invalid types to valid AdminViewConfig types
    let type = raw.type;
    const validTypes = new Set(["grid", "kanban", "calendar", "custom"]);
    const typeNormalization: Record<string, string> = {
      list: "grid",
      table: "grid",
      dashboard: "custom",
    };

    if (!validTypes.has(type)) {
      type = typeNormalization[type] || "grid";
    }

    const view: AdminViewConfig = {
      id: raw.id,
      type: type as AdminViewConfig["type"],
      title: raw.title || raw.id,
      table: raw.table,
    };

    // For custom views, derive component path if not explicitly set
    if (type === "custom") {
      view.component = raw.component || `$views/${getViewPath(grimoire.id)}`;
    }

    // Pass through extra properties used by DataExplorer and UI
    if (raw.groupBy !== undefined) view.groupBy = raw.groupBy;
    if (raw.dateField !== undefined) view.dateField = raw.dateField;
    if (raw.titleField !== undefined) view.titleField = raw.titleField;
    if (raw.icon !== undefined) view.icon = raw.icon;
    if (raw.description !== undefined) view.description = raw.description;
    if (raw.rowActions !== undefined) view.rowActions = raw.rowActions;
    if (raw.bulkActions !== undefined) view.bulkActions = raw.bulkActions;

    views.push(view);
  }

  return views;
}

/**
 * Build grimoire config as part of a realm (dynamic)
 */
async function buildRealmGrimoireConfig(
  grimoire: GremiusManifest,
  _realm: RealmInfo
): Promise<GrimoireAdminConfig | null> {
  // Skip engine infrastructure
  if (isEngineInfrastructure(grimoire.id)) {
    return null;
  }

  const grimoirePath = join(getPackagesRoot(), "grimoires", getGrimoireDirName(grimoire.id));

  // Get tables from grimoire.json or infer from id
  const tables = await detectTables(grimoire, grimoirePath);

  // 1. Try to read admin.views from grimoire.json (Hybrid Rendering)
  const views = extractViewsFromManifest(grimoire);

  // 2. Fallback to legacy behavior if no admin.views declared
  let hasCustomViewLegacy = false;
  if (views.length === 0) {
    hasCustomViewLegacy = await detectCustomView(grimoire.id);
    if (hasCustomViewLegacy) {
      views.push({
        id: "custom",
        type: "custom",
        title: "Overview",
        component: `$views/${getViewPath(grimoire.id)}`,
      });
    }
    for (const table of tables) {
      views.push({
        id: `grid-${table.name}`,
        type: "grid",
        title: table.label,
        table: table.name,
      });
    }
  }

  const hasCustomView = views.some((v) => v.type === "custom") || hasCustomViewLegacy;
  const defaultView = (grimoire as any).admin?.defaultView || views[0]?.id || "grid";

  return {
    id: grimoire.id,
    name: grimoire.name || grimoire.id,
    icon: grimoire.icon || getDefaultIcon(grimoire.id),
    category: "esports", // Realms are always esports category
    hasCustomView,
    tables,
    views,
    defaultView,
  };
}

/**
 * Scan all grimoires and build admin registry
 */
/**
 * Load the manifest of the currently active realm (realm.json).
 */
async function loadActiveRealmManifest(): Promise<RealmManifest | null> {
  const activeRealmId =
    process.env.GREMIUS_ACTIVE_REALM || process.env.GREMIUS_ACTIVE_THEME || null;
  if (!activeRealmId) return null;

  const realmJsonPath = join(getPackagesRoot(), "realms", activeRealmId, "realm.json");
  const legacyPath = join(getPackagesRoot(), "realms", activeRealmId, "gremius.json");

  for (const path of [realmJsonPath, legacyPath]) {
    const file = Bun.file(path);
    if (await file.exists()) {
      try {
        return (await file.json()) as RealmManifest;
      } catch {
        // ignore
      }
    }
  }
  return null;
}

/**
 * Apply realm-level overrides to a grimoire admin config.
 */
function applyRealmOverrides(
  config: GrimoireAdminConfig,
  realmManifest: RealmManifest | null
): GrimoireAdminConfig {
  if (!realmManifest?.grimoireConfig) return config;

  const override = realmManifest.grimoireConfig[config.id];
  if (!override) return config;

  // Clone to avoid mutating original
  const patched = { ...config };

  // Override display name
  if (override.displayName) {
    patched.name = override.displayName;
  }

  // Override default view
  if (override.defaultView) {
    patched.defaultView = override.defaultView;
  }

  // Hide tables
  if (override.hiddenTables && override.hiddenTables.length > 0) {
    const hiddenSet = new Set(override.hiddenTables);
    patched.tables = patched.tables.filter((t) => !hiddenSet.has(t.name));
    patched.views = patched.views.filter((v) => !v.table || !hiddenSet.has(v.table));
  }

  // Add extra views
  if (override.extraViews && override.extraViews.length > 0) {
    patched.views = [...patched.views, ...override.extraViews];
  }

  return patched;
}

export async function buildAdminRegistry(): Promise<GrimoireAdminConfig[]> {
  // Check cache
  if (registryCache && Date.now() - cacheTimestamp < CACHE_TTL) {
    return registryCache;
  }

  const grimoires = await scanPackages("grimoires");
  const realms = await scanRealms();
  const activeRealmManifest = await loadActiveRealmManifest();
  const configs: GrimoireAdminConfig[] = [];

  // Build a set of grimoire IDs that belong to realms
  const realmGrimoireIds = new Set<string>();
  for (const realm of realms) {
    for (const gId of realm.grimoires) {
      realmGrimoireIds.add(gId);
    }
    for (const gId of realm.optionalGrimoires) {
      realmGrimoireIds.add(gId);
    }
  }

  // Scan standalone grimoires (not part of any realm)
  for (const grimoire of grimoires) {
    // Skip grimoires that belong to realms - they'll be handled separately
    if (realmGrimoireIds.has(grimoire.id)) {
      continue;
    }

    const config = await buildGrimoireAdminConfig(grimoire);
    if (config) {
      configs.push(config);
    }
  }

  // Scan realm grimoires dynamically
  for (const realm of realms) {
    for (const grimoireId of realm.grimoires) {
      // Find the grimoire manifest
      const grimoire = grimoires.find((g) => g.id === grimoireId);
      if (grimoire) {
        const config = await buildRealmGrimoireConfig(grimoire, realm);
        if (config) {
          configs.push(config);
        }
      } else {
        console.warn(
          `[AdminRegistry] Realm ${realm.id} references unknown grimoire: ${grimoireId}`
        );
      }
    }
  }

  // Scan core modules with custom views
  for (const coreModule of CORE_MODULES_WITH_VIEWS) {
    const config = await buildCoreModuleAdminConfig(coreModule);
    if (config) {
      configs.push(config);
    }
  }

  // Apply realm overrides (name changes, hidden tables, extra views)
  for (let i = 0; i < configs.length; i++) {
    configs[i] = applyRealmOverrides(configs[i], activeRealmManifest);
  }

  // Sort: custom views first, then alphabetically
  configs.sort((a, b) => {
    if (a.hasCustomView && !b.hasCustomView) return -1;
    if (!a.hasCustomView && b.hasCustomView) return 1;
    return a.name.localeCompare(b.name);
  });

  registryCache = configs;
  cacheTimestamp = Date.now();
  return configs;
}

/**
 * Build admin config for a single grimoire
 */
async function buildGrimoireAdminConfig(
  grimoire: GremiusManifest
): Promise<GrimoireAdminConfig | null> {
  // Skip engine infrastructure (Level 1 - always active, not user-facing)
  if (isEngineInfrastructure(grimoire.id)) {
    return null;
  }

  const grimoirePath = join(getPackagesRoot(), "grimoires", getGrimoireDirName(grimoire.id));

  // 2. Get tables from grimoire.json or infer from id
  const tables = await detectTables(grimoire, grimoirePath);

  // 3. Build views config — read admin.views from grimoire.json (Hybrid Rendering)
  const views = extractViewsFromManifest(grimoire);

  // Fallback to legacy behavior if no admin.views declared
  let hasCustomViewLegacy = false;
  if (views.length === 0) {
    hasCustomViewLegacy = await detectCustomView(grimoire.id);
    if (hasCustomViewLegacy) {
      views.push({
        id: "custom",
        type: "custom",
        title: "Overview",
        component: `$views/${getViewPath(grimoire.id)}`,
      });
    }
    for (const table of tables) {
      views.push({
        id: `grid-${table.name}`,
        type: "grid",
        title: table.label,
        table: table.name,
      });
    }
  }

  const hasCustomView = views.some((v) => v.type === "custom") || hasCustomViewLegacy;

  // Get apiBase from grimoire.json admin config or mount path
  const apiBase = (grimoire as any).admin?.apiBase || (grimoire as any).mount?.path;

  const defaultView = (grimoire as any).admin?.defaultView || views[0]?.id || "grid";

  return {
    id: grimoire.id,
    name: grimoire.name || grimoire.id,
    icon: grimoire.icon || getDefaultIcon(grimoire.id),
    category: mapCategory(grimoire.category, grimoire.realmId),
    hasCustomView,
    tables,
    views,
    defaultView,
    apiBase,
  };
}

/**
 * Build admin config for a core module (from apps/api/src/modules/)
 */
async function buildCoreModuleAdminConfig(
  coreModule: CoreModuleWithView
): Promise<GrimoireAdminConfig | null> {
  // 1. Detect custom view by convention
  const hasCustomView = await detectCustomView(coreModule.id);

  // 2. Build tables config
  const tables: AdminTableConfig[] = [];
  if (coreModule.tables) {
    for (const tableName of coreModule.tables) {
      const introspected = await introspectTable(tableName);
      tables.push({
        name: tableName,
        label: humanize(tableName),
        icon: getTableIcon(tableName),
        primaryKey: introspected?.primaryKey[0] || "id",
        searchableFields: introspected?.columns
          .filter((c) => isSearchableType(c))
          .map((c) => c.name),
        filterableFields: introspected?.columns
          .filter((c) => isFilterableType(c))
          .map((c) => c.name),
      });
    }
  }

  // 3. Build views config
  const views: AdminViewConfig[] = [];

  if (hasCustomView) {
    views.push({
      id: "custom",
      type: "custom",
      title: "Overview",
      component: `$views/${getViewPath(coreModule.id)}`,
    });
  }

  // Add grid views for each table
  for (const table of tables) {
    views.push({
      id: `grid-${table.name}`,
      type: "grid",
      title: table.label,
      table: table.name,
    });
  }

  return {
    id: coreModule.id,
    name: coreModule.name,
    icon: getDefaultIcon(coreModule.id),
    category: coreModule.category,
    hasCustomView,
    tables,
    views,
    defaultView: hasCustomView ? "custom" : views[0]?.id || "grid",
  };
}

/**
 * Detect if grimoire has custom Svelte view by convention.
 * Uses getViewPath() which already handles all special mappings.
 * Avoids false positives from shared view files (e.g., PostsView.svelte
 * being incorrectly detected for every grimoire).
 */
async function detectCustomView(grimoireId: string): Promise<boolean> {
  const viewPath = getViewPath(grimoireId);

  // Primary: the mapped view path (handles all special cases)
  if (await Bun.file(join(process.cwd(), "../../packages/admin/src/views", viewPath)).exists()) {
    return true;
  }

  // Fallback: index.svelte in the same folder
  const indexPath = viewPath.includes("/")
    ? viewPath.replace(/\/[^/]+\.svelte$/, "/index.svelte")
    : `${viewPath.replace(/\.svelte$/, "")}/index.svelte`;

  if (await Bun.file(join(process.cwd(), "../admin/src/views", indexPath)).exists()) {
    return true;
  }

  return false;
}

/**
 * Table config from grimoire manifest
 */
interface GrimoireTableConfig {
  name?: string;
  table?: string;
  label?: string;
  icon?: string;
  description?: string;
  primaryKey?: string;
  searchableFields?: string[];
  filterableFields?: string[];
  readonly?: boolean;
}

/**
 * Detect tables for a grimoire
 */
async function detectTables(
  grimoire: GremiusManifest,

  _grimoirePath: string
): Promise<AdminTableConfig[]> {
  // Priority 1: Tables defined in grimoire.json
  if (grimoire.tables && Array.isArray(grimoire.tables)) {
    const configs: AdminTableConfig[] = [];

    for (const t of grimoire.tables) {
      if (typeof t === "string") {
        // Try to introspect from DB for extra metadata
        const introspected = await introspectTable(t);

        configs.push({
          name: t,
          label: humanize(t),
          icon: getTableIcon(t),
          primaryKey: introspected?.primaryKey[0] || "id",
          searchableFields: introspected?.columns
            .filter((c) => isSearchableType(c))
            .map((c) => c.name),
          filterableFields: introspected?.columns
            .filter((c) => isFilterableType(c))
            .map((c) => c.name),
        });
      } else {
        const tableConfig = t as GrimoireTableConfig;
        const name = tableConfig.name || tableConfig.table || "";
        configs.push({
          name,
          label: tableConfig.label || humanize(name),
          icon: tableConfig.icon || getTableIcon(name),
          description: tableConfig.description,
          primaryKey: tableConfig.primaryKey || "id",
          searchableFields: tableConfig.searchableFields,
          filterableFields: tableConfig.filterableFields,
          readonly: tableConfig.readonly || false,
        });
      }
    }

    return configs;
  }

  // Priority 2: Auto-detect table from DB introspection
  const baseName = grimoire.id.replace(/^grimoire-/, "").replace(/-/g, "_");

  // Try to find table with same name or plural
  const introspected =
    (await introspectTable(baseName)) ||
    (await introspectTable(baseName + "s")) ||
    (await introspectTable(baseName.replace(/s$/, "")));

  if (introspected) {
    const searchableFields = introspected.columns
      .filter((c) => isSearchableType(c))
      .map((c) => c.name);
    const filterableFields = introspected.columns
      .filter((c) => isFilterableType(c))
      .map((c) => c.name);

    return [
      {
        name: introspected.name,
        label: grimoire.name || humanize(grimoire.id),
        icon: getDefaultIcon(grimoire.id),
        primaryKey: introspected.primaryKey[0] || "id",
        searchableFields,
        filterableFields,
      },
    ];
  }

  // Priority 3: Fallback to basic config
  return [
    {
      name: baseName,
      label: grimoire.name || humanize(grimoire.id),
      icon: getDefaultIcon(grimoire.id),
      primaryKey: "id",
    },
  ];
}

/** Column with type info */
interface ColumnInfo {
  name: string;
  type: string;
}

// Helper to determine if column is searchable
function isSearchableType(col: ColumnInfo): boolean {
  const searchableTypes = ["text", "varchar", "char"];
  const type = col.type.toLowerCase();
  const searchableNames = ["name", "title", "label", "email", "description", "slug"];

  return (
    searchableTypes.some((t) => type.includes(t)) ||
    searchableNames.some((n) => col.name.toLowerCase().includes(n))
  );
}

// Helper to determine if column is filterable
function isFilterableType(col: IntrospectedColumn): boolean {
  if (col.name === "id") return false;
  if (col.name.endsWith("_id")) return true; // FKs are filterable
  if (col.type.toLowerCase().includes("json")) return false;
  return true;
}

/**
 * Get the directory name for a grimoire ID
 */
function getGrimoireDirName(id: string): string {
  // Common patterns
  if (id.startsWith("grimoire-")) return id;
  if (id.startsWith("core-")) return id.replace("core-", "core/");
  return `grimoire-${id}`;
}

/**
 * Get view path for custom component
 * Handles grimoire- prefix stripping for view paths
 */
function getViewPath(grimoireId: string): string {
  const shortId = grimoireId.replace(/^grimoire-/, "");
  const pascal = pascalCase(shortId);

  // Special cases for grimoire IDs that map to different view paths

  // blog: stored in content/ folder with PostsView name
  if (grimoireId === "grimoire-blog") {
    return "content/PostsView.svelte";
  }

  // Page Builder (Blocks): maps to blocks/ folder
  if (grimoireId === "grimoire-blocks") {
    return "blocks/BlocksView.svelte";
  }

  // Academy LMS: maps to academy/ folder
  if (grimoireId === "grimoire-academy-lms") {
    return "academy/AcademyView.svelte";
  }

  // Games (esports realm): maps to games/ folder
  if (grimoireId === "grimoire-games") {
    return "games/GamesView.svelte";
  }

  // Streamers: maps to users/ folder
  if (grimoireId === "grimoire-streamers") {
    return "users/StreamersView.svelte";
  }

  // Webhooks: maps to webhooks/ folder
  if (grimoireId === "grimoire-webhooks" || grimoireId === "webhooks") {
    return "webhooks/WebhooksView.svelte";
  }

  // Workers: maps to workers/ folder
  if (grimoireId === "grimoire-workers" || grimoireId === "workers") {
    return "workers/WorkersView.svelte";
  }

  // Media Library: maps to Media.svelte
  if (grimoireId === "media-library" || grimoireId === "media" || grimoireId === "grimoire-media") {
    return "Media.svelte";
  }

  // DataSets: Core grimoire - maps to DataSets.svelte
  if (grimoireId === "grimoire-datasets" || grimoireId === "datasets") {
    return "DataSets.svelte";
  }

  // Page Builder (Blocks): maps to blocks/BlocksView.svelte
  if (grimoireId === "grimoire-blocks" || grimoireId === "blocks") {
    return "blocks/BlocksView.svelte";
  }

  // Blog: maps to content/PostsView.svelte
  if (grimoireId === "grimoire-blog" || grimoireId === "blog") {
    return "content/PostsView.svelte";
  }

  // Default: use short ID without grimoire- prefix
  return `${shortId}/${pascal}View.svelte`;
}

/**
 * Engine infrastructure grimoires that should be hidden from admin
 * These are Level 1 - always active, not user-facing
 *
 * NOTE: Media Library is now a Core Grimoire (toggleable), not engine infrastructure.
 * The underlying MinIO storage service remains always-on as engine infrastructure,
 * but the API routes and UI are toggleable via grimoire system.
 */
const ENGINE_INFRASTRUCTURE: string[] = [];

/**
 * Check if grimoire is engine infrastructure (should be hidden)
 */
function isEngineInfrastructure(id: string): boolean {
  return ENGINE_INFRASTRUCTURE.includes(id);
}

/**
 * Map category to admin category
 *
 * Category mapping:
 * - "grimoire-core" | "core" → "core" (Level 2 - Core grimoires: blog, blocks, webhooks, connectors)
 * - "optional" → "content" or "data" (Level 3 - Optional features)
 * - "realm" | realmId present → "esports" (Level 4 - Realm-specific, dynamic)
 */
function mapCategory(category?: string, realmId?: string): GrimoireAdminConfig["category"] {
  // Realms are dynamic and separate from optional grimoires
  if (realmId || category === "realm") return "esports";
  // Core grimoires (both grimoire-core and core/system infrastructure)
  if (category === "grimoire-core" || category === "core") return "core";
  // Content grimoires
  if (["blog", "media", "content"].includes(category || "")) return "content";
  // System/Infrastructure grimoires also go to core
  if (["webhooks", "workers", "system"].includes(category || "")) return "core";
  // Default to data for other optional grimoires
  return "data";
}

/**
 * Get default icon for grimoire/table
 */
function getDefaultIcon(id: string): string {
  const icons: Record<string, string> = {
    games: "Gamepad2",
    streamers: "Tv",
    platforms: "Monitor",
    tags: "Tag",
    collections: "Library",
    teams: "Users",
    players: "UserCircle",
    matches: "Swords",
    tournaments: "Trophy",
    webhooks: "Webhook",
    workers: "Cpu",
    academy: "GraduationCap",
    booking: "CalendarDays",
    directory: "Contact",
    crm: "Briefcase",
    dms: "FileStack",
    blog: "FileText",
    media: "Image",
    datasets: "Database",
  };
  return icons[id] || "Database";
}

/**
 * Get icon for specific table
 */
function getTableIcon(tableName: string): string {
  if (tableName.includes("user") || tableName.includes("contact")) return "User";
  if (tableName.includes("game")) return "Gamepad2";
  if (tableName.includes("media") || tableName.includes("image")) return "Image";
  if (tableName.includes("post") || tableName.includes("article")) return "FileText";
  if (tableName.includes("category") || tableName.includes("tag")) return "Tag";
  if (tableName.includes("order") || tableName.includes("sale")) return "ShoppingCart";
  return "Table";
}

/**
 * Convert snake_case or camelCase to Human Readable
 */
function humanize(str: string): string {
  return str
    .replace(/^grimoire-/, "")
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

/**
 * Convert to PascalCase
 */
function pascalCase(str: string): string {
  return str
    .replace(/^grimoire-/, "")
    .replace(/[-_]/g, " ")
    .replace(/(?:^|\s)(\w)/g, (_, c) => c.toUpperCase())
    .replace(/\s/g, "");
}

/**
 * Clear registry cache (useful after grimoire installation)
 */
export function clearAdminRegistryCache() {
  registryCache = null;
  cacheTimestamp = 0;
}

/**
 * Get admin config for a specific grimoire
 */
export async function getGrimoireAdminConfig(
  grimoireId: string
): Promise<GrimoireAdminConfig | null> {
  const registry = await buildAdminRegistry();
  return registry.find((g) => g.id === grimoireId) || null;
}
