/**
 * Gremio CMS — Matches Module
 */

import { Hono } from "hono";
import { matchesRoutes } from "./matches.routes";

export * from "./matches.schema";

const app = new Hono();
app.route("/", matchesRoutes);

export const matchesModuleRoutes = app;
