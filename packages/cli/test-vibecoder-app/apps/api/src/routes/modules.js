// @ts-nocheck
/**
 * Modules API Routes
 *
 * Returns modules organized by category:
 *   - core: Official Gremius BaaS features (toggleable)
 *   - optional: Enterprise/vertical features (toggleable)
 *   - realm: Bundled with active realm (auto-loaded) — DYNAMIC
 *   - uninstalled: Grimoires with preserved data (can recover or purge)
 *
 * GET    /api/modules              — list all modules with categories
 * GET    /api/modules/:key         — get a single module by key
 * GET    /api/modules/:key/check   — can this module be disabled?
 * PATCH  /api/modules/:key         — toggle enabled / update settings
 * POST   /api/modules/:key/uninstall — uninstall but preserve data
 * POST   /api/modules/:key/recover   — recover uninstalled grimoire
 * DELETE /api/modules/:key         — delete grimoire and its data
 */
import { Hono } from "hono";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { db } from "../db";
import { modules, siteSettings } from "../db/schema";
import { scanPackages } from "../services/scanner";
import { CORE_MODULES, CORE_MODULE_KEYS, checkCanDisable, getCoreModules, getOptionalModules, getGrimoireCoreGrimoires, } from "../services/module-registry";
import { staticConfig as gremiusConfig } from "../../gremius.config";
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
/**
 * Check if a grimoire has data in the database
 * Returns table names and row counts if data exists
 */
async function checkGrimoireData(grimoireKey) {
    // Get tables from grimoire.json
    const grimoiresDir = join(getWorkspaceRoot(), "packages", "grimoires");
    const grimoireJsonPath = join(grimoiresDir, grimoireKey, "grimoire.json");
    let tablesToCheck = [];
    try {
        const file = Bun.file(grimoireJsonPath);
        if (await file.exists()) {
            const manifest = await file.json();
            if (manifest.tables && Array.isArray(manifest.tables)) {
                tablesToCheck = manifest.tables.map((t) => typeof t === "string" ? t : (t.name || t.table)).filter(Boolean);
            }
        }
    }
    catch {
        // If can't read grimoire.json, infer from key
        tablesToCheck = [grimoireKey.replace(/^grimoire-/, "").replace(/-/g, "_")];
    }
    const existingTables = [];
    for (const tableName of tablesToCheck) {
        try {
            const result = await db.execute(drizzleSql.raw(`SELECT COUNT(*) as count FROM "${tableName}"`));
            const rowCount = Number(result.rows?.[0]?.count || 0);
            if (rowCount > 0 || result.rows) {
                existingTables.push({ name: tableName, rowCount });
            }
        }
        catch {
            // Table doesn't exist or error counting
        }
    }
    const totalRows = existingTables.reduce((sum, t) => sum + t.rowCount, 0);
    return {
        hasData: existingTables.length > 0 && totalRows > 0,
        tables: existingTables,
        totalRows,
    };
}
/**
 * Get all uninstalled grimoires that have preserved data
 */
async function getUninstalledGrimoiresWithData() {
    const dbModules = await db.select().from(modules);
    const installedKeys = new Set(dbModules.map(m => m.key));
    // Get all available grimoires from filesystem
    const availableGrimoires = await scanPackages("grimoires");
    const uninstalled = [];
    for (const grimoire of availableGrimoires) {
        if (!installedKeys.has(grimoire.id)) {
            // Check if this grimoire has data
            const dataCheck = await checkGrimoireData(grimoire.id);
            if (dataCheck.hasData) {
                uninstalled.push({
                    key: grimoire.id,
                    name: grimoire.name || grimoire.id,
                    uninstalledAt: null, // Could track this in the future
                    data: dataCheck,
                });
            }
        }
    }
    return uninstalled;
}
/**
 * Resolve workspace root (same logic as module-loader / schema-merger).
 * - Dev: process.cwd() = apps/api/ → ../../ = monorepo root
 * - Docker: process.cwd() = /app/apps/api/ → packages/ at /app/packages/
 */
