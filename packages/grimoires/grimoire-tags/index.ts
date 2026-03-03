/**
 * Gremio CMS — Tags Module
 * 
 * Content tagging system with categories (genre, feature, topic, series)
 */

import { Hono } from "hono";
import { tagsRoutes } from "./tags.routes";

// Tags schema is defined in games.schema.ts (shared)

const app = new Hono();
app.route("/", tagsRoutes);

export const tagsModuleRoutes = app;
