/**
 * Dataset Permission Middleware
 *
 * Smart permission checker: defaults to "Admin-only" when no policyJson exists.
 * Enterprise features (RLS, custom access) are strictly opt-in.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FASE DE RESCATE: Este módulo ahora delega la lógica de RLS a rls-builder.ts
 * para optimizar consultas y evitar filtrado en memoria.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { dataSets } from "../db/schema";
import { checkReadAccess as rlsCheckRead, checkWriteAccess as rlsCheckWrite } from "../lib/rls-builder";
/**
 * Check read permission for a dataset.
 *  - NULL policy → admin-only
 *  - 'public' → anyone
 *  - 'authenticated' → logged-in users
 *  - 'admin' → admins only
 *
 * FASE DE RESCATE: Ahora delega a rls-builder para consistencia.
 */
export async function checkDatasetReadAccess(c, datasetId) {
    const user = c.get("user");
    const [dataset] = await db
        .select({ policyJson: dataSets.policyJson })
        .from(dataSets)
        .where(eq(dataSets.id, datasetId))
        .limit(1);
    if (!dataset)
        return false;
    const policy = dataset.policyJson;
    return rlsCheckRead(policy, user ?? null);
}
/**
 * Check write permission for a dataset.
 *  - NULL policy → admin-only
 *  - 'authenticated' → logged-in users
 *  - 'admin' → admins only
 *
 * FASE DE RESCATE: Ahora delega a rls-builder para consistencia.
 */
export async function checkDatasetWriteAccess(c, datasetId) {
    const user = c.get("user");
    const [dataset] = await db
        .select({ policyJson: dataSets.policyJson })
        .from(dataSets)
        .where(eq(dataSets.id, datasetId))
        .limit(1);
    if (!dataset)
        return false;
    const policy = dataset.policyJson;
    return rlsCheckWrite(policy, user ?? null);
}
/**
 * Determine entry status based on workflow config.
 * - No workflowJson → 'published' (instant)
 * - requireApproval → 'draft' (needs review)
 */
export function resolveEntryStatus(workflowJson) {
    if (!workflowJson || !workflowJson.requireApproval) {
        return "published";
    }
    return "draft";
}
//# sourceMappingURL=permissions.js.map