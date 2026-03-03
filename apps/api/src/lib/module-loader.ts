/**
 * GremiusCMS — Dynamic Grimoire Loader (The Magic System)
 *
 * Loads grimoires (individual magical blocks of code) from packages/grimoires/{name}/
 * Mounts routes based on active realm configuration from packages/realms/{realm}/realm.json
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LORE REFACTOR: Jerarquía Mágica de Gremius
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * GRIMOIRES (formerly "modules"): Individual code blocks with schema + routes
 *   Location: packages/grimoires/{grimoire-name}/
 *   Example: packages/grimoires/grimoire-tournaments/
 * 
 * REALMS (formerly "themes"): Business ecosystems grouping grimoires
 *   Location: packages/realms/{realm-name}/
 *   Manifest: realm.json (declares which grimoires to load)
 *   Example: packages/realms/realm-esports/realm.json
 * 
 * Mount points:
 *   - Realm grimoires: /api/{name}
 *   - Core/Optional grimoires: /api/custom/{name}
 *
 * Grimoire convention:
 *   - Export a Hono router named {name}Routes (e.g., tournamentsRoutes)
 *   - Optionally export an init* async function
 */

import type { Hono } from "hono";
import gremiusConfig from "../../gremius.config";
import { db } from "../db";
import { siteSettings } from "../db/schema";
import { join } from "node:path";
import { GRIMOIRE_REGISTRY, type GrimoireDef } from "../services/module-registry";

// Realm grimoire keys (mounted at /api/{name})
const REALM_GRIMOIRE_KEYS = new Set(
    GRIMOIRE_REGISTRY
        .filter(g => g.category === "realm")
        .map(g => g.key)
);

/** Check if a value is a Hono router */
function isHonoRouter(val: unknown): val is Hono {
    return (
        typeof val === "object" &&
        val !== null &&
        typeof (val as any).fetch === "function" &&
        typeof (val as any).route === "function"
    );
}

/**
 * Get the currently active realm from database.
 */
