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
/**
 * Create GrimoireContext with all dependencies injected
 */
export declare function createGrimoireContext(): GrimoireContext;
/**
 * Load and mount all configured grimoires.
 * Supports local, npm, and legacy grimoires.
 *
 * @param app - Hono app instance
 * @param existingContext - Optional existing GrimoireContext to reuse (for Content Publishing)
 */
export declare function loadGrimoires(app: Hono<any>, existingContext?: GrimoireContext): Promise<void>;
/**
 * Get the list of currently loaded grimoires.
 */
export declare function getLoadedGrimoires(): Promise<GrimoireDefinition[]>;
/**
 * @deprecated Use loadGrimoires instead
 */
export declare const loadModules: typeof loadGrimoires;
//# sourceMappingURL=module-loader.d.ts.map