function getWorkspaceRoot() {
    const cwdCheck = join(process.cwd(), "packages", "grimoires", "package.json");
    return existsSync(cwdCheck) ? process.cwd() : join(process.cwd(), "../../");
}
function getPackagesRoot() {
    return join(getWorkspaceRoot(), "packages");
}
/**
 * Scan all available realms dynamically
 * This reads realm.json from packages/realms/
 */
async function scanRealmsDynamic() {
    const realmsDir = join(getPackagesRoot(), "realms");
    const realms = [];
    try {
        const entries = await readdir(realmsDir, { withFileTypes: true });
        const realmDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules");
        for (const dir of realmDirs) {
            const realmJsonPath = join(realmsDir, dir.name, "realm.json");
            const legacyPath = join(realmsDir, dir.name, "gremius.json");
            let manifest = null;
            // Try realm.json first
            const realmFile = Bun.file(realmJsonPath);
            if (await realmFile.exists()) {
                try {
                    manifest = await realmFile.json();
                }
                catch (err) {
                    console.warn(`[ModulesAPI] Failed to parse ${realmJsonPath}`);
                }
            }
            // Fallback to gremius.json
            if (!manifest) {
                const legacyFile = Bun.file(legacyPath);
                if (await legacyFile.exists()) {
                    try {
                        manifest = await legacyFile.json();
                    }
                    catch (err) {
                        console.warn(`[ModulesAPI] Failed to parse ${legacyPath}`);
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
    }
    catch (err) {
        // Realms directory might not exist
    }
    return realms;
}
/**
 * Get all realm grimoires dynamically
 * Combines hardcoded registry with dynamically scanned realms
 */
async function getDynamicRealmGrimoires() {
    const realms = await scanRealmsDynamic();
    const grimoireList = await scanPackages("grimoires");
    const grimoireMap = new Map(grimoireList.map(g => [g.id, g]));
    const result = [];
    for (const realm of realms) {
        for (const grimoireId of realm.grimoires) {
            // Get grimoire info from scanned packages
            const grimoire = grimoireMap.get(grimoireId);
            if (grimoire) {
                result.push({
                    key: grimoireId.replace(/^grimoire-/, "").replace(/-/g, "_"),
                    name: grimoire.name || grimoireId,
                    description: grimoire.description || `${grimoire.name} module`,
                    icon: grimoire.icon || "📦",
                    color: "#6366F1",
                    category: "realm",
                    realmId: realm.id,
                    tables: grimoire.tables || [],
                    dependsOn: [],
                    referencedBy: [],
                });
            }
            else {
                // Fallback if grimoire not found in packages
                result.push({
                    key: grimoireId.replace(/^grimoire-/, "").replace(/-/g, "_"),
                    name: grimoireId.replace(/^grimoire-/, "").replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
                    description: `Grimoire from ${realm.name}`,
                    icon: "📦",
                    color: "#6366F1",
                    category: "realm",
                    realmId: realm.id,
                    tables: [],
                    dependsOn: [],
                    referencedBy: [],
                });
            }
        }
    }
    return result;
}
export const modulesRoutes = new Hono();
// ── Map grimoire registry keys to gremius.config.ts core flags ──
// NOTE: Only Nivel 2 (Core) pieces have feature flags.
// Blog and Blocks are now Nivel 3 Grimoires — loaded dynamically.
// Helper to check if a grimoire is enabled in config
const isGrimoireEnabledInConfig = (id) => {
    const grimoire = gremiusConfig.core.find(g => g.id === id);
    return grimoire?.enabled ?? false;
};
const CORE_FLAG_MAP = {
    "grimoire-media": isGrimoireEnabledInConfig("grimoire-media"),
    "media-library": isGrimoireEnabledInConfig("grimoire-media"), // legacy alias
};
// Helper: get default enabled state by category
function defaultEnabled(category) {
    if (category === "core")
        return true;
    if (category === "grimoire-core")
        return true;
    if (category === "realm")
        return false; // Realm modules OFF unless realm is active
    return false; // optional defaults to off
}
// Helper: get active theme/realm
async function getActiveTheme() {
    try {
        const [settings] = await db.select().from(siteSettings).limit(1);
        // Support both new activeRealm and legacy activeTheme columns
        return settings?.activeRealm || settings?.activeTheme || null;
    }
    catch {
        return null;
    }
}
// ── GET / — List ALL modules organized by category ──
modulesRoutes.get("/", async (c) => {
    const dbModules = await db.select().from(modules);
    const dbMap = new Map(dbModules.map((m) => [m.key, m]));
    const activeTheme = await getActiveTheme();
    // Transform registry module to API response
    const transformModule = (m, source) => {
        const stored = dbMap.get(m.key);
        // Realm modules are auto-enabled when their realm is active
        const isRealmActive = m.category === "realm" && m.realmId === activeTheme;
        // Check if this grimoire is linked to the active realm in DB
        const enabledByRealm = stored?.realmId === activeTheme && activeTheme !== null;
        // Core infrastructure flags from gremius.config.ts take precedence
        const configFlag = CORE_FLAG_MAP[m.key];
        const enabled = configFlag !== undefined
            ? configFlag
            : enabledByRealm
                ? true
                : (stored ? stored.enabled : defaultEnabled(m.category));
        // Unify core categories: both "core" and "grimoire-core" become "core"
        const unifiedCategory = m.category === "grimoire-core" ? "core" : m.category;
        return {
            key: m.key,
            name: m.name,
            description: m.description,
            icon: m.icon,
            color: m.color,
            category: unifiedCategory,
            realmId: stored?.realmId || m.realmId || null,
            enabled,
            settings: stored?.settings || {},
            dependsOn: m.dependsOn,
            tables: m.tables,
            source,
            // UI hints
            canToggle: true, // All grimoires can be toggled individually now
            isRealmActive,
            enabledByRealm, // Indicates this grimoire is active because its realm is active
            sidebarBadge: enabledByRealm ? "Active by Realm" : stored?.sidebarBadge,
        };
    };
    // Core modules (media, webhooks, connectors)
    const coreModules = getCoreModules().map(m => transformModule(m, "core"));
    // Grimoire-Core modules (blog, blocks, formulas)
    const grimoireCoreModules = getGrimoireCoreGrimoires().map(m => transformModule(m, "core"));
    // Optional modules (academy, dms, booking, directory, crm, blog)
    const optionalModules = getOptionalModules().map(m => transformModule(m, "core"));
    // Realm modules — DYNAMICALLY loaded from packages/realms/*/
    const allRealmGrimoires = await getDynamicRealmGrimoires();
    const realmModules = allRealmGrimoires.map(m => transformModule(m, "realm"));
    // Auto-discovered grimoires from filesystem (not in hardcoded registry)
    // This is the key to zero-config: drop a grimoire directory with grimoire.json
    // and it auto-appears in the admin panel.
    const registryKeys = new Set([
        ...coreModules.map(m => m.key),
        ...grimoireCoreModules.map(m => m.key),
        ...optionalModules.map(m => m.key),
        ...realmModules.map(m => m.key),
    ]);
    let filesystemModules = [];
    try {
        const manifestList = await scanPackages("grimoires");
        filesystemModules = manifestList
            .filter((m) => !registryKeys.has(m.id) && !registryKeys.has(m.id.replace(/^grimoire-/, "")))
            .map((m) => {
            const stored = dbMap.get(m.id);
            const enabledByRealm = stored?.realmId === activeTheme && activeTheme !== null;
            const enabled = enabledByRealm ? true : (stored?.enabled || false);
            return {
                key: m.id,
                name: m.name || m.id.replace(/^grimoire-/, "").replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
                description: m.description || "",
                version: m.version,
                icon: m.icon || "📦",
                category: stored?.realmId ? "realm" : "optional",
                realmId: stored?.realmId || null,
                enabled,
                settings: stored?.settings || {},
                sidebarPath: m.admin_route || `/${m.id.replace(/^grimoire-/, "")}`,
                source: "filesystem",
                canToggle: true,
                enabledByRealm,
                sidebarBadge: enabledByRealm ? "Active by Realm" : stored?.sidebarBadge,
            };
        });
    }
    catch {
        // No packages dir
    }
    // Get uninstalled grimoires with preserved data
    const uninstalledGrimoires = await getUninstalledGrimoiresWithData();
    // Build categorized response
    const response = {
        activeTheme,
        categories: {
            core: {
                label: "Core Infrastructure",
                description: "Nivel 2 — Switchable infrastructure",
                modules: coreModules,
            },
            "grimoire-core": {
                label: "Grimoire Core",
                description: "Nivel 3 — Official superpowers",
                modules: grimoireCoreModules,
            },
            optional: {
                label: "Optional Grimoires",
                description: "Enterprise and vertical features",
                modules: [...optionalModules, ...filesystemModules],
            },
            theme: {
                label: "Realm Grimoires",
                description: activeTheme
                    ? `Active realm: ${activeTheme}`
                    : "No realm active — all disabled",
                modules: realmModules,
            },
            uninstalled: {
                label: "Uninstalled (Data Preserved)",
                description: uninstalledGrimoires.length > 0
                    ? `${uninstalledGrimoires.length} grimoires with data available for recovery`
                    : "No uninstalled grimoires with preserved data",
                modules: uninstalledGrimoires.map(g => ({
                    key: g.key,
                    name: g.name,
                    status: "uninstalled",
                    hasPreservedData: true,
                    dataSummary: {
                        totalRows: g.data.totalRows,
                        tables: g.data.tables.map(t => ({ name: t.name, rows: t.rowCount })),
                    },
                    canRecover: true,
                    canDelete: true, // Can permanently delete from here
                    actions: ["recover", "delete"],
                })),
            },
        },
        // Flat list for backward compatibility (sidebar, etc.)
        docs: [...coreModules, ...grimoireCoreModules, ...optionalModules, ...realmModules, ...filesystemModules],
        totalDocs: coreModules.length + grimoireCoreModules.length + optionalModules.length + realmModules.length + filesystemModules.length,
    };
    return c.json(response);
});
// ── GET /:key — Get a single module by key ──
modulesRoutes.get("/:key", async (c) => {
    const key = c.req.param("key");
    const activeTheme = await getActiveTheme();
    const [stored] = await db.select().from(modules).where(eq(modules.key, key)).limit(1);
    const registryDef = CORE_MODULES.find(m => m.key === key);
    if (!stored && !registryDef) {
        return c.json({ error: `Module '${key}' not found` }, 404);
    }
    // Check if enabled by realm (stored in DB and realm matches active)
    const enabledByRealm = stored?.realmId === activeTheme && activeTheme !== null;
    // Calculate isRealmActive - either from registry or from DB
    const isRealmActive = (registryDef?.category === "realm" && registryDef?.realmId === activeTheme) || enabledByRealm;
    // Calculate enabled status
    const configFlag = CORE_FLAG_MAP[key];
    const enabled = configFlag !== undefined
        ? configFlag
        : enabledByRealm
            ? true
            : (stored ? stored.enabled : defaultEnabled(registryDef?.category || "optional"));
    // Check if this is a realm grimoire (either from registry or DB)
    const isRealmGrimoire = registryDef?.category === "realm" || !!stored?.realmId;
    return c.json({
        key,
        name: registryDef?.name || stored?.name || key,
        description: registryDef?.description || stored?.description || "",
        icon: registryDef?.icon || stored?.icon || "📦",
        color: registryDef?.color || "",
        category: registryDef?.category === "grimoire-core" ? "core" : (registryDef?.category || stored?.category || "optional"),
        realmId: stored?.realmId || registryDef?.realmId || null,
        enabled,
        settings: stored?.settings || {},
        tables: registryDef?.tables || [],
        dependsOn: registryDef?.dependsOn || [],
        canToggle: true, // All grimoires can be toggled individually
        isRealmActive,
        enabledByRealm,
        isRealmGrimoire,
        sidebarBadge: enabledByRealm ? "Active by Realm" : stored?.sidebarBadge,
    });
});
// ── GET /:key/check — Can this module be disabled? ──
modulesRoutes.get("/:key/check", async (c) => {
    const key = c.req.param("key");
    // Check if this is a realm grimoire - realm grimoires CAN be toggled individually now
    // but we show a warning that it's part of a realm
    const moduleDef = CORE_MODULES.find(m => m.key === key);
    const [stored] = await db.select().from(modules).where(eq(modules.key, key)).limit(1);
    const isRealmGrimoire = moduleDef?.category === "realm" || !!stored?.realmId;
    const dbModules = await db.select().from(modules);
    const dbMap = new Map(dbModules.map((m) => [m.key, m]));
    const enabledKeys = new Set();
    for (const cm of CORE_MODULES) {
        const stored = dbMap.get(cm.key);
        const isEnabled = stored ? stored.enabled : defaultEnabled(cm.category);
        if (isEnabled)
            enabledKeys.add(cm.key);
    }
    for (const [k, v] of dbMap) {
        if (!CORE_MODULE_KEYS.includes(k) && v.enabled) {
            enabledKeys.add(k);
        }
    }
    const result = await checkCanDisable(key, enabledKeys);
    // Add realm info to result
    const checkResult = {
        ...result,
        isRealmGrimoire,
        realmId: stored?.realmId || moduleDef?.realmId || null,
        warning: isRealmGrimoire ? "This grimoire is part of a realm. Disabling it may affect realm functionality." : undefined,
    };
    return c.json(checkResult);
});
// ── PATCH /:key — Toggle or update ──
modulesRoutes.patch("/:key", async (c) => {
    const key = c.req.param("key");
    const body = await c.req.json();
    const registryDef = CORE_MODULES.find((m) => m.key === key);
    // Check if this is a realm grimoire
    const [existingModule] = await db.select().from(modules).where(eq(modules.key, key)).limit(1);
    const isRealmGrimoire = registryDef?.category === "realm" || existingModule?.realmId;
    // If disabling, run dependency check
    if (body.enabled === false) {
        const dbModules = await db.select().from(modules);
        const dbMap = new Map(dbModules.map((m) => [m.key, m]));
        const enabledKeys = new Set();
        for (const cm of CORE_MODULES) {
            const stored = dbMap.get(cm.key);
            if (stored ? stored.enabled : defaultEnabled(cm.category)) {
                enabledKeys.add(cm.key);
            }
        }
        for (const [k, v] of dbMap) {
            if (!CORE_MODULE_KEYS.includes(k) && v.enabled)
                enabledKeys.add(k);
        }
        const check = await checkCanDisable(key, enabledKeys);
        if (!check.canDisable) {
            return c.json({
                error: "Cannot disable module",
                message: `${key} has active dependencies that must be removed first.`,
                blockers: check.blockers,
            }, 409);
        }
    }
    // Upsert
    const existing = await db.select().from(modules).where(eq(modules.key, key)).limit(1);
    if (existing.length === 0) {
        if (body.enabled !== undefined) {
            if (body.enabled === true) {
                try {
                    const { runModuleMigrations } = await import("../services/scanner");
                    await runModuleMigrations(key);
                }
                catch (err) {
                    console.error(`[Modules] Migration error for ${key}:`, err);
                }
            }
            await db.insert(modules).values({
                key,
                name: registryDef?.name || body.name || key,
                description: registryDef?.description || body.description,
                icon: registryDef?.icon || body.icon,
                category: registryDef?.category || "optional",
                enabled: body.enabled,
                settings: body.settings || {},
            });
        }
    }
    else {
        const updates = {};
        if (typeof body.enabled === "boolean") {
            updates.enabled = body.enabled;
            if (body.enabled === true) {
                try {
                    const { runModuleMigrations } = await import("../services/scanner");
                    await runModuleMigrations(key);
                }
                catch (err) {
                    console.error(`[Modules] Migration error for ${key}:`, err);
                }
            }
        }
        if (body.settings !== undefined)
            updates.settings = body.settings;
        if (Object.keys(updates).length > 0) {
            await db.update(modules).set(updates).where(eq(modules.key, key));
        }
    }
    const [updated] = await db.select().from(modules).where(eq(modules.key, key));
    if (!updated && registryDef) {
        return c.json({
            key,
            name: registryDef.name,
            enabled: defaultEnabled(registryDef.category),
            settings: {},
            category: registryDef.category,
            realmId: null,
            enabledByRealm: false,
        });
    }
    // Get active theme to calculate enabledByRealm
    const activeTheme = await getActiveTheme();
    const enabledByRealm = updated?.realmId === activeTheme && activeTheme !== null;
    return c.json(updated ? {
        ...updated,
        enabledByRealm,
        isRealmGrimoire: !!updated.realmId,
    } : { key, enabled: body.enabled || false, realmId: null, enabledByRealm: false });
});
// ── POST /:key/uninstall — Uninstall grimoire but preserve data ──
modulesRoutes.post("/:key/uninstall", async (c) => {
    const key = c.req.param("key");
    // Check if module exists in DB
    const [existing] = await db.select().from(modules).where(eq(modules.key, key)).limit(1);
    if (!existing) {
        return c.json({ error: `Grimoire '${key}' not found` }, 404);
    }
    // Check for dependencies
    const dbModulesList = await db.select().from(modules);
    const dbMap = new Map(dbModulesList.map((m) => [m.key, m]));
    const enabledKeys = new Set();
    for (const cm of CORE_MODULES) {
        const stored = dbMap.get(cm.key);
        if (stored ? stored.enabled : defaultEnabled(cm.category)) {
            enabledKeys.add(cm.key);
        }
    }
    for (const [k, v] of dbMap) {
        if (!CORE_MODULE_KEYS.includes(k) && v.enabled)
            enabledKeys.add(k);
    }
    const check = await checkCanDisable(key, enabledKeys);
    if (existing.enabled && !check.canDisable) {
        return c.json({
            error: "Cannot uninstall",
            message: `${key} has active dependencies. Disable it first.`,
            blockers: check.blockers,
            enabled: existing.enabled,
        }, 409);
    }
    // Get data info before uninstalling
    const dataInfo = await checkGrimoireData(key);
    // Delete the module from DB (preserves data in actual tables)
    await db.delete(modules).where(eq(modules.key, key));
    console.log(`[Modules] Grimoire ${key} uninstalled, data preserved (${dataInfo.totalRows} rows)`);
    return c.json({
        success: true,
        action: "uninstall",
        key,
        name: existing.name,
        wasEnabled: existing.enabled,
        wasRealmGrimoire: !!existing.realmId,
        realmId: existing.realmId,
        dataPreserved: {
            hasData: dataInfo.hasData,
            totalRows: dataInfo.totalRows,
            tables: dataInfo.tables,
        },
        message: `Grimoire ${key} uninstalled. Data preserved: ${dataInfo.totalRows} rows in ${dataInfo.tables.length} tables.`,
        nextSteps: [
            "Use POST /api/modules/${key}/recover to reinstall and recover data",
            "Use DELETE /api/modules/${key}?purge=true to permanently delete data",
        ],
    });
});
// ── POST /:key/recover — Recover/Reinstall an uninstalled grimoire ──
modulesRoutes.post("/:key/recover", async (c) => {
    const key = c.req.param("key");
    // Check if already installed
    const [existing] = await db.select().from(modules).where(eq(modules.key, key)).limit(1);
    if (existing) {
        return c.json({
            error: "Already installed",
            message: `Grimoire ${key} is already installed.`,
            key,
            enabled: existing.enabled,
        }, 409);
    }
    // Get grimoire info from filesystem
    const grimoires = await scanPackages("grimoires");
    const grimoire = grimoires.find(g => g.id === key);
    const registryDef = CORE_MODULES.find(m => m.key === key);
    if (!grimoire && !registryDef) {
        return c.json({ error: `Grimoire '${key}' not found in filesystem or registry` }, 404);
    }
    // Check if there's preserved data
    const dataInfo = await checkGrimoireData(key);
    // Run migrations (will restore schema if needed)
    try {
        const { runModuleMigrations } = await import("../services/scanner");
        await runModuleMigrations(key);
    }
    catch (err) {
        console.error(`[Modules] Migration error for ${key}:`, err);
    }
    // Re-insert into modules table
    const name = grimoire?.name || registryDef?.name || key;
    const description = grimoire?.description || registryDef?.description;
    const icon = grimoire?.icon || registryDef?.icon || "📦";
    const category = registryDef?.category || "optional";
    await db.insert(modules).values({
        key,
        name,
        description,
        icon,
        category,
        enabled: true,
        settings: {},
    });
    console.log(`[Modules] Grimoire ${key} recovered, data restored (${dataInfo.totalRows} rows)`);
    return c.json({
        success: true,
        action: "recover",
        key,
        name,
        enabled: true,
        dataRestored: {
            hasData: dataInfo.hasData,
            totalRows: dataInfo.totalRows,
            tables: dataInfo.tables,
        },
        message: dataInfo.hasData
            ? `Grimoire ${key} recovered successfully with ${dataInfo.totalRows} rows of data.`
            : `Grimoire ${key} recovered successfully. No previous data found.`,
    });
});
// ── DELETE /:key — Permanently delete grimoire and its data ──
modulesRoutes.delete("/:key", async (c) => {
    const key = c.req.param("key");
    const purge = c.req.query("purge") === "true";
    const force = c.req.query("force") === "true";
    // Check if module exists in DB
    const [existing] = await db.select().from(modules).where(eq(modules.key, key)).limit(1);
    // If still installed, require purge flag
    if (existing && !purge) {
        return c.json({
            error: "Grimoire is installed",
            message: `Grimoire ${key} is still installed. Use POST /api/modules/${key}/uninstall first, or use ?purge=true to uninstall and delete in one step.`,
            key,
            status: "installed",
            enabled: existing.enabled,
            canUninstall: true,
        }, 409);
    }
    // Check for dependencies if still "enabled" somehow
    if (existing?.enabled) {
        const dbModulesList = await db.select().from(modules);
        const dbMap = new Map(dbModulesList.map((m) => [m.key, m]));
        const enabledKeys = new Set();
        for (const cm of CORE_MODULES) {
            const stored = dbMap.get(cm.key);
            if (stored ? stored.enabled : defaultEnabled(cm.category)) {
                enabledKeys.add(cm.key);
            }
        }
        const check = await checkCanDisable(key, enabledKeys);
        if (!check.canDisable && !force) {
            return c.json({
                error: "Cannot delete",
                message: `${key} has active dependencies. Disable it first or use ?force=true.`,
                blockers: check.blockers,
            }, 409);
        }
    }
    // Get data info before deletion
    const dataInfo = await checkGrimoireData(key);
    // Delete from modules table if exists
    if (existing) {
        await db.delete(modules).where(eq(modules.key, key));
    }
    // If purge, also drop the actual tables
    let droppedTables = [];
    if (purge) {
        for (const table of dataInfo.tables) {
            try {
                await db.execute(drizzleSql.raw(`DROP TABLE IF EXISTS "${table.name}" CASCADE`));
                droppedTables.push(table.name);
            }
            catch (err) {
                console.error(`[Modules] Error dropping table ${table.name}:`, err);
            }
        }
    }
    console.log(`[Modules] Grimoire ${key} deleted${purge ? ` with ${droppedTables.length} tables dropped` : " (data preserved)"}`);
    return c.json({
        success: true,
        action: "delete",
        key,
        name: existing?.name || key,
        purge,
        dataDeleted: purge ? {
            tablesDropped: droppedTables.length,
            tables: droppedTables,
            totalRows: dataInfo.totalRows,
        } : undefined,
        message: purge
            ? `Grimoire ${key} permanently deleted. ${droppedTables.length} tables dropped (${dataInfo.totalRows} rows).`
            : `Grimoire ${key} removed from registry. Data preserved in ${dataInfo.tables.length} tables.`,
        warning: purge ? "This action is irreversible. Data has been permanently deleted." : undefined,
    });
});
//# sourceMappingURL=modules.js.map