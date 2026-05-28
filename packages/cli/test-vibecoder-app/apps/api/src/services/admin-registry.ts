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

import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
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
const _ADMIN_VIEWS_PATH = "../../../apps/admin/src/views";

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: { isDirectory: () => boolean; name: string }) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules"
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

  // Detect custom view by convention
  const hasCustomView = await detectCustomView(grimoire.id);

  // Get tables from grimoire.json or infer from id
  const tables = await detectTables(grimoire, grimoirePath);

  // Build views config
  const views: AdminViewConfig[] = [];

  if (hasCustomView) {
    views.push({
      id: "custom",
      type: "custom",
      title: "Overview",
      component: `$views/${getViewPath(grimoire.id)}`,
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
    id: grimoire.id,
    name: grimoire.name || grimoire.id,
    icon: grimoire.icon || getDefaultIcon(grimoire.id),
    category: "esports", // Realms are always esports category
    hasCustomView,
    tables,
    views,
    defaultView: hasCustomView ? "custom" : views[0]?.id || "grid",
  };
}

/**
 * Scan all grimoires and build admin registry
 */
export async function buildAdminRegistry(): Promise<GrimoireAdminConfig[]> {
  // Check cache
  if (registryCache && Date.now() - cacheTimestamp < CACHE_TTL) {
    return registryCache;
  }

  const grimoires = await scanPackages("grimoires");
  const realms = await scanRealms();
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
      const grimoire = grimoires.find(g => g.id === grimoireId);
      if (grimoire) {
        const config = await buildRealmGrimoireConfig(grimoire, realm);
        if (config) {
          configs.push(config);
        }
      } else {
        console.warn(`[AdminRegistry] Realm ${realm.id} references unknown grimoire: ${grimoireId}`);
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
async function buildGrimoireAdminConfig(grimoire: GremiusManifest): Promise<GrimoireAdminConfig | null> {
  // Skip engine infrastructure (Level 1 - always active, not user-facing)
  if (isEngineInfrastructure(grimoire.id)) {
    return null;
  }

  const grimoirePath = join(getPackagesRoot(), "grimoires", getGrimoireDirName(grimoire.id));

  // 1. Detect custom view by convention
  const hasCustomView = await detectCustomView(grimoire.id);

  // 2. Get tables from grimoire.json or infer from id
  const tables = await detectTables(grimoire, grimoirePath);

  // 3. Build views config
  const views: AdminViewConfig[] = [];

  if (hasCustomView) {
    views.push({
      id: "custom",
      type: "custom",
      title: "Overview",
      component: `$views/${getViewPath(grimoire.id)}`,
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

  // Get apiBase from grimoire.json admin config or mount path
  const apiBase = (grimoire as any).admin?.apiBase || (grimoire as any).mount?.path;

  return {
    id: grimoire.id,
    name: grimoire.name || grimoire.id,
    icon: grimoire.icon || getDefaultIcon(grimoire.id),
    category: mapCategory(grimoire.category, grimoire.realmId),
    hasCustomView,
    tables,
    views,
    defaultView: hasCustomView ? "custom" : views[0]?.id || "grid",
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
 * Detect if grimoire has custom Svelte view by convention
 * Checks: apps/admin/src/views/{grimoire}/{Grimoire}View.svelte
 * 
 * NOTE: Handles grimoire- prefix stripping for view paths.
 * e.g., grimoire-formulas → views/formulas/FormulasView.svelte
 */
async function detectCustomView(grimoireId: string): Promise<boolean> {
  const shortId = grimoireId.replace(/^grimoire-/, "");

  const viewPaths = [
    // With grimoire- prefix (e.g., grimoire-formulas/GrimoireFormulasView.svelte)
    join(process.cwd(), "../admin/src/views", grimoireId, `${pascalCase(grimoireId)}View.svelte`),
    join(process.cwd(), "../admin/src/views", `${grimoireId}View.svelte`),
    join(process.cwd(), "../admin/src/views", grimoireId, "index.svelte"),
    // Without grimoire- prefix (e.g., formulas/FormulasView.svelte)
    join(process.cwd(), "../admin/src/views", shortId, `${pascalCase(shortId)}View.svelte`),
    join(process.cwd(), "../admin/src/views", `${shortId}View.svelte`),
    join(process.cwd(), "../admin/src/views", shortId, "index.svelte"),
    // Special cases - grimoires with non-standard view paths
    // blog: stored in content/ folder
    join(process.cwd(), "../admin/src/views/content/PostsView.svelte"),
    // blocks: stored in blocks/ folder
    join(process.cwd(), "../admin/src/views/blocks/BlocksView.svelte"),
    // academy-lms: maps to academy/ folder
    join(process.cwd(), "../admin/src/views/academy/AcademyView.svelte"),
    // games: maps to games/ folder (esports realm)
    join(process.cwd(), "../admin/src/views/games/GamesView.svelte"),
    // streamers: maps to users/ folder
    join(process.cwd(), "../admin/src/views/users/StreamersView.svelte"),
    // webhooks: maps to webhooks/ folder
    join(process.cwd(), "../admin/src/views/webhooks/WebhooksView.svelte"),
    // workers: maps to workers/ folder
    join(process.cwd(), "../admin/src/views/workers/WorkersView.svelte"),
    // media-library: maps to Media.svelte
    join(process.cwd(), "../admin/src/views/Media.svelte"),
    // DataSets: maps to DataSets.svelte (Core grimoire)
    join(process.cwd(), "../admin/src/views/DataSets.svelte"),
    // Page Builder (Blocks): maps to blocks/BlocksView.svelte
    join(process.cwd(), "../admin/src/views/blocks/BlocksView.svelte"),
    // Blog: maps to content/PostsView.svelte
    join(process.cwd(), "../admin/src/views/content/PostsView.svelte"),
  ];

  for (const path of viewPaths) {
    if (await Bun.file(path).exists()) {
      return true;
    }
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
          name: name,
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
    datasets: "Database"
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
export async function getGrimoireAdminConfig(grimoireId: string): Promise<GrimoireAdminConfig | null> {
  const registry = await buildAdminRegistry();
  return registry.find(g => g.id === grimoireId) || null;
}
