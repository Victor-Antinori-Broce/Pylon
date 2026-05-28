/**
 * Grimoire Agile — API Routes (DI Version)
 *
 * REST API for agile project management with Dependency Injection.
 *
 * IMPORTANT: Route order matters! Specific routes must come before parameterized ones.
 * Correct order:
 *   1. /projects/* (all project routes)
 *   2. /issues/:key, /intakes/:id/* (specific entity routes)
 *   3. /:projectId/* (parameterized project routes)
 *
 * @version 1.1.1
 */
import { Hono } from "hono";
import { eq, and, sql, asc, desc } from "drizzle-orm";
import { agileProjects, agileStates, agileIssues, agileCycles, agileModules, agileIntakes, agileComments, } from "./agile.schema";
/**
 * Create Agile Router with Dependency Injection
 */
export function createAgileRouter(ctx) {
    const app = new Hono();
    const { db, auth } = ctx;
    // Helper middleware for auth
    const requireAuth = auth.requireAuth;
    // ═══════════════════════════════════════════════════════════════════════════════
    // 1. PROJECTS (Static routes first)
    // ═══════════════════════════════════════════════════════════════════════════════
    /**
     * Helper to build cover image URLs from media id
     */
    const buildCoverImageUrls = (coverImageId) => {
        if (!coverImageId)
            return null;
        return {
            original: `/api/media/${coverImageId}`,
            large: `/api/media/preset/${coverImageId}/large`,
            small: `/api/media/preset/${coverImageId}/small`,
        };
    };
    /**
     * GET /api/agile/projects
     * List all projects
     */
    app.get("/projects", async (c) => {
        const query = c.req.query();
        const isArchived = query.isArchived === "true" ? true : query.isArchived === "false" ? false : null;
        let conditions = [];
        if (isArchived !== null) {
            conditions.push(eq(agileProjects.isArchived, isArchived));
        }
        const projects = await db.instance
            .select({
            id: agileProjects.id,
            name: agileProjects.name,
            identifier: agileProjects.identifier,
            description: agileProjects.description,
            emoji: agileProjects.emoji,
            color: agileProjects.color,
            isArchived: agileProjects.isArchived,
            leadId: agileProjects.leadId,
            keyCounter: agileProjects.keyCounter,
            coverImageId: agileProjects.coverImageId,
            createdAt: agileProjects.createdAt,
        })
            .from(agileProjects)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(asc(agileProjects.name));
        // Add cover image URLs to response
        const projectsWithCovers = projects.map((project) => ({
            ...project,
            coverImage: buildCoverImageUrls(project.coverImageId),
        }));
        return c.json({ docs: projectsWithCovers, totalDocs: projectsWithCovers.length });
    });
    /**
     * POST /api/agile/projects
     * Create a new project with default states
     */
    app.post("/projects", requireAuth, async (c) => {
        const body = await c.req.json();
        if (!body.name || !body.identifier) {
            return c.json({ error: "name and identifier are required" }, 400);
        }
        // Check duplicate identifier
        const [existing] = await db.instance
            .select({ id: agileProjects.id })
            .from(agileProjects)
            .where(eq(agileProjects.identifier, body.identifier.toUpperCase()))
            .limit(1);
        if (existing) {
            return c.json({ error: "Project identifier already exists" }, 409);
        }
        // Create project
        const [project] = await db.instance
            .insert(agileProjects)
            .values({
            name: body.name,
            identifier: body.identifier.toUpperCase(),
            description: body.description,
            emoji: body.emoji || "📁",
            color: body.color || "#6366f1",
            leadId: body.leadId,
            defaultAssigneeId: body.defaultAssigneeId,
            coverImageId: body.coverImageId,
            config: body.config || { estimateType: "fibonacci" },
            createdBy: body.createdBy,
        })
            .returning();
        // Create default states for the project
        const defaultStates = [
            { name: "Backlog", group: "backlog", color: "#94a3b8", sequence: 0, isDefault: true },
            { name: "Todo", group: "unstarted", color: "#3b82f6", sequence: 1 },
            { name: "In Progress", group: "started", color: "#f59e0b", sequence: 2 },
            { name: "Done", group: "completed", color: "#22c55e", sequence: 3, isCompleted: true },
            { name: "Cancelled", group: "cancelled", color: "#ef4444", sequence: 4, isCancelled: true },
        ];
        await db.instance
            .insert(agileStates)
            .values(defaultStates.map((s) => ({
            ...s,
            projectId: project.id,
        })));
        return c.json(project, 201);
    });
    /**
     * GET /api/agile/projects/:id
     * Get project with states
     */
    app.get("/projects/:id", async (c) => {
        const { id } = c.req.param();
        const [project] = await db.instance
            .select()
            .from(agileProjects)
            .where(eq(agileProjects.id, id))
            .limit(1);
        if (!project)
            return c.json({ error: "Project not found" }, 404);
        // Get states for this project
        const states = await db.instance
            .select()
            .from(agileStates)
            .where(eq(agileStates.projectId, id))
            .orderBy(asc(agileStates.sequence));
        // Add cover image URLs
        const projectWithCover = {
            ...project,
            coverImage: buildCoverImageUrls(project.coverImageId),
        };
        return c.json({ ...projectWithCover, states });
    });
    // ═══════════════════════════════════════════════════════════════════════════════
    // 2. SPECIFIC ENTITY ROUTES (Before parameterized routes)
    // ═══════════════════════════════════════════════════════════════════════════════
    /**
     * GET /api/agile/issues/:key
     * Get single issue by key (must come before /:projectId/issues)
     */
    app.get("/issues/:key", async (c) => {
        const { key } = c.req.param();
        const [issue] = await db.instance
            .select({
            id: agileIssues.id,
            key: agileIssues.key,
            name: agileIssues.name,
            descriptionHtml: agileIssues.descriptionHtml,
            descriptionText: agileIssues.descriptionText,
            type: agileIssues.type,
            priority: agileIssues.priority,
            stateId: agileIssues.stateId,
            cycleId: agileIssues.cycleId,
            moduleId: agileIssues.moduleId,
            projectId: agileIssues.projectId,
            assigneeId: agileIssues.assigneeId,
            createdBy: agileIssues.createdBy,
            estimate: agileIssues.estimate,
            isSubIssue: agileIssues.isSubIssue,
            parentId: agileIssues.parentId,
            subIssuesCount: agileIssues.subIssuesCount,
            commentsCount: agileIssues.commentsCount,
            targetDate: agileIssues.targetDate,
            createdAt: agileIssues.createdAt,
            updatedAt: agileIssues.updatedAt,
        })
            .from(agileIssues)
            .where(eq(agileIssues.key, key))
            .limit(1);
        if (!issue)
            return c.json({ error: "Issue not found" }, 404);
        return c.json(issue);
    });
    /**
     * PATCH /api/agile/issues/:key
     * Update an issue
     */
    app.patch("/issues/:key", requireAuth, async (c) => {
        const { key } = c.req.param();
        const body = await c.req.json();
        const [existing] = await db.instance.select().from(agileIssues).where(eq(agileIssues.key, key)).limit(1);
        if (!existing)
            return c.json({ error: "Issue not found" }, 404);
        const updates = { updatedAt: new Date() };
        if (body.name !== undefined)
            updates.name = body.name;
        if (body.descriptionHtml !== undefined) {
            updates.descriptionHtml = body.descriptionHtml;
            updates.descriptionText = body.descriptionText || body.descriptionHtml.replace(/<[^>]*>/g, "");
        }
        if (body.type !== undefined)
            updates.type = body.type;
        if (body.priority !== undefined)
            updates.priority = body.priority;
        if (body.stateId !== undefined)
            updates.stateId = body.stateId;
        if (body.cycleId !== undefined)
            updates.cycleId = body.cycleId;
        if (body.moduleId !== undefined)
            updates.moduleId = body.moduleId;
        if (body.assigneeId !== undefined)
            updates.assigneeId = body.assigneeId;
        if (body.estimate !== undefined)
            updates.estimate = body.estimate;
        if (body.targetDate !== undefined)
            updates.targetDate = body.targetDate ? new Date(body.targetDate) : null;
        if (body.props !== undefined)
            updates.props = body.props;
        const [updated] = await db.instance.update(agileIssues).set(updates).where(eq(agileIssues.key, key)).returning();
        return c.json(updated);
    });
    /**
     * GET /api/agile/issues/:key/comments
     * List comments for an issue
     */
    app.get("/issues/:key/comments", async (c) => {
        const { key } = c.req.param();
        const [issue] = await db.instance.select({ id: agileIssues.id }).from(agileIssues).where(eq(agileIssues.key, key)).limit(1);
        if (!issue)
            return c.json({ error: "Issue not found" }, 404);
        const comments = await db.instance
            .select({
            id: agileComments.id,
            contentHtml: agileComments.contentHtml,
            createdBy: agileComments.createdBy,
            isEdited: agileComments.isEdited,
            parentId: agileComments.parentId,
            reactions: agileComments.reactions,
            createdAt: agileComments.createdAt,
        })
            .from(agileComments)
            .where(eq(agileComments.issueId, issue.id))
            .orderBy(asc(agileComments.createdAt));
        return c.json({ docs: comments });
    });
    /**
     * POST /api/agile/issues/:key/comments
     * Create a comment
     */
    app.post("/issues/:key/comments", requireAuth, async (c) => {
        const { key } = c.req.param();
        const body = await c.req.json();
        const [issue] = await db.instance.select({ id: agileIssues.id }).from(agileIssues).where(eq(agileIssues.key, key)).limit(1);
        if (!issue)
            return c.json({ error: "Issue not found" }, 404);
        if (!body.contentHtml) {
            return c.json({ error: "contentHtml is required" }, 400);
        }
        const [comment] = await db.instance
            .insert(agileComments)
            .values({
            issueId: issue.id,
            contentHtml: body.contentHtml,
            contentText: body.contentText || body.contentHtml.replace(/<[^>]*>/g, ""),
            createdBy: body.createdBy,
            parentId: body.parentId,
        })
            .returning();
        // Update issue comment count
        const commentCount = await db.instance
            .select({ count: sql `count(*)` })
            .from(agileComments)
            .where(eq(agileComments.issueId, issue.id));
        await db.instance
            .update(agileIssues)
            .set({ commentsCount: commentCount[0].count })
            .where(eq(agileIssues.id, issue.id));
        return c.json(comment, 201);
    });
    // ═══════════════════════════════════════════════════════════════════════════════
    // INTAKE ACTION HANDLERS (shared between /intakes and /agile_intakes aliases)
    // ═══════════════════════════════════════════════════════════════════════════════
    async function handleApproveIntake(c) {
        const intakeId = c.req.param("intakeId") || c.req.param("id");
        const body = await c.req.json();
        // Step 1: Find the intake
        const [intake] = await db.instance
            .select()
            .from(agileIntakes)
            .where(and(eq(agileIntakes.id, intakeId), eq(agileIntakes.status, "pending")))
            .limit(1);
        if (!intake) {
            return c.json({ error: "Intake not found or already processed" }, 404);
        }
        // Step 2: Get project data for key generation
        const [project] = await db.instance
            .select({ id: agileProjects.id, identifier: agileProjects.identifier, keyCounter: agileProjects.keyCounter })
            .from(agileProjects)
            .where(eq(agileProjects.id, intake.projectId))
            .limit(1);
        if (!project) {
            return c.json({ error: "Project not found" }, 404);
        }
        // Determine state for the new issue
        let stateId = body.stateId || intake.suggestedStateId;
        if (!stateId) {
            const [defaultState] = await db.instance
                .select({ id: agileStates.id })
                .from(agileStates)
                .where(and(eq(agileStates.projectId, project.id), eq(agileStates.isDefault, true)))
                .limit(1);
            stateId = defaultState?.id;
        }
        // Generate unique key
        const newCounter = project.keyCounter + 1;
        const key = `${project.identifier}-${newCounter}`;
        // Step 3: TRANSACTION - Insert issue + Update intake atomically
        try {
            const result = await db.instance.transaction(async (tx) => {
                const [issue] = await tx
                    .insert(agileIssues)
                    .values({
                    key,
                    name: body.name || intake.title,
                    descriptionHtml: body.descriptionHtml || intake.description,
                    descriptionText: body.descriptionText ||
                        (body.descriptionHtml || intake.description || "").replace(/<[^>]*>/g, ""),
                    type: body.type || intake.suggestedType || "issue",
                    priority: body.priority || intake.suggestedPriority || "medium",
                    projectId: project.id,
                    stateId: stateId,
                    cycleId: body.cycleId,
                    moduleId: body.moduleId,
                    assigneeId: body.assigneeId,
                    createdBy: body.createdBy || intake.createdBy || "system",
                    estimate: body.estimate,
                    targetDate: body.targetDate ? new Date(body.targetDate) : null,
                    props: body.props || {},
                })
                    .returning();
                await tx
                    .update(agileProjects)
                    .set({ keyCounter: newCounter })
                    .where(eq(agileProjects.id, project.id));
                await tx
                    .update(agileIntakes)
                    .set({
                    status: "accepted",
                    createdIssueId: issue.id,
                    createdIssueKey: issue.key,
                    decidedBy: body.decidedBy,
                    decidedAt: new Date(),
                    decisionReason: body.reason || "Approved via API",
                    updatedAt: new Date(),
                })
                    .where(eq(agileIntakes.id, intakeId));
                return issue;
            });
            return c.json({
                success: true,
                issue: {
                    id: result.id,
                    key: result.key,
                    name: result.name,
                },
                intake: {
                    id: intakeId,
                    status: "accepted",
                },
            }, 201);
        }
        catch (error) {
            console.error("Error in approve intake transaction:", error);
            return c.json({ error: "Failed to create issue from intake" }, 500);
        }
    }
    async function handleDeclineIntake(c) {
        const intakeId = c.req.param("intakeId") || c.req.param("id");
        const body = await c.req.json();
        const [intake] = await db.instance
            .select()
            .from(agileIntakes)
            .where(and(eq(agileIntakes.id, intakeId), eq(agileIntakes.status, "pending")))
            .limit(1);
        if (!intake)
            return c.json({ error: "Intake not found or already processed" }, 404);
        const [updated] = await db.instance
            .update(agileIntakes)
            .set({
            status: "declined",
            decidedBy: body.decidedBy,
            decidedAt: new Date(),
            decisionReason: body.reason,
            updatedAt: new Date(),
        })
            .where(eq(agileIntakes.id, intakeId))
            .returning();
        return c.json(updated);
    }
    async function handleDuplicateIntake(c) {
        const intakeId = c.req.param("intakeId") || c.req.param("id");
        const body = await c.req.json();
        if (!body.duplicateOfId) {
            return c.json({ error: "duplicateOfId is required" }, 400);
        }
        const [intake] = await db.instance
            .select()
            .from(agileIntakes)
            .where(and(eq(agileIntakes.id, intakeId), eq(agileIntakes.status, "pending")))
            .limit(1);
        if (!intake)
            return c.json({ error: "Intake not found or already processed" }, 404);
        const [updated] = await db.instance
            .update(agileIntakes)
            .set({
            status: "duplicate",
            duplicateOfId: body.duplicateOfId,
            decidedBy: body.decidedBy,
            decidedAt: new Date(),
            decisionReason: body.reason || `Duplicate of issue ${body.duplicateOfId}`,
            updatedAt: new Date(),
        })
            .where(eq(agileIntakes.id, intakeId))
            .returning();
        return c.json(updated);
    }
    // Original short paths
    app.post("/intakes/:intakeId/approve", requireAuth, handleApproveIntake);
    app.post("/intakes/:intakeId/decline", requireAuth, handleDeclineIntake);
    app.post("/intakes/:intakeId/duplicate", requireAuth, handleDuplicateIntake);
    // DataExplorer compatibility aliases (uses full table name)
    app.post("/agile_intakes/:id/approve", requireAuth, handleApproveIntake);
    app.post("/agile_intakes/:id/decline", requireAuth, handleDeclineIntake);
    app.post("/agile_intakes/:id/convert", requireAuth, handleApproveIntake); // convert = approve (create issue)
    // ═══════════════════════════════════════════════════════════════════════════════
    // 3. PARAMETERIZED PROJECT ROUTES (Must come last)
    // ═══════════════════════════════════════════════════════════════════════════════
    /**
     * GET /api/agile/:projectId/issues
     * List issues for a project
     */
    app.get("/:projectId/issues", async (c) => {
        const { projectId } = c.req.param();
        const query = c.req.query();
        // Verify project exists
        const [project] = await db.instance
            .select({ id: agileProjects.id, identifier: agileProjects.identifier })
            .from(agileProjects)
            .where(eq(agileProjects.id, projectId))
            .limit(1);
        if (!project)
            return c.json({ error: "Project not found" }, 404);
        // Build filters
        let conditions = [eq(agileIssues.projectId, projectId)];
        if (query.stateId)
            conditions.push(eq(agileIssues.stateId, query.stateId));
        if (query.cycleId)
            conditions.push(eq(agileIssues.cycleId, query.cycleId));
        if (query.moduleId)
            conditions.push(eq(agileIssues.moduleId, query.moduleId));
        if (query.assigneeId)
            conditions.push(eq(agileIssues.assigneeId, query.assigneeId));
        if (query.type)
            conditions.push(eq(agileIssues.type, query.type));
        if (query.priority)
            conditions.push(eq(agileIssues.priority, query.priority));
        // Search in name
        if (query.search) {
            conditions.push(sql `${agileIssues.name} ILIKE ${`%${query.search}%`}`);
        }
        const issues = await db.instance
            .select({
            id: agileIssues.id,
            key: agileIssues.key,
            name: agileIssues.name,
            type: agileIssues.type,
            priority: agileIssues.priority,
            stateId: agileIssues.stateId,
            assigneeId: agileIssues.assigneeId,
            estimate: agileIssues.estimate,
            createdAt: agileIssues.createdAt,
            stateName: agileStates.name,
            stateColor: agileStates.color,
            stateGroup: agileStates.group,
        })
            .from(agileIssues)
            .leftJoin(agileStates, eq(agileIssues.stateId, agileStates.id))
            .where(and(...conditions))
            .orderBy(asc(agileIssues.createdAt))
            .limit(parseInt(query.limit || "50"));
        return c.json({
            docs: issues.map((issue) => ({
                ...issue,
                state: issue.stateId
                    ? { id: issue.stateId, name: issue.stateName, color: issue.stateColor, group: issue.stateGroup }
                    : null,
            })),
            totalDocs: issues.length,
        });
    });
    /**
     * POST /api/agile/:projectId/issues
     * Create a new issue
     */
    app.post("/:projectId/issues", requireAuth, async (c) => {
        const { projectId } = c.req.param();
        const body = await c.req.json();
        // Verify project exists
        const [project] = await db.instance
            .select({ id: agileProjects.id, identifier: agileProjects.identifier, keyCounter: agileProjects.keyCounter })
            .from(agileProjects)
            .where(eq(agileProjects.id, projectId))
            .limit(1);
        if (!project)
            return c.json({ error: "Project not found" }, 404);
        // Validation
        if (!body.name) {
            return c.json({ error: "name is required" }, 400);
        }
        // Get default state if not provided
        let stateId = body.stateId;
        if (!stateId) {
            const [defaultState] = await db.instance
                .select({ id: agileStates.id })
                .from(agileStates)
                .where(and(eq(agileStates.projectId, projectId), eq(agileStates.isDefault, true)))
                .limit(1);
            if (!defaultState) {
                return c.json({ error: "No default state found for project" }, 500);
            }
            stateId = defaultState.id;
        }
        // Generate unique key
        const newCounter = project.keyCounter + 1;
        const key = `${project.identifier}-${newCounter}`;
        // Create issue
        const [issue] = await db.instance
            .insert(agileIssues)
            .values({
            key,
            name: body.name,
            descriptionHtml: body.descriptionHtml,
            descriptionText: body.descriptionText || body.descriptionHtml?.replace(/<[^>]*>/g, ""),
            type: body.type || "issue",
            priority: body.priority || "medium",
            projectId,
            stateId,
            assigneeId: body.assigneeId,
            createdBy: body.createdBy,
            estimate: body.estimate,
            props: body.props || {},
        })
            .returning();
        // Update project counter
        await db.instance.update(agileProjects).set({ keyCounter: newCounter }).where(eq(agileProjects.id, projectId));
        return c.json(issue, 201);
    });
    /**
     * GET /api/agile/:projectId/intakes
     * List intakes for a project
     */
    app.get("/:projectId/intakes", async (c) => {
        const { projectId } = c.req.param();
        const query = c.req.query();
        let conditions = [eq(agileIntakes.projectId, projectId)];
        if (query.status)
            conditions.push(eq(agileIntakes.status, query.status));
        const intakes = await db.instance
            .select({
            id: agileIntakes.id,
            title: agileIntakes.title,
            description: agileIntakes.description,
            status: agileIntakes.status,
            source: agileIntakes.source,
            suggestedType: agileIntakes.suggestedType,
            suggestedPriority: agileIntakes.suggestedPriority,
            createdIssueKey: agileIntakes.createdIssueKey,
            createdAt: agileIntakes.createdAt,
        })
            .from(agileIntakes)
            .where(and(...conditions))
            .orderBy(desc(agileIntakes.createdAt));
        return c.json({ docs: intakes, totalDocs: intakes.length });
    });
    /**
     * POST /api/agile/:projectId/intakes
     * Create a new intake
     */
    app.post("/:projectId/intakes", requireAuth, async (c) => {
        const { projectId } = c.req.param();
        const body = await c.req.json();
        if (!body.title) {
            return c.json({ error: "title is required" }, 400);
        }
        const [intake] = await db.instance
            .insert(agileIntakes)
            .values({
            projectId,
            title: body.title,
            description: body.description,
            suggestedType: body.suggestedType,
            suggestedPriority: body.suggestedPriority,
            source: body.source || "api",
            sourceData: body.sourceData || {},
            createdBy: body.createdBy,
        })
            .returning();
        return c.json(intake, 201);
    });
    /**
     * GET /api/agile/:projectId/cycles
     * List cycles for a project
     */
    app.get("/:projectId/cycles", async (c) => {
        const { projectId } = c.req.param();
        const cycles = await db.instance
            .select({
            id: agileCycles.id,
            name: agileCycles.name,
            startDate: agileCycles.startDate,
            endDate: agileCycles.endDate,
            status: agileCycles.status,
            isActive: agileCycles.isActive,
        })
            .from(agileCycles)
            .where(eq(agileCycles.projectId, projectId))
            .orderBy(desc(agileCycles.startDate));
        return c.json({ docs: cycles, totalDocs: cycles.length });
    });
    /**
     * POST /api/agile/:projectId/cycles
     * Create a new cycle
     */
    app.post("/:projectId/cycles", requireAuth, async (c) => {
        const { projectId } = c.req.param();
        const body = await c.req.json();
        if (!body.name || !body.startDate || !body.endDate) {
            return c.json({ error: "name, startDate, and endDate are required" }, 400);
        }
        const [cycle] = await db.instance
            .insert(agileCycles)
            .values({
            projectId,
            name: body.name,
            description: body.description,
            startDate: new Date(body.startDate),
            endDate: new Date(body.endDate),
            createdBy: body.createdBy,
        })
            .returning();
        return c.json(cycle, 201);
    });
    /**
     * GET /api/agile/:projectId/modules
     * List modules for a project
     */
    app.get("/:projectId/modules", async (c) => {
        const { projectId } = c.req.param();
        const modules = await db.instance
            .select({
            id: agileModules.id,
            name: agileModules.name,
            description: agileModules.description,
            status: agileModules.status,
            color: agileModules.color,
        })
            .from(agileModules)
            .where(eq(agileModules.projectId, projectId))
            .orderBy(asc(agileModules.name));
        return c.json({ docs: modules, totalDocs: modules.length });
    });
    /**
     * POST /api/agile/:projectId/modules
     * Create a new module
     */
    app.post("/:projectId/modules", requireAuth, async (c) => {
        const { projectId } = c.req.param();
        const body = await c.req.json();
        if (!body.name) {
            return c.json({ error: "name is required" }, 400);
        }
        const [module] = await db.instance
            .insert(agileModules)
            .values({
            projectId,
            name: body.name,
            description: body.description,
            color: body.color,
            createdBy: body.createdBy,
        })
            .returning();
        return c.json(module, 201);
    });
    // Return the configured router
    return app;
}
//# sourceMappingURL=agile.routes.js.map