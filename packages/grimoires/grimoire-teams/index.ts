/**
 * Gremio CMS — Teams Module
 */

import { Hono } from "hono";
import { teamsRoutes } from "./teams.routes";

export * from "./teams.schema";

const app = new Hono();
app.route("/", teamsRoutes);

export const teamsModuleRoutes = app;