async function getActiveRealm(): Promise<string | null> {
    try {
        const [settings] = await db.select().from(siteSettings).limit(1);
        // Support both old 'activeTheme' and new 'activeRealm' field
        return settings?.activeRealm ||
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
    // Legacy support
    bundled_modules?: string[];
}

/**
 * Get bundled grimoires for a realm by reading its realm.json manifest.
 */
async function getRealmGrimoires(realmId: string): Promise<string[]> {
    try {
        // Try new realm.json format first
        const realmJsonPath = join(
            process.cwd(),
            "../../packages/realms",
            realmId,
            "realm.json"
        );

        const realmFile = Bun.file(realmJsonPath);
        if (await realmFile.exists()) {
            const manifest: RealmManifest = await realmFile.json();
            return manifest.grimoires || [];
        }

        // Fallback to legacy gremius.json
        const legacyPath = join(
            process.cwd(),
            "../../packages/realms",
            realmId,
            "gremius.json"
        );

        const legacyFile = Bun.file(legacyPath);
        if (await legacyFile.exists()) {
            const manifest = await legacyFile.json();
            // Support both bundled_modules (legacy) and grimoires (new)
            return manifest.grimoires || manifest.bundled_modules || [];
        }

        return [];
    } catch (err) {
        console.warn(`  ⚠️  Could not read realm manifest for ${realmId}:`, err);
        return [];
    }
}

/**
 * Load and mount all configured grimoires.
 * Core modules (promote, webhooks) are gated by feature flags in gremius.config.ts.
 */
export async function loadGrimoires(app: Hono<any>): Promise<void> {
    const { modules: configModules, core: coreFlags } = gremiusConfig;
    const activeRealm = await getActiveRealm();
    const realmGrimoires = activeRealm
        ? await getRealmGrimoires(activeRealm)
        : [];

    // Combine config modules + realm grimoires
    const allGrimoires = new Set([...configModules, ...realmGrimoires]);

    // ═══ CORE FEATURE FLAGS (Nivel 1) ═══
    // Inject core modules that are enabled but not in the grimoire list,
    // or remove them if their flag is disabled.
    const CORE_MODULE_FLAGS: Record<string, boolean> = {
        "promote": coreFlags.promoteToContent.enabled,
        "webhooks": coreFlags.webhooks.enabled,
    };

    // Map module names to their packages/core/ directory names
    const CORE_DIR_MAP: Record<string, string> = {
        "webhooks": "webhooks",
        "promote": "promote-to-content",
    };

    for (const [moduleName, enabled] of Object.entries(CORE_MODULE_FLAGS)) {
        if (enabled && !allGrimoires.has(moduleName)) {
            allGrimoires.add(moduleName);
        } else if (!enabled) {
            allGrimoires.delete(moduleName);
            console.log(`  📰 Core: ${moduleName} → DISABLED (feature flag)`);
        }
    }

    if (allGrimoires.size === 0) {
        console.log("📜 No grimoires configured");
        return;
    }

    console.log(`\n📜 Loading ${allGrimoires.size} grimoire(s)...`);
    if (activeRealm) {
        console.log(`  🏰 Active realm: ${activeRealm}`);
    }

    const loaded: string[] = [];
    const failed: string[] = [];

    for (const name of allGrimoires) {
        // Strip 'grimoire-' prefix when matching against registry keys
        const cleanName = name.replace(/^grimoire-/, "");
        const isRealmGrimoire = REALM_GRIMOIRE_KEYS.has(name) || REALM_GRIMOIRE_KEYS.has(cleanName);

        // Realm grimoires mount at /api/{cleanName}, others at /api/custom/{name}
        const mountPath = isRealmGrimoire ? `/api/${cleanName}` : `/api/custom/${name}`;

        try {
            let mod;
            try {
                // First attempt: load core modules from packages/core/
                if (name in CORE_DIR_MAP) {
                    const coreDir = CORE_DIR_MAP[name];
                    const corePath = `../../../../packages/core/${coreDir}/index.ts`;
                    mod = await import(corePath);
                } else {
                    throw new Error("Not a core module");
                }
            } catch {
                try {
                    // Second attempt: load from grimoires (new location)
                    const grimoirePath = `../../../../packages/grimoires/${name}/index.ts`;
                    mod = await import(grimoirePath);
                } catch (err: any) {
                    console.error(`  ⚠️  [DEBUG] First import failed for ${name}:`, err.message);
                    // Fallback to legacy API modules
                    try {
                        mod = await import(`../modules/${name}/index.ts`);
                    } catch (err2: any) {
                        // Last resort: try realm bundled path (legacy)
                        if (activeRealm) {
                            const legacyPath = `../../../../packages/realms/${activeRealm}/grimoires/${name}/index.ts`;
                            mod = await import(legacyPath);
                        } else {
                            throw err;
                        }
                    }
                }
            }

            let routerMounted = false;
            let initExecuted = false;

            // Find and mount the Hono router
            for (const [exportName, exportValue] of Object.entries(mod)) {
                if (isHonoRouter(exportValue)) {
                    app.route(mountPath, exportValue as Hono);
                    routerMounted = true;
                    break;
                }
            }

            // Call any init* function
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
                console.log(`  ✅ ${name} [${category}] ${status}${initStatus}`);
                loaded.push(name);
            } else {
                console.log(`  ⚠️  ${name} → no router or init found`);
                failed.push(name);
            }
        } catch (err: any) {
            console.log(`  ❌ ${name} → ${err.message}`);
            failed.push(name);
        }
    }

    console.log(
        `\n📜 Grimoires: ${loaded.length} loaded` +
        (failed.length ? `, ${failed.length} failed` : "")
    );
}

/**
 * @deprecated Use loadGrimoires instead
 */
export const loadModules = loadGrimoires;
