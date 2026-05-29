/**
 * Gremius CRM - API Routes (Hono)
 * 
 * Complete CRM API with:
 * - Companies CRUD
 * - Contacts CRUD  
 * - Pipelines & Stages CRUD
 * - Deals CRUD + Kanban operations
 * - Activities CRUD
 */

import { Hono } from "hono";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import type { GrimoireContext } from "@gremius/shared";
import {
  crmCompanies,
  crmContacts,
  crmPipelines,
  crmPipelineStages,
  crmDeals,
  crmActivities,
  crmEntityConfigs,
  crmStageTransitions,
  crmDocuments,
  type DealMovePayload,
  type StageEntryRequirements,
  type ValidationResult,
} from "./crm.schema";

/**
 * Factory function that creates CRM routes with dependency injection
 */
export function createCRMRouter(ctx: GrimoireContext): Hono {
  const crmRoutes = new Hono();
  const { db, auth, logger } = ctx;

  // Helper for auth middleware
  const requireAuth = auth.requireAuth;

  // Apply authentication to all routes
  crmRoutes.use("/*", requireAuth);

  // ============================================================================
  // COMPANIES
  // ============================================================================

  /**
   * GET /api/crm/companies
   * List companies with pagination and filters
   */
  crmRoutes.get("/companies", async (c) => {
    try {
      const orgId = c.req.query("organizationId");
      const industry = c.req.query("industry");
      const search = c.req.query("search");
      const limit = Math.min(Number(c.req.query("limit")) || 50, 100);
      const offset = Number(c.req.query("offset")) || 0;

      let query = db.instance.select().from(crmCompanies);

      if (orgId) {
        query = query.where(eq(crmCompanies.organizationId, orgId));
      }

      if (industry) {
        query = query.where(eq(crmCompanies.industry, industry));
      }

      if (search) {
        query = query.where(
          sql`${crmCompanies.name} ILIKE ${`%${search}%`} OR ${crmCompanies.domain} ILIKE ${`%${search}%`}`
        );
      }

      const [companies, countResult] = await Promise.all([
        query.orderBy(desc(crmCompanies.updatedAt)).limit(limit).offset(offset),
        db.instance
          .select({ count: sql<number>`count(*)` })
          .from(crmCompanies)
          .where(
            orgId ? eq(crmCompanies.organizationId, orgId) : undefined
          ),
      ]);

      // Transform logo IDs to URLs
      const companiesWithLogo = companies.map((company: typeof crmCompanies.$inferSelect) => ({
        ...company,
        logoUrl: company.logoId ? `/api/media/preset/${company.logoId}/small` : null,
      }));

      return c.json({
        success: true,
        data: companiesWithLogo,
        pagination: {
          total: countResult[0]?.count ?? 0,
          limit,
          offset,
        },
      });
    } catch (error) {
      logger.error("[CRM] Error fetching companies:", { error });
      return c.json({ success: false, error: "Failed to fetch companies" }, 500);
    }
  });

  /**
   * POST /api/crm/companies
   * Create a new company
   */
  crmRoutes.post("/companies", async (c) => {
    try {
      const body = await c.req.json();

      const [company] = await db.instance
        .insert(crmCompanies)
        .values({
          name: body.name,
          domain: body.domain,
          industry: body.industry,
          size: body.size,
          website: body.website,
          linkedin: body.linkedin,
          address: body.address,
          city: body.city,
          country: body.country,
          phone: body.phone,
          description: body.description,
          logoId: body.logoId,
          annualRevenue: body.annualRevenue,
          metadata: body.metadata || {},
          createdBy: body.createdBy,
          organizationId: body.organizationId,
        })
        .returning();

      logger.info("[CRM] Company created", { companyId: company.id });
      return c.json({
        success: true,
        data: {
          ...company,
          logoUrl: company.logoId ? `/api/media/preset/${company.logoId}/small` : null,
        }
      }, 201);
    } catch (error) {
      logger.error("[CRM] Error creating company:", { error });
      return c.json({ success: false, error: "Failed to create company" }, 500);
    }
  });

  /**
   * GET /api/crm/companies/:id
   * Get company with contacts count
   */
  crmRoutes.get("/companies/:id", async (c) => {
    try {
      const companyId = c.req.param("id");

      const [company] = await db.instance
        .select()
        .from(crmCompanies)
        .where(eq(crmCompanies.id, companyId));

      if (!company) {
        return c.json({ success: false, error: "Company not found" }, 404);
      }

      // Get contacts count
      const [contactsCount] = await db.instance
        .select({ count: sql<number>`count(*)` })
        .from(crmContacts)
        .where(eq(crmContacts.companyId, companyId));

      // Get deals count and total value
      const [dealsAgg] = await db.instance
        .select({
          count: sql<number>`count(*)`,
          totalValue: sql<number>`coalesce(sum(${crmDeals.value}), 0)`,
        })
        .from(crmDeals)
        .where(eq(crmDeals.companyId, companyId));

      return c.json({
        success: true,
        data: {
          ...company,
          logoUrl: company.logoId ? `/api/media/preset/${company.logoId}/small` : null,
          stats: {
            contactsCount: contactsCount.count,
            dealsCount: dealsAgg.count,
            totalDealValue: dealsAgg.totalValue,
          },
        },
      });
    } catch (error) {
      logger.error("[CRM] Error fetching company:", { error });
      return c.json({ success: false, error: "Failed to fetch company" }, 500);
    }
  });

  /**
   * PATCH /api/crm/companies/:id
   * Update company
   */
  crmRoutes.patch("/companies/:id", async (c) => {
    try {
      const companyId = c.req.param("id");
      const body = await c.req.json();

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      const fields = [
        "name", "domain", "industry", "size", "website", "linkedin",
        "address", "city", "country", "phone", "description", "logoId",
        "annualRevenue", "metadata"
      ];

      for (const field of fields) {
        if (body[field] !== undefined) {
          updateData[field] = body[field];
        }
      }

      const [company] = await db.instance
        .update(crmCompanies)
        .set(updateData)
        .where(eq(crmCompanies.id, companyId))
        .returning();

      if (!company) {
        return c.json({ success: false, error: "Company not found" }, 404);
      }

      return c.json({
        success: true,
        data: {
          ...company,
          logoUrl: company.logoId ? `/api/media/preset/${company.logoId}/small` : null,
        }
      });
    } catch (error) {
      logger.error("[CRM] Error updating company:", { error });
      return c.json({ success: false, error: "Failed to update company" }, 500);
    }
  });

  /**
   * DELETE /api/crm/companies/:id
   * Delete company (contacts will have companyId set to null)
   */
  crmRoutes.delete("/companies/:id", async (c) => {
    try {
      const companyId = c.req.param("id");

      await db.instance
        .delete(crmCompanies)
        .where(eq(crmCompanies.id, companyId));

      logger.info("[CRM] Company deleted", { companyId });
      return c.json({ success: true });
    } catch (error) {
      logger.error("[CRM] Error deleting company:", { error });
      return c.json({ success: false, error: "Failed to delete company" }, 500);
    }
  });

  // ============================================================================
  // CONTACTS
  // ============================================================================

  /**
   * GET /api/crm/contacts
   * List contacts with pagination and filters
   */
  crmRoutes.get("/contacts", async (c) => {
    try {
      const orgId = c.req.query("organizationId");
      const companyId = c.req.query("companyId");
      const status = c.req.query("status");
      const assignedTo = c.req.query("assignedTo");
      const search = c.req.query("search");
      const limit = Math.min(Number(c.req.query("limit")) || 50, 100);
      const offset = Number(c.req.query("offset")) || 0;

      let query = db.instance.select().from(crmContacts);

      const conditions = [];
      if (orgId) conditions.push(eq(crmContacts.organizationId, orgId));
      if (companyId) conditions.push(eq(crmContacts.companyId, companyId));
      if (status) conditions.push(eq(crmContacts.status, status as any));
      if (assignedTo) conditions.push(eq(crmContacts.assignedTo, assignedTo));

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      if (search) {
        query = query.where(
          sql`${crmContacts.firstName} ILIKE ${`%${search}%`} OR 
              ${crmContacts.lastName} ILIKE ${`%${search}%`} OR 
              ${crmContacts.email} ILIKE ${`%${search}%`}`
        );
      }

      const [contacts, countResult] = await Promise.all([
        query.orderBy(desc(crmContacts.updatedAt)).limit(limit).offset(offset),
        db.instance
          .select({ count: sql<number>`count(*)` })
          .from(crmContacts)
          .where(conditions.length > 0 ? and(...conditions) : undefined),
      ]);

      // Transform avatar IDs to URLs
      const contactsWithAvatar = contacts.map((contact: typeof crmContacts.$inferSelect) => ({
        ...contact,
        avatarUrl: contact.avatarId ? `/api/media/preset/${contact.avatarId}/thumbnail` : null,
      }));

      return c.json({
        success: true,
        data: contactsWithAvatar,
        pagination: {
          total: countResult[0]?.count ?? 0,
          limit,
          offset,
        },
      });
    } catch (error) {
      logger.error("[CRM] Error fetching contacts:", { error });
      return c.json({ success: false, error: "Failed to fetch contacts" }, 500);
    }
  });

  /**
   * POST /api/crm/contacts
   * Create a new contact
   */
  crmRoutes.post("/contacts", async (c) => {
    try {
      const body = await c.req.json();

      const [contact] = await db.instance
        .insert(crmContacts)
        .values({
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email,
          phone: body.phone,
          mobile: body.mobile,
          jobTitle: body.jobTitle,
          department: body.department,
          avatarId: body.avatarId,
          status: body.status || "lead",
          source: body.source,
          score: body.score || 0,
          companyId: body.companyId,
          assignedTo: body.assignedTo,
          linkedin: body.linkedin,
          twitter: body.twitter,
          address: body.address,
          city: body.city,
          country: body.country,
          notes: body.notes,
          tags: body.tags || [],
          customFields: body.customFields || {},
          metadata: body.metadata || {},
          createdBy: body.createdBy,
          organizationId: body.organizationId,
        })
        .returning();

      logger.info("[CRM] Contact created", { contactId: contact.id });
      return c.json({
        success: true,
        data: {
          ...contact,
          avatarUrl: contact.avatarId ? `/api/media/preset/${contact.avatarId}/thumbnail` : null,
        }
      }, 201);
    } catch (error) {
      logger.error("[CRM] Error creating contact:", { error });
      return c.json({ success: false, error: "Failed to create contact" }, 500);
    }
  });

  /**
   * GET /api/crm/contacts/:id
   * Get contact with company info
   */
  crmRoutes.get("/contacts/:id", async (c) => {
    try {
      const contactId = c.req.param("id");

      const [contact] = await db.instance
        .select()
        .from(crmContacts)
        .where(eq(crmContacts.id, contactId));

      if (!contact) {
        return c.json({ success: false, error: "Contact not found" }, 404);
      }

      // Get company if exists
      let company = null;
      if (contact.companyId) {
        const [co] = await db.instance
          .select()
          .from(crmCompanies)
          .where(eq(crmCompanies.id, contact.companyId));
        company = co || null;
      }

      // Get deals count
      const [dealsAgg] = await db.instance
        .select({
          count: sql<number>`count(*)`,
          totalValue: sql<number>`coalesce(sum(${crmDeals.value}), 0)`,
        })
        .from(crmDeals)
        .where(eq(crmDeals.contactId, contactId));

      return c.json({
        success: true,
        data: {
          ...contact,
          avatarUrl: contact.avatarId ? `/api/media/preset/${contact.avatarId}/thumbnail` : null,
          company,
          stats: {
            dealsCount: dealsAgg.count,
            totalDealValue: dealsAgg.totalValue,
          },
        },
      });
    } catch (error) {
      logger.error("[CRM] Error fetching contact:", { error });
      return c.json({ success: false, error: "Failed to fetch contact" }, 500);
    }
  });

  /**
   * PATCH /api/crm/contacts/:id
   * Update contact
   */
  crmRoutes.patch("/contacts/:id", async (c) => {
    try {
      const contactId = c.req.param("id");
      const body = await c.req.json();

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      const fields = [
        "firstName", "lastName", "email", "phone", "mobile", "jobTitle",
        "department", "avatarId", "status", "source", "score", "companyId",
        "assignedTo", "linkedin", "twitter", "address", "city", "country",
        "notes", "tags", "customFields", "metadata", "lastContactedAt"
      ];

      for (const field of fields) {
        if (body[field] !== undefined) {
          updateData[field] = body[field];
        }
      }

      const [contact] = await db.instance
        .update(crmContacts)
        .set(updateData)
        .where(eq(crmContacts.id, contactId))
        .returning();

      if (!contact) {
        return c.json({ success: false, error: "Contact not found" }, 404);
      }

      return c.json({
        success: true,
        data: {
          ...contact,
          avatarUrl: contact.avatarId ? `/api/media/preset/${contact.avatarId}/thumbnail` : null,
        }
      });
    } catch (error) {
      logger.error("[CRM] Error updating contact:", { error });
      return c.json({ success: false, error: "Failed to update contact" }, 500);
    }
  });

  /**
   * DELETE /api/crm/contacts/:id
   * Delete contact
   */
  crmRoutes.delete("/contacts/:id", async (c) => {
    try {
      const contactId = c.req.param("id");

      await db.instance
        .delete(crmContacts)
        .where(eq(crmContacts.id, contactId));

      logger.info("[CRM] Contact deleted", { contactId });
      return c.json({ success: true });
    } catch (error) {
      logger.error("[CRM] Error deleting contact:", { error });
      return c.json({ success: false, error: "Failed to delete contact" }, 500);
    }
  });

  // ============================================================================
  // PIPELINES
  // ============================================================================

  /**
   * GET /api/crm/pipelines
   * List all pipelines
   */
  crmRoutes.get("/pipelines", async (c) => {
    try {
      const orgId = c.req.query("organizationId");
      
      let query = db.instance.select().from(crmPipelines);
      
      if (orgId) {
        query = query.where(eq(crmPipelines.organizationId, orgId));
      }
      
      const pipelines = await query.orderBy(desc(crmPipelines.isDefault), asc(crmPipelines.name));
      
      return c.json({ success: true, data: pipelines });
    } catch (error) {
      logger.error("[CRM] Error fetching pipelines:", { error });
      return c.json({ success: false, error: "Failed to fetch pipelines" }, 500);
    }
  });

  /**
   * POST /api/crm/pipelines
   * Create a new pipeline with optional default stages
   */
  crmRoutes.post("/pipelines", async (c) => {
    try {
      const body = await c.req.json();
      
      // Create pipeline
      const [pipeline] = await db.instance
        .insert(crmPipelines)
        .values({
          name: body.name,
          description: body.description,
          currency: body.currency || "USD",
          isDefault: body.isDefault || false,
          metadata: body.metadata || {},
          createdBy: body.createdBy,
          organizationId: body.organizationId,
        })
        .returning();
      
      // Create default stages if requested
      if (body.createDefaultStages !== false) {
        const defaultStages = [
          { name: "Lead", color: "#6b7280", order: 0, probability: 10 },
          { name: "Qualified", color: "#3b82f6", order: 1, probability: 25 },
          { name: "Proposal", color: "#f59e0b", order: 2, probability: 50 },
          { name: "Negotiation", color: "#f97316", order: 3, probability: 75 },
          { name: "Closed Won", color: "#10b981", order: 4, probability: 100 },
          { name: "Closed Lost", color: "#ef4444", order: 5, probability: 0 },
        ];
        
        await db.instance.insert(crmPipelineStages).values(
          defaultStages.map(stage => ({
            ...stage,
            pipelineId: pipeline.id,
          }))
        );
      }
      
      logger.info("[CRM] Pipeline created", { pipelineId: pipeline.id });
      return c.json({ success: true, data: pipeline }, 201);
    } catch (error) {
      logger.error("[CRM] Error creating pipeline:", { error });
      return c.json({ success: false, error: "Failed to create pipeline" }, 500);
    }
  });

  /**
   * GET /api/crm/pipelines/:id
   * Get pipeline with all stages
   */
  crmRoutes.get("/pipelines/:id", async (c) => {
    try {
      const pipelineId = c.req.param("id");
      
      const [pipeline] = await db.instance
        .select()
        .from(crmPipelines)
        .where(eq(crmPipelines.id, pipelineId));
      
      if (!pipeline) {
        return c.json({ success: false, error: "Pipeline not found" }, 404);
      }
      
      const stages = await db.instance
        .select()
        .from(crmPipelineStages)
        .where(eq(crmPipelineStages.pipelineId, pipelineId))
        .orderBy(asc(crmPipelineStages.order));
      
      return c.json({
        success: true,
        data: { ...pipeline, stages },
      });
    } catch (error) {
      logger.error("[CRM] Error fetching pipeline:", { error });
      return c.json({ success: false, error: "Failed to fetch pipeline" }, 500);
    }
  });

  /**
   * PATCH /api/crm/pipelines/:id
   * Update pipeline
   */
  crmRoutes.patch("/pipelines/:id", async (c) => {
    try {
      const pipelineId = c.req.param("id");
      const body = await c.req.json();
      
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      
      if (body.name !== undefined) updateData.name = body.name;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.currency !== undefined) updateData.currency = body.currency;
      if (body.isDefault !== undefined) updateData.isDefault = body.isDefault;
      if (body.metadata !== undefined) updateData.metadata = body.metadata;
      
      const [pipeline] = await db.instance
        .update(crmPipelines)
        .set(updateData)
        .where(eq(crmPipelines.id, pipelineId))
        .returning();
      
      if (!pipeline) {
        return c.json({ success: false, error: "Pipeline not found" }, 404);
      }
      
      return c.json({ success: true, data: pipeline });
    } catch (error) {
      logger.error("[CRM] Error updating pipeline:", { error });
      return c.json({ success: false, error: "Failed to update pipeline" }, 500);
    }
  });

  /**
   * DELETE /api/crm/pipelines/:id
   * Delete pipeline and all its stages/deals
   */
  crmRoutes.delete("/pipelines/:id", async (c) => {
    try {
      const pipelineId = c.req.param("id");
      
      await db.instance
        .delete(crmPipelines)
        .where(eq(crmPipelines.id, pipelineId));
      
      logger.info("[CRM] Pipeline deleted", { pipelineId });
      return c.json({ success: true });
    } catch (error) {
      logger.error("[CRM] Error deleting pipeline:", { error });
      return c.json({ success: false, error: "Failed to delete pipeline" }, 500);
    }
  });

  // ============================================================================
  // PIPELINE STAGES
  // ============================================================================

  /**
   * POST /api/crm/pipelines/:id/stages
   * Add stage to pipeline
   */
  crmRoutes.post("/pipelines/:id/stages", async (c) => {
    try {
      const pipelineId = c.req.param("id");
      const body = await c.req.json();
      
      // Get max order
      const [maxOrder] = await db.instance
        .select({ maxOrder: sql<number>`coalesce(max(${crmPipelineStages.order}), -1)` })
        .from(crmPipelineStages)
        .where(eq(crmPipelineStages.pipelineId, pipelineId));
      
      const [stage] = await db.instance
        .insert(crmPipelineStages)
        .values({
          pipelineId,
          name: body.name,
          color: body.color || "#3b82f6",
          order: body.order ?? (maxOrder.maxOrder + 1),
          probability: body.probability ?? 0,
          wipLimit: body.wipLimit,
          metadata: body.metadata || {},
        })
        .returning();
      
      logger.info("[CRM] Stage created", { stageId: stage.id, pipelineId });
      return c.json({ success: true, data: stage }, 201);
    } catch (error) {
      logger.error("[CRM] Error creating stage:", { error });
      return c.json({ success: false, error: "Failed to create stage" }, 500);
    }
  });

  /**
   * PATCH /api/crm/stages/:id
   * Update stage
   */
  crmRoutes.patch("/stages/:id", async (c) => {
    try {
      const stageId = c.req.param("id");
      const body = await c.req.json();
      
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      
      if (body.name !== undefined) updateData.name = body.name;
      if (body.color !== undefined) updateData.color = body.color;
      if (body.order !== undefined) updateData.order = body.order;
      if (body.probability !== undefined) updateData.probability = body.probability;
      if (body.wipLimit !== undefined) updateData.wipLimit = body.wipLimit;
      if (body.metadata !== undefined) updateData.metadata = body.metadata;
      
      const [stage] = await db.instance
        .update(crmPipelineStages)
        .set(updateData)
        .where(eq(crmPipelineStages.id, stageId))
        .returning();
      
      if (!stage) {
        return c.json({ success: false, error: "Stage not found" }, 404);
      }
      
      return c.json({ success: true, data: stage });
    } catch (error) {
      logger.error("[CRM] Error updating stage:", { error });
      return c.json({ success: false, error: "Failed to update stage" }, 500);
    }
  });

  /**
   * DELETE /api/crm/stages/:id
   * Delete stage (deals must be moved first)
   */
  crmRoutes.delete("/stages/:id", async (c) => {
    try {
      const stageId = c.req.param("id");
      
      // Check if stage has deals
      const [dealsCount] = await db.instance
        .select({ count: sql<number>`count(*)` })
        .from(crmDeals)
        .where(eq(crmDeals.stageId, stageId));
      
      if (dealsCount.count > 0) {
        return c.json({
          success: false,
          error: "Cannot delete stage with deals. Move deals first.",
          dealsCount: dealsCount.count,
        }, 400);
      }
      
      await db.instance
        .delete(crmPipelineStages)
        .where(eq(crmPipelineStages.id, stageId));
      
      logger.info("[CRM] Stage deleted", { stageId });
      return c.json({ success: true });
    } catch (error) {
      logger.error("[CRM] Error deleting stage:", { error });
      return c.json({ success: false, error: "Failed to delete stage" }, 500);
    }
  });

  // ============================================================================
  // DEALS
  // ============================================================================

  /**
   * GET /api/crm/deals
   * List deals with pagination and filters
   */
  crmRoutes.get("/deals", async (c) => {
    try {
      const orgId = c.req.query("organizationId");
      const pipelineId = c.req.query("pipelineId");
      const stageId = c.req.query("stageId");
      const status = c.req.query("status");
      const contactId = c.req.query("contactId");
      const companyId = c.req.query("companyId");
      const assignedTo = c.req.query("assignedTo");
      const search = c.req.query("search");
      const limit = Math.min(Number(c.req.query("limit")) || 50, 100);
      const offset = Number(c.req.query("offset")) || 0;

      let query = db.instance.select().from(crmDeals);

      const conditions = [];
      if (orgId) conditions.push(eq(crmDeals.organizationId, orgId));
      if (pipelineId) conditions.push(eq(crmDeals.pipelineId, pipelineId));
      if (stageId) conditions.push(eq(crmDeals.stageId, stageId));
      if (status) conditions.push(eq(crmDeals.status, status as any));
      if (contactId) conditions.push(eq(crmDeals.contactId, contactId));
      if (companyId) conditions.push(eq(crmDeals.companyId, companyId));
      if (assignedTo) conditions.push(eq(crmDeals.assignedTo, assignedTo));

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      if (search) {
        query = query.where(
          sql`${crmDeals.title} ILIKE ${`%${search}%`}`
        );
      }

      const [deals, countResult] = await Promise.all([
        query.orderBy(desc(crmDeals.updatedAt)).limit(limit).offset(offset),
        db.instance
          .select({ count: sql<number>`count(*)` })
          .from(crmDeals)
          .where(conditions.length > 0 ? and(...conditions) : undefined),
      ]);

      return c.json({
        success: true,
        data: deals,
        pagination: {
          total: countResult[0]?.count ?? 0,
          limit,
          offset,
        },
      });
    } catch (error) {
      logger.error("[CRM] Error fetching deals:", { error });
      return c.json({ success: false, error: "Failed to fetch deals" }, 500);
    }
  });

  /**
   * POST /api/crm/deals
   * Create a new deal
   */
  crmRoutes.post("/deals", async (c) => {
    try {
      const body = await c.req.json();

      // Get stage probability if not provided
      let probability = body.probability;
      if (probability === undefined && body.stageId) {
        const [stage] = await db.instance
          .select({ probability: crmPipelineStages.probability })
          .from(crmPipelineStages)
          .where(eq(crmPipelineStages.id, body.stageId));
        probability = stage?.probability ?? 0;
      }

      const [deal] = await db.instance
        .insert(crmDeals)
        .values({
          title: body.title,
          description: body.description,
          value: body.value || 0,
          currency: body.currency || "USD",
          status: body.status || "open",
          pipelineId: body.pipelineId,
          stageId: body.stageId,
          probability,
          contactId: body.contactId,
          companyId: body.companyId,
          assignedTo: body.assignedTo,
          expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : null,
          source: body.source,
          campaign: body.campaign,
          tags: body.tags || [],
          customFields: body.customFields || {},
          metadata: body.metadata || {},
          createdBy: body.createdBy,
          organizationId: body.organizationId,
        })
        .returning();

      logger.info("[CRM] Deal created", { dealId: deal.id });
      return c.json({ success: true, data: deal }, 201);
    } catch (error) {
      logger.error("[CRM] Error creating deal:", { error });
      return c.json({ success: false, error: "Failed to create deal" }, 500);
    }
  });

  /**
   * GET /api/crm/deals/:id
   * Get deal with relations
   */
  crmRoutes.get("/deals/:id", async (c) => {
    try {
      const dealId = c.req.param("id");

      const [deal] = await db.instance
        .select()
        .from(crmDeals)
        .where(eq(crmDeals.id, dealId));

      if (!deal) {
        return c.json({ success: false, error: "Deal not found" }, 404);
      }

      // Get related data
      const [contact, company, stage, pipeline] = await Promise.all([
        deal.contactId
          ? db.instance.select().from(crmContacts).where(eq(crmContacts.id, deal.contactId)).then((r: (typeof crmContacts.$inferSelect)[]) => r[0] || null)
          : Promise.resolve(null),
        deal.companyId
          ? db.instance.select().from(crmCompanies).where(eq(crmCompanies.id, deal.companyId)).then((r: (typeof crmCompanies.$inferSelect)[]) => r[0] || null)
          : Promise.resolve(null),
        deal.stageId
          ? db.instance.select().from(crmPipelineStages).where(eq(crmPipelineStages.id, deal.stageId)).then((r: (typeof crmPipelineStages.$inferSelect)[]) => r[0] || null)
          : Promise.resolve(null),
        deal.pipelineId
          ? db.instance.select().from(crmPipelines).where(eq(crmPipelines.id, deal.pipelineId)).then((r: (typeof crmPipelines.$inferSelect)[]) => r[0] || null)
          : Promise.resolve(null),
      ]);

      return c.json({
        success: true,
        data: { ...deal, contact, company, stage, pipeline },
      });
    } catch (error) {
      logger.error("[CRM] Error fetching deal:", { error });
      return c.json({ success: false, error: "Failed to fetch deal" }, 500);
    }
  });

  /**
   * PATCH /api/crm/deals/:id
   * Update deal
   */
  crmRoutes.patch("/deals/:id", async (c) => {
    try {
      const dealId = c.req.param("id");
      const body = await c.req.json();

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      const fields = [
        "title", "description", "value", "currency", "status",
        "pipelineId", "stageId", "probability", "contactId", "companyId",
        "assignedTo", "expectedCloseDate", "actualCloseDate", "source",
        "campaign", "tags", "customFields", "metadata"
      ];

      for (const field of fields) {
        if (body[field] !== undefined) {
          if (field === "expectedCloseDate" || field === "actualCloseDate") {
            updateData[field] = body[field] ? new Date(body[field]) : null;
          } else {
            updateData[field] = body[field];
          }
        }
      }

      const [deal] = await db.instance
        .update(crmDeals)
        .set(updateData)
        .where(eq(crmDeals.id, dealId))
        .returning();

      if (!deal) {
        return c.json({ success: false, error: "Deal not found" }, 404);
      }

      return c.json({ success: true, data: deal });
    } catch (error) {
      logger.error("[CRM] Error updating deal:", { error });
      return c.json({ success: false, error: "Failed to update deal" }, 500);
    }
  });

  /**
   * DELETE /api/crm/deals/:id
   * Delete deal
   */
  crmRoutes.delete("/deals/:id", async (c) => {
    try {
      const dealId = c.req.param("id");

      await db.instance
        .delete(crmDeals)
        .where(eq(crmDeals.id, dealId));

      logger.info("[CRM] Deal deleted", { dealId });
      return c.json({ success: true });
    } catch (error) {
      logger.error("[CRM] Error deleting deal:", { error });
      return c.json({ success: false, error: "Failed to delete deal" }, 500);
    }
  });

  // ============================================================================
  // KANBAN OPERATIONS
  // ============================================================================

  /**
   * GET /api/crm/pipelines/:id/kanban
   * Get full kanban board data (pipeline + stages + deals)
   */
  crmRoutes.get("/pipelines/:id/kanban", async (c) => {
    try {
      const pipelineId = c.req.param("id");

      const [pipeline] = await db.instance
        .select()
        .from(crmPipelines)
        .where(eq(crmPipelines.id, pipelineId));

      if (!pipeline) {
        return c.json({ success: false, error: "Pipeline not found" }, 404);
      }

      const stages = await db.instance
        .select()
        .from(crmPipelineStages)
        .where(eq(crmPipelineStages.pipelineId, pipelineId))
        .orderBy(asc(crmPipelineStages.order));

      const deals = await db.instance
        .select()
        .from(crmDeals)
        .where(and(
          eq(crmDeals.pipelineId, pipelineId),
          eq(crmDeals.status, "open")
        ))
        .orderBy(asc(crmDeals.createdAt));

      // Group deals by stage
      const stagesWithDeals = stages.map((stage: typeof crmPipelineStages.$inferSelect) => ({
        ...stage,
        deals: deals.filter((d: typeof crmDeals.$inferSelect) => d.stageId === stage.id),
      }));

      return c.json({
        success: true,
        data: {
          pipeline,
          stages: stagesWithDeals,
        },
      });
    } catch (error) {
      logger.error("[CRM] Error fetching kanban:", { error });
      return c.json({ success: false, error: "Failed to fetch kanban data" }, 500);
    }
  });

  /**
   * POST /api/crm/deals/:id/move
   * Move deal to another stage (optimized for drag & drop)
   */
  crmRoutes.post("/deals/:id/move", async (c) => {
    try {
      const dealId = c.req.param("id");
      const body: DealMovePayload = await c.req.json();
      const { targetStageId, newOrder = 0 } = body;

      const [deal] = await db.instance
        .update(crmDeals)
        .set({
          stageId: targetStageId,
          order: newOrder,
          updatedAt: new Date(),
        })
        .where(eq(crmDeals.id, dealId))
        .returning();

      if (!deal) {
        return c.json({ success: false, error: "Deal not found" }, 404);
      }

      logger.info("[CRM] Deal moved", { dealId, targetStageId });
      return c.json({ success: true, data: deal });
    } catch (error) {
      logger.error("[CRM] Error moving deal:", { error });
      return c.json({ success: false, error: "Failed to move deal" }, 500);
    }
  });

  /**
   * POST /api/crm/deals/reorder
   * Batch reorder deals
   */
  crmRoutes.post("/deals/reorder", async (c) => {
    try {
      const body = await c.req.json();
      const { deals }: { deals: { id: string; stageId: string; order: number }[] } = body;

      for (const deal of deals) {
        await db.instance
          .update(crmDeals)
          .set({
            stageId: deal.stageId,
            order: deal.order,
            updatedAt: new Date(),
          })
          .where(eq(crmDeals.id, deal.id));
      }

      return c.json({ success: true, updated: deals.length });
    } catch (error) {
      logger.error("[CRM] Error reordering deals:", { error });
      return c.json({ success: false, error: "Failed to reorder deals" }, 500);
    }
  });

  // ============================================================================
  // ACTIVITIES
  // ============================================================================

  /**
   * GET /api/crm/activities
   * List activities with filters
   */
  crmRoutes.get("/activities", async (c) => {
    try {
      const orgId = c.req.query("organizationId");
      const contactId = c.req.query("contactId");
      const companyId = c.req.query("companyId");
      const dealId = c.req.query("dealId");
      const type = c.req.query("type");
      const assignedTo = c.req.query("assignedTo");
      const completed = c.req.query("completed");
      const limit = Math.min(Number(c.req.query("limit")) || 50, 100);
      const offset = Number(c.req.query("offset")) || 0;

      let query = db.instance.select().from(crmActivities);

      const conditions = [];
      if (orgId) conditions.push(eq(crmActivities.organizationId, orgId));
      if (contactId) conditions.push(eq(crmActivities.contactId, contactId));
      if (companyId) conditions.push(eq(crmActivities.companyId, companyId));
      if (dealId) conditions.push(eq(crmActivities.dealId, dealId));
      if (type) conditions.push(eq(crmActivities.type, type as any));
      if (assignedTo) conditions.push(eq(crmActivities.assignedTo, assignedTo));
      if (completed === "true") conditions.push(sql`${crmActivities.completedAt} IS NOT NULL`);
      if (completed === "false") conditions.push(sql`${crmActivities.completedAt} IS NULL`);

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const [activities, countResult] = await Promise.all([
        query.orderBy(desc(crmActivities.createdAt)).limit(limit).offset(offset),
        db.instance
          .select({ count: sql<number>`count(*)` })
          .from(crmActivities)
          .where(conditions.length > 0 ? and(...conditions) : undefined),
      ]);

      return c.json({
        success: true,
        data: activities,
        pagination: {
          total: countResult[0]?.count ?? 0,
          limit,
          offset,
        },
      });
    } catch (error) {
      logger.error("[CRM] Error fetching activities:", { error });
      return c.json({ success: false, error: "Failed to fetch activities" }, 500);
    }
  });

  /**
   * POST /api/crm/activities
   * Create a new activity
   */
  crmRoutes.post("/activities", async (c) => {
    try {
      const body = await c.req.json();

      const [activity] = await db.instance
        .insert(crmActivities)
        .values({
          type: body.type,
          subject: body.subject,
          description: body.description,
          contactId: body.contactId,
          companyId: body.companyId,
          dealId: body.dealId,
          assignedTo: body.assignedTo,
          createdBy: body.createdBy,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          durationMinutes: body.durationMinutes,
          outcome: body.outcome,
          notes: body.notes,
          metadata: body.metadata || {},
          organizationId: body.organizationId,
        })
        .returning();

      // Update lastActivityAt on related deal if exists
      if (body.dealId) {
        await db.instance
          .update(crmDeals)
          .set({ lastActivityAt: new Date() })
          .where(eq(crmDeals.id, body.dealId));
      }

      logger.info("[CRM] Activity created", { activityId: activity.id });
      return c.json({ success: true, data: activity }, 201);
    } catch (error) {
      logger.error("[CRM] Error creating activity:", { error });
      return c.json({ success: false, error: "Failed to create activity" }, 500);
    }
  });

  /**
   * GET /api/crm/activities/:id
   * Get activity
   */
  crmRoutes.get("/activities/:id", async (c) => {
    try {
      const activityId = c.req.param("id");

      const [activity] = await db.instance
        .select()
        .from(crmActivities)
        .where(eq(crmActivities.id, activityId));

      if (!activity) {
        return c.json({ success: false, error: "Activity not found" }, 404);
      }

      return c.json({ success: true, data: activity });
    } catch (error) {
      logger.error("[CRM] Error fetching activity:", { error });
      return c.json({ success: false, error: "Failed to fetch activity" }, 500);
    }
  });

  /**
   * PATCH /api/crm/activities/:id
   * Update activity
   */
  crmRoutes.patch("/activities/:id", async (c) => {
    try {
      const activityId = c.req.param("id");
      const body = await c.req.json();

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      const fields = [
        "type", "subject", "description", "contactId", "companyId",
        "dealId", "assignedTo", "dueDate", "durationMinutes",
        "outcome", "notes", "metadata"
      ];

      for (const field of fields) {
        if (body[field] !== undefined) {
          if (field === "dueDate") {
            updateData[field] = body[field] ? new Date(body[field]) : null;
          } else {
            updateData[field] = body[field];
          }
        }
      }

      const [activity] = await db.instance
        .update(crmActivities)
        .set(updateData)
        .where(eq(crmActivities.id, activityId))
        .returning();

      if (!activity) {
        return c.json({ success: false, error: "Activity not found" }, 404);
      }

      return c.json({ success: true, data: activity });
    } catch (error) {
      logger.error("[CRM] Error updating activity:", { error });
      return c.json({ success: false, error: "Failed to update activity" }, 500);
    }
  });

  /**
   * POST /api/crm/activities/:id/complete
   * Mark activity as completed
   */
  crmRoutes.post("/activities/:id/complete", async (c) => {
    try {
      const activityId = c.req.param("id");
      const body = await c.req.json();

      const [activity] = await db.instance
        .update(crmActivities)
        .set({
          completedAt: new Date(),
          outcome: body.outcome,
          notes: body.notes,
          updatedAt: new Date(),
        })
        .where(eq(crmActivities.id, activityId))
        .returning();

      if (!activity) {
        return c.json({ success: false, error: "Activity not found" }, 404);
      }

      return c.json({ success: true, data: activity });
    } catch (error) {
      logger.error("[CRM] Error completing activity:", { error });
      return c.json({ success: false, error: "Failed to complete activity" }, 500);
    }
  });

  /**
   * DELETE /api/crm/activities/:id
   * Delete activity
   */
  crmRoutes.delete("/activities/:id", async (c) => {
    try {
      const activityId = c.req.param("id");

      await db.instance
        .delete(crmActivities)
        .where(eq(crmActivities.id, activityId));

      logger.info("[CRM] Activity deleted", { activityId });
      return c.json({ success: true });
    } catch (error) {
      logger.error("[CRM] Error deleting activity:", { error });
      return c.json({ success: false, error: "Failed to delete activity" }, 500);
    }
  });

  // ============================================================================
  // DASHBOARD STATS
  // ============================================================================

  /**
   * GET /api/crm/stats
   * Get CRM dashboard stats
   */
  crmRoutes.get("/stats", async (c) => {
    try {
      const orgId = c.req.query("organizationId");

      const buildOrgWhere = (table: any) => {
        const conditions: any[] = [];
        if (orgId) conditions.push(eq(table.organizationId, orgId));
        return conditions.length > 0 ? and(...conditions) : undefined;
      };

      const overdueConditions = [
        sql`${crmActivities.completedAt} IS NULL`,
        sql`${crmActivities.dueDate} <= NOW()`,
      ];
      if (orgId) overdueConditions.push(eq(crmActivities.organizationId, orgId));

      const [
        contactsCount,
        companiesCount,
        dealsStats,
        activitiesCount,
        openActivitiesCount,
      ] = await Promise.all([
        db.instance
          .select({ count: sql<number>`count(*)` })
          .from(crmContacts)
          .where(buildOrgWhere(crmContacts))
          .then((r: { count: number }[]) => r[0]?.count ?? 0),
        db.instance
          .select({ count: sql<number>`count(*)` })
          .from(crmCompanies)
          .where(buildOrgWhere(crmCompanies))
          .then((r: { count: number }[]) => r[0]?.count ?? 0),
        db.instance
          .select({
            total: sql<number>`count(*)`,
            open: sql<number>`count(*) FILTER (WHERE ${crmDeals.status} = 'open')`,
            won: sql<number>`count(*) FILTER (WHERE ${crmDeals.status} = 'won')`,
            lost: sql<number>`count(*) FILTER (WHERE ${crmDeals.status} = 'lost')`,
            totalValue: sql<number>`coalesce(sum(${crmDeals.value}), 0)`,
            openValue: sql<number>`coalesce(sum(${crmDeals.value}) FILTER (WHERE ${crmDeals.status} = 'open'), 0)`,
            wonValue: sql<number>`coalesce(sum(${crmDeals.value}) FILTER (WHERE ${crmDeals.status} = 'won'), 0)`,
          })
          .from(crmDeals)
          .where(buildOrgWhere(crmDeals))
          .then((r: { total: number; open: number; won: number; lost: number; totalValue: number; openValue: number; wonValue: number }[]) => r[0]),
        db.instance
          .select({ count: sql<number>`count(*)` })
          .from(crmActivities)
          .where(buildOrgWhere(crmActivities))
          .then((r: { count: number }[]) => r[0]?.count ?? 0),
        db.instance
          .select({ count: sql<number>`count(*)` })
          .from(crmActivities)
          .where(overdueConditions.length > 1 ? and(...overdueConditions) : undefined)
          .then((r: { count: number }[]) => r[0]?.count ?? 0),
      ]);

      return c.json({
        success: true,
        data: {
          contacts: contactsCount,
          companies: companiesCount,
          deals: {
            total: dealsStats?.total ?? 0,
            open: dealsStats?.open ?? 0,
            won: dealsStats?.won ?? 0,
            lost: dealsStats?.lost ?? 0,
            values: {
              total: dealsStats?.totalValue ?? 0,
              open: dealsStats?.openValue ?? 0,
              won: dealsStats?.wonValue ?? 0,
            },
          },
          activities: {
            total: activitiesCount,
            overdue: openActivitiesCount,
          },
        },
      });
    } catch (error) {
      logger.error("[CRM] Error fetching stats:", { error });
      return c.json({ success: false, error: "Failed to fetch stats" }, 500);
    }
  });

  // ============================================================================
  // FASE 1: CRM BUILDER - ENTITY CONFIGS
  // ============================================================================

  /**
   * GET /api/crm/entity-configs
   * List entity configurations
   */
  crmRoutes.get("/entity-configs", async (c) => {
    try {
      const grimoireId = c.req.query("grimoireId");
      const configs = await db.instance
        .select()
        .from(crmEntityConfigs)
        .where(grimoireId ? eq(crmEntityConfigs.grimoireId, grimoireId) : undefined)
        .orderBy(desc(crmEntityConfigs.updatedAt));

      return c.json({ success: true, data: configs });
    } catch (error) {
      logger.error("[CRM] Error fetching entity configs:", { error });
      return c.json({ success: false, error: "Failed to fetch entity configs" }, 500);
    }
  });

  /**
   * POST /api/crm/entity-configs
   * Create entity configuration
   */
  crmRoutes.post("/entity-configs", async (c) => {
    try {
      const body = await c.req.json();
      const user = c.get("user");

      const [config] = await db.instance
        .insert(crmEntityConfigs)
        .values({
          grimoireId: body.grimoireId,
          entityName: body.entityName,
          singularLabel: body.singularLabel,
          pluralLabel: body.pluralLabel,
          requiresContact: body.requiresContact ?? true,
          requiresCompany: body.requiresCompany ?? true,
          allowsValue: body.allowsValue ?? true,
          allowsTimeTracking: body.allowsTimeTracking ?? true,
          fieldSchema: body.fieldSchema ?? [],
          defaultPipelineId: body.defaultPipelineId,
          isActive: body.isActive ?? true,
          isDefault: body.isDefault ?? false,
          metadata: body.metadata ?? {},
          createdBy: user?.id,
        })
        .returning();

      logger.info("[CRM] Entity config created", { configId: config.id });
      return c.json({ success: true, data: config }, 201);
    } catch (error) {
      logger.error("[CRM] Error creating entity config:", { error });
      return c.json({ success: false, error: "Failed to create entity config" }, 500);
    }
  });

  /**
   * PATCH /api/crm/entity-configs/:id
   * Update entity configuration
   */
  crmRoutes.patch("/entity-configs/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json();

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (body.entityName !== undefined) updateData.entityName = body.entityName;
      if (body.singularLabel !== undefined) updateData.singularLabel = body.singularLabel;
      if (body.pluralLabel !== undefined) updateData.pluralLabel = body.pluralLabel;
      if (body.requiresContact !== undefined) updateData.requiresContact = body.requiresContact;
      if (body.requiresCompany !== undefined) updateData.requiresCompany = body.requiresCompany;
      if (body.allowsValue !== undefined) updateData.allowsValue = body.allowsValue;
      if (body.allowsTimeTracking !== undefined) updateData.allowsTimeTracking = body.allowsTimeTracking;
      if (body.fieldSchema !== undefined) updateData.fieldSchema = body.fieldSchema;
      if (body.defaultPipelineId !== undefined) updateData.defaultPipelineId = body.defaultPipelineId;
      if (body.isActive !== undefined) updateData.isActive = body.isActive;
      if (body.isDefault !== undefined) updateData.isDefault = body.isDefault;
      if (body.metadata !== undefined) updateData.metadata = body.metadata;

      const [config] = await db.instance
        .update(crmEntityConfigs)
        .set(updateData)
        .where(eq(crmEntityConfigs.id, id))
        .returning();

      if (!config) {
        return c.json({ success: false, error: "Entity config not found" }, 404);
      }

      logger.info("[CRM] Entity config updated", { configId: id });
      return c.json({ success: true, data: config });
    } catch (error) {
      logger.error("[CRM] Error updating entity config:", { error });
      return c.json({ success: false, error: "Failed to update entity config" }, 500);
    }
  });

  // ============================================================================
  // FASE 1: STAGE VALIDATIONS & TIME TRACKING
  // ============================================================================

  /**
   * Helper: Validate stage transition
   */
  async function validateStageTransition(
    dealId: string,
    targetStageId: string,
    tx: typeof db.instance
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      canMove: true,
      missingFields: [],
      missingDocuments: [],
      failedValidations: [],
      warnings: [],
    };

    // Get deal with custom fields
    const [deal] = await tx
      .select()
      .from(crmDeals)
      .where(eq(crmDeals.id, dealId));

    if (!deal) {
      result.canMove = false;
      result.warnings.push("Deal not found");
      return result;
    }

    // Get target stage with requirements
    const [stage] = await tx
      .select()
      .from(crmPipelineStages)
      .where(eq(crmPipelineStages.id, targetStageId));

    if (!stage) {
      result.canMove = false;
      result.warnings.push("Target stage not found");
      return result;
    }

    const requirements = (stage.entryRequirements || {}) as StageEntryRequirements;
    const customFields = (deal.customFields || {}) as Record<string, unknown>;

    // Validate required fields
    if (requirements.requiredFields?.length) {
      for (const fieldKey of requirements.requiredFields) {
        const value = customFields[fieldKey];
        if (value === undefined || value === null || value === '') {
          result.missingFields.push({
            key: fieldKey,
            label: fieldKey, // Could be enhanced to get from schema
            currentValue: value,
          });
          result.canMove = false;
        }
      }
    }

    // Validate custom validations
    if (requirements.customValidations?.length) {
      for (const validation of requirements.customValidations) {
        const value = customFields[validation.field];
        let passes = false;

        switch (validation.operator) {
          case '==':
            passes = value === validation.value;
            break;
          case '!=':
            passes = value !== validation.value;
            break;
          case '>':
            passes = Number(value) > Number(validation.value);
            break;
          case '<':
            passes = Number(value) < Number(validation.value);
            break;
          case '>=':
            passes = Number(value) >= Number(validation.value);
            break;
          case '<=':
            passes = Number(value) <= Number(validation.value);
            break;
          case 'exists':
            passes = value !== undefined && value !== null && value !== '';
            break;
        }

        if (!passes) {
          result.failedValidations.push({
            field: validation.field,
            operator: validation.operator,
            expected: validation.value,
            actual: value,
            message: `Field ${validation.field} must be ${validation.operator} ${validation.value}`,
          });
          result.canMove = false;
        }
      }
    }

    // Validate required documents (basic check for Fase 1)
    if (requirements.requiredDocuments?.length) {
      const uploadedDocs = await tx
        .select({ type: crmDocuments.documentType })
        .from(crmDocuments)
        .where(eq(crmDocuments.dealId, dealId));

      const uploadedTypes = new Set(uploadedDocs.map((d: { type: string | null }) => d.type));

      for (const docType of requirements.requiredDocuments) {
        if (!uploadedTypes.has(docType)) {
          result.missingDocuments.push({
            type: docType,
            label: docType,
          });
          // Note: Not blocking move in Fase 1, just warning
          result.warnings.push(`Missing required document: ${docType}`);
        }
      }
    }

    return result;
  }

  /**
   * POST /api/crm/deals/:id/validate-move
   * Validate if deal can move to target stage
   */
  crmRoutes.post("/deals/:id/validate-move", async (c) => {
    try {
      const dealId = c.req.param("id");
      const { targetStageId } = await c.req.json();

      if (!targetStageId) {
        return c.json({ success: false, error: "targetStageId is required" }, 400);
      }

      const validation = await validateStageTransition(dealId, targetStageId, db.instance);

      return c.json({ success: true, data: validation });
    } catch (error) {
      logger.error("[CRM] Error validating move:", { error });
      return c.json({ success: false, error: "Failed to validate move" }, 500);
    }
  });

  /**
   * GET /api/crm/deals/:id/timeline
   * Get deal timeline with stage transitions
   */
  crmRoutes.get("/deals/:id/timeline", async (c) => {
    try {
      const dealId = c.req.param("id");

      const timeline = await db.instance.execute(sql`
        SELECT 
          st.id,
          st.from_stage_id,
          fs.name AS from_stage_name,
          st.to_stage_id,
          ts.name AS to_stage_name,
          st.entered_at,
          st.exited_at,
          st.duration_minutes,
          st.was_on_time,
          st.sla_breach,
          st.moved_by
        FROM crm_stage_transitions st
        LEFT JOIN crm_pipeline_stages fs ON st.from_stage_id = fs.id
        LEFT JOIN crm_pipeline_stages ts ON st.to_stage_id = ts.id
        WHERE st.deal_id = ${dealId}
        ORDER BY st.entered_at DESC
      `);

      // Format duration for human readability
      const formattedTimeline = (timeline.rows || []).map((row: Record<string, unknown>) => {
        const duration = row.duration_minutes as number;
        let durationText = 'In progress';
        
        if (duration !== null && duration !== undefined) {
          const days = Math.floor(duration / (24 * 60));
          const hours = Math.floor((duration % (24 * 60)) / 60);
          const mins = duration % 60;
          
          const parts = [];
          if (days > 0) parts.push(`${days}d`);
          if (hours > 0) parts.push(`${hours}h`);
          if (mins > 0) parts.push(`${mins}m`);
          
          durationText = parts.join(' ') || '< 1m';
        }

        return {
          ...row,
          duration_text: durationText,
        };
      });

      return c.json({ success: true, data: formattedTimeline });
    } catch (error) {
      logger.error("[CRM] Error fetching timeline:", { error });
      return c.json({ success: false, error: "Failed to fetch timeline" }, 500);
    }
  });

  /**
   * GET /api/crm/analytics/cycle-time
   * Get cycle time analytics for a pipeline
   */
  crmRoutes.get("/analytics/cycle-time", async (c) => {
    try {
      const pipelineId = c.req.query("pipelineId");
      const startDate = c.req.query("startDate");
      const endDate = c.req.query("endDate");

      if (!pipelineId) {
        return c.json({ success: false, error: "pipelineId is required" }, 400);
      }

      const result = await db.instance.execute(sql`
        SELECT 
          ps.id AS stage_id,
          ps.name AS stage_name,
          ROUND(AVG(st.duration_minutes), 2) AS avg_duration_minutes,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY st.duration_minutes) AS median_duration_minutes,
          MIN(st.duration_minutes) AS min_duration_minutes,
          MAX(st.duration_minutes) AS max_duration_minutes,
          COUNT(*) AS deal_count,
          COUNT(*) FILTER (WHERE st.sla_breach = TRUE) AS sla_breach_count,
          ROUND(
            COUNT(*) FILTER (WHERE st.sla_breach = TRUE) * 100.0 / NULLIF(COUNT(*), 0), 
            2
          ) AS sla_breach_rate
        FROM crm_stage_transitions st
        JOIN crm_pipeline_stages ps ON st.to_stage_id = ps.id
        WHERE ps.pipeline_id = ${pipelineId}
          AND st.exited_at IS NOT NULL
          ${startDate ? sql`AND st.entered_at >= ${new Date(startDate)}` : sql``}
          ${endDate ? sql`AND st.entered_at <= ${new Date(endDate)}` : sql``}
        GROUP BY ps.id, ps.name, ps.order
        ORDER BY ps.order
      `);

      // Format durations for readability
      const formattedData = (result.rows || []).map((row: Record<string, unknown>) => {
        const formatDuration = (mins: number) => {
          if (!mins) return '-';
          const days = Math.floor(mins / (24 * 60));
          if (days > 0) return `${days}d ${Math.floor((mins % (24 * 60)) / 60)}h`;
          const hours = Math.floor(mins / 60);
          if (hours > 0) return `${hours}h ${mins % 60}m`;
          return `${mins}m`;
        };

        return {
          ...row,
          avg_duration_text: formatDuration(row.avg_duration_minutes as number),
          median_duration_text: formatDuration(row.median_duration_minutes as number),
          min_duration_text: formatDuration(row.min_duration_minutes as number),
          max_duration_text: formatDuration(row.max_duration_minutes as number),
        };
      });

      return c.json({ success: true, data: formattedData });
    } catch (error) {
      logger.error("[CRM] Error fetching cycle time:", { error });
      return c.json({ success: false, error: "Failed to fetch cycle time analytics" }, 500);
    }
  });

  /**
   * PATCH /api/crm/pipeline-stages/:id/config
   * Update stage configuration (builder features)
   */
  crmRoutes.patch("/pipeline-stages/:id/config", async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json();

      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (body.trackTimeInStage !== undefined) updateData.trackTimeInStage = body.trackTimeInStage;
      if (body.estimatedDays !== undefined) updateData.estimatedDays = body.estimatedDays;
      if (body.entryRequirements !== undefined) updateData.entryRequirements = body.entryRequirements;
      if (body.onEnterActions !== undefined) updateData.onEnterActions = body.onEnterActions;
      if (body.onExitActions !== undefined) updateData.onExitActions = body.onExitActions;

      const [stage] = await db.instance
        .update(crmPipelineStages)
        .set(updateData)
        .where(eq(crmPipelineStages.id, id))
        .returning();

      if (!stage) {
        return c.json({ success: false, error: "Stage not found" }, 404);
      }

      logger.info("[CRM] Stage config updated", { stageId: id });
      return c.json({ success: true, data: stage });
    } catch (error) {
      logger.error("[CRM] Error updating stage config:", { error });
      return c.json({ success: false, error: "Failed to update stage config" }, 500);
    }
  });

  // ============================================================================
  // FASE 1: DOCUMENTS (Basic CRUD)
  // ============================================================================

  /**
   * GET /api/crm/deals/:id/documents
   * List documents for a deal
   */
  crmRoutes.get("/deals/:id/documents", async (c) => {
    try {
      const dealId = c.req.param("id");

      const documents = await db.instance
        .select()
        .from(crmDocuments)
        .where(eq(crmDocuments.dealId, dealId))
        .orderBy(desc(crmDocuments.uploadedAt));

      return c.json({ success: true, data: documents });
    } catch (error) {
      logger.error("[CRM] Error fetching documents:", { error });
      return c.json({ success: false, error: "Failed to fetch documents" }, 500);
    }
  });

  /**
   * POST /api/crm/documents
   * Create document record
   */
  crmRoutes.post("/documents", async (c) => {
    try {
      const body = await c.req.json();
      const user = c.get("user");

      const [doc] = await db.instance
        .insert(crmDocuments)
        .values({
          dealId: body.dealId,
          name: body.name,
          fileUrl: body.fileUrl,
          fileType: body.fileType,
          fileSize: body.fileSize,
          documentType: body.documentType,
          category: body.category,
          requiredForStageId: body.requiredForStageId,
          isRequired: body.isRequired ?? false,
          isPrivileged: body.isPrivileged ?? false,
          confidential: body.confidential ?? false,
          uploadedBy: user?.id,
          metadata: body.metadata ?? {},
        })
        .returning();

      logger.info("[CRM] Document created", { docId: doc.id });
      return c.json({ success: true, data: doc }, 201);
    } catch (error) {
      logger.error("[CRM] Error creating document:", { error });
      return c.json({ success: false, error: "Failed to create document" }, 500);
    }
  });

  /**
   * DELETE /api/crm/documents/:id
   * Delete document
   */
  crmRoutes.delete("/documents/:id", async (c) => {
    try {
      const id = c.req.param("id");

      const [doc] = await db.instance
        .delete(crmDocuments)
        .where(eq(crmDocuments.id, id))
        .returning();

      if (!doc) {
        return c.json({ success: false, error: "Document not found" }, 404);
      }

      logger.info("[CRM] Document deleted", { docId: id });
      return c.json({ success: true });
    } catch (error) {
      logger.error("[CRM] Error deleting document:", { error });
      return c.json({ success: false, error: "Failed to delete document" }, 500);
    }
  });

  // ============================================================================
  // FASE 1: ENHANCED DEAL MOVE (with validation & time tracking)
  // ============================================================================

  /**
   * POST /api/crm/deals/:id/move (ENHANCED)
   * Move deal to new stage with validation and time tracking
   */
  crmRoutes.post("/deals/:id/move", async (c) => {
    try {
      const dealId = c.req.param("id");
      const { targetStageId, newOrder, skipValidation, moveReason } = await c.req.json();
      const user = c.get("user");

      if (!targetStageId) {
        return c.json({ success: false, error: "targetStageId is required" }, 400);
      }

      // Get current deal
      const [deal] = await db.instance
        .select()
        .from(crmDeals)
        .where(eq(crmDeals.id, dealId));

      if (!deal) {
        return c.json({ success: false, error: "Deal not found" }, 404);
      }

      // Skip if already in target stage
      if (deal.stageId === targetStageId) {
        return c.json({ success: true, data: deal, message: "Already in target stage" });
      }

      // Validate transition (unless skipped)
      if (!skipValidation) {
        const validation = await validateStageTransition(dealId, targetStageId, db.instance);
        if (!validation.canMove) {
          return c.json({ 
            success: false, 
            error: "Validation failed", 
            details: validation 
          }, 400);
        }
      }

      // Get target stage for SLA tracking
      const [targetStage] = await db.instance
        .select()
        .from(crmPipelineStages)
        .where(eq(crmPipelineStages.id, targetStageId));

      // Close current transition (time tracking)
      if (deal.currentTransitionId) {
        await db.instance
          .update(crmStageTransitions)
          .set({ exitedAt: new Date() })
          .where(eq(crmStageTransitions.id, deal.currentTransitionId));
      }

      // Create new transition record
      const [newTransition] = await db.instance
        .insert(crmStageTransitions)
        .values({
          dealId,
          fromStageId: deal.stageId,
          toStageId: targetStageId,
          enteredAt: new Date(),
          estimatedDays: targetStage?.estimatedDays ?? null,
          movedBy: user?.id,
          moveReason,
          validationResult: skipValidation ? { skipped: true } : {},
        })
        .returning();

      // Update deal
      const updateData: Record<string, unknown> = {
        stageId: targetStageId,
        currentTransitionId: newTransition.id,
        updatedAt: new Date(),
      };

      if (newOrder !== undefined) {
        updateData.order = newOrder;
      }

      const [updatedDeal] = await db.instance
        .update(crmDeals)
        .set(updateData)
        .where(eq(crmDeals.id, dealId))
        .returning();

      logger.info("[CRM] Deal moved", { 
        dealId, 
        fromStage: deal.stageId, 
        toStage: targetStageId,
        transitionId: newTransition.id
      });

      return c.json({ 
        success: true, 
        data: updatedDeal,
        transition: newTransition
      });
    } catch (error) {
      logger.error("[CRM] Error moving deal:", { error });
      return c.json({ success: false, error: "Failed to move deal" }, 500);
    }
  });

  // Return the configured router
  return crmRoutes;
}
