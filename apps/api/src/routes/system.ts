/**
 * System Routes
 * - Theme management (Module-Aware Themes / Prism)
 * - CSS serving
 * - Module dependency resolution on theme activation
 *
 * NOTE: /init-check and /setup are handled inline in index.ts (before auth middleware).
 * These routes are for authenticated system management.
 */

import { Hono } from "hono";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { siteSettings, modules } from "../db/schema";
import { scanPackages, scanPackages as scanRealms } from "../services/scanner";
import { CORE_MODULES, CORE_MODULE_KEYS } from "../services/module-registry";
import { protectRoute } from "../middleware/auth-guard";

export const systemRoutes = new Hono();

/**
 * Get all grimoires (both required and optional) for a realm
 */
async function getRealmGrimoires(realmId: string): Promise<{ required: string[]; optional: string[] }> {
  const realms = await scanRealms("realms");
  const realm = realms.find(r => r.id === realmId);
  
  if (!realm) {
    return { required: [], optional: [] };
  }
  
  return {
    required: realm.grimoires || [],
    optional: realm.optional_grimoires || [],
  };
}

// ── Helper: get currently enabled module keys ──
async function getEnabledModuleKeys(): Promise<Set<string>> {
  const dbModules = await db.select().from(modules);
  const dbMap = new Map(dbModules.map((m) => [m.key, m]));
  const enabled = new Set<string>();

  for (const cm of CORE_MODULES) {
    const stored = dbMap.get(cm.key);
    const isEnabled = stored ? stored.enabled : (cm.category === "core");
    if (isEnabled) enabled.add(cm.key);
  }

  // Filesystem modules
  for (const [k, v] of dbMap) {
    if (!CORE_MODULE_KEYS.includes(k) && v.enabled) enabled.add(k);
  }

  return enabled;
}

// ── GET /themes — List installed themes (with module awareness) ──
systemRoutes.get("/themes", async (c) => {
  const themes = await scanPackages("themes");
  const [settings] = await db.select().from(siteSettings).limit(1);
  const activeId = settings?.activeTheme || "gremius-default";
  const enabledKeys = await getEnabledModuleKeys();

  return c.json({
    docs: themes.map((t) => {
      const required = t.requires_modules || [];
      const optional = t.optional_modules || [];

      // Check which required modules are missing
      const missingRequired = required.filter((k) => !enabledKeys.has(k));
      const missingOptional = optional.filter((k) => !enabledKeys.has(k));

      return {
        ...t,
        isActive: t.id === activeId,
        // Module awareness fields
        requires_modules: required,
        optional_modules: optional,
        missing_required: missingRequired,
        missing_optional: missingOptional,
        modules_satisfied: missingRequired.length === 0,
      };
    }),
  });
});

// ── GET /realms — List installed realms with detailed grimoire info ──
systemRoutes.get("/realms", async (c) => {
  const realms = await scanPackages("realms");
  const [settings] = await db.select().from(siteSettings).limit(1);
  const allModules = await db.select().from(modules);
  const modulesMap = new Map(allModules.map(m => [m.key, m]));
  
  // Support both legacy activeTheme and new activeRealm
  const activeId = (settings as any)?.activeRealm || settings?.activeTheme || null;

  const result = await Promise.all(realms.map(async (r) => {
    const required = r.grimoires || [];
    const optional = r.optional_grimoires || [];
    
    // Get detailed info for each grimoire
    const grimoireDetails = [...required, ...optional].map(gId => {
      const mod = modulesMap.get(gId);
      return {
        key: gId,
        name: mod?.name || gId,
        installed: !!mod,
        enabled: mod?.enabled || false,
        isRealmLinked: mod?.realmId === r.id,
        category: mod?.category || "optional",
      };
    });
    
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      version: r.version,
      isActive: r.id === activeId,
      grimoires: {
        required,
        optional,
        details: grimoireDetails,
        installedCount: grimoireDetails.filter(g => g.installed).length,
        enabledCount: grimoireDetails.filter(g => g.enabled).length,
      },
      canDelete: r.id !== activeId, // Cannot delete active realm
    };
  }));

  return c.json(result);
});

