/**
 * Gremio CMS — Games Module
 * 
 * Game library with IGDB integration, collections, screenshots, and trailers.
 * This is a theme-bundled module that only loads when Gremio CMS is active.
 */

import { Hono } from "hono";
import { gamesRoutes } from "./games.routes";

// Re-export schema for schema-merger
export * from "./games.schema";

// Create the module's Hono app
const app = new Hono();
app.route("/", gamesRoutes);

export const gamesModuleRoutes = app;
