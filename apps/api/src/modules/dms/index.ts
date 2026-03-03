/**
 * DMS — Public API (Barrel Export)
 *
 * ─────────────────────────────────────────────────────────────
 * HOW TO MOUNT:
 *
 *   import { dmsRoutes } from "./modules/dms";
 *   app.route("/api/custom", dmsRoutes);
 *
 * Exposed endpoints:
 *   POST  /api/custom/docs/:id/new-version — Scenario 2 (versioning Black Box)
 *   GET   /api/custom/docs/:id/download    — Scenario 1 (department ACL)
 *   POST  /api/custom/docs/:id/approve     — Scenario 3,4,5 (approval + BullMQ)
 *
 * User context required (inject via middleware into c.var.user):
 *   { userId: string, role: "employee"|"manager"|"admin", department: string }
 * ─────────────────────────────────────────────────────────────
 */

export { dmsRoutes } from "./dms.controller";
export { dmsService, NotFoundError, ForbiddenError, ConflictError } from "./dms.service";
export { closeDmsQueue } from "./dms.queue";
export type { UserContext, NewVersionInput, Document, DocumentVersion } from "./dms.schema";