// ── GET /realms/:id — Get detailed info about a specific realm ──
systemRoutes.get("/realms/:id", async (c) => {
  const realmId = c.req.param("id");
  const realms = await scanPackages("realms");
  const realm = realms.find(r => r.id === realmId);
  
  if (!realm) {
    return c.json({ error: `Realm '${realmId}' not found` }, 404);
  }
  
  const [settings] = await db.select().from(siteSettings).limit(1);
  const allModules = await db.select().from(modules);
  const modulesMap = new Map(allModules.map(m => [m.key, m]));
  
  const activeId = (settings as any)?.activeRealm || settings?.activeTheme || null;
  const isActive = realmId === activeId;
  
  const required = realm.grimoires || [];
  const optional = realm.optional_grimoires || [];
  
  const grimoireDetails = [...required, ...optional].map(gId => {
    const mod = modulesMap.get(gId);
    return {
      key: gId,
      name: mod?.name || gId,
      installed: !!mod,
      enabled: mod?.enabled || false,
      isRealmLinked: mod?.realmId === realmId,
      realmId: mod?.realmId || null,
      category: mod?.category || "optional",
      canDelete: !mod?.enabled, // Can only delete if not enabled
    };
  });
  
  return c.json({
    id: realm.id,
    name: realm.name,
    description: realm.description,
    version: realm.version,
    isActive,
    grimoires: {
      required,
      optional,
      details: grimoireDetails,
      installedCount: grimoireDetails.filter(g => g.installed).length,
      enabledCount: grimoireDetails.filter(g => g.enabled).length,
    },
    canDelete: !isActive,
    canDeactivate: isActive,
  });
});

// ── GET /themes/:id/check — Pre-activation check ──
systemRoutes.get("/themes/:id/check", protectRoute, async (c) => {
  const themeId = c.req.param("id");
  const themes = await scanPackages("themes");
  const theme = themes.find((t) => t.id === themeId);

  if (!theme) return c.json({ error: "Theme not found" }, 404);

  const enabledKeys = await getEnabledModuleKeys();
  const required = theme.requires_modules || [];
  const optional = theme.optional_modules || [];

  const missingRequired = required.filter((k) => !enabledKeys.has(k));
  const missingOptional = optional.filter((k) => !enabledKeys.has(k));

  // Resolve module names for display
  const allModules = CORE_MODULES;
  const resolveModule = (key: string) => {
    const cm = allModules.find((m) => m.key === key);
    return {
      key,
      name: cm?.name || key,
      icon: cm?.icon || "📦",
      description: cm?.description || "",
      category: cm?.category || "optional",
      enabled: enabledKeys.has(key),
    };
  };

  return c.json({
    theme: { id: theme.id, name: theme.name, theme_type: theme.theme_type },
    canActivate: true, // Always allow — missing modules just disable features
    requires: missingRequired.map(resolveModule),
    optional: missingOptional.map(resolveModule),
    allSatisfied: missingRequired.length === 0 && missingOptional.length === 0,
  });
});

