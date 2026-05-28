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
import { Hono } from "hono";
import type { AppVariables } from "@/types/hono";
declare const agentMemoryRouter: Hono<{
    Variables: AppVariables;
}, import("hono/types").BlankSchema, "/">;
export default agentMemoryRouter;
//# sourceMappingURL=agent-memory.d.ts.map