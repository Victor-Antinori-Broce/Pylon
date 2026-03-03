/**
 * Gremio CMS — Streamers Module
 * 
 * Track live streamers across Twitch, YouTube, and Kick.
 * Real-time status sync with viewer counts and game associations.
 */

import { Hono } from "hono";
import { streamersRoutes } from "./streamers.routes";

// Re-export schema for schema-merger
export * from "./streamers.schema";

// Create the module's Hono app
const app = new Hono();
app.route("/", streamersRoutes);

export const streamersModuleRoutes = app;
