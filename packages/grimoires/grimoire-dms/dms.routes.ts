/**
 * Gremius DMS - Document Management System Routes
 * 
 * REST API for versioned document management with:
 * - CRUD completo de documentos y versiones
 * - Versionado semántico (major.minor.patch)
 * - Workflow de aprobación
 * - Categorización jerárquica
 * - Gestión de archivos
 * - Audit trail completo
 */

import { Hono } from "hono";
import { eq, and, or, sql, desc, asc, like, isNull, inArray, gte, lte } from "drizzle-orm";
import type { GrimoireContext } from "@gremius/shared";
import {
  dmsCategories,
  dmsDocuments,
  dmsDocumentVersions,
  dmsDocumentFiles,
  dmsDocumentRelations,
  dmsDocumentAcknowledgments,
  dmsAccessLog,
  dmsWorkflowNotifications,
  dmsDocumentSlugHistory,
  dmsDocumentComments,
  dmsDocumentDiagrams,
  type NewDmsDocument,
  type NewDmsDocumentVersion,
} from "./dms.schema";

export function createDMSRouter(ctx: GrimoireContext) {
  const router = new Hono();
  const { db, auth, storage } = ctx;
  const dbInstance = db.instance;
  const requireAuth = auth.requireAuth;

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  function generateDocumentCode(type: string, _categoryId: string | null): string {
    const prefix = type.substring(0, 3).toUpperCase();
    const timestamp = Date.now().toString(36).toUpperCase();
    return `${prefix}-${timestamp}`;
  }

  function getUserId(c: any): string {
    return c.get("user")?.id || "system";
  }

  function incrementVersion(version: string, changeType: "major" | "minor" | "patch"): string {
    const [major, minor, patch] = version.split(".").map(Number);
    if (changeType === "major") return `${major + 1}.0.0`;
    if (changeType === "minor") return `${major}.${minor + 1}.0`;
    return `${major}.${minor}.${patch + 1}`;
  }

  async function logAction(
    action: string,
    resourceType: string,
    resourceId: string | undefined,
    userId: string,
    details?: Record<string, any>
  ) {
    try {
      await dbInstance.insert(dmsAccessLog).values({
        action,
        resourceType,
        resourceId,
        userId,
        details: details || {},
      });
    } catch (e) {
      console.error("[DMS] Failed to log action:", e);
    }
  }

  // Quick Win: Validar wiki-links en contenido
  async function validateWikiLinks(content: string | null) {
    if (!content) return [];
    const matches = content.match(/\[\[(.*?)\]\]/g);
    if (!matches) return [];

    const targets = [...new Set(matches.map(m => m.slice(2, -2).trim()))];
    const warnings = [];
    for (const target of targets) {
      const [found] = await dbInstance
        .select({ id: dmsDocuments.id })
        .from(dmsDocuments)
        .where(and(
          eq(dmsDocuments.isActive, true),
          or(
            eq(dmsDocuments.code, target),
            eq(dmsDocuments.slug, target)
          )
        ))
        .limit(1);
      warnings.push({ target, exists: !!found });
    }
    return warnings;
  }

  // Quick Win: Crear notificaciones de workflow
  async function createWorkflowNotification(
    documentId: string,
    versionId: string | null,
    userIds: string[],
    type: string,
    message: string
  ) {
    if (!userIds.length) return;
    const uniqueUserIds = [...new Set(userIds)];
    try {
      await dbInstance.insert(dmsWorkflowNotifications).values(
        uniqueUserIds.map(uid => ({
          documentId,
          versionId,
          userId: uid,
          type,
          message,
        }))
      );
    } catch (e) {
      console.error("[DMS] Failed to create workflow notification:", e);
    }
  }

  // Quick Win: Computar flag requiresReview
  function computeRequiresReview(doc: { reviewDueDate: Date | null; expirationDate: Date | null }) {
    const now = new Date();
    return (
      (doc.reviewDueDate && new Date(doc.reviewDueDate) < now) ||
      (doc.expirationDate && new Date(doc.expirationDate) < now)
    );
  }

  // Fase 1: Verificar ACL de documento
  function canAccessDocument(
    doc: {
      visibility: string;
      ownerId: string | null;
      createdById: string | null;
      allowedUserIds: any;
      allowedRoleIds: any;
      departmentId: string | null;
    },
    userId: string,
    userRoleIds?: string[],
    userDepartmentId?: string | null
  ): boolean {
    if (doc.visibility === "public") return true;
    if (doc.ownerId === userId || doc.createdById === userId) return true;

    const allowedUsers = Array.isArray(doc.allowedUserIds) ? doc.allowedUserIds : [];
    if (allowedUsers.includes(userId)) return true;

    if (doc.visibility === "private") return false;

    // restricted: también revisar roles y departamento (si se proporcionan)
    const allowedRoles = Array.isArray(doc.allowedRoleIds) ? doc.allowedRoleIds : [];
    if (userRoleIds && allowedRoles.some((r: string) => userRoleIds.includes(r))) return true;

    if (userDepartmentId && doc.departmentId === userDepartmentId) return true;

    return false;
  }

  // Fase 1: Generar TOC desde contenido HTML/Markdown
  function generateToc(content: string | null, format: string = "markdown") {
    if (!content) return [];
    const toc: { id: string; text: string; level: number }[] = [];

    if (format === "html") {
      const headerRegex = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
      let match;
      while ((match = headerRegex.exec(content)) !== null) {
        const level = parseInt(match[1]);
        const text = match[2].replace(/<[^>]+>/g, "").trim();
        const id = text.toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        toc.push({ id: id || `section-${toc.length}`, text, level });
      }
    } else {
      // Markdown
      const lines = content.split("\n");
      for (const line of lines) {
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
          const level = match[1].length;
          const text = match[2].trim();
          const id = text.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
          toc.push({ id: id || `section-${toc.length}`, text, level });
        }
      }
    }
    return toc;
  }

  // Fase 1: Inyectar IDs a headers en contenido HTML
  function injectHeaderIds(content: string): string {
    let counter = 0;
    return content.replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (_match, level, text) => {
      const plainText = text.replace(/<[^>]+>/g, "").trim();
      const id = plainText.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || `section-${counter++}`;
      return `<h${level} id="${id}">${text}</h${level}>`;
    });
  }

  // Fase 1: Construir breadcrumb de categorías
  async function buildBreadcrumb(categoryId: string | null): Promise<{ id: string; name: string; slug: string }[]> {
    const breadcrumb: { id: string; name: string; slug: string }[] = [];
    let currentId = categoryId;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const [cat] = await dbInstance
        .select({ id: dmsCategories.id, name: dmsCategories.name, slug: dmsCategories.slug, parentId: dmsCategories.parentId })
        .from(dmsCategories)
        .where(eq(dmsCategories.id, currentId))
        .limit(1);
      if (!cat) break;
      breadcrumb.unshift({ id: cat.id, name: cat.name, slug: cat.slug });
      currentId = cat.parentId;
    }
    return breadcrumb;
  }

  // Fase 3: Reemplazar placeholders de diagramas en contenido
  async function injectDiagrams(content: string | null, versionId: string): Promise<string> {
    if (!content) return "";
    const diagramRegex = /\[\[diagram:(.*?)\]\]/g;
    const ids = [...content.matchAll(diagramRegex)].map(m => m[1]);
    if (!ids.length) return content;

    const diagrams = await dbInstance
      .select()
      .from(dmsDocumentDiagrams)
      .where(and(
        inArray(dmsDocumentDiagrams.id, ids),
        eq(dmsDocumentDiagrams.versionId, versionId)
      ));

    const map = new Map<string, any>(diagrams.map((d: any) => [d.id, d]));
    return content.replace(diagramRegex, (_match, id) => {
      const diagram = map.get(id);
      if (!diagram) return `<!-- diagram not found: ${id} -->`;
      if (diagram.renderedSvg) return diagram.renderedSvg;
      if (diagram.mediaId) return `<img src="/api/media/${diagram.mediaId}" alt="${diagram.name}" />`;
      return `<!-- diagram: ${diagram.name} -->`;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MIDDLEWARE
  // ═══════════════════════════════════════════════════════════════════════════

  router.use("/*", requireAuth);

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORIES
  // ═══════════════════════════════════════════════════════════════════════════

  router.get("/categories", async (c) => {
    const parentId = c.req.query("parentId");
    const withStats = c.req.query("stats") === "true";

    let query = dbInstance
      .select()
      .from(dmsCategories)
      .where(eq(dmsCategories.isActive, true))
      .orderBy(asc(dmsCategories.sortOrder), asc(dmsCategories.name));

    if (parentId) {
      query = dbInstance
        .select()
        .from(dmsCategories)
        .where(and(
          eq(dmsCategories.isActive, true),
          parentId === "null" ? isNull(dmsCategories.parentId) : eq(dmsCategories.parentId, parentId)
        ))
        .orderBy(asc(dmsCategories.sortOrder));
    }

    const categories = await query;

    if (withStats) {
      const categoryIds = categories.map((c: any) => c.id);
      const docCounts = await dbInstance
        .select({
          categoryId: dmsDocuments.categoryId,
          count: sql<number>`count(*)::int`,
        })
        .from(dmsDocuments)
        .where(and(
          inArray(dmsDocuments.categoryId, categoryIds),
          eq(dmsDocuments.isActive, true),
          eq(dmsDocuments.status, "published")
        ))
        .groupBy(dmsDocuments.categoryId);

      const countMap = new Map(docCounts.map((c: any) => [c.categoryId, c.count]));
      return c.json({
        docs: categories.map((cat: any) => ({
          ...cat,
          documentCount: countMap.get(cat.id) || 0,
        })),
      });
    }

    return c.json({ docs: categories });
  });

  router.post("/categories", async (c) => {
    const body = await c.req.json();
    const userId = getUserId(c);

    // Generar slug único
    const slug = body.slug || body.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Calcular path y level
    let level = 0;
    let path = slug;
    if (body.parentId) {
      const [parent] = await dbInstance
        .select({ level: dmsCategories.level, path: dmsCategories.path })
        .from(dmsCategories)
        .where(eq(dmsCategories.id, body.parentId))
        .limit(1);
      if (parent) {
        level = parent.level + 1;
        path = `${parent.path}/${slug}`;
      }
    }

    const [category] = await dbInstance
      .insert(dmsCategories)
      .values({
        name: body.name,
        slug,
        description: body.description,
        icon: body.icon,
        color: body.color,
        parentId: body.parentId,
        level,
        path,
        metadataSchema: body.metadataSchema || {},
        allowedRoles: body.allowedRoles || [],
        departmentId: body.departmentId,
        sortOrder: body.sortOrder || 0,
        createdById: userId,
      })
      .returning();

    await logAction("create", "category", category.id, userId, { name: category.name });
    return c.json(category, 201);
  });

  router.get("/categories/tree", async (c) => {
    // Devolver árbol completo de categorías
    const allCategories = await dbInstance
      .select()
      .from(dmsCategories)
      .where(eq(dmsCategories.isActive, true))
      .orderBy(asc(dmsCategories.sortOrder), asc(dmsCategories.name));

    const buildTree = (parentId: string | null = null): any[] => {
      return allCategories
        .filter((cat: any) => cat.parentId === parentId)
        .map((cat: any) => ({
          ...cat,
          children: buildTree(cat.id),
        }));
    };

    return c.json({ docs: buildTree(null) });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  router.get("/documents", async (c) => {
    const query = c.req.query();
    const limit = Math.min(parseInt(query.limit || "50"), 100);
    const page = parseInt(query.page || "1");
    const offset = (page - 1) * limit;

    let conditions: any[] = [eq(dmsDocuments.isActive, true)];

    // Filtros
    if (query.categoryId) conditions.push(eq(dmsDocuments.categoryId, query.categoryId));
    if (query.status) conditions.push(eq(dmsDocuments.status, query.status as any));
    if (query.type) conditions.push(eq(dmsDocuments.type, query.type as any));
    if (query.ownerId) conditions.push(eq(dmsDocuments.ownerId, query.ownerId));
    if (query.departmentId) conditions.push(eq(dmsDocuments.departmentId, query.departmentId));
    if (query.tags) {
      const tags = query.tags.split(",");
      conditions.push(sql`${dmsDocuments.tags} @> ${JSON.stringify(tags)}::jsonb`);
    }

    // Búsqueda
    if (query.search) {
      const searchTerm = `%${query.search.toLowerCase()}%`;
      conditions.push(or(
        like(sql`LOWER(${dmsDocuments.title})`, searchTerm),
        like(sql`LOWER(${dmsDocuments.code})`, searchTerm),
        like(sql`LOWER(${dmsDocuments.description})`, searchTerm)
      ));
    }

    // Contar total
    const [countResult] = await dbInstance
      .select({ count: sql<number>`count(*)::int` })
      .from(dmsDocuments)
      .where(and(...conditions));

    const total = countResult?.count || 0;

    // Obtener documentos
    const docs = await dbInstance
      .select({
        id: dmsDocuments.id,
        code: dmsDocuments.code,
        title: dmsDocuments.title,
        slug: dmsDocuments.slug,
        description: dmsDocuments.description,
        type: dmsDocuments.type,
        status: dmsDocuments.status,
        categoryId: dmsDocuments.categoryId,
        tags: dmsDocuments.tags,
        currentVersionNumber: dmsDocuments.currentVersionNumber,
        ownerId: dmsDocuments.ownerId,
        departmentId: dmsDocuments.departmentId,
        visibility: dmsDocuments.visibility,
        versionCount: dmsDocuments.versionCount,
        viewCount: dmsDocuments.viewCount,
        createdAt: dmsDocuments.createdAt,
        updatedAt: dmsDocuments.updatedAt,
        publishedAt: dmsDocuments.publishedAt,
        effectiveDate: dmsDocuments.effectiveDate,
        reviewDueDate: dmsDocuments.reviewDueDate,
      })
      .from(dmsDocuments)
      .where(and(...conditions))
      .orderBy(desc(dmsDocuments.updatedAt))
      .limit(limit)
      .offset(offset);

    // Obtener nombres de categorías
    const categoryIds = [...new Set(docs.map((d: any) => d.categoryId).filter(Boolean))];
    const categories = categoryIds.length > 0
      ? await dbInstance
          .select({ id: dmsCategories.id, name: dmsCategories.name })
          .from(dmsCategories)
          .where(inArray(dmsCategories.id, categoryIds))
      : [];
    const categoryMap = new Map(categories.map((c: any) => [c.id, c.name]));

    return c.json({
      docs: docs.map((d: any) => ({
        ...d,
        requiresReview: computeRequiresReview(d),
        categoryName: d.categoryId ? categoryMap.get(d.categoryId) : null,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  router.post("/documents", async (c) => {
    const body = await c.req.json();
    const userId = getUserId(c);

    // Validar requeridos
    if (!body.title) return c.json({ error: "Title is required" }, 400);

    // Generar código único
    const code = body.code || generateDocumentCode(body.type || "manual", body.categoryId);

    // Generar slug
    const slug = body.title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .substring(0, 100);

    const [existing] = await dbInstance
      .select({ id: dmsDocuments.id })
      .from(dmsDocuments)
      .where(eq(dmsDocuments.code, code))
      .limit(1);

    if (existing) return c.json({ error: "Document code already exists" }, 409);

    const [document] = await dbInstance
      .insert(dmsDocuments)
      .values({
        code,
        title: body.title,
        slug,
        description: body.description,
        type: body.type || "manual",
        categoryId: body.categoryId,
        tags: body.tags || [],
        ownerId: body.ownerId || userId,
        reviewerIds: body.reviewerIds || [],
        approverIds: body.approverIds || [],
        visibility: body.visibility || "restricted",
        allowedUserIds: body.allowedUserIds || [],
        allowedRoleIds: body.allowedRoleIds || [],
        departmentId: body.departmentId,
        metadata: body.metadata || {},
        effectiveDate: body.effectiveDate,
        reviewDueDate: body.reviewDueDate,
        expirationDate: body.expirationDate,
        requiresAcknowledgment: body.requiresAcknowledgment || false,
        createdById: userId,
      } as NewDmsDocument)
      .returning();

    await logAction("create", "document", document.id, userId, { title: document.title });

    // Crear primera versión automáticamente si hay contenido
    if (body.content || body.changelog) {
      await dbInstance.insert(dmsDocumentVersions).values({
        documentId: document.id,
        versionNumber: "1.0.0",
        changeType: "minor",
        content: body.content || "",
        contentFormat: body.contentFormat || "markdown",
        changelog: body.changelog || "Initial version",
        status: "draft",
        createdById: userId,
      });

      await dbInstance
        .update(dmsDocuments)
        .set({ versionCount: 1, nextVersionNumber: "1.0.1" })
        .where(eq(dmsDocuments.id, document.id));
    }

    return c.json(document, 201);
  });

  router.get("/documents/:id", async (c) => {
    const { id } = c.req.param();
    const includeVersions = c.req.query("versions") === "true";
    const includeRelations = c.req.query("relations") === "true";

    const [document] = await dbInstance
      .select()
      .from(dmsDocuments)
      .where(eq(dmsDocuments.id, id))
      .limit(1);

    if (!document) return c.json({ error: "Document not found" }, 404);

    // Quick Win: Contador de vistas con deduplicación por usuario (5 minutos)
    const userId = getUserId(c);
    const [recentView] = await dbInstance
      .select({ id: dmsAccessLog.id })
      .from(dmsAccessLog)
      .where(and(
        eq(dmsAccessLog.documentId, id),
        eq(dmsAccessLog.userId, userId),
        eq(dmsAccessLog.action, "view"),
        gte(dmsAccessLog.createdAt, sql`NOW() - INTERVAL '5 minutes'`)
      ))
      .limit(1);

    if (!recentView) {
      await dbInstance
        .update(dmsDocuments)
        .set({ viewCount: sql`${dmsDocuments.viewCount} + 1` })
        .where(eq(dmsDocuments.id, id));
      await logAction("view", "document", id, userId);
    }

    const result: any = { ...document, requiresReview: computeRequiresReview(document) };

    // Obtener categoría
    if (document.categoryId) {
      const [category] = await dbInstance
        .select()
        .from(dmsCategories)
        .where(eq(dmsCategories.id, document.categoryId))
        .limit(1);
      result.category = category;
    }

    // Obtener versiones
    if (includeVersions) {
      const versions = await dbInstance
        .select({
          id: dmsDocumentVersions.id,
          versionNumber: dmsDocumentVersions.versionNumber,
          changeType: dmsDocumentVersions.changeType,
          status: dmsDocumentVersions.status,
          changelog: dmsDocumentVersions.changelog,
          content: dmsDocumentVersions.content,
          contentFormat: dmsDocumentVersions.contentFormat,
          createdAt: dmsDocumentVersions.createdAt,
          createdById: dmsDocumentVersions.createdById,
          approvedById: dmsDocumentVersions.approvedById,
          approvedAt: dmsDocumentVersions.approvedAt,
          publishedAt: dmsDocumentVersions.publishedAt,
          isLatest: dmsDocumentVersions.isLatest,
          fileCount: dmsDocumentVersions.fileCount,
        })
        .from(dmsDocumentVersions)
        .where(eq(dmsDocumentVersions.documentId, id))
        .orderBy(desc(dmsDocumentVersions.createdAt));
      result.versions = versions;
      result.currentVersion = versions.find((v: any) => v.isLatest) || versions[0] || null;
    }

    // Obtener relaciones
    if (includeRelations) {
      const relations = await dbInstance
        .select()
        .from(dmsDocumentRelations)
        .where(eq(dmsDocumentRelations.sourceDocumentId, id));
      result.relations = relations;
    }

    return c.json(result);
  });

  router.patch("/documents/:id", async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    const userId = getUserId(c);

    const [existing] = await dbInstance
      .select()
      .from(dmsDocuments)
      .where(eq(dmsDocuments.id, id))
      .limit(1);

    if (!existing) return c.json({ error: "Document not found" }, 404);

    const updates: any = { updatedAt: new Date() };

    // Campos actualizables
    const allowedFields = [
      "title", "description", "type", "categoryId", "tags", "ownerId",
      "reviewerIds", "approverIds", "visibility", "allowedUserIds",
      "allowedRoleIds", "metadata", "effectiveDate", "reviewDueDate",
      "expirationDate", "requiresAcknowledgment", "status", "slug",
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    // Fase 1: Si cambia el slug, guardar el anterior en historial
    if (body.slug && body.slug !== existing.slug) {
      await dbInstance.insert(dmsDocumentSlugHistory).values({
        documentId: id,
        oldSlug: existing.slug,
      });
    }

    const [updated] = await dbInstance
      .update(dmsDocuments)
      .set(updates)
      .where(eq(dmsDocuments.id, id))
      .returning();

    await logAction("update", "document", id, userId, { fields: Object.keys(updates) });

    return c.json({ ...updated, requiresReview: computeRequiresReview(updated) });
  });

  router.delete("/documents/:id", async (c) => {
    const { id } = c.req.param();
    const userId = getUserId(c);

    // Soft delete
    await dbInstance
      .update(dmsDocuments)
      .set({ isActive: false, status: "archived", archivedAt: new Date() })
      .where(eq(dmsDocuments.id, id));

    await logAction("delete", "document", id, userId);
    return c.json({ success: true });
  });

  // Quick Win: Clonar documento desde plantilla
  router.post("/documents/from-template/:templateId", async (c) => {
    const { templateId } = c.req.param();
    const userId = getUserId(c);

    const [template] = await dbInstance
      .select()
      .from(dmsDocuments)
      .where(and(
        eq(dmsDocuments.id, templateId),
        eq(dmsDocuments.isTemplate, true),
        eq(dmsDocuments.isActive, true)
      ))
      .limit(1);

    if (!template) return c.json({ error: "Template not found" }, 404);

    const code = generateDocumentCode(template.type || "manual", template.categoryId);
    const slug = `${template.slug}-copy-${Date.now().toString(36)}`;

    const [newDoc] = await dbInstance
      .insert(dmsDocuments)
      .values({
        code,
        title: `${template.title} (Copy)`,
        slug,
        description: template.description,
        type: template.type,
        categoryId: template.categoryId,
        tags: template.tags,
        ownerId: userId,
        reviewerIds: template.reviewerIds || [],
        approverIds: template.approverIds || [],
        visibility: template.visibility || "restricted",
        allowedUserIds: template.allowedUserIds || [],
        allowedRoleIds: template.allowedRoleIds || [],
        departmentId: template.departmentId,
        metadata: template.metadata || {},
        effectiveDate: template.effectiveDate,
        reviewDueDate: template.reviewDueDate,
        expirationDate: template.expirationDate,
        requiresAcknowledgment: template.requiresAcknowledgment || false,
        isTemplate: false,
        createdById: userId,
      } as NewDmsDocument)
      .returning();

    // Clonar última versión del template
    const [latestVersion] = await dbInstance
      .select()
      .from(dmsDocumentVersions)
      .where(eq(dmsDocumentVersions.documentId, templateId))
      .orderBy(desc(dmsDocumentVersions.createdAt))
      .limit(1);

    if (latestVersion) {
      await dbInstance.insert(dmsDocumentVersions).values({
        documentId: newDoc.id,
        versionNumber: "1.0.0",
        changeType: "minor",
        content: latestVersion.content,
        contentFormat: latestVersion.contentFormat,
        changelog: `Cloned from template ${template.code}`,
        status: "draft",
        createdById: userId,
      });

      await dbInstance
        .update(dmsDocuments)
        .set({ versionCount: 1, nextVersionNumber: "1.0.1" })
        .where(eq(dmsDocuments.id, newDoc.id));
    }

    await logAction("create_from_template", "document", newDoc.id, userId, { templateId });
    return c.json({ ...newDoc, requiresReview: computeRequiresReview(newDoc) }, 201);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VERSIONES
  // ═══════════════════════════════════════════════════════════════════════════

  router.get("/documents/:id/versions", async (c) => {
    const { id } = c.req.param();

    const versions = await dbInstance
      .select()
      .from(dmsDocumentVersions)
      .where(eq(dmsDocumentVersions.documentId, id))
      .orderBy(desc(dmsDocumentVersions.createdAt));

    return c.json({ docs: versions });
  });

  router.post("/documents/:id/versions", async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    const userId = getUserId(c);

    const [document] = await dbInstance
      .select()
      .from(dmsDocuments)
      .where(eq(dmsDocuments.id, id))
      .limit(1);

    if (!document) return c.json({ error: "Document not found" }, 404);

    // Validar requeridos
    if (!body.changelog) return c.json({ error: "Changelog is required" }, 400);

    // Calcular siguiente número de versión
    const changeType = body.changeType || "minor";
    const versionNumber = incrementVersion(document.nextVersionNumber, changeType);

    const [version] = await dbInstance
      .insert(dmsDocumentVersions)
      .values({
        documentId: id,
        versionNumber,
        changeType,
        content: body.content || "",
        contentFormat: body.contentFormat || "markdown",
        changelog: body.changelog,
        status: "draft",
        createdById: userId,
      } as NewDmsDocumentVersion)
      .returning();

    // Actualizar documento
    await dbInstance
      .update(dmsDocuments)
      .set({
        versionCount: sql`${dmsDocuments.versionCount} + 1`,
        nextVersionNumber: incrementVersion(versionNumber, "patch"),
        updatedAt: new Date(),
      })
      .where(eq(dmsDocuments.id, id));

    await logAction("create", "version", version.id, userId, {
      documentId: id,
      versionNumber,
    });

    // Quick Win: Validar wiki-links
    const wikiLinkWarnings = await validateWikiLinks(body.content);

    return c.json({ ...version, warnings: { wikiLinks: wikiLinkWarnings } }, 201);
  });

  router.get("/versions/:versionId", async (c) => {
    const { versionId } = c.req.param();
    const includeFiles = c.req.query("files") === "true";

    const [version] = await dbInstance
      .select()
      .from(dmsDocumentVersions)
      .where(eq(dmsDocumentVersions.id, versionId))
      .limit(1);

    if (!version) return c.json({ error: "Version not found" }, 404);

    const result: any = { ...version };

    if (includeFiles) {
      const files = await dbInstance
        .select()
        .from(dmsDocumentFiles)
        .where(eq(dmsDocumentFiles.versionId, versionId))
        .orderBy(asc(dmsDocumentFiles.sortOrder));
      result.files = files;
    }

    return c.json(result);
  });

  router.patch("/versions/:versionId", async (c) => {
    const { versionId } = c.req.param();
    const body = await c.req.json();
    const userId = getUserId(c);

    const [version] = await dbInstance
      .select()
      .from(dmsDocumentVersions)
      .where(eq(dmsDocumentVersions.id, versionId))
      .limit(1);

    if (!version) return c.json({ error: "Version not found" }, 404);

    // Solo permitir actualizar versiones en draft
    if (version.status !== "draft" && !body.force) {
      return c.json({ error: "Cannot modify published version" }, 400);
    }

    const updates: any = { updatedAt: new Date() };
    if (body.content !== undefined) updates.content = body.content;
    if (body.contentFormat !== undefined) updates.contentFormat = body.contentFormat;
    if (body.changelog !== undefined) updates.changelog = body.changelog;

    const [updated] = await dbInstance
      .update(dmsDocumentVersions)
      .set(updates)
      .where(eq(dmsDocumentVersions.id, versionId))
      .returning();

    await logAction("update", "version", versionId, userId);

    // Quick Win: Validar wiki-links
    const wikiLinkWarnings = await validateWikiLinks(updates.content);

    return c.json({ ...updated, warnings: { wikiLinks: wikiLinkWarnings } });
  });

  // Workflow: Submit for review
  router.post("/versions/:versionId/submit", async (c) => {
    const { versionId } = c.req.param();
    const userId = getUserId(c);

    const [version] = await dbInstance
      .update(dmsDocumentVersions)
      .set({ status: "review_pending" })
      .where(and(
        eq(dmsDocumentVersions.id, versionId),
        eq(dmsDocumentVersions.status, "draft")
      ))
      .returning();

    if (!version) return c.json({ error: "Version not found or not in draft" }, 404);

    // Quick Win: Notificar a reviewers
    const [doc] = await dbInstance
      .select({ id: dmsDocuments.id, title: dmsDocuments.title, reviewerIds: dmsDocuments.reviewerIds, createdById: dmsDocuments.createdById })
      .from(dmsDocuments)
      .where(eq(dmsDocuments.id, version.documentId))
      .limit(1);

    if (doc && Array.isArray(doc.reviewerIds) && doc.reviewerIds.length > 0) {
      await createWorkflowNotification(
        doc.id,
        versionId,
        doc.reviewerIds,
        "review_requested",
        `Document "${doc.title}" version ${version.versionNumber} is pending your review`
      );
    }

    await logAction("submit_review", "version", versionId, userId);
    return c.json(version);
  });

  // Workflow: Review (approve/reject)
  router.post("/versions/:versionId/review", async (c) => {
    const { versionId } = c.req.param();
    const body = await c.req.json();
    const userId = getUserId(c);

    if (!body.decision || !["approved", "changes_requested"].includes(body.decision)) {
      return c.json({ error: "Invalid decision" }, 400);
    }

    const [version] = await dbInstance
      .update(dmsDocumentVersions)
      .set({
        status: body.decision,
        reviewedById: userId,
        reviewedAt: new Date(),
        reviewNotes: body.notes,
      })
      .where(and(
        eq(dmsDocumentVersions.id, versionId),
        eq(dmsDocumentVersions.status, "review_pending")
      ))
      .returning();

    if (!version) return c.json({ error: "Version not found or not pending review" }, 404);

    // Quick Win: Notificar al autor del documento
    const [doc] = await dbInstance
      .select({ id: dmsDocuments.id, title: dmsDocuments.title, createdById: dmsDocuments.createdById, ownerId: dmsDocuments.ownerId })
      .from(dmsDocuments)
      .where(eq(dmsDocuments.id, version.documentId))
      .limit(1);

    if (doc) {
      const notifyType = body.decision === "approved" ? "approved" : "changes_requested";
      const notifyMessage = body.decision === "approved"
        ? `Document "${doc.title}" version ${version.versionNumber} has been approved`
        : `Changes requested on "${doc.title}" version ${version.versionNumber}: ${body.notes || ""}`;
      const recipients = [...new Set([doc.createdById, doc.ownerId].filter(Boolean))] as string[];
      if (recipients.length > 0) {
        await createWorkflowNotification(doc.id, versionId, recipients, notifyType, notifyMessage);
      }
    }

    await logAction(body.decision, "version", versionId, userId, { notes: body.notes });
    return c.json(version);
  });

  // Workflow: Publish
  router.post("/versions/:versionId/publish", async (c) => {
    const { versionId } = c.req.param();
    const userId = getUserId(c);

    const [version] = await dbInstance
      .select()
      .from(dmsDocumentVersions)
      .where(eq(dmsDocumentVersions.id, versionId))
      .limit(1);

    if (!version) return c.json({ error: "Version not found" }, 404);
    if (version.status !== "approved") {
      return c.json({ error: "Version must be approved before publishing" }, 400);
    }

    // Marcar todas las versiones anteriores como no activas
    await dbInstance
      .update(dmsDocumentVersions)
      .set({ isActive: false, isLatest: false })
      .where(eq(dmsDocumentVersions.documentId, version.documentId));

    // Publicar esta versión
    const [published] = await dbInstance
      .update(dmsDocumentVersions)
      .set({
        status: "published",
        publishedById: userId,
        publishedAt: new Date(),
        isActive: true,
        isLatest: true,
      })
      .where(eq(dmsDocumentVersions.id, versionId))
      .returning();

    // Actualizar documento
    await dbInstance
      .update(dmsDocuments)
      .set({
        currentVersionId: versionId,
        currentVersionNumber: version.versionNumber,
        status: "published",
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(dmsDocuments.id, version.documentId));

    // Quick Win: Notificar al autor del documento
    const [doc] = await dbInstance
      .select({ id: dmsDocuments.id, title: dmsDocuments.title, createdById: dmsDocuments.createdById, ownerId: dmsDocuments.ownerId })
      .from(dmsDocuments)
      .where(eq(dmsDocuments.id, version.documentId))
      .limit(1);

    if (doc) {
      const recipients = [...new Set([doc.createdById, doc.ownerId].filter(Boolean))] as string[];
      if (recipients.length > 0) {
        await createWorkflowNotification(
          doc.id,
          versionId,
          recipients,
          "published",
          `Document "${doc.title}" version ${version.versionNumber} has been published`
        );
      }
    }

    await logAction("publish", "version", versionId, userId);
    return c.json(published);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ARCHIVOS
  // ═══════════════════════════════════════════════════════════════════════════

  router.post("/versions/:versionId/files", async (c) => {
    const { versionId } = c.req.param();
    const formData = await c.req.formData();
    const file = formData.get("file") as File;
    const userId = getUserId(c);

    if (!file) return c.json({ error: "No file provided" }, 400);

    const [version] = await dbInstance
      .select({ documentId: dmsDocumentVersions.documentId })
      .from(dmsDocumentVersions)
      .where(eq(dmsDocumentVersions.id, versionId))
      .limit(1);

    if (!version) return c.json({ error: "Version not found" }, 404);

    // Guardar archivo usando storage del contexto
    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `dms/${version.documentId}/${versionId}/${file.name}`;
    
    let publicUrl: string | undefined;
    if (storage) {
      const result = await (storage as any).upload(storagePath, buffer, {
        contentType: file.type,
      });
      publicUrl = result.url;
    }

    const [docFile] = await dbInstance
      .insert(dmsDocumentFiles)
      .values({
        versionId,
        documentId: version.documentId,
        filename: file.name,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        storageProvider: storage ? "s3" : "local",
        storagePath,
        publicUrl,
        createdById: userId,
      })
      .returning();

    // Actualizar contadores de la versión
    await dbInstance
      .update(dmsDocumentVersions)
      .set({
        fileCount: sql`${dmsDocumentVersions.fileCount} + 1`,
        totalSizeBytes: sql`${dmsDocumentVersions.totalSizeBytes} + ${file.size}`,
      })
      .where(eq(dmsDocumentVersions.id, versionId));

    await logAction("upload", "file", docFile.id, userId, { filename: file.name });
    return c.json(docFile, 201);
  });

  router.get("/files/:fileId/download", async (c) => {
    const { fileId } = c.req.param();
    const userId = getUserId(c);

    const [file] = await dbInstance
      .select()
      .from(dmsDocumentFiles)
      .where(eq(dmsDocumentFiles.id, fileId))
      .limit(1);

    if (!file) return c.json({ error: "File not found" }, 404);

    // Incrementar contador de descargas del documento
    await dbInstance
      .update(dmsDocuments)
      .set({ downloadCount: sql`${dmsDocuments.downloadCount} + 1` })
      .where(eq(dmsDocuments.id, file.documentId));

    await logAction("download", "file", fileId, userId);

    if (file.publicUrl) {
      return c.redirect(file.publicUrl);
    }

    return c.json({ url: `/storage/${file.storagePath}` });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RELACIONES
  // ═══════════════════════════════════════════════════════════════════════════

  router.post("/documents/:id/relations", async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    const userId = getUserId(c);

    if (!body.targetDocumentId || !body.relationType) {
      return c.json({ error: "targetDocumentId and relationType are required" }, 400);
    }

    const [relation] = await dbInstance
      .insert(dmsDocumentRelations)
      .values({
        sourceDocumentId: id,
        targetDocumentId: body.targetDocumentId,
        relationType: body.relationType,
        description: body.description,
      })
      .returning();

    await logAction("create", "relation", relation.id, userId);
    return c.json(relation, 201);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACKNOWLEDGMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  router.post("/documents/:id/acknowledge", async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    const userId = getUserId(c);

    const [document] = await dbInstance
      .select({ currentVersionId: dmsDocuments.currentVersionId })
      .from(dmsDocuments)
      .where(eq(dmsDocuments.id, id))
      .limit(1);

    if (!document) return c.json({ error: "Document not found" }, 404);
    if (!document.currentVersionId) return c.json({ error: "No published version" }, 400);

    const [ack] = await dbInstance
      .insert(dmsDocumentAcknowledgments)
      .values({
        documentId: id,
        versionId: document.currentVersionId,
        userId,
        notes: body.notes,
      })
      .onConflictDoNothing()
      .returning();

    return c.json(ack || { alreadyAcknowledged: true });
  });

  router.get("/documents/:id/acknowledgments", async (c) => {
    const { id } = c.req.param();

    const acks = await dbInstance
      .select()
      .from(dmsDocumentAcknowledgments)
      .where(eq(dmsDocumentAcknowledgments.documentId, id))
      .orderBy(desc(dmsDocumentAcknowledgments.acknowledgedAt));

    return c.json({ docs: acks });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMENTS (Fase 2)
  // ═══════════════════════════════════════════════════════════════════════════

  router.get("/documents/:id/comments", async (c) => {
    const { id } = c.req.param();
    const query = c.req.query();
    const limit = Math.min(parseInt(query.limit || "50"), 100);
    const page = parseInt(query.page || "1");
    const offset = (page - 1) * limit;

    const conditions: any[] = [
      eq(dmsDocumentComments.documentId, id),
      isNull(dmsDocumentComments.parentId),
    ];
    if (query.resolved === "true") {
      conditions.push(sql`${dmsDocumentComments.resolvedAt} IS NOT NULL`);
    } else if (query.resolved === "false") {
      conditions.push(sql`${dmsDocumentComments.resolvedAt} IS NULL`);
    }

    const [countResult] = await dbInstance
      .select({ count: sql<number>`count(*)::int` })
      .from(dmsDocumentComments)
      .where(and(...conditions));

    const total = countResult?.count || 0;

    const comments = await dbInstance
      .select()
      .from(dmsDocumentComments)
      .where(and(...conditions))
      .orderBy(asc(dmsDocumentComments.createdAt))
      .limit(limit)
      .offset(offset);

    // Obtener replies para cada comentario
    const commentIds = comments.map((comment: any) => comment.id);
    let replies: any[] = [];
    if (commentIds.length > 0) {
      replies = await dbInstance
        .select()
        .from(dmsDocumentComments)
        .where(and(
          inArray(dmsDocumentComments.parentId, commentIds),
          eq(dmsDocumentComments.documentId, id)
        ))
        .orderBy(asc(dmsDocumentComments.createdAt));
    }

    const repliesMap = new Map<string, any[]>();
    for (const reply of replies) {
      if (!reply.parentId) continue;
      const list = repliesMap.get(reply.parentId) || [];
      list.push(reply);
      repliesMap.set(reply.parentId, list);
    }

    return c.json({
      docs: comments.map((comment: any) => ({
        ...comment,
        replies: repliesMap.get(comment.id) || [],
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  });

  router.post("/documents/:id/comments", async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    const userId = getUserId(c);

    if (!body.content) return c.json({ error: "Content is required" }, 400);

    const [comment] = await dbInstance
      .insert(dmsDocumentComments)
      .values({
        documentId: id,
        versionId: body.versionId || null,
        parentId: body.parentId || null,
        userId,
        content: body.content,
      })
      .returning();

    return c.json(comment, 201);
  });

  router.patch("/comments/:commentId", async (c) => {
    const { commentId } = c.req.param();
    const body = await c.req.json();
    const userId = getUserId(c);

    const [existing] = await dbInstance
      .select()
      .from(dmsDocumentComments)
      .where(eq(dmsDocumentComments.id, commentId))
      .limit(1);

    if (!existing) return c.json({ error: "Comment not found" }, 404);
    if (existing.userId !== userId) return c.json({ error: "Forbidden" }, 403);

    const updates: any = { updatedAt: new Date() };
    if (body.content !== undefined) updates.content = body.content;

    const [updated] = await dbInstance
      .update(dmsDocumentComments)
      .set(updates)
      .where(eq(dmsDocumentComments.id, commentId))
      .returning();

    return c.json(updated);
  });

  router.delete("/comments/:commentId", async (c) => {
    const { commentId } = c.req.param();
    const userId = getUserId(c);

    const [existing] = await dbInstance
      .select()
      .from(dmsDocumentComments)
      .where(eq(dmsDocumentComments.id, commentId))
      .limit(1);

    if (!existing) return c.json({ error: "Comment not found" }, 404);
    if (existing.userId !== userId) return c.json({ error: "Forbidden" }, 403);

    await dbInstance
      .delete(dmsDocumentComments)
      .where(eq(dmsDocumentComments.id, commentId));

    return c.json({ success: true });
  });

  router.post("/comments/:commentId/resolve", async (c) => {
    const { commentId } = c.req.param();

    const [existing] = await dbInstance
      .select()
      .from(dmsDocumentComments)
      .where(eq(dmsDocumentComments.id, commentId))
      .limit(1);

    if (!existing) return c.json({ error: "Comment not found" }, 404);

    const [updated] = await dbInstance
      .update(dmsDocumentComments)
      .set({ resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(dmsDocumentComments.id, commentId))
      .returning();

    return c.json(updated);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BACKLINKS (Fase 2)
  // ═══════════════════════════════════════════════════════════════════════════

  router.get("/documents/:id/backlinks", async (c) => {
    const { id } = c.req.param();

    const [document] = await dbInstance
      .select({ code: dmsDocuments.code, slug: dmsDocuments.slug })
      .from(dmsDocuments)
      .where(eq(dmsDocuments.id, id))
      .limit(1);

    if (!document) return c.json({ error: "Document not found" }, 404);

    // Buscar documentos cuyo contenido contenga [[CODE]] o [[slug]]
    const patterns = [`[[${document.code}]]`, `[[${document.slug}]]`];
    const backlinks = await dbInstance
      .select({
        id: dmsDocuments.id,
        code: dmsDocuments.code,
        title: dmsDocuments.title,
        slug: dmsDocuments.slug,
        currentVersionNumber: dmsDocuments.currentVersionNumber,
      })
      .from(dmsDocuments)
      .innerJoin(dmsDocumentVersions, eq(dmsDocumentVersions.documentId, dmsDocuments.id))
      .where(and(
        eq(dmsDocuments.isActive, true),
        eq(dmsDocumentVersions.status, "published"),
        or(
          like(dmsDocumentVersions.content, `%${patterns[0]}%`),
          like(dmsDocumentVersions.content, `%${patterns[1]}%`)
        )
      ))
      .groupBy(dmsDocuments.id);

    return c.json({ docs: backlinks });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORT (Fase 2)
  // ═══════════════════════════════════════════════════════════════════════════

  router.get("/versions/:versionId/export/html", async (c) => {
    const { versionId } = c.req.param();

    const [version] = await dbInstance
      .select()
      .from(dmsDocumentVersions)
      .where(eq(dmsDocumentVersions.id, versionId))
      .limit(1);

    if (!version) return c.json({ error: "Version not found" }, 404);

    const [document] = await dbInstance
      .select()
      .from(dmsDocuments)
      .where(eq(dmsDocuments.id, version.documentId))
      .limit(1);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${document?.title || "Document"}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;line-height:1.6;max-width:800px;margin:2rem auto;padding:0 1rem;color:#333}
h1,h2,h3,h4,h5,h6{color:#111;margin-top:1.5rem}
pre{background:#f4f4f4;padding:1rem;border-radius:4px;overflow-x:auto}
blockquote{border-left:4px solid #ddd;margin:0;padding-left:1rem;color:#666}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}
</style>
</head>
<body>
${version.contentFormat === "markdown" ? `<pre>${version.content}</pre>` : version.content}
</body>
</html>`;

    c.header("Content-Type", "text/html; charset=utf-8");
    return c.body(html);
  });

  router.get("/versions/:versionId/export/md", async (c) => {
    const { versionId } = c.req.param();

    const [version] = await dbInstance
      .select()
      .from(dmsDocumentVersions)
      .where(eq(dmsDocumentVersions.id, versionId))
      .limit(1);

    if (!version) return c.json({ error: "Version not found" }, 404);

    const markdown = version.contentFormat === "markdown"
      ? version.content
      : `<!-- Original format: ${version.contentFormat} -->\n\n${version.content}`;

    c.header("Content-Type", "text/markdown; charset=utf-8");
    return c.body(markdown || "");
  });

  router.get("/categories/:id/export/zip", async (c) => {
    const { id } = c.req.param();

    const category = await dbInstance
      .select()
      .from(dmsCategories)
      .where(eq(dmsCategories.id, id))
      .limit(1);

    if (!category.length) return c.json({ error: "Category not found" }, 404);

    const docs = await dbInstance
      .select()
      .from(dmsDocuments)
      .where(and(
        eq(dmsDocuments.categoryId, id),
        eq(dmsDocuments.isActive, true),
        eq(dmsDocuments.status, "published")
      ));

    const files: { path: string; content: string; contentType: string }[] = [];

    for (const doc of docs) {
      const [version] = await dbInstance
        .select()
        .from(dmsDocumentVersions)
        .where(and(
          eq(dmsDocumentVersions.documentId, doc.id),
          eq(dmsDocumentVersions.isLatest, true)
        ))
        .limit(1);

      if (!version) continue;

      files.push({
        path: `${doc.slug}/metadata.json`,
        content: JSON.stringify({
          id: doc.id,
          code: doc.code,
          title: doc.title,
          slug: doc.slug,
          type: doc.type,
          versionNumber: version.versionNumber,
          publishedAt: doc.publishedAt,
        }, null, 2),
        contentType: "application/json",
      });

      files.push({
        path: `${doc.slug}/content.md`,
        content: version.content || "",
        contentType: "text/markdown",
      });
    }

    // Nota: en un backend headless, el ZIP real se genera en el frontend usando JSZip
    // Este endpoint devuelve la estructura lista para empaquetar
    return c.json({
      manifest: {
        format: "gremius-dms-export",
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        category: category[0],
        documentCount: docs.length,
      },
      files,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DIAGRAMS (Fase 3)
  // ═══════════════════════════════════════════════════════════════════════════

  router.get("/versions/:versionId/diagrams", async (c) => {
    const { versionId } = c.req.param();
    const diagrams = await dbInstance
      .select()
      .from(dmsDocumentDiagrams)
      .where(eq(dmsDocumentDiagrams.versionId, versionId))
      .orderBy(asc(dmsDocumentDiagrams.name));
    return c.json({ docs: diagrams });
  });

  router.post("/versions/:versionId/diagrams", async (c) => {
    const { versionId } = c.req.param();
    const body = await c.req.json();

    if (!body.name) return c.json({ error: "Name is required" }, 400);

    const [diagram] = await dbInstance
      .insert(dmsDocumentDiagrams)
      .values({
        versionId,
        name: body.name,
        sourceXml: body.sourceXml || null,
        sourceJson: body.sourceJson || null,
        renderedSvg: body.renderedSvg || null,
        mediaId: body.mediaId || null,
      })
      .returning();

    return c.json(diagram, 201);
  });

  router.patch("/diagrams/:diagramId", async (c) => {
    const { diagramId } = c.req.param();
    const body = await c.req.json();

    const updates: any = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.sourceXml !== undefined) updates.sourceXml = body.sourceXml;
    if (body.sourceJson !== undefined) updates.sourceJson = body.sourceJson;
    if (body.renderedSvg !== undefined) updates.renderedSvg = body.renderedSvg;
    if (body.mediaId !== undefined) updates.mediaId = body.mediaId;

    const [updated] = await dbInstance
      .update(dmsDocumentDiagrams)
      .set(updates)
      .where(eq(dmsDocumentDiagrams.id, diagramId))
      .returning();

    if (!updated) return c.json({ error: "Diagram not found" }, 404);
    return c.json(updated);
  });

  router.delete("/diagrams/:diagramId", async (c) => {
    const { diagramId } = c.req.param();
    await dbInstance
      .delete(dmsDocumentDiagrams)
      .where(eq(dmsDocumentDiagrams.id, diagramId));
    return c.json({ success: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPORT (Fase 3)
  // ═══════════════════════════════════════════════════════════════════════════

  router.post("/import", async (c) => {
    const body = await c.req.json();
    const userId = getUserId(c);

    if (!body.manifest || !body.files) {
      return c.json({ error: " manifest and files are required" }, 400);
    }

    const results = {
      categoriesCreated: 0,
      documentsCreated: 0,
      versionsCreated: 0,
      errors: [] as string[],
    };

    // Mapear categorías por slug para reusar o crear

    for (const file of body.files) {
      try {
        if (file.path.endsWith("/metadata.json")) {
          const meta = JSON.parse(file.content);
          const slugParts = file.path.split("/");
          const docSlug = slugParts[slugParts.length - 2];

          // Crear documento
          const code = meta.code || generateDocumentCode(meta.type || "manual", null);
          const [doc] = await dbInstance
            .insert(dmsDocuments)
            .values({
              code,
              title: meta.title || docSlug,
              slug: docSlug,
              type: meta.type || "manual",
              status: "draft",
              ownerId: userId,
              createdById: userId,
              visibility: "restricted",
            } as NewDmsDocument)
            .returning();

          results.documentsCreated++;

          // Crear versión inicial
          const contentFile = body.files.find(
            (f: any) => f.path === `${docSlug}/content.md`
          );
          if (contentFile) {
            await dbInstance.insert(dmsDocumentVersions).values({
              documentId: doc.id,
              versionNumber: meta.versionNumber || "1.0.0",
              content: contentFile.content,
              contentFormat: "markdown",
              changelog: "Imported",
              status: "draft",
              createdById: userId,
            });
            results.versionsCreated++;
          }
        }
      } catch (err: any) {
        results.errors.push(`${file.path}: ${err.message}`);
      }
    }

    return c.json({ success: true, results });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT LOG
  // ═══════════════════════════════════════════════════════════════════════════

  router.get("/audit-log", async (c) => {
    const query = c.req.query();
    const limit = Math.min(parseInt(query.limit || "50"), 100);
    const page = parseInt(query.page || "1");
    const offset = (page - 1) * limit;

    let conditions: any[] = [];

    if (query.documentId) conditions.push(eq(dmsAccessLog.documentId, query.documentId));
    if (query.userId) conditions.push(eq(dmsAccessLog.userId, query.userId));
    if (query.action) conditions.push(eq(dmsAccessLog.action, query.action));

    const logs = await dbInstance
      .select()
      .from(dmsAccessLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(dmsAccessLog.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({ docs: logs });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WORKFLOW NOTIFICATIONS (Quick Win)
  // ═══════════════════════════════════════════════════════════════════════════

  router.get("/notifications", async (c) => {
    const userId = getUserId(c);
    const query = c.req.query();
    const limit = Math.min(parseInt(query.limit || "50"), 100);
    const page = parseInt(query.page || "1");
    const offset = (page - 1) * limit;

    const conditions: any[] = [eq(dmsWorkflowNotifications.userId, userId)];
    if (query.unreadOnly === "true") {
      conditions.push(eq(dmsWorkflowNotifications.read, false));
    }

    const [countResult] = await dbInstance
      .select({ count: sql<number>`count(*)::int` })
      .from(dmsWorkflowNotifications)
      .where(and(...conditions));

    const total = countResult?.count || 0;

    const notifications = await dbInstance
      .select()
      .from(dmsWorkflowNotifications)
      .where(and(...conditions))
      .orderBy(desc(dmsWorkflowNotifications.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      docs: notifications,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  });

  router.post("/notifications/:id/read", async (c) => {
    const { id } = c.req.param();
    const userId = getUserId(c);

    const [updated] = await dbInstance
      .update(dmsWorkflowNotifications)
      .set({ read: true })
      .where(and(
        eq(dmsWorkflowNotifications.id, id),
        eq(dmsWorkflowNotifications.userId, userId)
      ))
      .returning();

    if (!updated) return c.json({ error: "Notification not found" }, 404);
    return c.json(updated);
  });

  router.post("/notifications/read-all", async (c) => {
    const userId = getUserId(c);

    await dbInstance
      .update(dmsWorkflowNotifications)
      .set({ read: true })
      .where(and(
        eq(dmsWorkflowNotifications.userId, userId),
        eq(dmsWorkflowNotifications.read, false)
      ));

    return c.json({ success: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER / PUBLIC READER (Fase 1)
  // ═══════════════════════════════════════════════════════════════════════════

  router.get("/render/:slug", async (c) => {
    const { slug } = c.req.param();
    const userId = getUserId(c);
    const userRoleIds: string[] = c.get("userRoleIds") || [];
    const userDepartmentId: string | null = c.get("userDepartmentId") || null;

    // 1. Buscar documento por slug
    let [document] = await dbInstance
      .select()
      .from(dmsDocuments)
      .where(and(eq(dmsDocuments.slug, slug), eq(dmsDocuments.isActive, true)))
      .limit(1);

    // 2. Si no existe, buscar en slug history y redirigir
    if (!document) {
      const [history] = await dbInstance
        .select({ documentId: dmsDocumentSlugHistory.documentId })
        .from(dmsDocumentSlugHistory)
        .where(eq(dmsDocumentSlugHistory.oldSlug, slug))
        .limit(1);

      if (history) {
        const [doc] = await dbInstance
          .select({ slug: dmsDocuments.slug })
          .from(dmsDocuments)
          .where(eq(dmsDocuments.id, history.documentId))
          .limit(1);
        if (doc) {
          return c.redirect(`/api/dms/render/${doc.slug}`, 308);
        }
      }
      return c.json({ error: "Document not found" }, 404);
    }

    // 3. Verificar ACL
    if (!canAccessDocument(document, userId, userRoleIds, userDepartmentId)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    // 4. Obtener versión publicada activa
    const [version] = await dbInstance
      .select()
      .from(dmsDocumentVersions)
      .where(and(
        eq(dmsDocumentVersions.documentId, document.id),
        eq(dmsDocumentVersions.status, "published"),
        eq(dmsDocumentVersions.isLatest, true)
      ))
      .limit(1);

    if (!version) {
      return c.json({ error: "No published version available" }, 404);
    }

    // 5. Generar TOC e inyectar IDs
    const toc = generateToc(version.content, version.contentFormat || "markdown");
    let renderedContent = version.content || "";
    if (version.contentFormat === "html") {
      renderedContent = injectHeaderIds(renderedContent);
    }

    // 5b. Inyectar diagramas embebidos
    renderedContent = await injectDiagrams(renderedContent, version.id);

    // 5c. Resolver wiki-links en el contenido para el frontend
    const wikiLinks = await validateWikiLinks(version.content);

    // 6. Navegación contextual (prev/next en misma categoría)
    const siblings = await dbInstance
      .select({ id: dmsDocuments.id, slug: dmsDocuments.slug, title: dmsDocuments.title })
      .from(dmsDocuments)
      .where(and(
        eq(dmsDocuments.categoryId, document.categoryId),
        eq(dmsDocuments.isActive, true),
        eq(dmsDocuments.status, "published")
      ))
      .orderBy(asc(dmsDocuments.publishedAt));

    const currentIndex = siblings.findIndex((s: any) => s.id === document.id);
    const prev = currentIndex > 0 ? siblings[currentIndex - 1] : null;
    const next = currentIndex >= 0 && currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;

    // 7. Breadcrumb
    const breadcrumb = await buildBreadcrumb(document.categoryId);

    // 8. Incrementar viewCount (con deduplicación ya implementada en quick wins)
    const [recentView] = await dbInstance
      .select({ id: dmsAccessLog.id })
      .from(dmsAccessLog)
      .where(and(
        eq(dmsAccessLog.documentId, document.id),
        eq(dmsAccessLog.userId, userId),
        eq(dmsAccessLog.action, "view"),
        gte(dmsAccessLog.createdAt, sql`NOW() - INTERVAL '5 minutes'`)
      ))
      .limit(1);

    if (!recentView) {
      await dbInstance
        .update(dmsDocuments)
        .set({ viewCount: sql`${dmsDocuments.viewCount} + 1` })
        .where(eq(dmsDocuments.id, document.id));
      await logAction("view", "document", document.id, userId);
    }

    return c.json({
      document: {
        id: document.id,
        code: document.code,
        title: document.title,
        slug: document.slug,
        description: document.description,
        type: document.type,
        publishedAt: document.publishedAt,
        versionNumber: version.versionNumber,
        changelog: version.changelog,
        requiresReview: computeRequiresReview(document),
      },
      category: document.categoryId ? {
        id: document.categoryId,
        name: breadcrumb[breadcrumb.length - 1]?.name || null,
        slug: breadcrumb[breadcrumb.length - 1]?.slug || null,
        breadcrumb,
      } : null,
      content: renderedContent,
      contentFormat: version.contentFormat,
      toc,
      wikiLinks,
      navigation: { prev, next },
    });
  });

  // Render por código inmutable
  router.get("/render/code/:code", async (c) => {
    const { code } = c.req.param();
    // Redirigir a búsqueda por slug internamente
    const [document] = await dbInstance
      .select({ slug: dmsDocuments.slug })
      .from(dmsDocuments)
      .where(and(eq(dmsDocuments.code, code), eq(dmsDocuments.isActive, true)))
      .limit(1);
    if (!document) return c.json({ error: "Document not found" }, 404);
    return c.redirect(`/api/dms/render/${document.slug}`, 307);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STATS & DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  router.get("/stats", async (c) => {
    const [docStats] = await dbInstance
      .select({
        total: sql<number>`count(*)::int`,
        published: sql<number>`count(*) filter (where status = 'published')::int`,
        draft: sql<number>`count(*) filter (where status = 'draft')::int`,
        archived: sql<number>`count(*) filter (where status = 'archived')::int`,
      })
      .from(dmsDocuments)
      .where(eq(dmsDocuments.isActive, true));

    const [versionStats] = await dbInstance
      .select({
        total: sql<number>`count(*)::int`,
        totalSize: sql<number>`sum(total_size_bytes)::int`,
      })
      .from(dmsDocumentVersions);

    const byType = await dbInstance
      .select({
        type: dmsDocuments.type,
        count: sql<number>`count(*)::int`,
      })
      .from(dmsDocuments)
      .where(eq(dmsDocuments.isActive, true))
      .groupBy(dmsDocuments.type);

    // Documentos próximos a revisión
    const upcomingReviews = await dbInstance
      .select({
        id: dmsDocuments.id,
        code: dmsDocuments.code,
        title: dmsDocuments.title,
        reviewDueDate: dmsDocuments.reviewDueDate,
      })
      .from(dmsDocuments)
      .where(and(
        eq(dmsDocuments.isActive, true),
        eq(dmsDocuments.status, "published"),
        gte(dmsDocuments.reviewDueDate, new Date()),
        lte(dmsDocuments.reviewDueDate, sql`NOW() + INTERVAL '30 days'`)
      ))
      .orderBy(asc(dmsDocuments.reviewDueDate))
      .limit(10);

    const [pendingApprovals] = await dbInstance
      .select({ count: sql<number>`count(*)::int` })
      .from(dmsDocumentVersions)
      .where(eq(dmsDocumentVersions.status, "review_pending"));

    return c.json({
      documents: docStats,
      versions: versionStats,
      byType,
      upcomingReviews,
      pendingApprovals: pendingApprovals?.count || 0,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH (Fase 1 - Full-text search mejorado)
  // ═══════════════════════════════════════════════════════════════════════════

  router.get("/search", async (c) => {
    const q = c.req.query("q");
    if (!q || q.length < 2) {
      return c.json({ error: "Query must be at least 2 characters" }, 400);
    }

    const limit = Math.min(parseInt(c.req.query("limit") || "20"), 50);
    const queryFilters = c.req.query();

    // Fallback: búsqueda por LIKE en campos del documento (sinónimo simple)
    const searchTerm = `%${q.toLowerCase()}%`;
    const likeConditions = or(
      like(sql`LOWER(${dmsDocuments.title})`, searchTerm),
      like(sql`LOWER(${dmsDocuments.code})`, searchTerm),
      like(sql`LOWER(${dmsDocuments.description})`, searchTerm)
    );

    // Construir filtros adicionales
    const docFilters: any[] = [eq(dmsDocuments.isActive, true)];
    if (queryFilters.categoryId) docFilters.push(eq(dmsDocuments.categoryId, queryFilters.categoryId));
    if (queryFilters.type) docFilters.push(eq(dmsDocuments.type, queryFilters.type as any));
    if (queryFilters.status) docFilters.push(eq(dmsDocuments.status, queryFilters.status as any));

    // Búsqueda full-text en contenido de versiones publicadas usando raw SQL
    // Nota: requiere índice GIN creado en migración 0001_slug_history_and_fts.sql
    const ftsResults = await dbInstance.execute(sql`
      SELECT
        d.id,
        d.code,
        d.title,
        d.slug,
        d.description,
        d.type,
        d.status,
        d.current_version_number as "currentVersionNumber",
        v.version_number as "versionNumber",
        ts_rank(to_tsvector('spanish', COALESCE(v.content, '')), plainto_tsquery('spanish', ${q})) as rank,
        ts_headline('spanish', COALESCE(v.content, ''), plainto_tsquery('spanish', ${q}), 'StartSel=<mark>,StopSel=</mark>,MaxWords=35,MinWords=15') as snippet
      FROM dms_documents d
      INNER JOIN dms_document_versions v ON v.document_id = d.id
      WHERE d.is_active = true
        AND v.status = 'published'
        AND v.is_latest = true
        AND to_tsvector('spanish', COALESCE(v.content, '')) @@ plainto_tsquery('spanish', ${q})
      ORDER BY rank DESC
      LIMIT ${limit}
    `);

    // Búsqueda por LIKE en metadatos del documento (fallback si FTS no devuelve nada)
    let documentResults = ftsResults.rows || [];

    if (documentResults.length === 0) {
      const docs = await dbInstance
        .select({
          id: dmsDocuments.id,
          code: dmsDocuments.code,
          title: dmsDocuments.title,
          slug: dmsDocuments.slug,
          description: dmsDocuments.description,
          type: dmsDocuments.type,
          status: dmsDocuments.status,
          currentVersionNumber: dmsDocuments.currentVersionNumber,
        })
        .from(dmsDocuments)
        .where(and(...docFilters, likeConditions))
        .limit(limit);
      documentResults = docs;
    }

    // Búsqueda en categorías
    const categories = await dbInstance
      .select({ id: dmsCategories.id, name: dmsCategories.name, description: dmsCategories.description })
      .from(dmsCategories)
      .where(and(
        eq(dmsCategories.isActive, true),
        or(
          like(sql`LOWER(${dmsCategories.name})`, searchTerm),
          like(sql`LOWER(${dmsCategories.description})`, searchTerm)
        )
      ))
      .limit(10);

    return c.json({
      documents: documentResults,
      categories,
      total: documentResults.length + categories.length,
      searchType: documentResults.length > 0 && (documentResults[0] as any).rank !== undefined ? "fulltext" : "fallback",
    });
  });

  return router;
}

export { createDMSRouter as dmsRoutes };
