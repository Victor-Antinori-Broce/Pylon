/**
 * @gremius/grimoire-crm — CRM & Pipeline Management (Grimoire)
 *
 * Complete CRM system with:
 * - Companies (accounts)
 * - Contacts (people)
 * - Pipelines & Stages
 * - Deals with Kanban view
 * - Activities (calls, emails, meetings, tasks)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is a Business Grimoire (Layer 3) that receives all dependencies via
 * injected context. It does NOT import from apps/api/src.
 *
 *   ┌─────────────────────────────────────────┐
 *   │  Grimoire Loader (apps/api/src)         │
 *   │  ├─ Creates GrimoireContext             │
 *   │  ├─ Calls createRouter(ctx)             │
 *   │  └─ Mounts at /api/crm                  │
 *   └─────────────────────────────────────────┘
 *                   │
 *                   ▼ injects
 *   ┌─────────────────────────────────────────┐
 *   │  grimoire-crm (this package)            │
 *   │  ├─ Routes (crm.routes.ts)              │
 *   │  ├─ Schema (crm.schema.ts)              │
 *   │  └─ Uses ctx.db, ctx.auth, ctx.logger   │
 *   └─────────────────────────────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */
import type { GrimoireDefinition } from "@gremius/shared";
import { createCRMRouter } from "./crm.routes";
export * from "./crm.schema";
export { createCRMRouter } from "./crm.routes";
/**
 * Definición completa del grimoire para registro automático
 * Compatible con el sistema de module-loader v3
 */
export declare const grimoire: GrimoireDefinition;
export default grimoire;
export declare const crmRoutes: typeof createCRMRouter;
//# sourceMappingURL=index.d.ts.map