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
import type { Context } from "hono";
export type { PolicyJson, RLSUser } from "../lib/rls-builder";
/**
 * Interface for workflow configuration
 */
interface WorkflowJson {
    requireApproval?: boolean;
    [key: string]: unknown;
}
/**
 * Check read permission for a dataset.
 *  - NULL policy → admin-only
 *  - 'public' → anyone
 *  - 'authenticated' → logged-in users
 *  - 'admin' → admins only
 *
 * FASE DE RESCATE: Ahora delega a rls-builder para consistencia.
 */
export declare function checkDatasetReadAccess(c: Context, datasetId: string): Promise<boolean>;
/**
 * Check write permission for a dataset.
 *  - NULL policy → admin-only
 *  - 'authenticated' → logged-in users
 *  - 'admin' → admins only
 *
 * FASE DE RESCATE: Ahora delega a rls-builder para consistencia.
 */
export declare function checkDatasetWriteAccess(c: Context, datasetId: string): Promise<boolean>;
/**
 * Determine entry status based on workflow config.
 * - No workflowJson → 'published' (instant)
 * - requireApproval → 'draft' (needs review)
 */
export declare function resolveEntryStatus(workflowJson: WorkflowJson | null | undefined): "published" | "draft";
//# sourceMappingURL=permissions.d.ts.map