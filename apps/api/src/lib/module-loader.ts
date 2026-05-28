/**
 * GremiusCMS — Dynamic Grimoire Loader v3 (Node Modules Support)
 *
 * Loads grimoires from:
 *   1. packages/grimoires/{name}/ (local)
 *   2. node_modules/@gremius/grimoire-{name}/ (published)
 *   3. node_modules/{scope}/grimoire-{name}/ (3rd party)
 *   4. apps/api/src/modules/{name}/ (legacy)
 *   5. packages/realms/{realm}/grimoires/{name}/ (realm bundled)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 3-TIER ARCHITECTURE:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nivel 1 — ENGINE (packages/engine/):
 *   Always active. Auth, DB, Workers. NOT loaded here.
 *
 * Nivel 2 — CORE (packages/core/):
 *   Switchable. Connectors and Webhooks gated here via Core flags.
 *
 * Nivel 3 — GRIMOIRES (packages/grimoires/ + node_modules/):
 *   Loaded dynamically. Modern grimoires use dependency injection.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * GRIMOIRE RESOLUTION ORDER:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. Local packages/grimoires/
 * 2. @gremius/grimoire-{name} (official)
 * 3. @gremius/{name} (official shorthand)
 * 4. grimoire-{name} (community)
 * 5. {scope}/grimoire-{name} (3rd party)
 * 6. Legacy fallbacks
 */

import type { Hono } from "hono";
import type { GrimoireContext, GrimoireDefinition } from "@gremius/shared";
import { getConfig, staticConfig } from "../../gremius.config";
let gremiusConfig = staticConfig;
let cachedLoadedGrimoires: GrimoireDefinition[] = [];
import { db } from "../db";
import { siteSettings, modules as modulesTable, installedGrimoires } from "../db/schema";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { GRIMOIRE_REGISTRY } from "../services/module-registry";
import { eq } from "drizzle-orm";

import { invalidateCache } from "./cache";
import { events } from "./events";
import { realtimeManager } from "./realtime";
import { requireAuth, requireRole, optionalAuth } from "../middleware/auth";
import { auth } from "./auth";
import { logger } from "./logger";
import { registerGrimoire } from "@gremius/engine";
// Content Publishing Registry - defined inline to avoid import issues
class ContentPublishingRegistry {
  private targets = new Map<string, any>();
  private ctx: any;

  constructor(ctx: any) {
    this.ctx = ctx;
  }

  register(target: any): void {
    if (this.targets.has(target.id)) {
      this.ctx.logger.warn(`ContentTarget '${target.id}' is being re-registered by ${target.grimoireId}`);
    }
    this.targets.set(target.id, target);
    this.ctx.logger.info(`ContentTarget registered: '${target.id}' (${target.name})`);
  }

  unregister(targetId: string): void {
    const target = this.targets.get(targetId);
    if (target) {
      this.targets.delete(targetId);
      this.ctx.logger.info(`ContentTarget unregistered: '${targetId}' (${target.name})`);
    }
  }

  getAvailableTargets(): any[] {
    return Array.from(this.targets.values()).map((target) => ({
      id: target.id,
      name: target.name,
      grimoireId: target.grimoireId,
      capabilities: target.capabilities,
    }));
  }

  hasTarget(targetId: string): boolean {
    return this.targets.has(targetId);
  }

  async promote(targetId: string, data: any): Promise<any> {
    const target = this.targets.get(targetId);
    if (!target) {
      throw new Error(`Content target '${targetId}' is not available`);
    }
    return target.publish(data, this.ctx);
  }

  async unpublish(targetId: string, contentId: string): Promise<void> {
    const target = this.targets.get(targetId);
    if (!target?.unpublish) {
      throw new Error(`Content target '${targetId}' does not support unpublish`);
    }
    return target.unpublish(contentId, this.ctx);
  }

  getPublishedUrl(targetId: string, result: any): string {
    const target = this.targets.get(targetId);
    if (!target) return result.url;
    return target.getPublishedUrl(result);
  }
}

