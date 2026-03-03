/**
 * DMS — Service
 *
 * Business logic implementing every Gherkin scenario in dms_features.feature:
 *
 *   ✔ Scenario 1: Access denied (403) if user.department !== document.targetDepartment
 *   ✔ Scenario 2: New version creates v1.2, marks v1.1 as superseded (Black Box)
 *   ✔ Scenario 3: Approve DRAFT → APPROVED + enqueue BullMQ event
 *   ✔ Scenario 4: Approving a non-DRAFT document → 409 Conflict
 *   ✔ Scenario 5: Non-manager role trying to approve → 403 Forbidden (enforced in controller)
 */

import { eq, and } from "drizzle-orm";
import { db } from "../../db";
import { documents, documentVersions } from "./dms.schema";
import type { UserContext, NewVersionInput } from "./dms.schema";
import { enqueueManualPublished } from "./dms.queue";

// ── Custom Errors ─────────────────────────────────────────────

export class NotFoundError extends Error {
    constructor(msg: string) { super(msg); this.name = "NotFoundError"; }
}
export class ForbiddenError extends Error {
    constructor(msg: string) { super(msg); this.name = "ForbiddenError"; }
}
export class ConflictError extends Error {
    constructor(msg: string) { super(msg); this.name = "ConflictError"; }
}

// ── Helpers ───────────────────────────────────────────────────

async function getDocumentOrThrow(docId: string) {
    const [doc] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, docId))
        .limit(1);
    if (!doc) throw new NotFoundError(`Document '${docId}' not found.`);
    return doc;
}

// ── Service ───────────────────────────────────────────────────

export const dmsService = {

    /**
     * Scenario 1 — Downloads the active version's file URL, enforcing department access.
     *
     * Gherkin: "Un empleado intenta descargar un manual de un departamento al que no pertenece"
     * Outcome: 403 if user.department !== document.targetDepartment
     */
    async getDownloadUrl(docId: string, user: UserContext): Promise<string> {
        const doc = await getDocumentOrThrow(docId);

        // ── Access control check (Scenario 1 & admin bypass) ─────
        const canAccess =
            user.role === "admin" || user.department === doc.targetDepartment;

        if (!canAccess) {
            throw new ForbiddenError(
                `Access denied: document '${docId}' is restricted to department '${doc.targetDepartment}'.`
            );
        }

        // Fetch active version
        const [activeVersion] = await db
            .select({ fileUrl: documentVersions.fileUrl })
            .from(documentVersions)
            .where(
                and(
                    eq(documentVersions.documentId, docId),
                    eq(documentVersions.isActive, true)
                )
            )
            .limit(1);

        if (!activeVersion) {
            throw new NotFoundError(`No active version found for document '${docId}'.`);
        }

        return activeVersion.fileUrl;
    },

    /**
     * Scenario 2 — Uploads a new document version (Black Box versioning).
     *
     * Gherkin: "Se sube una nueva actualización de un documento existente"
     * Outcome:
     *   - Previous active version → is_active = false, status = 'superseded' (NOT deleted)
     *   - New version inserted with is_active = true
     */
    async newVersion(docId: string, input: NewVersionInput, user: UserContext) {
        // Verify document exists
        await getDocumentOrThrow(docId);

        // ── STEP 1: Deactivate current active version (Black Box) ─
        await db
            .update(documentVersions)
            .set({ isActive: false, versionStatus: "superseded" })
            .where(
                and(
                    eq(documentVersions.documentId, docId),
                    eq(documentVersions.isActive, true)
                )
            );

        // ── STEP 2: Insert new version as active ──────────────────
        const [created] = await db
            .insert(documentVersions)
            .values({
                documentId: docId,
                versionNumber: input.version_number,
                fileUrl: input.file_url,
                isActive: true,
                versionStatus: "active",
            })
            .returning();

        return created;
    },

    /**
     * Scenario 3 & 4 — Approves a DRAFT document, emits BullMQ event.
     *
     * Gherkin: "Se aprueba un documento en estado DRAFT"
     * Outcome: status → APPROVED, job enqueued to email-notifications
     *
     * Gherkin: "Intentar aprobar un documento que ya está APPROVED"
     * Outcome: 409 Conflict, no job emitted
     */
    async approveDocument(docId: string, user: UserContext) {
        const doc = await getDocumentOrThrow(docId);

        // ── Scenario 4 guard: only DRAFT can be approved ──────────
        if (doc.status !== "DRAFT") {
            throw new ConflictError(
                `Document '${docId}' cannot be approved because its current status is '${doc.status}'.`
            );
        }

        // ── Update status ─────────────────────────────────────────
        const [updated] = await db
            .update(documents)
            .set({ status: "APPROVED", updatedAt: new Date() })
            .where(eq(documents.id, docId))
            .returning();

        // ── Enqueue notification (fire-and-forget) ────────────────
        enqueueManualPublished({
            documentId: updated.id,
            title: updated.title,
            targetDepartment: updated.targetDepartment,
        }).catch((err) => {
            // Queue failure MUST NOT roll back the approval — the DB is source of truth.
            console.error("[DmsService] Failed to enqueue NEW_MANUAL_PUBLISHED:", err);
        });

        return updated;
    },
};
