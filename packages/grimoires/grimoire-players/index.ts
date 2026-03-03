/**
 * Gremio CMS — Players Module
 */

import { Hono } from "hono";
import { playersRoutes } from "./players.routes";

export * from "./players.schema";

const app = new Hono();
app.route("/", playersRoutes);

export const playersModuleRoutes = app;