/**
 * Get realm grimoire keys dynamically from both hardcoded registry and active realm.
 * This ensures grimoires defined in realm.json are correctly identified as realm grimoires.
 */
async function getRealmGrimoireKeys(activeRealm: string | null): Promise<Set<string>> {
  const keys = new Set<string>();
  
  // Add hardcoded registry realm grimoires
  for (const g of GRIMOIRE_REGISTRY.filter(g => g.category === "realm")) {
    keys.add(g.key);
    // Also add without grimoire- prefix for flexibility
    keys.add(g.key.replace(/^grimoire-/, ""));
  }
  
  // Add grimoires from active realm (from realm.json)
  if (activeRealm) {
    const realmGrimoires = await getRealmGrimoires(activeRealm);
    for (const grimoireId of realmGrimoires) {
      keys.add(grimoireId);
      // Also add without grimoire- prefix
      keys.add(grimoireId.replace(/^grimoire-/, ""));
    }
  }
  
  return keys;
}

/** Grimoire metadata from any source */
interface GrimoireSource {
  id: string;
  name: string;
  source: "local" | "npm" | "realm" | "legacy";
  path: string;
  manifest?: GrimoireManifest;
  enabled: boolean;
}

/** Check if a value is a Hono router */
function isHonoRouter(val: unknown): val is Hono {
  return (
    typeof val === "object" &&
    val !== null &&
    typeof (val as any).fetch === "function" &&
    typeof (val as any).route === "function"
  );
}

/** Check if value is a GrimoireDefinition (modern) */
function isGrimoireDefinition(val: unknown): val is GrimoireDefinition {
  return (
    typeof val === "object" &&
    val !== null &&
    "id" in val &&
    "createRouter" in val &&
    typeof (val as any).createRouter === "function"
  );
}

/** Check if value is an Auto-Grimoire (created by defineGrimoire) */
function isAutoGrimoire(val: unknown): boolean {
  return (
    typeof val === "object" &&
    val !== null &&
    "id" in val &&
    "config" in val &&
    "initialize" in val &&
    typeof (val as any).initialize === "function"
  );
}

/**
 * Create GrimoireContext with all dependencies injected
 */
export function createGrimoireContext(): GrimoireContext {
  // Crear el contexto base
  const context: any = {
    // Database
    db: {
      instance: db,
      execute: async (sql: string) => db.execute(sql),
      tableExists: async (tableName: string) => {
        try {
          await db.execute(
            `SELECT 1 FROM "${tableName}" LIMIT 1`
          );
          return true;
        } catch {
          return false;
        }
      },
    },

    // Cache
    cache: {
      get: async <T>(_key: string) => {
        return null as T | null;
      },
      set: async <T>(_key: string, _value: T, _ttlSeconds?: number) => {
        // Implementation
      },
      invalidate: async (pattern: string) => {
        await invalidateCache(pattern);
      },
    },

    // Events
    events: {
      emit: (event: string, data: unknown) => {
        events.emit(event, data);
      },
      on: (event: string, handler: (data: unknown) => void) => {
        events.on(event, handler);
      },
    },

    // Realtime
    realtime: {
      broadcast: (channel: string, message: unknown) => {
        realtimeManager.broadcast(channel, message);
      },
      sendToUser: (userId: string, message: unknown) => {
        realtimeManager.sendToUser(userId, message);
      },
    },

    // Auth
    auth: {
      requireAuth: requireAuth as any,
      requireRole: (roles: string[]) => requireRole(roles) as any,
      optionalAuth: optionalAuth as any,
      getSession: async (headers: Headers) => {
        return auth.api.getSession({ headers });
      },
    },

    // Storage (S3/MinIO)
    storage: {
      getSignedUploadUrl: async (_key: string, _contentType: string, _expiresIn = 3600) => {
        return "";
      },
      getSignedDownloadUrl: async (_key: string, _expiresIn = 3600) => {
        return "";
      },
      delete: async (_key: string) => {
        // Implementation
      },
    },

    // Logger
    logger: {
      info: (message: string, meta?: Record<string, unknown>) => {
        logger.info(meta || {}, message);
      },
      warn: (message: string, meta?: Record<string, unknown>) => {
        logger.warn(meta || {}, message);
      },
      error: (message: string, meta?: Record<string, unknown>) => {
        logger.error(meta || {}, message);
      },
      debug: (message: string, meta?: Record<string, unknown>) => {
        logger.debug(meta || {}, message);
      },
    },

    // Config
    config: {
      siteName: process.env.SITE_NAME || "Gremius CMS",
      siteUrl: process.env.SITE_URL || "http://localhost:3000",
      environment: (process.env.NODE_ENV as any) || "development",
    },
  };

  // Inicializar Content Publishing Registry con el contexto
  context.contentPublishing = new ContentPublishingRegistry(context);

  return context as GrimoireContext;
}

