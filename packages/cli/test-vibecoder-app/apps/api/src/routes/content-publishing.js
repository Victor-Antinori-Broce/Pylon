/**
 * Content Publishing API Routes
 *
 * Endpoints públicos para el sistema de promoción de contenido.
 * Estos endpoints son parte del Core (Nivel 2) y siempre están disponibles.
 */
import { Hono } from "hono";
/**
 * Factory que crea el router de Content Publishing
 * Nota: Este router usa el GrimoireContext inyectado
 */
export function createContentPublishingRouter(ctx) {
    const router = new Hono();
    const { auth, logger } = ctx;
    const contentPublishing = ctx.contentPublishing;
    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC ROUTES (lectura)
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * GET /api/content/targets
     * Listar todos los Content Targets disponibles
     */
    router.get("/targets", async (c) => {
        try {
            const targets = contentPublishing.getAvailableTargets();
            return c.json({
                targets,
                count: targets.length,
            });
        }
        catch (err) {
            logger.error("Failed to list content targets", { error: err.message });
            return c.json({ error: "Failed to fetch content targets" }, 500);
        }
    });
    /**
     * GET /api/content/targets/:id
     * Obtener detalles de un Content Target específico
     */
    router.get("/targets/:id", async (c) => {
        try {
            const targetId = c.req.param("id");
            const targets = contentPublishing.getAvailableTargets();
            const target = targets.find((t) => t.id === targetId);
            if (!target) {
                return c.json({
                    error: "Content target not found",
                    available: targets.map((t) => t.id),
                }, 404);
            }
            return c.json({ target });
        }
        catch (err) {
            logger.error("Failed to get content target", { error: err.message });
            return c.json({ error: "Failed to fetch content target" }, 500);
        }
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // PROTECTED ROUTES (escritura)
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * POST /api/content/promote
     * Promover una entrada de dataset o grimoire a contenido publicable
     *
     * Body:
     * {
     *   targetId: string;      // 'blog', 'docs', etc.
     *   source: {
     *     type: 'dataset' | 'grimoire';
     *     grimoireId?: string;
     *     table?: string;
     *     recordId: string;
     *   },
     *   options: {
     *     title?: string;
     *     slug?: string;
     *     autoPublish?: boolean;
     *     scheduledAt?: string; // ISO date
     *   }
     * }
     */
    router.post("/promote", auth.requireAuth, async (c) => {
        try {
            const body = await c.req.json();
            const currentUser = c.get("user");
            // Validación
            if (!body.targetId) {
                return c.json({ error: "targetId is required" }, 400);
            }
            if (!body.source?.type || !body.source?.recordId) {
                return c.json({ error: "source.type and source.recordId are required" }, 400);
            }
            if (!["dataset", "grimoire"].includes(body.source.type)) {
                return c.json({ error: "source.type must be 'dataset' or 'grimoire'" }, 400);
            }
            // Verificar que el target existe
            if (!contentPublishing.hasTarget(body.targetId)) {
                const available = contentPublishing
                    .getAvailableTargets()
                    .map((t) => t.id);
                return c.json({
                    error: `Content target '${body.targetId}' is not available`,
                    available,
                }, 400);
            }
            // Obtener datos de la fuente
            const sourceData = await fetchSourceData(ctx, body.source);
            if (!sourceData) {
                return c.json({ error: "Source record not found" }, 404);
            }
            // Promover
            const result = await contentPublishing.promote(body.targetId, {
                source: {
                    ...body.source,
                    data: sourceData,
                },
                options: {
                    ...body.options,
                    authorId: body.options?.authorId || currentUser?.id,
                    scheduledAt: body.options?.scheduledAt
                        ? new Date(body.options.scheduledAt)
                        : undefined,
                },
            });
            logger.info("Content promoted via API", {
                targetId: body.targetId,
                contentId: result.contentId,
                userId: currentUser?.id,
            });
            return c.json({
                success: true,
                data: result,
            }, 201);
        }
        catch (err) {
            logger.error("Failed to promote content", { error: err.message });
            if (err.code === "TARGET_NOT_FOUND" || err.code === "VALIDATION_ERROR") {
                return c.json({ error: err.message }, 400);
            }
            return c.json({ error: "Failed to promote content" }, 500);
        }
    });
    /**
     * POST /api/content/unpublish
     * Despublicar contenido
     */
    router.post("/unpublish", auth.requireAuth, async (c) => {
        try {
            const { targetId, contentId } = await c.req.json();
            if (!targetId || !contentId) {
                return c.json({ error: "targetId and contentId are required" }, 400);
            }
            await contentPublishing.unpublish(targetId, contentId);
            logger.info("Content unpublished", { targetId, contentId });
            return c.json({
                success: true,
                message: "Content unpublished successfully",
            });
        }
        catch (err) {
            logger.error("Failed to unpublish content", { error: err.message });
            if (err.code === "TARGET_NOT_FOUND") {
                return c.json({ error: err.message }, 400);
            }
            return c.json({ error: "Failed to unpublish content" }, 500);
        }
    });
    return router;
}
// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Obtener datos de la fuente (dataset o grimoire)
 */
async function fetchSourceData(ctx, source) {
    const { db } = ctx;
    if (source.type === "dataset") {
        // Para datasets, necesitamos el datasetId y entryId
        // Esto vendría en source.grimoireId (como datasetId)
        const datasetId = source.grimoireId;
        if (!datasetId)
            return null;
        try {
            const result = await db.execute(`SELECT * FROM ${quoteIdentifier(datasetId)} WHERE id = '${source.recordId}' LIMIT 1`);
            return result[0] || null;
        }
        catch {
            return null;
        }
    }
    if (source.type === "grimoire" && source.table) {
        // Para grimoires, consultar tabla directamente
        try {
            const result = await db.execute(`SELECT * FROM ${quoteIdentifier(source.table)} WHERE id = '${source.recordId}' LIMIT 1`);
            return result[0] || null;
        }
        catch {
            return null;
        }
    }
    return null;
}
/**
 * Escapar identificadores SQL
 */
function quoteIdentifier(identifier) {
    // Prevenir SQL injection básica
    const clean = identifier.replace(/[^a-zA-Z0-9_]/g, "");
    return `"${clean}"`;
}
//# sourceMappingURL=content-publishing.js.map