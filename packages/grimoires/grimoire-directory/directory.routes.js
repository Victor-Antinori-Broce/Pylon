// @ts-nocheck
/**
 * Gremio CMS — Employee Directory Routes
 *
 * REST API for employee profiles, departments, positions,
 * and organizational hierarchy.
 */
import { Hono } from "hono";
import { eq, and, or, sql, asc, desc, like, isNull, inArray } from "drizzle-orm";
import { organizations, departments, positions, employees, employeeDocuments, } from "./directory.schema";
/**
 * Factory function that creates Directory routes with dependency injection
 */
export function createDirectoryRouter(ctx) {
    const directoryRoutes = new Hono();
    const { db, cache, auth } = ctx;
    // Get the actual DB instance for queries
    const dbInstance = db.instance;
    const requireAuth = auth.requireAuth;
    const cachedQuery = async (key, ttl, fn) => {
        const cached = await cache.get(key);
        if (cached)
            return cached;
        const result = await fn();
        await cache.set(key, result, ttl);
        return result;
    };
    const invalidateCache = async (pattern) => {
        await cache.invalidate(pattern);
    };
    // ═══════════════════════════════════════════════
    // ORGANIZATIONS CRUD
    // ═══════════════════════════════════════════════
    // Helper to generate media URLs
    const getLogoUrl = (logoId) => logoId ? `/api/media/preset/${logoId}/small` : null;
    const getPhotoUrl = (photoId) => photoId ? `/api/media/preset/${photoId}/thumbnail` : null;
    directoryRoutes.get("/organizations", async (c) => {
        const list = await dbInstance
            .select({
            id: organizations.id,
            name: organizations.name,
            slug: organizations.slug,
            website: organizations.website,
            city: organizations.city,
            country: organizations.country,
            logoId: organizations.logoId,
            employeeCount: organizations.employeeCount,
            isActive: organizations.isActive,
        })
            .from(organizations)
            .where(eq(organizations.isActive, true))
            .orderBy(asc(organizations.name));
        return c.json({
            docs: list.map(org => ({
                ...org,
                logoUrl: getLogoUrl(org.logoId),
            })),
        });
    });
    directoryRoutes.post("/organizations", requireAuth, async (c) => {
        const body = await c.req.json();
        const slug = body.slug || body.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        const [existing] = await dbInstance
            .select({ id: organizations.id })
            .from(organizations)
            .where(eq(organizations.slug, slug))
            .limit(1);
        if (existing)
            return c.json({ error: "Organization with this slug exists" }, 409);
        const [org] = await dbInstance
            .insert(organizations)
            .values({
            name: body.name,
            slug,
            description: body.description,
            website: body.website,
            email: body.email,
            phone: body.phone,
            address: body.address,
            city: body.city,
            state: body.state,
            country: body.country,
            postalCode: body.postalCode,
            primaryColor: body.primaryColor,
        })
            .returning();
        return c.json(org, 201);
    });
    directoryRoutes.get("/organizations/:id", async (c) => {
        const { id } = c.req.param();
        const [org] = await dbInstance
            .select()
            .from(organizations)
            .where(sql `${organizations.id} = ${id} OR ${organizations.slug} = ${id}`)
            .limit(1);
        if (!org)
            return c.json({ error: "Organization not found" }, 404);
        // Get departments
        const depts = await dbInstance
            .select({
            id: departments.id,
            name: departments.name,
            slug: departments.slug,
            employeeCount: departments.employeeCount,
            headId: departments.headId,
        })
            .from(departments)
            .where(and(eq(departments.organizationId, org.id), eq(departments.isActive, true), isNull(departments.parentDepartmentId) // Top-level only
        ))
            .orderBy(asc(departments.name));
        return c.json({
            ...org,
            logoUrl: getLogoUrl(org.logoId),
            departments: depts,
        });
    });
    // ═══════════════════════════════════════════════
    // DEPARTMENTS CRUD
    // ═══════════════════════════════════════════════
    directoryRoutes.get("/departments", async (c) => {
        const orgId = c.req.query("organizationId");
        const parentId = c.req.query("parentId");
        let conditions = [eq(departments.isActive, true)];
        if (orgId)
            conditions.push(eq(departments.organizationId, orgId));
        if (parentId === "null") {
            conditions.push(isNull(departments.parentDepartmentId));
        }
        else if (parentId) {
            conditions.push(eq(departments.parentDepartmentId, parentId));
        }
        const list = await dbInstance
            .select({
            id: departments.id,
            organizationId: departments.organizationId,
            name: departments.name,
            slug: departments.slug,
            description: departments.description,
            level: departments.level,
            employeeCount: departments.employeeCount,
            headId: departments.headId,
            location: departments.location,
        })
            .from(departments)
            .where(and(...conditions))
            .orderBy(asc(departments.name));
        return c.json({ docs: list });
    });
    directoryRoutes.post("/departments", requireAuth, async (c) => {
        const body = await c.req.json();
        if (!body.organizationId || !body.name) {
            return c.json({ error: "organizationId and name are required" }, 400);
        }
        const slug = body.slug || body.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        // Check for duplicate in same org
        const [existing] = await dbInstance
            .select({ id: departments.id })
            .from(departments)
            .where(and(eq(departments.organizationId, body.organizationId), eq(departments.slug, slug)))
            .limit(1);
        if (existing)
            return c.json({ error: "Department with this slug exists in organization" }, 409);
        // Calculate level based on parent
        let level = 0;
        if (body.parentDepartmentId) {
            const [parent] = await dbInstance
                .select({ level: departments.level })
                .from(departments)
                .where(eq(departments.id, body.parentDepartmentId))
                .limit(1);
            if (parent)
                level = parent.level + 1;
        }
        const [dept] = await dbInstance
            .insert(departments)
            .values({
            organizationId: body.organizationId,
            name: body.name,
            slug,
            description: body.description,
            parentDepartmentId: body.parentDepartmentId,
            level,
            email: body.email,
            phone: body.phone,
            location: body.location,
            costCenter: body.costCenter,
        })
            .returning();
        await invalidateCache(`directory:*`);
        return c.json(dept, 201);
    });
    directoryRoutes.get("/departments/:id", async (c) => {
        const { id } = c.req.param();
        const [dept] = await dbInstance
            .select()
            .from(departments)
            .where(eq(departments.id, id))
            .limit(1);
        if (!dept)
            return c.json({ error: "Department not found" }, 404);
        // Get head info
        let head = null;
        if (dept.headId) {
            const [h] = await dbInstance
                .select({
                id: employees.id,
                firstName: employees.firstName,
                lastName: employees.lastName,
                displayName: employees.displayName,
                photoId: employees.photoId,
                email: employees.email,
            })
                .from(employees)
                .where(eq(employees.id, dept.headId))
                .limit(1);
            head = h ? { ...h, photoUrl: getPhotoUrl(h.photoId) } : null;
        }
        // Get sub-departments
        const subDepts = await dbInstance
            .select({
            id: departments.id,
            name: departments.name,
            slug: departments.slug,
            employeeCount: departments.employeeCount,
        })
            .from(departments)
            .where(and(eq(departments.parentDepartmentId, id), eq(departments.isActive, true)))
            .orderBy(asc(departments.name));
        // Get employees
        const emps = await dbInstance
            .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            displayName: employees.displayName,
            email: employees.email,
            photoId: employees.photoId,
            status: employees.status,
        })
            .from(employees)
            .where(and(eq(employees.departmentId, id), eq(employees.isActive, true)))
            .orderBy(asc(employees.lastName));
        return c.json({
            ...dept,
            head,
            subDepartments: subDepts,
            employees: emps.map(e => ({ ...e, photoUrl: getPhotoUrl(e.photoId) })),
        });
    });
    // ═══════════════════════════════════════════════
    // POSITIONS CRUD
    // ═══════════════════════════════════════════════
    directoryRoutes.get("/positions", async (c) => {
        const orgId = c.req.query("organizationId");
        const deptId = c.req.query("departmentId");
        let conditions = [eq(positions.isActive, true)];
        if (orgId)
            conditions.push(eq(positions.organizationId, orgId));
        if (deptId)
            conditions.push(eq(positions.departmentId, deptId));
        const list = await dbInstance
            .select({
            id: positions.id,
            title: positions.title,
            level: positions.level,
            grade: positions.grade,
            departmentId: positions.departmentId,
            isManagement: positions.isManagement,
        })
            .from(positions)
            .where(and(...conditions))
            .orderBy(asc(positions.title));
        return c.json({ docs: list });
    });
    directoryRoutes.post("/positions", requireAuth, async (c) => {
        const body = await c.req.json();
        const slug = body.slug || body.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        const [position] = await dbInstance
            .insert(positions)
            .values({
            organizationId: body.organizationId,
            title: body.title,
            slug,
            description: body.description,
            level: body.level,
            grade: body.grade,
            departmentId: body.departmentId,
            reportsToPositionId: body.reportsToPositionId,
            isManagement: body.isManagement || false,
        })
            .returning();
        return c.json(position, 201);
    });
    // ═══════════════════════════════════════════════
    // EMPLOYEES CRUD
    // ═══════════════════════════════════════════════
    directoryRoutes.get("/employees", async (c) => {
        const query = c.req.query();
        const result = await cachedQuery(`employees:list:${JSON.stringify(query)}`, 60, async () => {
            let conditions = [eq(employees.isActive, true)];
            if (query.organizationId)
                conditions.push(eq(employees.organizationId, query.organizationId));
            if (query.departmentId)
                conditions.push(eq(employees.departmentId, query.departmentId));
            if (query.positionId)
                conditions.push(eq(employees.positionId, query.positionId));
            if (query.managerId)
                conditions.push(eq(employees.managerId, query.managerId));
            if (query.status)
                conditions.push(eq(employees.status, query.status));
            if (query.remote === "true")
                conditions.push(eq(employees.remote, true));
            if (query.location)
                conditions.push(eq(employees.location, query.location));
            // Search by name
            if (query.search) {
                const searchTerm = `%${query.search.toLowerCase()}%`;
                conditions.push(or(like(sql `LOWER(${employees.firstName})`, searchTerm), like(sql `LOWER(${employees.lastName})`, searchTerm), like(sql `LOWER(${employees.email})`, searchTerm)));
            }
            const empList = await dbInstance
                .select({
                id: employees.id,
                employeeId: employees.employeeId,
                firstName: employees.firstName,
                lastName: employees.lastName,
                displayName: employees.displayName,
                email: employees.email,
                workEmail: employees.workEmail,
                phone: employees.phone,
                mobile: employees.mobile,
                photoId: employees.photoId,
                departmentId: employees.departmentId,
                positionId: employees.positionId,
                managerId: employees.managerId,
                status: employees.status,
                location: employees.location,
                remote: employees.remote,
            })
                .from(employees)
                .where(and(...conditions))
                .orderBy(asc(employees.lastName), asc(employees.firstName))
                .limit(Math.min(parseInt(query.limit || "50"), 100));
            // Get department and position names
            const deptIds = [...new Set(empList.map(e => e.departmentId).filter(Boolean))];
            const posIds = [...new Set(empList.map(e => e.positionId).filter(Boolean))];
            const [depts, poss] = await Promise.all([
                deptIds.length ? dbInstance
                    .select({ id: departments.id, name: departments.name })
                    .from(departments)
                    .where(inArray(departments.id, deptIds)) : [],
                posIds.length ? dbInstance
                    .select({ id: positions.id, title: positions.title })
                    .from(positions)
                    .where(inArray(positions.id, posIds)) : [],
            ]);
            const deptMap = new Map(depts.map(d => [d.id, d.name]));
            const posMap = new Map(poss.map(p => [p.id, p.title]));
            return {
                docs: empList.map(e => ({
                    ...e,
                    departmentName: e.departmentId ? deptMap.get(e.departmentId) : null,
                    positionTitle: e.positionId ? posMap.get(e.positionId) : null,
                    photoUrl: getPhotoUrl(e.photoId),
                })),
                totalDocs: empList.length,
            };
        });
        return c.json(result);
    });
    directoryRoutes.post("/employees", requireAuth, async (c) => {
        const body = await c.req.json();
        // Validate required fields
        if (!body.organizationId || !body.employeeId || !body.firstName || !body.lastName || !body.email) {
            return c.json({ error: "organizationId, employeeId, firstName, lastName, and email are required" }, 400);
        }
        // Check for duplicate employee ID in org
        const [existingId] = await dbInstance
            .select({ id: employees.id })
            .from(employees)
            .where(and(eq(employees.organizationId, body.organizationId), eq(employees.employeeId, body.employeeId)))
            .limit(1);
        if (existingId)
            return c.json({ error: "Employee ID already exists in organization" }, 409);
        // Check for duplicate email
        const [existingEmail] = await dbInstance
            .select({ id: employees.id })
            .from(employees)
            .where(eq(employees.email, body.email))
            .limit(1);
        if (existingEmail)
            return c.json({ error: "Email already registered" }, 409);
        const [emp] = await dbInstance
            .insert(employees)
            .values({
            userId: body.userId,
            organizationId: body.organizationId,
            employeeId: body.employeeId,
            firstName: body.firstName,
            lastName: body.lastName,
            displayName: body.displayName,
            email: body.email,
            workEmail: body.workEmail,
            phone: body.phone,
            mobile: body.mobile,
            photoId: body.photoId,
            departmentId: body.departmentId,
            positionId: body.positionId,
            managerId: body.managerId,
            status: body.status || "active",
            employmentType: body.employmentType || "full_time",
            startDate: body.startDate || new Date().toISOString().split("T")[0],
            birthDate: body.birthDate,
            location: body.location,
            timezone: body.timezone,
            remote: body.remote || false,
            skills: body.skills || [],
            languages: body.languages || [],
            bio: body.bio,
            linkedin: body.linkedin,
            github: body.github,
            twitter: body.twitter,
            website: body.website,
            emergencyContact: body.emergencyContact,
            customFields: body.customFields || {},
            externalId: body.externalId,
        })
            .returning();
        // Update organization employee count
        const [orgEmpCount] = await dbInstance
            .select({ count: sql `count(*)::int` })
            .from(employees)
            .where(and(eq(employees.organizationId, body.organizationId), eq(employees.isActive, true)));
        await dbInstance
            .update(organizations)
            .set({ employeeCount: orgEmpCount?.count || 0 })
            .where(eq(organizations.id, body.organizationId));
        // Update department employee count if applicable
        if (body.departmentId) {
            const [deptEmpCount] = await dbInstance
                .select({ count: sql `count(*)::int` })
                .from(employees)
                .where(and(eq(employees.departmentId, body.departmentId), eq(employees.isActive, true)));
            await dbInstance
                .update(departments)
                .set({ employeeCount: deptEmpCount?.count || 0 })
                .where(eq(departments.id, body.departmentId));
        }
        await invalidateCache(`directory:*`);
        return c.json(emp, 201);
    });
    directoryRoutes.get("/employees/:id", async (c) => {
        const { id } = c.req.param();
        const [emp] = await dbInstance
            .select()
            .from(employees)
            .where(eq(employees.id, id))
            .limit(1);
        if (!emp)
            return c.json({ error: "Employee not found" }, 404);
        // Get related data
        const [dept, pos, manager, org] = await Promise.all([
            emp.departmentId ? dbInstance.select().from(departments).where(eq(departments.id, emp.departmentId)).limit(1).then(r => r[0]) : null,
            emp.positionId ? dbInstance.select().from(positions).where(eq(positions.id, emp.positionId)).limit(1).then(r => r[0]) : null,
            emp.managerId ? dbInstance.select({
                id: employees.id,
                firstName: employees.firstName,
                lastName: employees.lastName,
                displayName: employees.displayName,
                photoId: employees.photoId,
                email: employees.email,
            }).from(employees).where(eq(employees.id, emp.managerId)).limit(1).then(r => r[0]) : null,
            dbInstance.select({ name: organizations.name, slug: organizations.slug }).from(organizations).where(eq(organizations.id, emp.organizationId)).limit(1).then(r => r[0]),
        ]);
        // Get direct reports
        const reports = await dbInstance
            .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            displayName: employees.displayName,
            photoId: employees.photoId,
            email: employees.email,
            positionId: employees.positionId,
            status: employees.status,
        })
            .from(employees)
            .where(and(eq(employees.managerId, id), eq(employees.isActive, true)))
            .orderBy(asc(employees.lastName));
        // Get position titles for reports
        const reportPosIds = [...new Set(reports.map(r => r.positionId).filter(Boolean))];
        const reportPos = reportPosIds.length ? await dbInstance
            .select({ id: positions.id, title: positions.title })
            .from(positions)
            .where(inArray(positions.id, reportPosIds)) : [];
        const posMap = new Map(reportPos.map(p => [p.id, p.title]));
        return c.json({
            ...emp,
            photoUrl: getPhotoUrl(emp.photoId),
            organization: org ? { ...org, logoUrl: getLogoUrl(org.logoId) } : null,
            department: dept,
            position: pos,
            manager: manager ? { ...manager, photoUrl: getPhotoUrl(manager.photoId) } : null,
            directReports: reports.map(r => ({
                ...r,
                photoUrl: getPhotoUrl(r.photoId),
                positionTitle: r.positionId ? posMap.get(r.positionId) : null,
            })),
        });
    });
    directoryRoutes.patch("/employees/:id", requireAuth, async (c) => {
        const { id } = c.req.param();
        const body = await c.req.json();
        const [existing] = await dbInstance.select().from(employees).where(eq(employees.id, id)).limit(1);
        if (!existing)
            return c.json({ error: "Employee not found" }, 404);
        const updates = { updatedAt: new Date() };
        // Update allowed fields
        const allowedFields = [
            "firstName", "lastName", "displayName", "email", "workEmail",
            "phone", "mobile", "photoId", "departmentId", "positionId", "managerId",
            "status", "employmentType", "startDate", "endDate", "birthDate",
            "location", "timezone", "remote", "skills", "languages", "bio",
            "linkedin", "github", "twitter", "website", "emergencyContact",
            "customFields", "visibleInDirectory"
        ];
        for (const field of allowedFields) {
            if (body[field] !== undefined)
                updates[field] = body[field];
        }
        const [updated] = await dbInstance
            .update(employees)
            .set(updates)
            .where(eq(employees.id, id))
            .returning();
        // Update counts if department changed
        if (body.departmentId && body.departmentId !== existing.departmentId) {
            if (existing.departmentId) {
                await dbInstance
                    .update(departments)
                    .set({ employeeCount: sql `${departments.employeeCount} - 1` })
                    .where(eq(departments.id, existing.departmentId));
            }
            await dbInstance
                .update(departments)
                .set({ employeeCount: sql `${departments.employeeCount} + 1` })
                .where(eq(departments.id, body.departmentId));
        }
        await invalidateCache(`directory:*`);
        return c.json(updated);
    });
    directoryRoutes.delete("/employees/:id", requireAuth, async (c) => {
        const { id } = c.req.param();
        const [existing] = await dbInstance.select({ departmentId: employees.departmentId }).from(employees).where(eq(employees.id, id)).limit(1);
        if (!existing)
            return c.json({ error: "Employee not found" }, 404);
        // Soft delete
        await dbInstance
            .update(employees)
            .set({ isActive: false, status: "terminated", updatedAt: new Date() })
            .where(eq(employees.id, id));
        // Update counts
        if (existing.departmentId) {
            await dbInstance
                .update(departments)
                .set({ employeeCount: sql `${departments.employeeCount} - 1` })
                .where(eq(departments.id, existing.departmentId));
        }
        await invalidateCache(`directory:*`);
        return c.json({ success: true });
    });
    // ═══════════════════════════════════════════════
    // ORG CHART
    // ═══════════════════════════════════════════════
    directoryRoutes.get("/org-chart", async (c) => {
        const orgId = c.req.query("organizationId");
        if (!orgId)
            return c.json({ error: "organizationId is required" }, 400);
        // Get all active employees with their reporting info
        const empList = await dbInstance
            .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            displayName: employees.displayName,
            email: employees.email,
            photoId: employees.photoId,
            managerId: employees.managerId,
            departmentId: employees.departmentId,
            positionId: employees.positionId,
        })
            .from(employees)
            .where(and(eq(employees.organizationId, orgId), eq(employees.isActive, true)));
        // Get department and position names
        const deptIds = [...new Set(empList.map(e => e.departmentId).filter(Boolean))];
        const posIds = [...new Set(empList.map(e => e.positionId).filter(Boolean))];
        const [depts, poss] = await Promise.all([
            deptIds.length ? dbInstance.select({ id: departments.id, name: departments.name }).from(departments).where(inArray(departments.id, deptIds)) : [],
            posIds.length ? dbInstance.select({ id: positions.id, title: positions.title }).from(positions).where(inArray(positions.id, posIds)) : [],
        ]);
        const deptMap = new Map(depts.map(d => [d.id, d.name]));
        const posMap = new Map(poss.map(p => [p.id, p.title]));
        // Build tree structure
        const empMap = new Map(empList.map(e => [e.id, {
                ...e,
                departmentName: e.departmentId ? deptMap.get(e.departmentId) : null,
                positionTitle: e.positionId ? posMap.get(e.positionId) : null,
                photoUrl: getPhotoUrl(e.photoId),
                children: [],
            }]));
        const roots = [];
        for (const emp of empList) {
            const node = empMap.get(emp.id);
            if (emp.managerId && empMap.has(emp.managerId)) {
                empMap.get(emp.managerId).children.push(node);
            }
            else {
                roots.push(node);
            }
        }
        return c.json({
            organizationId: orgId,
            roots,
            totalEmployees: empList.length,
        });
    });
    // Get employee's reporting chain
    directoryRoutes.get("/employees/:id/reporting-chain", async (c) => {
        const { id } = c.req.param();
        const chain = [];
        let currentId = id;
        while (currentId) {
            const [emp] = await dbInstance
                .select({
                id: employees.id,
                firstName: employees.firstName,
                lastName: employees.lastName,
                displayName: employees.displayName,
                email: employees.email,
                photoId: employees.photoId,
                managerId: employees.managerId,
                positionId: employees.positionId,
            })
                .from(employees)
                .where(eq(employees.id, currentId))
                .limit(1);
            if (!emp)
                break;
            // Get position
            const [pos] = emp.positionId ? await dbInstance
                .select({ title: positions.title })
                .from(positions)
                .where(eq(positions.id, emp.positionId))
                .limit(1) : [null];
            chain.unshift({ ...emp, positionTitle: pos?.title, photoUrl: getPhotoUrl(emp.photoId) });
            currentId = emp.managerId;
        }
        return c.json({ chain });
    });
    // ═══════════════════════════════════════════════
    // EMPLOYEE DOCUMENTS
    // ═══════════════════════════════════════════════
    directoryRoutes.get("/employees/:id/documents", async (c) => {
        const { id } = c.req.param();
        const docs = await dbInstance
            .select()
            .from(employeeDocuments)
            .where(eq(employeeDocuments.employeeId, id))
            .orderBy(desc(employeeDocuments.createdAt));
        return c.json({ docs });
    });
    directoryRoutes.post("/employees/:id/documents", requireAuth, async (c) => {
        const { id } = c.req.param();
        const body = await c.req.json();
        const [doc] = await dbInstance
            .insert(employeeDocuments)
            .values({
            employeeId: id,
            name: body.name,
            type: body.type,
            description: body.description,
            mediaId: body.mediaId,
            issueDate: body.issueDate,
            expiryDate: body.expiryDate,
            documentNumber: body.documentNumber,
            isConfidential: body.isConfidential || false,
            uploadedById: body.uploadedById,
        })
            .returning();
        return c.json(doc, 201);
    });
    // ═══════════════════════════════════════════════
    // SEARCH
    // ═══════════════════════════════════════════════
    directoryRoutes.get("/search", async (c) => {
        const query = c.req.query("q");
        const orgId = c.req.query("organizationId");
        if (!query || query.length < 2) {
            return c.json({ error: "Query must be at least 2 characters" }, 400);
        }
        const searchTerm = `%${query.toLowerCase()}%`;
        // Search employees
        const empResults = await dbInstance
            .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            displayName: employees.displayName,
            email: employees.email,
            photoId: employees.photoId,
            departmentId: employees.departmentId,
            positionId: employees.positionId,
        })
            .from(employees)
            .where(and(eq(employees.isActive, true), eq(employees.visibleInDirectory, true), orgId ? eq(employees.organizationId, orgId) : undefined, or(like(sql `LOWER(${employees.firstName})`, searchTerm), like(sql `LOWER(${employees.lastName})`, searchTerm), like(sql `LOWER(${employees.email})`, searchTerm), like(sql `LOWER(${employees.displayName})`, searchTerm))))
            .limit(20);
        // Search departments
        const deptResults = await dbInstance
            .select({
            id: departments.id,
            name: departments.name,
            description: departments.description,
            employeeCount: departments.employeeCount,
        })
            .from(departments)
            .where(and(eq(departments.isActive, true), orgId ? eq(departments.organizationId, orgId) : undefined, or(like(sql `LOWER(${departments.name})`, searchTerm), like(sql `LOWER(${departments.description})`, searchTerm))))
            .limit(10);
        return c.json({
            employees: empResults.map(e => ({ ...e, photoUrl: getPhotoUrl(e.photoId) })),
            departments: deptResults,
            total: empResults.length + deptResults.length,
        });
    });
    // ═══════════════════════════════════════════════
    // STATS
    // ═══════════════════════════════════════════════
    directoryRoutes.get("/stats", async (c) => {
        const orgId = c.req.query("organizationId");
        if (!orgId)
            return c.json({ error: "organizationId is required" }, 400);
        const stats = await cachedQuery(`directory:stats:${orgId}`, 300, async () => {
            // Employee counts by status
            const statusCounts = await dbInstance
                .select({
                status: employees.status,
                count: sql `count(*)::int`,
            })
                .from(employees)
                .where(and(eq(employees.organizationId, orgId), eq(employees.isActive, true)))
                .groupBy(employees.status);
            // Employee counts by department
            const deptCounts = await dbInstance
                .select({
                departmentId: employees.departmentId,
                count: sql `count(*)::int`,
            })
                .from(employees)
                .where(and(eq(employees.organizationId, orgId), eq(employees.isActive, true)))
                .groupBy(employees.departmentId);
            // Remote vs on-site
            const [remoteCount] = await dbInstance
                .select({ count: sql `count(*)::int` })
                .from(employees)
                .where(and(eq(employees.organizationId, orgId), eq(employees.isActive, true), eq(employees.remote, true)));
            const [totalCount] = await dbInstance
                .select({ count: sql `count(*)::int` })
                .from(employees)
                .where(and(eq(employees.organizationId, orgId), eq(employees.isActive, true)));
            return {
                totalEmployees: totalCount?.count || 0,
                byStatus: Object.fromEntries(statusCounts.map(s => [s.status, s.count])),
                byDepartment: Object.fromEntries(deptCounts.map(d => [d.departmentId, d.count])),
                remoteEmployees: remoteCount?.count || 0,
                onSiteEmployees: (totalCount?.count || 0) - (remoteCount?.count || 0),
            };
        });
        return c.json(stats);
    });
    // Return the configured router
    return directoryRoutes;
}
// Legacy export for backward compatibility
export { createDirectoryRouter as directoryRoutes };
//# sourceMappingURL=directory.routes.js.map