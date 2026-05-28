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
export declare const themeConfigRoute: Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
//# sourceMappingURL=theme-config.d.ts.map