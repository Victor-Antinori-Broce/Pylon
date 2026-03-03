/**
 * Employee Directory — Public API (Barrel Export)
 *
 * ─────────────────────────────────────────────────────────────
 * HOW TO MOUNT:
 *
 *   import { directoryRoutes } from "./modules/directory";
 *   app.route("/api/custom", directoryRoutes);
 *
 * Exposed endpoints:
 *   GET    /api/custom/directorio                — list employees
 *   GET    /api/custom/directorio/:user_id       — full profile (JOIN)
 *   POST   /api/custom/directorio                — create employee profile
 *   PATCH  /api/custom/directorio/:user_id       — update profile
 *   POST   /api/custom/directorio/ban            — ban + revoke sessions
 *   POST   /api/custom/directorio/unban          — restore access
 * ─────────────────────────────────────────────────────────────
 */

export { directoryRoutes } from "./directory.controller";
export { directoryService, NotFoundError, AlreadyBannedError } from "./directory.service";
export type { CreateProfileInput, UpdateProfileInput, BanUserInput } from "./directory.schema";
export type { EmployeeProfile, NewEmployeeProfile } from "./directory.schema";