/**
 * Get the currently active realm from database.
 */
async function getActiveRealm(): Promise<string | null> {
  try {
    const [settings] = await db.select().from(siteSettings).limit(1);
    return (settings as any)?.activeRealm ||
      settings?.activeTheme ||
      process.env.GREMIUS_ACTIVE_REALM ||
      process.env.GREMIUS_ACTIVE_THEME ||
      null;
  } catch {
    return process.env.GREMIUS_ACTIVE_REALM || process.env.GREMIUS_ACTIVE_THEME || null;
  }
}

/**
 * Realm manifest interface (realm.json)
 */
interface RealmManifest {
  id: string;
  name: string;
  description?: string;
  version?: string;
  type: "realm";
  grimoires: string[];
  optional_grimoires?: string[];
  config?: Record<string, any>;
  bundled_modules?: string[];
}

/**
 * Grimoire manifest interface (grimoire.json)
 */
interface GrimoireManifest {
  id: string;
  name: string;
  version?: string;
  description?: string;
  author?: string;
  license?: string;
  minGremiusVersion?: string;
  mount?: {
    path: string;
  };
  tables?: string[];
  dependencies?: string[];
  [key: string]: any;
}

/**
 * Resolve workspace root directory.
 */
async function resolveWorkspaceRoot(): Promise<string> {
  const cwdPackages = join(process.cwd(), "packages", "grimoires", "package.json");
  const devRoot = join(process.cwd(), "../../");
  try {
    const cwdCheck = Bun.file(cwdPackages);
    if (await cwdCheck.exists()) {
      return process.cwd();
    }
  } catch { }
  return devRoot;
}

/**
 * Resolve node_modules directory (handles monorepos)
 */
async function resolveNodeModules(workspaceRoot: string): Promise<string[]> {
  const paths: string[] = [];

  // 1. Root node_modules
  paths.push(join(workspaceRoot, "node_modules"));

  // 2. Apps/api node_modules (if in monorepo)
  paths.push(join(workspaceRoot, "apps", "api", "node_modules"));

  // 3. Current working directory
  paths.push(join(process.cwd(), "node_modules"));

  return paths.filter(p => existsSync(p));
}

/**
 * Read grimoire.json manifest from a path
 */