// ── PATCH /active-theme — Activate theme (with auto realm grimoires activation) ──
systemRoutes.patch("/active-theme", protectRoute, async (c) => {
  const body = await c.req.json();
  const { themeId, enableModules } = body;

  if (!themeId) return c.json({ error: "themeId required" }, 400);

  // Validate theme exists
  const themes = await scanPackages("themes");
  const theme = themes.find((t) => t.id === themeId);
  if (!theme) return c.json({ error: "Theme not found" }, 404);

  // Get all grimoires from the realm (required + optional)
  const { required, optional } = await getRealmGrimoires(themeId);
  const allRealmGrimoires = [...required, ...optional];
  
  console.log(`[Realm Activation] Realm ${themeId} has ${required.length} required and ${optional.length} optional grimoires`);

  // Auto-install and auto-enable all realm grimoires
  const installedModules: string[] = [];
  const activatedModules: string[] = [];

  for (const grimoireId of allRealmGrimoires) {
    // Find grimoire info from scanner (filesystem grimoires)
    const grimoires = await scanPackages("grimoires");
    const grimoire = grimoires.find(g => g.id === grimoireId);
    
    // Also check hardcoded registry
    const registryDef = CORE_MODULES.find((m) => m.key === grimoireId);

    const [existing] = await db.select().from(modules).where(eq(modules.key, grimoireId)).limit(1);

    if (existing) {
      // Update realmId to link to this realm and ensure enabled
      if (!existing.enabled || existing.realmId !== themeId) {
        await db.update(modules).set({ 
          enabled: true,
          realmId: themeId,
        }).where(eq(modules.key, grimoireId));
        activatedModules.push(grimoireId);
      }
    } else {
      // Insert new module record linked to this realm
      await db.insert(modules).values({
        key: grimoireId,
        name: grimoire?.name || registryDef?.name || grimoireId,
        description: grimoire?.description || registryDef?.description,
        icon: grimoire?.icon || registryDef?.icon || "📦",
        category: "realm",
        enabled: true,
        realmId: themeId,
        settings: {},
        sidebarBadge: "Active by Realm",
      });
      installedModules.push(grimoireId);
      activatedModules.push(grimoireId);
    }

    // Run migrations if needed
    try {
      const { runModuleMigrations } = await import("../services/scanner");
      await runModuleMigrations(grimoireId);
    } catch (err) {
      console.error(`[Realm Activation] Migration error for grimoire ${grimoireId}:`, err);
    }
  }

  // Also handle any manually specified modules (backward compatibility)
  if (enableModules && Array.isArray(enableModules) && enableModules.length > 0) {
    for (const moduleKey of enableModules) {
      // Skip if already processed as realm grimoire
      if (allRealmGrimoires.includes(moduleKey)) continue;
      
      const registryDef = CORE_MODULES.find((m) => m.key === moduleKey);
      const [existing] = await db.select().from(modules).where(eq(modules.key, moduleKey)).limit(1);

      if (existing) {
        if (!existing.enabled) {
          await db.update(modules).set({ enabled: true }).where(eq(modules.key, moduleKey));
          activatedModules.push(moduleKey);
        }
      } else {
        await db.insert(modules).values({
          key: moduleKey,
          name: registryDef?.name || moduleKey,
          description: registryDef?.description,
          icon: registryDef?.icon,
          category: registryDef?.category || "optional",
          enabled: true,
          settings: {},
        });
        activatedModules.push(moduleKey);
      }

      try {
        const { runModuleMigrations } = await import("../services/scanner");
        await runModuleMigrations(moduleKey);
      } catch (err) {
        console.error(`[Theme Activation] Migration error for module ${moduleKey}:`, err);
      }
    }
  }

  // Activate the theme
  let [settings] = await db.select().from(siteSettings).limit(1);

  if (settings) {
    await db.update(siteSettings).set({ activeTheme: themeId }).where(eq(siteSettings.id, settings.id));
  } else {
    await db.insert(siteSettings).values({ activeTheme: themeId });
  }

  console.log(`[Realm Activation] Realm ${themeId} activated with ${installedModules.length} new grimoires installed and ${activatedModules.length} total activated`);

  return c.json({
    success: true,
    activeTheme: themeId,
    installedModules,
    activatedModules,
    realmGrimoires: allRealmGrimoires,
    message: installedModules.length > 0 
      ? `Realm activated. Installed ${installedModules.length} new grimoires and activated ${activatedModules.length} total.`
      : `Realm activated. ${activatedModules.length} grimoires active.`,
  });
});

// ── DELETE /active-theme — Deactivate current realm (disable all realm grimoires) ──
systemRoutes.delete("/active-theme", protectRoute, async (c) => {
  // Get current active realm
  let [settings] = await db.select().from(siteSettings).limit(1);
  const currentRealmId = settings?.activeTheme || null;

  if (!currentRealmId) {
    return c.json({
      success: true,
      message: "No realm currently active.",
      deactivatedModules: [],
    });
  }

  // Deactivate all grimoires linked to this realm
  const deactivatedModules: string[] = [];
  
  // Get all modules linked to this realm
  const realmModulesList = await db
    .select()
    .from(modules)
    .where(eq(modules.realmId, currentRealmId));

  for (const mod of realmModulesList) {
    if (mod.enabled) {
      await db
        .update(modules)
        .set({ enabled: false })
        .where(eq(modules.key, mod.key));
      deactivatedModules.push(mod.key);
    }
  }

  // Clear active theme/realm
  if (settings) {
    await db.update(siteSettings).set({ activeTheme: null }).where(eq(siteSettings.id, settings.id));
  }

  console.log(`[Realm Deactivation] Realm ${currentRealmId} deactivated. Disabled ${deactivatedModules.length} grimoires.`);

  return c.json({
    success: true,
    deactivatedRealm: currentRealmId,
    deactivatedModules,
    message: deactivatedModules.length > 0
      ? `Realm ${currentRealmId} deactivated. Disabled ${deactivatedModules.length} grimoires.`
      : `Realm ${currentRealmId} deactivated.`,
  });
});

