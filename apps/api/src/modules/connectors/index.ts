/**
 * Data Connectors — Module Barrel
 *
 * Exports the Hono router for auto-discovery by the module-loader.
 */

import { Hono } from "hono";
import { connectorsRoutes } from "./connectors.routes";

const app = new Hono();
app.route("/connectors", connectorsRoutes);

export const connectorsModuleRoutes = app;
