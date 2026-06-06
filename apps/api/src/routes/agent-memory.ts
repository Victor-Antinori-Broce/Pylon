/**
 * @file agent-memory.ts
 * @description Agent Memory API Routes (Fase 4)
 *
 * Endpoints para que los agentes gestionen su propia memoria cognitiva:
 * - GET /api/agent/memory - Listar memorias del agente
 * - POST /api/agent/memory - Crear nueva memoria
 * - GET /api/agent/memory/:id - Obtener memoria específica
 * - PUT /api/agent/memory/:id - Actualizar memoria
 * - DELETE /api/agent/memory/:id - Eliminar memoria
 * - POST /api/agent/memory/search - Búsqueda semántica (si pgvector disponible)
 *
 * @author Gremius Security Team
 * @version 1.0.0
 */

import { eq, and, desc, sql, lt, gt, gte, lte, inArray, isNull, or } from "drizzle-orm";
import { Hono } from "hono";

// @ts-ignore - Path alias @/ not resolved by tsc
import { db } from "@/db";
// @ts-ignore - Path alias @/ not resolved by tsc
import { agentMemory } from "@/db/schema";
// @ts-ignore - Path alias @/ not resolved by tsc
import { logger } from "@/lib/logger";
// @ts-ignore - Path alias @/ not resolved by tsc
import { agentAuthWithRBAC, requireScope } from "@/middleware/agent-rbac";
// @ts-ignore - Path alias @/ not resolved by tsc
import type { AgentAuthContext } from "@/services/agent-auth";
// @ts-ignore - Path alias @/ not resolved by tsc
import type { AppVariables } from "@/types/hono";

const agentMemoryRouter = new Hono<{ Variables: AppVariables }>();

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE: Todos los endpoints requieren autenticación de agente
// ═══════════════════════════════════════════════════════════════════════════

agentMemoryRouter.use(
  "*",
  agentAuthWithRBAC({
    scopes: ["memory:read"],
    optional: false,
  })
);

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

interface MemoryCreateRequest {
  key?: string;
  content: Record<string, unknown>;
  summary?: string;
  memoryType?: "short_term" | "long_term" | "episodic" | "semantic";
  category?:
    | "general"
    | "conversation"
    | "task"
    | "insight"
    | "preference"
    | "context"
    | "knowledge";
  importance?: number;
  confidence?: number;
  source?: "agent" | "user" | "system" | "inference" | "external";
  validUntil?: string;
  relatedMemoryIds?: string[];
  tags?: string[];
}

interface MemoryUpdateRequest {
  content?: Record<string, unknown>;
  summary?: string;
  importance?: number;
  confidence?: number;
  validUntil?: string | null;
  tags?: string[];
}

