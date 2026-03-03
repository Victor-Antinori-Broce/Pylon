/**
 * GremiusCMS — Theme Config Endpoint
 *
 * Returns the active theme's JSON configuration for the Admin Theming Engine.
 * Mount this in system routes: systemRoutes.route("/theme-config", themeConfigRoute)
 * 
 * Or add this handler directly to system.ts:
 *
 *   systemRoutes.get("/theme-config", async (c) => { ... });
 *
 * The endpoint reads theme.json from packages/realms/{activeRealm}/theme.json
 * and falls back to siteSettings branding data.
 */

import { Hono } from "hono";
import { join } from "node:path";
import { db } from "../db";
import { siteSettings } from "../db/schema";

export const themeConfigRoute = new Hono();

themeConfigRoute.get("/", async (c) => {
  const [settings] = await db.select().from(siteSettings).limit(1);
  const activeId = settings?.activeTheme || "gremius-default";

  // Try to load theme.json from the theme package
  // Try new realms path first
  let configPath = join(process.cwd(), "../../packages/realms", activeId, "theme.json");
  
  // Fallback to legacy themes path
  const legacyPath = join(process.cwd(), "../../packages/themes", activeId, "theme.json");

  try {
    const file = Bun.file(configPath);
    if (await file.exists()) {
      const config = await file.json();
      return c.json(config);
    }
  } catch (e) {
    console.warn(`[ThemeConfig] Failed to read theme.json for ${activeId}:`, e);
  }

  // Fallback: build config from siteSettings branding
  const branding = (settings?.branding as any) || {};
  return c.json({
    colors: {
      primary: branding.primaryColor || "#00e5ff",
      secondary: branding.accentColor || "#ff2a6d",
    },
    branding: {
      siteName: settings?.siteName || "GremiusCMS",
    },
  });
});
