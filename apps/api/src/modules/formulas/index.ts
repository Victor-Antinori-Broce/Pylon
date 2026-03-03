/**
 * Formulas KPI — Public API (Barrel Export)
 *
 * ─────────────────────────────────────────────────────────────
 * HOW TO MOUNT:
 *
 *   import { formulasRoutes } from "./modules/formulas";
 *   app.route("/api/custom", formulasRoutes);
 *
 * Exposed endpoints:
 *   GET    /api/custom/formulas        — list all formulas
 *   GET    /api/custom/formulas/:id    — get one formula
 *   POST   /api/custom/formulas        — create formula
 *   PATCH  /api/custom/formulas/:id    — update formula
 *   DELETE /api/custom/formulas/:id    — delete formula
 * ─────────────────────────────────────────────────────────────
 */

export { formulasRoutes } from "./formulas.controller";
export { formulasService } from "./formulas.service";
export type { FormulaInput, FormulaUpdateInput, FormulaDoc } from "./formulas.schema";
