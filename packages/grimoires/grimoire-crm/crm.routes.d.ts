/**
 * Gremius CRM - API Routes (Hono)
 *
 * Complete CRM API with:
 * - Companies CRUD
 * - Contacts CRUD
 * - Pipelines & Stages CRUD
 * - Deals CRUD + Kanban operations
 * - Activities CRUD
 */
import { Hono } from "hono";
import type { GrimoireContext } from "@gremius/shared";
/**
 * Factory function that creates CRM routes with dependency injection
 */
export declare function createCRMRouter(ctx: GrimoireContext): Hono;
//# sourceMappingURL=crm.routes.d.ts.map