interface MemorySearchRequest {
  query?: string;
  memoryType?: string;
  category?: string;
  tags?: string[];
  minImportance?: number;
  validOnly?: boolean;
  limit?: number;
  offset?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verifica que el agente solo acceda a sus propias memorias
 */
function enforceOwnership(agent: AgentAuthContext, memoryAgentId: string): boolean {
  return agent.agentId === memoryAgentId;
}

/**
 * Construye filtros de búsqueda para memorias
 */
function buildMemoryFilters(agentId: string, filters: MemorySearchRequest) {
  const conditions: any[] = [eq(agentMemory.agentId, agentId)];

  if (filters.memoryType) {
    conditions.push(eq(agentMemory.memoryType, filters.memoryType as any));
  }

  if (filters.category) {
    conditions.push(eq(agentMemory.category, filters.category as any));
  }

  if (filters.tags && filters.tags.length > 0) {
    // Buscar memorias que tengan ALGUNO de los tags (OR)
    // Usar formato de array PostgreSQL manualmente
    // @ts-ignore - tagArray is used for SQL generation
    const tagArray = filters.tags.map((t: string) => `"${t.replace(/"/g, '\\"')}"`).join(",");
    conditions.push(
      sql`${agentMemory.tags} ?| ARRAY[${sql.raw(filters.tags.map((_: string, i: number) => `$${i + 1}`).join(","))}]`
    );
  }

  if (filters.minImportance !== undefined) {
    conditions.push(gte(agentMemory.importance, filters.minImportance));
  }

  if (filters.validOnly) {
    // Memoria válida: validFrom <= NOW() AND (validUntil IS NULL OR validUntil > NOW())
    conditions.push(lte(agentMemory.validFrom, sql`NOW()`));
    conditions.push(or(isNull(agentMemory.validUntil), gt(agentMemory.validUntil, sql`NOW()`))!);
  }

  return and(...conditions);
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/agent/memory
 * Listar memorias del agente autenticado
 *
 * Query params:
 * - type: short_term | long_term | episodic | semantic
 * - category: general | conversation | task | insight | preference | context | knowledge
 * - limit: número de resultados (default: 20)
 * - offset: paginación (default: 0)
 * - valid_only: solo memorias vigentes (default: true)
 * - min_importance: filtro por importancia mínima
 */
agentMemoryRouter.get("/", async (c) => {
  const agent = c.get("agent")!;
  const requestId = c.get("requestId");

  try {
    const query = c.req.query();

    const filters: MemorySearchRequest = {
      memoryType: query.type,
      category: query.category,
      tags: query.tags?.split(","),
      minImportance: query.min_importance ? parseInt(query.min_importance) : undefined,
      validOnly: query.valid_only !== "false",
      limit: parseInt(query.limit || "20"),
      offset: parseInt(query.offset || "0"),
    };

    // Construir condiciones
    const whereClause = buildMemoryFilters(agent.agentId, filters);

    // Ejecutar query
    const memories = await db
      .select({
        id: agentMemory.id,
        key: agentMemory.key,
        memoryType: agentMemory.memoryType,
        category: agentMemory.category,
        summary: agentMemory.summary,
        importance: agentMemory.importance,
        confidence: agentMemory.confidence,
        source: agentMemory.source,
        tags: agentMemory.tags,
        validFrom: agentMemory.validFrom,
        validUntil: agentMemory.validUntil,
        accessCount: agentMemory.accessCount,
        lastAccessedAt: agentMemory.lastAccessedAt,
        createdAt: agentMemory.createdAt,
        updatedAt: agentMemory.updatedAt,
      })
      .from(agentMemory)
      .where(whereClause)
      .orderBy(desc(agentMemory.importance), desc(agentMemory.createdAt))
      .limit(filters.limit!)
      .offset(filters.offset!);

    // Contar total
    const [{ count: total }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(agentMemory)
      .where(whereClause);

    logger.debug(
      {
        agentId: agent.agentId,
        requestId,
        count: memories.length,
        total,
      },
      "Agent memory listed"
    );

    // Actualizar last_accessed para estas memorias (fire and forget)
    if (memories.length > 0) {
      const memoryIds = memories.map((m: (typeof memories)[0]) => m.id);
      db.update(agentMemory)
        .set({
          accessCount: sql`${agentMemory.accessCount} + 1`,
          lastAccessedAt: new Date(),
        })
        .where(inArray(agentMemory.id, memoryIds))
        .execute()
        .catch(() => {}); // Silenciar errores
    }

    return c.json({
      success: true,
      data: memories,
      pagination: {
        total: Number(total),
        limit: filters.limit,
        offset: filters.offset,
        hasMore: (filters.offset || 0) + memories.length < Number(total),
      },
    });
  } catch (error) {
    logger.error({ error, agentId: agent.agentId, requestId }, "Failed to list agent memories");
    return c.json(
      {
        success: false,
        error: "Failed to retrieve memories",
        code: "MEMORY_LIST_ERROR",
      },
      500
    );
  }
});

/**
 * POST /api/agent/memory
 * Crear nueva memoria
 *
 * Requiere scope: memory:write
 */
agentMemoryRouter.post(
  "/",
  requireScope("memory:write", "crear memoria", "sistema de memoria"),
  async (c) => {
    const agent = c.get("agent")!;
    const requestId = c.get("requestId");

    try {
      const body: MemoryCreateRequest = await c.req.json();

      // Validaciones
      if (!body.content || typeof body.content !== "object") {
        return c.json(
          {
            success: false,
            error: "Content is required and must be an object",
            code: "INVALID_CONTENT",
          },
          400
        );
      }

      if (body.importance !== undefined && (body.importance < 0 || body.importance > 100)) {
        return c.json(
          {
            success: false,
            error: "Importance must be between 0 and 100",
            code: "INVALID_IMPORTANCE",
          },
          400
        );
      }

      if (body.confidence !== undefined && (body.confidence < 0 || body.confidence > 100)) {
        return c.json(
          {
            success: false,
            error: "Confidence must be between 0 and 100",
            code: "INVALID_CONFIDENCE",
          },
          400
        );
      }

      // Crear memoria
      const [memory] = await db
        .insert(agentMemory)
        .values({
          agentId: agent.agentId,
          key: body.key,
          content: body.content,
          summary: body.summary,
          memoryType: body.memoryType || "short_term",
          category: body.category || "general",
          importance: body.importance ?? 50,
          confidence: body.confidence ?? 80,
          source: body.source || "agent",
          validUntil: body.validUntil ? new Date(body.validUntil) : null,
          relatedMemoryIds: body.relatedMemoryIds || [],
          tags: body.tags || [],
        })
        .returning();

      logger.info(
        {
          agentId: agent.agentId,
          memoryId: memory.id,
          requestId,
          memoryType: memory.memoryType,
          category: memory.category,
        },
        "Agent memory created"
      );

      return c.json(
        {
          success: true,
          data: {
            id: memory.id,
            key: memory.key,
            memoryType: memory.memoryType,
            category: memory.category,
            summary: memory.summary,
            importance: memory.importance,
            confidence: memory.confidence,
            source: memory.source,
            tags: memory.tags,
            validFrom: memory.validFrom,
            validUntil: memory.validUntil,
            createdAt: memory.createdAt,
          },
        },
        201
      );
    } catch (error) {
      logger.error({ error, agentId: agent.agentId, requestId }, "Failed to create agent memory");
      return c.json(
        {
          success: false,
          error: "Failed to create memory",
          code: "MEMORY_CREATE_ERROR",
        },
        500
      );
    }
  }
);

/**
 * GET /api/agent/memory/:id
 * Obtener memoria específica
 */
agentMemoryRouter.get("/:id", async (c) => {
  const agent = c.get("agent")!;
  const requestId = c.get("requestId");
  const memoryId = c.req.param("id");

  try {
    const [memory] = await db
      .select()
      .from(agentMemory)
      .where(and(eq(agentMemory.id, memoryId), eq(agentMemory.agentId, agent.agentId)))
      .limit(1);

    if (!memory) {
      return c.json(
        {
          success: false,
          error: "Memory not found",
          code: "MEMORY_NOT_FOUND",
        },
        404
      );
    }

    // Actualizar contador de acceso (fire and forget)
    db.update(agentMemory)
      .set({
        accessCount: sql`${agentMemory.accessCount} + 1`,
        lastAccessedAt: new Date(),
      })
      .where(eq(agentMemory.id, memoryId))
      .execute()
      .catch(() => {});

    logger.debug(
      {
        agentId: agent.agentId,
        memoryId,
        requestId,
      },
      "Agent memory retrieved"
    );

    return c.json({
      success: true,
      data: memory,
    });
  } catch (error) {
    logger.error(
      { error, agentId: agent.agentId, memoryId, requestId },
      "Failed to get agent memory"
    );
    return c.json(
      {
        success: false,
        error: "Failed to retrieve memory",
        code: "MEMORY_GET_ERROR",
      },
      500
    );
  }
});

/**
 * GET /api/agent/memory/key/:key
 * Obtener memoria por clave
 */
agentMemoryRouter.get("/key/:key", async (c) => {
  const agent = c.get("agent")!;
  const requestId = c.get("requestId");
  const key = c.req.param("key");

  try {
    const [memory] = await db
      .select()
      .from(agentMemory)
      .where(and(eq(agentMemory.agentId, agent.agentId), eq(agentMemory.key, key)))
      .limit(1);

    if (!memory) {
      return c.json(
        {
          success: false,
          error: "Memory not found",
          code: "MEMORY_NOT_FOUND",
        },
        404
      );
    }

    // Actualizar contador de acceso
    db.update(agentMemory)
      .set({
        accessCount: sql`${agentMemory.accessCount} + 1`,
        lastAccessedAt: new Date(),
      })
      .where(eq(agentMemory.id, memory.id))
      .execute()
      .catch(() => {});

    return c.json({
      success: true,
      data: memory,
    });
  } catch (error) {
    logger.error({ error, agentId: agent.agentId, key, requestId }, "Failed to get memory by key");
    return c.json(
      {
        success: false,
        error: "Failed to retrieve memory",
        code: "MEMORY_GET_ERROR",
      },
      500
    );
  }
});

/**
 * PUT /api/agent/memory/:id
 * Actualizar memoria
 *
 * Requiere scope: memory:write
 */
agentMemoryRouter.put(
  "/:id",
  requireScope("memory:write", "actualizar memoria", "sistema de memoria"),
  async (c) => {
    const agent = c.get("agent")!;
    const requestId = c.get("requestId");
    const memoryId = c.req.param("id");

    try {
      // Verificar que la memoria existe y pertenece al agente
      const [existing] = await db
        .select({ id: agentMemory.id, agentId: agentMemory.agentId })
        .from(agentMemory)
        .where(eq(agentMemory.id, memoryId))
        .limit(1);

      if (!existing) {
        return c.json(
          {
            success: false,
            error: "Memory not found",
            code: "MEMORY_NOT_FOUND",
          },
          404
        );
      }

      if (!enforceOwnership(agent, existing.agentId)) {
        logger.warn(
          {
            agentId: agent.agentId,
            targetMemoryId: memoryId,
            memoryOwner: existing.agentId,
            requestId,
          },
          "Agent tried to update memory belonging to another agent"
        );

        return c.json(
          {
            success: false,
            error: "You can only update your own memories",
            code: "MEMORY_ACCESS_DENIED",
          },
          403
        );
      }

      const body: MemoryUpdateRequest = await c.req.json();

      // Validaciones
      if (body.importance !== undefined && (body.importance < 0 || body.importance > 100)) {
        return c.json(
          {
            success: false,
            error: "Importance must be between 0 and 100",
            code: "INVALID_IMPORTANCE",
          },
          400
        );
      }

      if (body.confidence !== undefined && (body.confidence < 0 || body.confidence > 100)) {
        return c.json(
          {
            success: false,
            error: "Confidence must be between 0 and 100",
            code: "INVALID_CONFIDENCE",
          },
          400
        );
      }

      // Actualizar
      const [updated] = await db
        .update(agentMemory)
        .set({
          content: body.content !== undefined ? body.content : undefined,
          summary: body.summary !== undefined ? body.summary : undefined,
          importance: body.importance !== undefined ? body.importance : undefined,
          confidence: body.confidence !== undefined ? body.confidence : undefined,
          validUntil:
            body.validUntil !== undefined
              ? body.validUntil
                ? new Date(body.validUntil)
                : null
              : undefined,
          tags: body.tags !== undefined ? body.tags : undefined,
          updatedAt: new Date(),
        })
        .where(eq(agentMemory.id, memoryId))
        .returning();

      logger.info(
        {
          agentId: agent.agentId,
          memoryId,
          requestId,
        },
        "Agent memory updated"
      );

      return c.json({
        success: true,
        data: updated,
      });
    } catch (error) {
      logger.error(
        { error, agentId: agent.agentId, memoryId, requestId },
        "Failed to update agent memory"
      );
      return c.json(
        {
          success: false,
          error: "Failed to update memory",
          code: "MEMORY_UPDATE_ERROR",
        },
        500
      );
    }
  }
);

/**
 * DELETE /api/agent/memory/:id
 * Eliminar memoria
 *
 * Requiere scope: memory:delete
 */
agentMemoryRouter.delete(
  "/:id",
  requireScope("memory:delete", "eliminar memoria", "sistema de memoria"),
  async (c) => {
    const agent = c.get("agent")!;
    const requestId = c.get("requestId");
    const memoryId = c.req.param("id");

    try {
      // Verificar que la memoria existe y pertenece al agente
      const [existing] = await db
        .select({ id: agentMemory.id, agentId: agentMemory.agentId })
        .from(agentMemory)
        .where(eq(agentMemory.id, memoryId))
        .limit(1);

      if (!existing) {
        return c.json(
          {
            success: false,
            error: "Memory not found",
            code: "MEMORY_NOT_FOUND",
          },
          404
        );
      }

      if (!enforceOwnership(agent, existing.agentId)) {
        logger.warn(
          {
            agentId: agent.agentId,
            targetMemoryId: memoryId,
            memoryOwner: existing.agentId,
            requestId,
          },
          "Agent tried to delete memory belonging to another agent"
        );

        return c.json(
          {
            success: false,
            error: "You can only delete your own memories",
            code: "MEMORY_ACCESS_DENIED",
          },
          403
        );
      }

      await db.delete(agentMemory).where(eq(agentMemory.id, memoryId));

      logger.info(
        {
          agentId: agent.agentId,
          memoryId,
          requestId,
        },
        "Agent memory deleted"
      );

      return c.json({
        success: true,
        message: "Memory deleted successfully",
      });
    } catch (error) {
      logger.error(
        { error, agentId: agent.agentId, memoryId, requestId },
        "Failed to delete agent memory"
      );
      return c.json(
        {
          success: false,
          error: "Failed to delete memory",
          code: "MEMORY_DELETE_ERROR",
        },
        500
      );
    }
  }
);

/**
 * POST /api/agent/memory/search
 * Búsqueda avanzada de memorias
 *
 * Nota: La búsqueda semántica por embedding requiere pgvector
 */
agentMemoryRouter.post("/search", async (c) => {
  const agent = c.get("agent")!;
  const requestId = c.get("requestId");

  try {
    const body: MemorySearchRequest = await c.req.json();

    const filters: MemorySearchRequest = {
      memoryType: body.memoryType,
      category: body.category,
      tags: body.tags,
      minImportance: body.minImportance,
      validOnly: body.validOnly !== false,
      limit: body.limit || 20,
      offset: body.offset || 0,
    };

    const whereClause = buildMemoryFilters(agent.agentId, filters);

    // Búsqueda básica (sin embeddings por ahora)
    // TODO: Implementar búsqueda semántica con pgvector cuando esté disponible
    const memories = await db
      .select({
        id: agentMemory.id,
        key: agentMemory.key,
        memoryType: agentMemory.memoryType,
        category: agentMemory.category,
        summary: agentMemory.summary,
        content: agentMemory.content,
        importance: agentMemory.importance,
        confidence: agentMemory.confidence,
        tags: agentMemory.tags,
        validFrom: agentMemory.validFrom,
        validUntil: agentMemory.validUntil,
        createdAt: agentMemory.createdAt,
        updatedAt: agentMemory.updatedAt,
      })
      .from(agentMemory)
      .where(whereClause)
      .orderBy(desc(agentMemory.importance), desc(agentMemory.createdAt))
      .limit(filters.limit!)
      .offset(filters.offset!);

    // Si hay query string, filtrar en memoria (básico)
    let results = memories;
    if (body.query) {
      const queryLower = body.query.toLowerCase();
      results = memories.filter((m: (typeof memories)[0]) => {
        const summaryMatch = m.summary?.toLowerCase().includes(queryLower);
        const contentMatch = JSON.stringify(m.content).toLowerCase().includes(queryLower);
        const keyMatch = m.key?.toLowerCase().includes(queryLower);
        return summaryMatch || contentMatch || keyMatch;
      });
    }

    logger.debug(
      {
        agentId: agent.agentId,
        requestId,
        query: body.query,
        resultsCount: results.length,
      },
      "Agent memory search completed"
    );

    return c.json({
      success: true,
      data: results,
      search: {
        query: body.query,
        filters: {
          memoryType: body.memoryType,
          category: body.category,
          tags: body.tags,
        },
      },
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        total: results.length,
      },
    });
  } catch (error) {
    logger.error({ error, agentId: agent.agentId, requestId }, "Failed to search agent memories");
    return c.json(
      {
        success: false,
        error: "Failed to search memories",
        code: "MEMORY_SEARCH_ERROR",
      },
      500
    );
  }
});

/**
 * POST /api/agent/memory/cleanup
 * Limpiar memorias antiguas de corto plazo
 *
 * Requiere scope: memory:admin
 */
agentMemoryRouter.post(
  "/cleanup",
  requireScope("memory:admin", "limpiar memorias", "sistema de memoria"),
  async (c) => {
    const agent = c.get("agent")!;
    const requestId = c.get("requestId");

    try {
      const body = await c.req.json().catch(() => ({}));
      const maxAgeHours = body.maxAgeHours || 24;
      const minImportance = body.minImportance || 10;

      // Eliminar memorias de corto plazo antiguas con baja importancia
      const result = await db
        .delete(agentMemory)
        .where(
          and(
            eq(agentMemory.agentId, agent.agentId),
            eq(agentMemory.memoryType, "short_term"),
            lte(agentMemory.importance, minImportance),
            lt(agentMemory.createdAt, sql`NOW() - INTERVAL '1 hour' * ${maxAgeHours}`),
            or(isNull(agentMemory.validUntil), lt(agentMemory.validUntil, sql`NOW()`))!
          )
        )
        .returning({ id: agentMemory.id });

      logger.info(
        {
          agentId: agent.agentId,
          requestId,
          deletedCount: result.length,
          maxAgeHours,
          minImportance,
        },
        "Agent memory cleanup completed"
      );

      return c.json({
        success: true,
        data: {
          deletedCount: result.length,
          criteria: {
            maxAgeHours,
            minImportance,
            memoryType: "short_term",
          },
        },
      });
    } catch (error) {
      logger.error(
        { error, agentId: agent.agentId, requestId },
        "Failed to cleanup agent memories"
      );
      return c.json(
        {
          success: false,
          error: "Failed to cleanup memories",
          code: "MEMORY_CLEANUP_ERROR",
        },
        500
      );
    }
  }
);

/**
 * GET /api/agent/memory/stats
 * Estadísticas de uso de memoria del agente
 */
agentMemoryRouter.get("/stats", async (c) => {
  const agent = c.get("agent")!;
  const requestId = c.get("requestId");

  try {
    // Contar por tipo
    const typeStats = await db
      .select({
        memoryType: agentMemory.memoryType,
        count: sql<number>`COUNT(*)`,
        avgImportance: sql<number>`AVG(${agentMemory.importance})`,
        totalAccessCount: sql<number>`SUM(${agentMemory.accessCount})`,
      })
      .from(agentMemory)
      .where(eq(agentMemory.agentId, agent.agentId))
      .groupBy(agentMemory.memoryType);

    // Contar por categoría
    const categoryStats = await db
      .select({
        category: agentMemory.category,
        count: sql<number>`COUNT(*)`,
      })
      .from(agentMemory)
      .where(eq(agentMemory.agentId, agent.agentId))
      .groupBy(agentMemory.category);

    // Totales
    const [{ totalMemories, expiredMemories }] = await db
      .select({
        totalMemories: sql<number>`COUNT(*)`,
        expiredMemories: sql<number>`COUNT(CASE WHEN ${agentMemory.validUntil} < NOW() THEN 1 END)`,
      })
      .from(agentMemory)
      .where(eq(agentMemory.agentId, agent.agentId));

    // Memoria más accedida
    const [mostAccessed] = await db
      .select({
        id: agentMemory.id,
        key: agentMemory.key,
        accessCount: agentMemory.accessCount,
      })
      .from(agentMemory)
      .where(eq(agentMemory.agentId, agent.agentId))
      .orderBy(desc(agentMemory.accessCount))
      .limit(1);

    logger.debug(
      {
        agentId: agent.agentId,
        requestId,
      },
      "Agent memory stats retrieved"
    );

    return c.json({
      success: true,
      data: {
        total: Number(totalMemories),
        expired: Number(expiredMemories),
        byType: typeStats,
        byCategory: categoryStats,
        mostAccessed: mostAccessed || null,
      },
    });
  } catch (error) {
    logger.error({ error, agentId: agent.agentId, requestId }, "Failed to get agent memory stats");
    return c.json(
      {
        success: false,
        error: "Failed to get memory stats",
        code: "MEMORY_STATS_ERROR",
      },
      500
    );
  }
});

export default agentMemoryRouter;