// ── POST /realm-state — Activate or deactivate a realm with full control ──
systemRoutes.post("/realm-state", protectRoute, async (c) => {
  const body = await c.req.json();
  const { action, realmId, options = {} } = body;

  if (!action || !["activate", "deactivate"].includes(action)) {
    return c.json({ error: "action must be 'activate' or 'deactivate'" }, 400);
  }

  // Get current active realm
  let [settings] = await db.select().from(siteSettings).limit(1);
  const currentActiveRealm = settings?.activeTheme || null;

  if (action === "deactivate") {
    // If realmId specified, only deactivate if it matches current
    if (realmId && realmId !== currentActiveRealm) {
      return c.json({
        error: "Cannot deactivate",
        message: `Realm ${realmId} is not currently active. Active realm is: ${currentActiveRealm || "none"}.`,
      }, 400);
    }

    // Deactivate current realm
    const targetRealm = currentActiveRealm;
    if (!targetRealm) {
      return c.json({
        success: true,
        message: "No realm currently active.",
        deactivatedModules: [],
      });
    }

    const deactivatedModules: string[] = [];
    const keepEnabled = options.keepGrimoiresEnabled || false;

    if (!keepEnabled) {
      // Get all modules linked to this realm and disable them
      const realmModulesList = await db
        .select()
        .from(modules)
        .where(eq(modules.realmId, targetRealm));

      for (const mod of realmModulesList) {
        if (mod.enabled) {
          await db
            .update(modules)
            .set({ enabled: false })
            .where(eq(modules.key, mod.key));
          deactivatedModules.push(mod.key);
        }
      }
    }

    // Clear active theme/realm
    if (settings) {
      await db.update(siteSettings).set({ activeTheme: null }).where(eq(siteSettings.id, settings.id));
    }

    return c.json({
      success: true,
      action: "deactivate",
      deactivatedRealm: targetRealm,
      deactivatedModules,
      keptEnabled: keepEnabled,
      message: keepEnabled
        ? `Realm ${targetRealm} deactivated. Grimoires kept enabled.`
        : `Realm ${targetRealm} deactivated. Disabled ${deactivatedModules.length} grimoires.`,
    });
  }

  // action === "activate"
  if (!realmId) {
    return c.json({ error: "realmId is required for activation" }, 400);
  }

  // If there's an active realm, deactivate it first
  if (currentActiveRealm && currentActiveRealm !== realmId) {
    // Optionally disable its grimoires
    const disablePrevious = options.disablePreviousRealm !== false; // default true
    
    if (disablePrevious) {
      const previousModules = await db
        .select()
        .from(modules)
        .where(eq(modules.realmId, currentActiveRealm));

      for (const mod of previousModules) {
        if (mod.enabled) {
          await db
            .update(modules)
            .set({ enabled: false })
            .where(eq(modules.key, mod.key));
        }
      }
    }
  }

  // Validate realm exists
  const realms = await scanPackages("realms");
  const realm = realms.find((r) => r.id === realmId);
  if (!realm) return c.json({ error: "Realm not found" }, 404);

  // Get all grimoires from the realm
  const { required, optional } = await getRealmGrimoires(realmId);
  const allRealmGrimoires = [...required, ...optional];

  // Auto-install and auto-enable all realm grimoires
  const installedModules: string[] = [];
  const activatedModules: string[] = [];

  for (const grimoireId of allRealmGrimoires) {
    const grimoires = await scanPackages("grimoires");
    const grimoire = grimoires.find(g => g.id === grimoireId);
    const registryDef = CORE_MODULES.find((m) => m.key === grimoireId);

    const [existing] = await db.select().from(modules).where(eq(modules.key, grimoireId)).limit(1);

    if (existing) {
      if (!existing.enabled || existing.realmId !== realmId) {
        await db.update(modules).set({ 
          enabled: true,
          realmId: realmId,
        }).where(eq(modules.key, grimoireId));
        activatedModules.push(grimoireId);
      }
    } else {
      await db.insert(modules).values({
        key: grimoireId,
        name: grimoire?.name || registryDef?.name || grimoireId,
        description: grimoire?.description || registryDef?.description,
        icon: grimoire?.icon || registryDef?.icon || "📦",
        category: "realm",
        enabled: true,
        realmId: realmId,
        settings: {},
        sidebarBadge: "Active by Realm",
      });
      installedModules.push(grimoireId);
      activatedModules.push(grimoireId);
    }

    // Run migrations
    try {
      const { runModuleMigrations } = await import("../services/scanner");
      await runModuleMigrations(grimoireId);
    } catch (err) {
      console.error(`[Realm Activation] Migration error for grimoire ${grimoireId}:`, err);
    }
  }

  // Activate the realm
  if (settings) {
    await db.update(siteSettings).set({ activeTheme: realmId }).where(eq(siteSettings.id, settings.id));
  } else {
    await db.insert(siteSettings).values({ activeTheme: realmId });
  }

  return c.json({
    success: true,
    action: "activate",
    activeRealm: realmId,
    installedModules,
    activatedModules,
    realmGrimoires: allRealmGrimoires,
    previousRealm: currentActiveRealm,
    message: installedModules.length > 0 
      ? `Realm ${realmId} activated. Installed ${installedModules.length} new grimoires and activated ${activatedModules.length} total.`
      : `Realm ${realmId} activated. ${activatedModules.length} grimoires active.`,
  });
});

