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
import { eq } from "drizzle-orm";
import { db } from "../db";
import { dataSets } from "../db/schema";
import { 
  checkReadAccess as rlsCheckRead, 
  checkWriteAccess as rlsCheckWrite,
  type PolicyJson,
  type RLSUser 
} from "../lib/rls-builder";

// Re-exportar tipos para compatibilidad
export type { PolicyJson, RLSUser } from "../lib/rls-builder";

/**
 * Check read permission for a dataset.
 *  - NULL policy → admin-only
 *  - 'public' → anyone
 *  - 'authenticated' → logged-in users
 *  - 'admin' → admins only
 * 
 * FASE DE RESCATE: Ahora delega a rls-builder para consistencia.
 */
export async function checkDatasetReadAccess(c: Context, datasetId: string): Promise<boolean> {
    const user = c.get("user") as RLSUser;

    const [dataset] = await db
        .select({ policyJson: dataSets.policyJson })
        .from(dataSets)
        .where(eq(dataSets.id, datasetId))
        .limit(1);

    if (!dataset) return false;

    const policy = dataset.policyJson as PolicyJson | null;
    return rlsCheckRead(policy, user);
}

/**
 * Check write permission for a dataset.
 *  - NULL policy → admin-only
 *  - 'authenticated' → logged-in users
 *  - 'admin' → admins only
 * 
 * FASE DE RESCATE: Ahora delega a rls-builder para consistencia.
 */
export async function checkDatasetWriteAccess(c: Context, datasetId: string): Promise<boolean> {
    const user = c.get("user") as RLSUser;

    const [dataset] = await db
        .select({ policyJson: dataSets.policyJson })
        .from(dataSets)
        .where(eq(dataSets.id, datasetId))
        .limit(1);

    if (!dataset) return false;

    const policy = dataset.policyJson as PolicyJson | null;
    return rlsCheckWrite(policy, user);
}

/**
 * Determine entry status based on workflow config.
 * - No workflowJson → 'published' (instant)
 * - requireApproval → 'draft' (needs review)
 */
export function resolveEntryStatus(workflowJson: any): "published" | "draft" {
    if (!workflowJson || !workflowJson.requireApproval) {
        return "published";
    }
    return "draft";
}


