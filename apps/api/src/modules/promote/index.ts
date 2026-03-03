/**
 * Promote to Content — Module Barrel
 *
 * Exports the Hono router for auto-discovery by the module-loader.
 */

import { Hono } from "hono";
import { promoteRoutes } from "./promote.routes";

const app = new Hono();
app.route("/", promoteRoutes);

export const promoteModuleRoutes = app;
