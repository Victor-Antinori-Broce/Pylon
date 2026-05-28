/**
 * Gremio CMS — Employee Directory (DI Version)
 * 
 * REST API for employee profiles, departments, positions,
 * and organizational hierarchy.
 * 
 * MIGRATED: Now uses Dependency Injection via GrimoireContext
 */

import { defineGrimoire } from "@gremius/shared";
import { Hono } from "hono";
import type { GrimoireContext } from "@gremius/shared";
import { createDirectoryRouter } from "./directory.routes";
import * as schema from "./directory.schema";

export * from "./directory.schema";
export { createDirectoryRouter };

function createDirectoryGrimoireRouter(ctx: GrimoireContext): Hono {
  return createDirectoryRouter(ctx);
}

export const grimoire = defineGrimoire({
  id: "grimoire-directory",
  name: "Employee Directory",
  version: "1.0.0",
  description: "Employee profiles, departments, positions, and organizational hierarchy",
  icon: "Contact",
  createRouter: createDirectoryGrimoireRouter,
  tables: [
    "directory_organizations",
    "directory_departments",
    "directory_positions",
    "directory_employees",
    "directory_employee_documents",
    "directory_org_chart_cache",
  ],
  dependencies: {
    grimoires: ["grimoire-media"],
    core: ["auth"],
  },
  mountPath: "/api/directory",
  hooks: {
    onEnable: async (ctx) => { ctx.logger.info("✅ Directory grimoire enabled"); },
    onDisable: async (ctx) => { ctx.logger.info("⛔ Directory grimoire disabled"); },
  },
  admin: {
    category: "enterprise",
    views: [
      { id: "grid-employees", type: "grid", title: "Employees", table: "directory_employees" },
      { id: "grid-departments", type: "grid", title: "Departments", table: "directory_departments" },
      { id: "grid-positions", type: "grid", title: "Positions", table: "directory_positions" },
      { id: "grid-organizations", type: "grid", title: "Organizations", table: "directory_organizations" },
    ],
  },
});

export { schema };
export default grimoire;
