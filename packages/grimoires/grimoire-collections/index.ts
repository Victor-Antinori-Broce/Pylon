/**
 * Gremio CMS — Collections Module
 * 
 * Curated game collections (featured, best of, editor's choice, etc.)
 */

import { Hono } from "hono";
import { collectionsRoutes } from "./collections.routes";

// Collections schema is defined in games.schema.ts (shared)

const app = new Hono();
app.route("/", collectionsRoutes);

export const collectionsModuleRoutes = app;
