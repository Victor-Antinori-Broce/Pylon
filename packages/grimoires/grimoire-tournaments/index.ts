/**
 * Gremio CMS — Tournaments Module
 */

import { Hono } from "hono";
import { tournamentsRoutes } from "./tournaments.routes";

export * from "./tournaments.schema";

const app = new Hono();
app.route("/", tournamentsRoutes);

export const tournamentsModuleRoutes = app;
