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
import { scanPackages } from "../services/scanner";
import { CORE_MODULES, CORE_MODULE_KEYS } from "../services/module-registry";
import { protectRoute } from "../middleware/auth-guard";

export const systemRoutes = new Hono();

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

// ── GET /realms — List installed realms (modern format) ──
systemRoutes.get("/realms", async (c) => {
  const realms = await scanPackages("themes");
  const [settings] = await db.select().from(siteSettings).limit(1);
  // Support both legacy activeTheme and new activeRealm
  const activeId = (settings as any)?.activeRealm || settings?.activeTheme || "realm-default";

  const result = realms.map((r) => {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      version: r.version,
      // Grimoires array is expected by the frontend
      grimoires: r.grimoires || r.requires_modules || [],
      isActive: r.id === activeId,
    };
  });

  return c.json(result);
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

// ── PATCH /active-theme — Activate theme (with optional module enablement) ──
systemRoutes.patch("/active-theme", protectRoute, async (c) => {
  const body = await c.req.json();
  const { themeId, enableModules } = body;

  if (!themeId) return c.json({ error: "themeId required" }, 400);

  // Validate theme exists
  const themes = await scanPackages("themes");
  const theme = themes.find((t) => t.id === themeId);
  if (!theme) return c.json({ error: "Theme not found" }, 404);

  // If user chose to enable required modules, do it now
  const activatedModules: string[] = [];
  if (enableModules && Array.isArray(enableModules) && enableModules.length > 0) {
    for (const moduleKey of enableModules) {
      // Only enable known modules
      const registryDef = CORE_MODULES.find((m) => m.key === moduleKey);

      const [existing] = await db.select().from(modules).where(eq(modules.key, moduleKey)).limit(1);

      if (existing) {
        if (!existing.enabled) {
          await db.update(modules).set({ enabled: true }).where(eq(modules.key, moduleKey));
          activatedModules.push(moduleKey);
        }
      } else {
        // Insert new module record
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

      // Run migrations if needed
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

  return c.json({
    success: true,
    activeTheme: themeId,
    activatedModules,
    message: activatedModules.length > 0
      ? `Theme activated. Also enabled modules: ${activatedModules.join(", ")}`
      : "Theme activated.",
  });
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