async function readGrimoireManifest(dir: string): Promise<GrimoireManifest | null> {
  try {
    // Try grimoire.json first
    const grimoireJsonPath = join(dir, "grimoire.json");
    const file = Bun.file(grimoireJsonPath);
    if (await file.exists()) {
      return await file.json() as GrimoireManifest;
    }

    // Fall back to package.json with gremius field
    const packageJsonPath = join(dir, "package.json");
    const pkgFile = Bun.file(packageJsonPath);
    if (await pkgFile.exists()) {
      const pkg = await pkgFile.json();
      if (pkg.gremius?.type === "grimoire") {
        return {
          id: pkg.gremius.id || pkg.name,
          name: pkg.gremius.name || pkg.name,
          version: pkg.version,
          description: pkg.description,
          author: pkg.author,
          license: pkg.license,
          minGremiusVersion: pkg.gremius.minVersion,
          ...pkg.gremius,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get bundled grimoires for a realm by reading its realm.json manifest.
 */
async function getRealmGrimoires(realmId: string, workspaceRoot?: string): Promise<string[]> {
  const root = workspaceRoot || process.cwd();
  try {
    const realmJsonPath = join(root, "packages/realms", realmId, "realm.json");

    const realmFile = Bun.file(realmJsonPath);
    if (await realmFile.exists()) {
      const manifest: RealmManifest = await realmFile.json();
      return manifest.grimoires || [];
    }

    const legacyPath = join(root, "packages/realms", realmId, "gremius.json");

    const legacyFile = Bun.file(legacyPath);
    if (await legacyFile.exists()) {
      const manifest = await legacyFile.json();
      return manifest.grimoires || manifest.bundled_modules || [];
    }

    return [];
  } catch (err) {
    console.warn(`  ⚠️  Could not read realm manifest for ${realmId}:`, err);
    return [];
  }
}

/**
 * Get grimoires enabled in DB (from `modules` table).
 * This allows filesystem-discovered grimoires to be loaded after being
 * toggled ON in the admin UI, even if they're not in gremius.config.ts.
 */
async function getEnabledGrimoiresFromDB(): Promise<string[]> {
  try {
    const rows = await db
      .select({ key: modulesTable.key, enabled: modulesTable.enabled })
      .from(modulesTable)
      .where(eq(modulesTable.enabled, true));

    return rows.map(r => r.key);
  } catch {
    // Table might not exist yet on first run
    return [];
  }
}

/**
 * Get grimoires installed via npm/marketplace from `installed_grimoires` table.
 * These grimoires may not be in gremius.config.ts but were installed with
 * `gremius install <pkg>` and registered in the database.
 */
async function getInstalledGrimoiresFromDB(): Promise<{ grimoireId: string; sourceUrl: string | null; path: string }[]> {
  try {
    const rows = await db
      .select({
        grimoireId: installedGrimoires.grimoireId,
        sourceUrl: installedGrimoires.sourceUrl,
        path: installedGrimoires.path,
      })
      .from(installedGrimoires)
      .where(eq(installedGrimoires.enabled, true));

    return rows;
  } catch {
    // Table might not exist yet on first run
    return [];
  }
}

/**
 * Topological sort grimoires by dependencies.grimoires
 * Ensures dependencies are loaded before dependents.
 * Detects circular dependencies and throws.
 */
function sortGrimoiresByDependencies(
  grimoires: GrimoireSource[]
): GrimoireSource[] {
  const map = new Map<string, GrimoireSource>();
  for (const g of grimoires) {
    map.set(g.id, g);
    // Also register without grimoire- prefix for flexibility
    map.set(g.id.replace(/^grimoire-/, ""), g);
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const result: GrimoireSource[] = [];

  function visit(g: GrimoireSource, stack: string[]) {
    const key = g.id;
    if (visited.has(key)) return;
    if (visiting.has(key)) {
      const cycle = stack.slice(stack.indexOf(key)).join(" → ");
      throw new Error(`Circular grimoire dependency detected: ${cycle}`);
    }

    visiting.add(key);
    stack.push(key);

    const deps = (g.manifest?.dependencies as any)?.grimoires as string[] ||
      (g.manifest?.dependencies as string[]) ||
      [];

    for (const depId of deps) {
      const dep = map.get(depId);
      if (dep && dep.id !== g.id) {
        visit(dep, stack);
      }
    }

    stack.pop();
    visiting.delete(key);
    visited.add(key);
    result.push(g);
  }

  for (const g of grimoires) {
    visit(g, []);
  }

  return result;
}

/**
 * Try to resolve a grimoire from various sources
 */
async function resolveGrimoire(
  name: string,
  workspaceRoot: string,
  nodeModulesPaths: string[]
): Promise<GrimoireSource | null> {
  const cleanName = name.replace(/^grimoire-/, "");
  const dirName = `grimoire-${cleanName}`;

  // ═══════════════════════════════════════════════════════════════════════
  // SOURCE 1: Local packages/grimoires/
  // ═══════════════════════════════════════════════════════════════════════
  const localPaths = [
    join(workspaceRoot, "packages/grimoires", dirName),
    join(workspaceRoot, "packages/grimoires", cleanName),
    join(workspaceRoot, "packages/grimoires", name),
  ];

  for (const localPath of localPaths) {
    if (existsSync(localPath)) {
      const manifest = await readGrimoireManifest(localPath);
      return {
        id: manifest?.id || name,
        name: manifest?.name || name,
        source: "local",
        path: localPath,
        manifest: manifest || undefined,
        enabled: true,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SOURCE 2: node_modules (@gremius/grimoire-xxx)
  // ═══════════════════════════════════════════════════════════════════════
  for (const nmPath of nodeModulesPaths) {
    // Official @gremius packages
    const officialPaths = [
      join(nmPath, "@gremius", dirName),
      join(nmPath, "@gremius", cleanName),
      join(nmPath, "@gremius", name),
    ];

    for (const officialPath of officialPaths) {
      if (existsSync(officialPath)) {
        const manifest = await readGrimoireManifest(officialPath);
        return {
          id: manifest?.id || name,
          name: manifest?.name || name,
          source: "npm",
          path: officialPath,
          manifest: manifest || undefined,
          enabled: true,
        };
      }
    }

    // Community grimoire-xxx packages
    const communityPaths = [
      join(nmPath, dirName),
      join(nmPath, `grimoire-${cleanName}`),
    ];

    for (const communityPath of communityPaths) {
      if (existsSync(communityPath)) {
        const manifest = await readGrimoireManifest(communityPath);
        return {
          id: manifest?.id || name,
          name: manifest?.name || name,
          source: "npm",
          path: communityPath,
          manifest: manifest || undefined,
          enabled: true,
        };
      }
    }

    // Scoped 3rd party packages (@scope/grimoire-xxx)
    // Try to find any scope that has this grimoire
    try {
      const entries = await readdir(nmPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith("@")) {
          const scopePath = join(nmPath, entry.name);
          const scopeEntries = await readdir(scopePath, { withFileTypes: true });
          for (const scopeEntry of scopeEntries) {
            if (scopeEntry.isDirectory() &&
              (scopeEntry.name === dirName || scopeEntry.name === cleanName || scopeEntry.name === name)) {
              const thirdPartyPath = join(scopePath, scopeEntry.name);
              const manifest = await readGrimoireManifest(thirdPartyPath);
              return {
                id: manifest?.id || name,
                name: manifest?.name || name,
                source: "npm",
                path: thirdPartyPath,
                manifest: manifest || undefined,
                enabled: true,
              };
            }
          }
        }
      }
    } catch {
      // Ignore errors reading node_modules
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SOURCE 3: installed_grimoires table (fallback)
  // ═══════════════════════════════════════════════════════════════════════
  // If the grimoire was installed via `gremius install` but isn't in
  // gremius.config.ts or any standard location, look it up in the DB.
  try {
    const dbResult = await db
      .select({
        grimoireId: installedGrimoires.grimoireId,
        sourceUrl: installedGrimoires.sourceUrl,
        path: installedGrimoires.path,
        manifest: installedGrimoires.manifest,
      })
      .from(installedGrimoires)
      .where(eq(installedGrimoires.enabled, true));

    for (const row of dbResult) {
      if (
        row.grimoireId === name ||
        row.grimoireId === cleanName ||
        row.grimoireId === dirName
      ) {
        // Try sourceUrl first (npm package name like @gremius/grimoire-crm)
        const sourceUrl = row.sourceUrl;
        if (sourceUrl) {
          for (const nmPath of nodeModulesPaths) {
            const resolvedPath = join(nmPath, sourceUrl);
            if (existsSync(resolvedPath)) {
              const manifest =
                (row.manifest as GrimoireManifest) ||
                (await readGrimoireManifest(resolvedPath)) ||
                undefined;
              return {
                id: manifest?.id || row.grimoireId,
                name: manifest?.name || row.grimoireId,
                source: "npm",
                path: resolvedPath,
                manifest,
                enabled: true,
              };
            }
          }
        }

        // Fallback to stored path
        if (row.path && existsSync(row.path)) {
          const manifest =
            (row.manifest as GrimoireManifest) ||
            (await readGrimoireManifest(row.path)) ||
            undefined;
          return {
            id: manifest?.id || row.grimoireId,
            name: manifest?.name || row.grimoireId,
            source: "npm",
            path: row.path,
            manifest,
            enabled: true,
          };
        }
      }
    }
  } catch {
    // installed_grimoires table might not exist yet
  }

  return null;
}

import { readdir } from "node:fs/promises";

/**
 * Load and mount all configured grimoires.
 * Supports local, npm, and legacy grimoires.
 * 
 * @param app - Hono app instance
 * @param existingContext - Optional existing GrimoireContext to reuse (for Content Publishing)
 */
export async function loadGrimoires(app: Hono<any>, existingContext?: GrimoireContext): Promise<void> {
  // Cargar config dinámica con auto-discovery
  gremiusConfig = await getConfig();
  
  const configGrimoires = gremiusConfig.grimoires ?? gremiusConfig.modules ?? [];
  const coreFlags = gremiusConfig.core;

  const workspaceRoot = await resolveWorkspaceRoot();
  const nodeModulesPaths = await resolveNodeModules(workspaceRoot);

  console.log(`  📁 Workspace root: ${workspaceRoot}`);
  console.log(`  📦 Node modules paths: ${nodeModulesPaths.length}`);

  const activeRealm = await getActiveRealm();
  const realmGrimoires = activeRealm
    ? await getRealmGrimoires(activeRealm, workspaceRoot)
    : [];

  // Get grimoires enabled in DB (includes filesystem-discovered grimoires toggled ON)
  const dbEnabledKeys = await getEnabledGrimoiresFromDB();

  // Get grimoires installed via npm/marketplace from installed_grimoires table
  const dbInstalled = await getInstalledGrimoiresFromDB();
  const dbInstalledKeys = dbInstalled.map(r => r.grimoireId);

  // Build list of all grimoires to load:
  // 1. From gremius.config.ts (explicit)
  // 2. From active realm (realm.json)
  // 3. From DB modules table (user-enabled via admin UI)
  // 4. From installed_grimoires table (npm-installed grimoires)
  const allGrimoireNames = new Set([
    ...configGrimoires,
    ...realmGrimoires,
    ...dbEnabledKeys,
    ...dbInstalledKeys,
  ]);

  // Core feature flags - new structure: core is GrimoireRef[]
  const isCoreGrimoireEnabled = (id: string): boolean => {
    const grimoire = coreFlags.find((g: any) => g.id === id);
    return grimoire?.enabled ?? false;
  };

  const CORE_MODULE_FLAGS: Record<string, boolean> = {
    "webhooks": isCoreGrimoireEnabled("grimoire-webhooks"),
    "connectors": isCoreGrimoireEnabled("grimoire-connectors"),
  };

  const CORE_DIR_MAP: Record<string, string> = {
    "webhooks": "webhooks",
    "connectors": "connectors",
  };

  for (const [moduleName, enabled] of Object.entries(CORE_MODULE_FLAGS)) {
    if (enabled && !allGrimoireNames.has(moduleName)) {
      allGrimoireNames.add(moduleName);
    } else if (!enabled) {
      allGrimoireNames.delete(moduleName);
      console.log(`  📰 Core: ${moduleName} → DISABLED (feature flag)`);
    }
  }

  if (allGrimoireNames.size === 0) {
    console.log("📜 No grimoires configured");
    return;
  }

  const isBundle = !existsSync(join(workspaceRoot, "apps/api/src/index.ts"));

  if (isBundle) {
    console.log(`\n📜 Production bundle detected — grimoire routes are pre-compiled.`);
    console.log(`  📦 ${allGrimoireNames.size} grimoire(s) configured (loaded at compile time)`);
    return;
  }

  console.log(`\n📜 Resolving ${allGrimoireNames.size} grimoire(s)...`);
  if (activeRealm) {
    console.log(`  🏰 Active realm: ${activeRealm}`);
  }

  // Resolve all grimoires
  const resolvedGrimoires: GrimoireSource[] = [];
  const unresolved: string[] = [];

  for (const name of allGrimoireNames) {
    // Try to resolve from filesystem
    const resolved = await resolveGrimoire(name, workspaceRoot, nodeModulesPaths);
    if (resolved) {
      resolvedGrimoires.push(resolved);
    } else {
      // Check for legacy core modules
      if (name in CORE_DIR_MAP) {
        const corePath = join(workspaceRoot, `packages/core/${CORE_DIR_MAP[name]}`);
        if (existsSync(corePath)) {
          resolvedGrimoires.push({
            id: name,
            name,
            source: "legacy",
            path: corePath,
            enabled: true,
          });
          continue;
        }
      }

      // Check for legacy modules in apps/api/src/modules/
      const cleanForLegacy = name.replace(/^grimoire-/, "");
      const legacyPaths = [
        join(process.cwd(), `src/modules/${name}`),
        join(process.cwd(), `src/modules/${cleanForLegacy}`),
      ];
      let legacyFound = false;
      for (const legacyPath of legacyPaths) {
        if (existsSync(legacyPath)) {
          resolvedGrimoires.push({
            id: name,
            name: cleanForLegacy,
            source: "legacy",
            path: legacyPath,
            enabled: true,
          });
          legacyFound = true;
          break;
        }
      }
      if (legacyFound) continue;

      unresolved.push(name);
    }
  }

  if (unresolved.length > 0) {
    console.log(`  ⚠️  Could not resolve: ${unresolved.join(", ")}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPENDENCY RESOLUTION: Topological sort
  // ═══════════════════════════════════════════════════════════════════════════
  const sortedGrimoires = sortGrimoiresByDependencies(resolvedGrimoires);
  const depOrderInfo = sortedGrimoires.length === resolvedGrimoires.length
    ? "dependency order applied"
    : "warning: sort mismatch";

  console.log(`\n📜 Loading ${sortedGrimoires.length} grimoire(s)... (${depOrderInfo})`);

  // Reset cached grimoires list
  cachedLoadedGrimoires = [];

  // Create shared context for all grimoires (or reuse existing)
  const context = existingContext || createGrimoireContext();

  // Get dynamic realm grimoire keys for proper mounting
  const realmGrimoireKeys = await getRealmGrimoireKeys(activeRealm);

  const loaded: string[] = [];
  const failed: string[] = [];
  const modern: string[] = [];
  const legacy: string[] = [];
  const fromNpm: string[] = [];

  for (const grimoire of sortedGrimoires) {
    const cleanName = grimoire.id.replace(/^grimoire-/, "");
    const isRealmGrimoire = realmGrimoireKeys.has(grimoire.id) || realmGrimoireKeys.has(cleanName);

    let mountPath = isRealmGrimoire ? `/api/${cleanName}` : `/api/custom/${grimoire.id}`;
    const customMountPath = grimoire.manifest?.mount?.path;
    if (customMountPath) {
      mountPath = customMountPath;
    }

    try {
      let mod: any;

      // Try to import from the resolved path
      const tryImports = [
        join(grimoire.path, "index.ts"),
        join(grimoire.path, "dist", "index.js"),
        join(grimoire.path, "dist", "index.cjs"),
        join(grimoire.path, "index.js"),
      ];

      for (const importPath of tryImports) {
        if (existsSync(importPath)) {
          try {
            mod = await import(pathToFileURL(importPath).href);
            break;
          } catch (err) {
            console.log(`    ⚠️  Failed to import from ${importPath}: ${(err as Error).message}`);
            continue;
          }
        }
      }

      if (!mod) {
        throw new Error(`Could not resolve module from any path in ${grimoire.path}`);
      }

      let routerMounted = false;
      let initExecuted = false;

      const grimoireExport = mod.grimoire || mod.default;

      // ═══════════════════════════════════════════════════════════════════════
      // MODE 1A: Auto-Generated Grimoire (Nivel 1)
      // ═══════════════════════════════════════════════════════════════════════
      if (isAutoGrimoire(grimoireExport)) {
        const autoGrimoire = grimoireExport as any;
        registerGrimoire(autoGrimoire);
        cachedLoadedGrimoires.push(autoGrimoire as GrimoireDefinition);

        const category = isRealmGrimoire ? "realm" : "grimoire";
        const sourceTag = grimoire.source === "npm" ? ", npm" : "";
        console.log(`  ✅ ${grimoire.id} [${category}, auto-api${sourceTag}] → metadata registered`);

        if (grimoire.source === "npm") {
          fromNpm.push(grimoire.id);
        }
        loaded.push(grimoire.id);
        modern.push(grimoire.id);
        continue;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // MODE 1B: Modern Grimoire (Dependency Injection)
      // ═══════════════════════════════════════════════════════════════════════
      if (isGrimoireDefinition(grimoireExport)) {
        const grimoireDef = grimoireExport;

        // Create router with injected context
        const router = grimoireDef.createRouter(context);

        // Apply custom mount path: grimoire definition > grimoire.json > default
        const finalMountPath = grimoireDef.mountPath || customMountPath || mountPath;
        app.route(finalMountPath, router);
        routerMounted = true;
        modern.push(grimoire.id);
        cachedLoadedGrimoires.push(grimoireDef);

        // Execute lifecycle hooks
        if (grimoireDef.hooks?.onStartup) {
          await grimoireDef.hooks.onStartup(context);
          initExecuted = true;
        }

        const status = `→ ${finalMountPath}`;
        const initStatus = initExecuted ? " + onStartup()" : "";
        const category = isRealmGrimoire ? "realm" : "grimoire";
        const sourceTag = grimoire.source === "npm" ? ", npm" : "";
        console.log(`  ✅ ${grimoire.id} [${category}, modern${sourceTag}] ${status}${initStatus}`);

        if (grimoire.source === "npm") {
          fromNpm.push(grimoire.id);
        }
        loaded.push(grimoire.id);
        continue;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // MODE 2: Legacy Router Export
      // ═══════════════════════════════════════════════════════════════════════
      for (const [, exportValue] of Object.entries(mod)) {
        if (isHonoRouter(exportValue)) {
          app.route(mountPath, exportValue as Hono);
          routerMounted = true;
          break;
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // MODE 3: Legacy Init-only
      // ═══════════════════════════════════════════════════════════════════════
      for (const [exportName, exportValue] of Object.entries(mod)) {
        if (exportName.startsWith("init") && typeof exportValue === "function") {
          await (exportValue as () => Promise<void>)();
          initExecuted = true;
        }
      }

      if (routerMounted || initExecuted) {
        const status = routerMounted ? `→ ${mountPath}` : "(init only)";
        const initStatus = initExecuted ? " + init()" : "";
        const category = isRealmGrimoire ? "realm" : "grimoire";
        const sourceTag = grimoire.source === "legacy" ? ", legacy" : "";
        console.log(`  ✅ ${grimoire.id} [${category}${sourceTag}] ${status}${initStatus}`);
        cachedLoadedGrimoires.push({
          id: grimoire.id,
          name: grimoire.name,
          version: grimoire.manifest?.version || "0.0.0",
          createRouter: () => { throw new Error("Legacy grimoire has no createRouter"); },
        } as GrimoireDefinition);
        legacy.push(grimoire.id);
        loaded.push(grimoire.id);
      } else {
        console.log(`  ⚠️  ${grimoire.id} → no router or init found`);
        failed.push(grimoire.id);
      }
    } catch (err: any) {
      console.log(`  ❌ ${grimoire.id} → ${err.message}`);
      failed.push(grimoire.id);
    }
  }

  console.log(
    `\n📜 Grimoires: ${loaded.length} loaded` +
    (modern.length ? ` (${modern.length} modern)` : "") +
    (legacy.length ? ` (${legacy.length} legacy)` : "") +
    (fromNpm.length ? `, ${fromNpm.length} from npm` : "") +
    (failed.length ? `, ${failed.length} failed` : "")
  );
}

/**
 * Get the list of currently loaded grimoires.
 */
export async function getLoadedGrimoires(): Promise<GrimoireDefinition[]> {
  return cachedLoadedGrimoires;
}

/**
 * @deprecated Use loadGrimoires instead
 */
export const loadModules = loadGrimoires;
