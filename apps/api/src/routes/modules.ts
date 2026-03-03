/**
 * Modules API Routes
 *
 * Returns modules organized by category:
 *   - core: Official Gremius BaaS features (toggleable)
 *   - optional: Enterprise/vertical features (toggleable)
 *   - theme: Bundled with active theme (auto-loaded)
 *
 * GET    /api/modules              — list all modules with categories
 * GET    /api/modules/:key/check   — can this module be disabled?
 * PATCH  /api/modules/:key         — toggle enabled / update settings
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { modules, siteSettings } from "../db/schema";
import { scanPackages } from "../services/scanner";
import {
  CORE_MODULES,
  CORE_MODULE_KEYS,
  checkCanDisable,
  getCoreModules,
  getOptionalModules,
  getThemeModules,
} from "../services/module-registry";
import gremiusConfig from "../../gremius.config";

export const modulesRoutes = new Hono();

// ── Map grimoire registry keys to gremius.config.ts core flags ──
const CORE_FLAG_MAP: Record<string, boolean | undefined> = {
  "media-library": gremiusConfig.core.mediaLibrary.enabled,
  "promote": gremiusConfig.core.promoteToContent.enabled,
  "webhooks": gremiusConfig.core.webhooks.enabled,
  "blocks": gremiusConfig.core.pageBuilder.enabled,
};

// Helper: get default enabled state by category
function defaultEnabled(category: string): boolean {
  if (category === "core") return true;
  if (category === "theme") return true; // Theme modules are auto-enabled
  return false; // optional defaults to off
}

// Helper: get active theme
async function getActiveTheme(): Promise<string | null> {
  try {
    const [settings] = await db.select().from(siteSettings).limit(1);
    return settings?.activeTheme || null;
  } catch {
    return null;
  }
}

// ── GET / — List ALL modules organized by category ──
modulesRoutes.get("/", async (c) => {
  const dbModules = await db.select().from(modules);
  const dbMap = new Map(dbModules.map((m) => [m.key, m]));
  const activeTheme = await getActiveTheme();

  // Transform registry module to API response
  const transformModule = (m: typeof CORE_MODULES[0], source: "core" | "theme" | "filesystem") => {
    const stored = dbMap.get(m.key);
    
    // Theme modules are auto-enabled when their theme is active
    const isThemeActive = m.category === "theme" && m.themeId === activeTheme;

    // Core infrastructure flags from gremius.config.ts take precedence
    const configFlag = CORE_FLAG_MAP[m.key];
    const enabled = configFlag !== undefined
      ? configFlag
      : isThemeActive 
        ? true 
        : (stored ? stored.enabled : defaultEnabled(m.category));

    return {
      key: m.key,
      name: m.name,
      description: m.description,
      icon: m.icon,
      color: m.color,
      category: m.category,
      themeId: m.themeId,
      enabled,
      settings: stored?.settings || {},
      dependsOn: m.dependsOn,
      tables: m.tables,
      source,
      // UI hints
      canToggle: m.category !== "theme", // Theme modules follow theme activation
      isThemeActive,
    };
  };

  // Core modules (promote, webhooks, connectors, blocks, media)
  const coreModules = getCoreModules().map(m => transformModule(m, "core"));

  // Optional modules (academy, dms, booking, directory, formulas, crm, blog)
  const optionalModules = getOptionalModules().map(m => transformModule(m, "core"));

  // Theme modules (games, streamers, platforms, tags - only if theme is active)
  const themeModules = activeTheme 
    ? getThemeModules(activeTheme).map(m => transformModule(m, "theme"))
    : [];

  // Filesystem modules (community/plugins)
  let filesystemModules: any[] = [];
  try {
    const manifestList = await scanPackages("modules");
    filesystemModules = manifestList
      .filter((m) => !CORE_MODULE_KEYS.includes(m.id))
      .map((m) => {
        const stored = dbMap.get(m.id);
        return {
          key: m.id,
          name: m.name,
          description: m.description,
          version: m.version,
          icon: m.icon,
          category: "optional",
          enabled: stored?.enabled || false,
          settings: stored?.settings || {},
          sidebarPath: m.admin_route,
          source: "filesystem" as const,
          canToggle: true,
        };
      });
  } catch {
    // No packages dir
  }

  // Build categorized response
  const response = {
    activeTheme,
    categories: {
      core: {
        label: "Core Modules",
        description: "Official Gremius BaaS features",
        modules: coreModules,
      },
      optional: {
        label: "Optional Modules", 
        description: "Enterprise and vertical features",
        modules: [...optionalModules, ...filesystemModules],
      },
      theme: {
        label: "Theme Modules",
        description: activeTheme 
          ? `Bundled with ${activeTheme}` 
          : "No theme active",
        modules: themeModules,
      },
    },
    // Flat list for backward compatibility
    docs: [...coreModules, ...optionalModules, ...themeModules, ...filesystemModules],
    totalDocs: coreModules.length + optionalModules.length + themeModules.length + filesystemModules.length,
  };

  return c.json(response);
});

// ── GET /:key/check — Can this module be disabled? ──
modulesRoutes.get("/:key/check", async (c) => {
  const key = c.req.param("key");

  // Theme modules cannot be toggled individually
  const moduleDef = CORE_MODULES.find(m => m.key === key);
  if (moduleDef?.category === "theme") {
    return c.json({
      canDisable: false,
      reason: "Theme modules are controlled by theme activation",
      blockers: [],
      warnings: [],
    });
  }

  const dbModules = await db.select().from(modules);
  const dbMap = new Map(dbModules.map((m) => [m.key, m]));

  const enabledKeys = new Set<string>();

  for (const cm of CORE_MODULES) {
    const stored = dbMap.get(cm.key);
    const isEnabled = stored ? stored.enabled : defaultEnabled(cm.category);
    if (isEnabled) enabledKeys.add(cm.key);
  }

  for (const [k, v] of dbMap) {
    if (!CORE_MODULE_KEYS.includes(k) && v.enabled) {
      enabledKeys.add(k);
    }
  }

  const result = await checkCanDisable(key, enabledKeys);
  return c.json(result);
});

// ── PATCH /:key — Toggle or update ──
modulesRoutes.patch("/:key", async (c) => {
  const key = c.req.param("key");
  const body = await c.req.json();

  const registryDef = CORE_MODULES.find((m) => m.key === key);

  // Theme modules cannot be toggled individually
  if (registryDef?.category === "theme") {
    return c.json({
      error: "Cannot toggle theme module",
      message: "Theme modules are controlled by theme activation. Use /api/system/active-theme to change themes.",
    }, 400);
  }

  // If disabling, run dependency check
  if (body.enabled === false) {
    const dbModules = await db.select().from(modules);
    const dbMap = new Map(dbModules.map((m) => [m.key, m]));

    const enabledKeys = new Set<string>();
    for (const cm of CORE_MODULES) {
      const stored = dbMap.get(cm.key);
      if (stored ? stored.enabled : defaultEnabled(cm.category)) {
        enabledKeys.add(cm.key);
      }
    }
    for (const [k, v] of dbMap) {
      if (!CORE_MODULE_KEYS.includes(k) && v.enabled) enabledKeys.add(k);
    }

    const check = await checkCanDisable(key, enabledKeys);
    if (!check.canDisable) {
      return c.json(
        {
          error: "Cannot disable module",
          message: `${key} has active dependencies that must be removed first.`,
          blockers: check.blockers,
        },
        409
      );
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
        } catch (err) {
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
  } else {
    const updates: Record<string, any> = {};

    if (typeof body.enabled === "boolean") {
      updates.enabled = body.enabled;
      if (body.enabled === true) {
        try {
          const { runModuleMigrations } = await import("../services/scanner");
          await runModuleMigrations(key);
        } catch (err) {
          console.error(`[Modules] Migration error for ${key}:`, err);
        }
      }
    }

    if (body.settings !== undefined) updates.settings = body.settings;

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
    });
  }

  return c.json(updated || { key, enabled: body.enabled || false });
});
