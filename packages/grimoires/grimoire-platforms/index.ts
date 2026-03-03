/**
 * Gremio CMS — Platforms Module
 * 
 * Gaming platforms catalog (PC, PlayStation, Xbox, Nintendo, etc.)
 */

import { Hono } from "hono";
import { platformsRoutes } from "./platforms.routes";

// Platform schema is defined in games.schema.ts (shared)

const app = new Hono();
app.route("/", platformsRoutes);

export const platformsModuleRoutes = app;