// ── DELETE /realms/:id — Delete/Uninstall a realm ──
systemRoutes.delete("/realms/:id", protectRoute, async (c) => {
  const realmId = c.req.param("id");
  const deleteGrimoires = c.req.query("deleteGrimoires") === "true";
  const force = c.req.query("force") === "true";
  
  // Check if realm exists
  const realms = await scanPackages("realms");
  const realm = realms.find(r => r.id === realmId);
  
  if (!realm) {
    return c.json({ error: `Realm '${realmId}' not found` }, 404);
  }
  
  // Get current active realm
  const [settings] = await db.select().from(siteSettings).limit(1);
  const isCurrentlyActive = settings?.activeTheme === realmId;
  
  // Get all grimoires linked to this realm
  const realmGrimoires = await db
    .select()
    .from(modules)
    .where(eq(modules.realmId, realmId));
  
  const enabledGrimoires = realmGrimoires.filter(g => g.enabled);
  
  // If realm is active or has enabled grimoires, require force
  if ((isCurrentlyActive || enabledGrimoires.length > 0) && !force) {
    return c.json({
      error: "Cannot delete realm",
      message: `Realm ${realmId} is currently active or has enabled grimoires. Deactivate it first or use ?force=true to force deletion.`,
      isActive: isCurrentlyActive,
      enabledGrimoires: enabledGrimoires.map(g => g.key),
      totalGrimoires: realmGrimoires.length,
    }, 409);
  }
  
  const result: any = {
    success: true,
    deletedRealm: realmId,
    realmName: realm.name,
    wasActive: isCurrentlyActive,
  };
  
  if (deleteGrimoires) {
    // Delete all grimoires linked to this realm
    const deletedGrimoires: string[] = [];
    
    for (const grimoire of realmGrimoires) {
      await db.delete(modules).where(eq(modules.key, grimoire.key));
      deletedGrimoires.push(grimoire.key);
    }
    
    result.deletedGrimoires = deletedGrimoires;
    result.grimoiresKept = [];
    result.message = `Realm ${realmId} deleted along with ${deletedGrimoires.length} grimoires.`;
  } else {
    // Keep grimoires but convert to standalone (remove realmId)
    const keptGrimoires: string[] = [];
    
    for (const grimoire of realmGrimoires) {
      await db
        .update(modules)
        .set({ 
          realmId: null,
          category: "optional",
          sidebarBadge: null,
        })
        .where(eq(modules.key, grimoire.key));
      keptGrimoires.push(grimoire.key);
    }
    
    result.deletedGrimoires = [];
    result.grimoiresKept = keptGrimoires;
    result.message = `Realm ${realmId} deleted. ${keptGrimoires.length} grimoires converted to standalone.`;
  }
  
  // If this realm was active, clear the active theme
  if (isCurrentlyActive && settings) {
    await db.update(siteSettings).set({ activeTheme: null }).where(eq(siteSettings.id, settings.id));
    result.clearedActiveTheme = true;
  }
  
  console.log(`[Realm Deletion] Realm ${realmId} deleted. deleteGrimoires=${deleteGrimoires}, grimoires affected: ${realmGrimoires.length}`);
  
  return c.json(result);
});

// ── GET /active-theme-config — Returns parsed theme JSON for the Theme Engine ──
systemRoutes.get("/active-theme-config", async (c) => {
  try {
    const [settings] = await db.select().from(siteSettings).limit(1);
    const activeId = settings?.activeTheme || "gremius-default";

    const themes = await scanPackages("themes");
    const theme = themes.find((t) => t.id === activeId);

    if (!theme) {
      return c.json({ theme: null, branding: settings?.branding || null });
    }

    // Try to read a theme.json with color/logo overrides
    let themeConfig: Record<string, any> = {
      id: theme.id,
      name: theme.name,
    };

    // Parse variables.css to extract color definitions
    const cssPath = join(process.cwd(), "../../packages/realms", activeId, theme.css_entry || "variables.css");
    try {
      const cssFile = Bun.file(cssPath);
      if (await cssFile.exists()) {
        const cssContent = await cssFile.text();
        const colors: Record<string, string> = {};
        // Extract --gremius-* variables from CSS
        const varRegex = /--gremius-([\w-]+)\s*:\s*([^;]+)/g;
        let match;
        while ((match = varRegex.exec(cssContent)) !== null) {
          const key = match[1].trim();
          const value = match[2].trim();
          // Map CSS var names back to theme config keys
          const keyMap: Record<string, string> = {
            'bg': 'background', 'card': 'card', 'border': 'border',
            'text': 'text', 'text-dim': 'textDim', 'cyan': 'primary',
            'pink': 'secondary', 'purple': 'accent', 'green': 'success',
            'amber': 'warning', 'surface': 'surface',
          };
          if (keyMap[key]) colors[keyMap[key]] = value;
        }
        if (Object.keys(colors).length > 0) themeConfig.colors = colors;

        // Extract font variables
        const fonts: Record<string, string> = {};
        const fontRegex = /--font-(display|body|mono)\s*:\s*([^;]+)/g;
        while ((match = fontRegex.exec(cssContent)) !== null) {
          fonts[match[1].trim()] = match[2].trim();
        }
        if (Object.keys(fonts).length > 0) themeConfig.fonts = fonts;
      }
    } catch (e) {
      // CSS parsing non-fatal
    }

    // Also try to read a dedicated theme.json if it exists
    const themeJsonPath = join(process.cwd(), "../../packages/realms", activeId, "theme.json");
    try {
      const jsonFile = Bun.file(themeJsonPath);
      if (await jsonFile.exists()) {
        const overrides = await jsonFile.json();
        if (overrides.colors) themeConfig.colors = { ...(themeConfig.colors || {}), ...overrides.colors };
        if (overrides.logos) themeConfig.logos = overrides.logos;
        if (overrides.fonts) themeConfig.fonts = { ...(themeConfig.fonts || {}), ...overrides.fonts };
      }
    } catch (e) {
      // theme.json is optional
    }

    return c.json({
      theme: themeConfig,
      branding: settings?.branding || null,
    });
  } catch (err: any) {
    return c.json({ theme: null, branding: null, error: err.message }, 500);
  }
});

// ── GET /theme-css/:themeId — Serve theme CSS variables ──
systemRoutes.get("/theme-css/:themeId", async (c) => {
  const themeId = c.req.param("themeId");

  if (themeId.includes("..") || themeId.includes("/") || themeId.includes("\\")) {
    return c.text("/* Invalid theme ID */", 400);
  }

  const themes = await scanPackages("themes");
  const theme = themes.find((t) => t.id === themeId);

  if (!theme) return c.text("/* Theme not found */", 404);

  const cssFile = theme.css_entry || "variables.css";
  const cssPath = join(process.cwd(), "../../packages/realms", themeId, cssFile);

  try {
    const file = Bun.file(cssPath);
    if (await file.exists()) {
      return new Response(file, {
        headers: { "Content-Type": "text/css" },
      });
    }
  } catch (e) {
    console.error("Theme CSS error:", e);
  }

  return c.text(`/* CSS not found for ${themeId} */`, 404);
});
