/**
 * Grimoire Agile — MCP (Model Context Protocol) Tools
 * 
 * Expone las capacidades del grimoire como herramientas consumibles
 * por modelos de lenguaje (Claude, Cursor, etc.)
 * 
 * @version 1.0.0
 */

import { z } from "zod";
import { eq, and, asc, desc } from "drizzle-orm";
import {
    agileProjects,
    agileIssues,
    agileStates,
    agileIntakes
} from "./agile.schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

// Tipo para la base de datos
type Database = NodePgDatabase<any>;

/**
 * Registra las herramientas MCP de Grimoire Agile
 * 
 * USO:
 * ```typescript
 * import { registerAgileTools } from "@gremius/grimoire-agile/mcp";
 * 
 * registerAgileTools(mcpServer, db);
 * ```
 */
export function registerAgileTools(server: any, db: Database) {
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // TOOL 1: agile_read_board
    // ═══════════════════════════════════════════════════════════════════════════════
    
    server.registerTool(
        "agile_read_board",
        {
            title: "Read Agile Board - READ-ONLY",
            description: `
                [READ-ONLY: Esta herramienta SOLO consulta, NUNCA modifica datos]
                
                OBTIENE el estado actual de un proyecto ágil para visualización del tablero Kanban.
                
                CAPACIDADES:
                - Lee issues organizados por estado (To Do, In Progress, Done, etc.)
                - Proporciona metadatos visuales de estados (colores hex, nombres, grupos lógicos)
                - Incluye información de asignación, prioridades y estimaciones
                - Retorna resumen con conteos por grupo de estado
                
                RESTRICCIONES IMPORTANTES:
                - Esta herramienta es SOLO LECTURA (read-only)
                - NUNCA crea, modifica ni elimina issues
                - NUNCA cambia estados de issues
                - NUNCA asigna tareas
                
                CUÁNDO USAR:
                - Usuario pregunta "¿cómo va el proyecto?", "muéstrame el tablero"
                - Necesitas contexto sobre estado actual antes de proponer cambios
                - Quieres reportar métricas del sprint (issues completados, en progreso, etc.)
                - Consultas de tipo "¿quién está trabajando en X?", "¿qué hay pendiente?"
                
                CUÁNDO NO USAR:
                - NUNCA para crear issues (usar agile_submit_intake)
                - NUNCA para modificar issues (no existe herramienta para esto)
                - NUNCA para cambiar estados de issues
                
                RELACIÓN CON OTRAS HERRAMIENTAS:
                - Si detectas un problema mientras lees el board, usa agile_submit_intake para reportarlo
                - Esta herramienta te da contexto; agile_submit_intake te permite actuar sobre ese contexto
            `.trim(),
            inputSchema: z.object({
                projectId: z.string().uuid()
                    .describe("UUID del proyecto ágil a consultar"),
                limit: z.number().min(1).max(100).default(50)
                    .describe("Máximo número de issues a retornar (1-100)"),
                stateGroup: z.enum(["backlog", "unstarted", "started", "completed", "cancelled"]).optional()
                    .describe("Filtrar por grupo de estado: backlog | unstarted | started | completed | cancelled"),
                assigneeId: z.string().optional()
                    .describe("Filtrar por ID del asignado (opcional)")
            }),
            outputSchema: z.any()
        },
        async ({ projectId, limit = 50, stateGroup, assigneeId }: { projectId: string; limit?: number; stateGroup?: string; assigneeId?: string }) => {
            try {
                // Verificar que el proyecto existe
                const [project] = await db
                    .select({
                        id: agileProjects.id,
                        name: agileProjects.name,
                        identifier: agileProjects.identifier
                    })
                    .from(agileProjects)
                    .where(eq(agileProjects.id, projectId))
                    .limit(1);

                if (!project) {
                    return {
                        isError: true,
                        content: [
                            { type: "text", text: `Error: Proyecto con ID '${projectId}' no encontrado` }
                        ]
                    };
                }

                // Obtener estados del proyecto con sus grupos
                const statesQuery = db
                    .select({
                        id: agileStates.id,
                        name: agileStates.name,
                        color: agileStates.color,
                        group: agileStates.group,
                        sequence: agileStates.sequence,
                        isDefault: agileStates.isDefault,
                        isCompleted: agileStates.isCompleted
                    })
                    .from(agileStates)
                    .where(eq(agileStates.projectId, projectId))
                    .orderBy(asc(agileStates.sequence));

                const states = await statesQuery;

                // Construir query de issues con join a estados
                let issuesQuery = db
                    .select({
                        id: agileIssues.id,
                        key: agileIssues.key,
                        name: agileIssues.name,
                        type: agileIssues.type,
                        priority: agileIssues.priority,
                        assigneeId: agileIssues.assigneeId,
                        estimate: agileIssues.estimate,
                        createdAt: agileIssues.createdAt,
                        updatedAt: agileIssues.updatedAt,
                        stateId: agileIssues.stateId,
                        stateName: agileStates.name,
                        stateColor: agileStates.color,
                        stateGroup: agileStates.group
                    })
                    .from(agileIssues)
                    .leftJoin(agileStates, eq(agileIssues.stateId, agileStates.id))
                    .where(eq(agileIssues.projectId, projectId));

                // Aplicar filtros
                if (stateGroup) {
                    issuesQuery = (issuesQuery as any).where(
                        and(
                            eq(agileIssues.projectId, projectId),
                            eq(agileStates.group, stateGroup as any)
                        )
                    );
                }

                if (assigneeId) {
                    issuesQuery = (issuesQuery as any).where(
                        and(
                            eq(agileIssues.projectId, projectId),
                            eq(agileIssues.assigneeId, assigneeId)
                        )
                    );
                }

                const issues = await issuesQuery
                    .orderBy(desc(agileIssues.updatedAt))
                    .limit(limit);

                // Organizar por estado para visualización tipo Kanban
                const boardByState = states.map(state => ({
                    state: {
                        id: state.id,
                        name: state.name,
                        color: state.color,
                        group: state.group,
                        isDefault: state.isDefault,
                        isCompleted: state.isCompleted
                    },
                    issues: issues.filter(issue => issue.stateId === state.id).map(issue => ({
                        id: issue.id,
                        key: issue.key,
                        name: issue.name,
                        type: issue.type,
                        priority: issue.priority,
                        assigneeId: issue.assigneeId,
                        estimate: issue.estimate,
                        createdAt: issue.createdAt,
                        updatedAt: issue.updatedAt
                    }))
                }));

                // Resumen del proyecto
                const summary = {
                    total: issues.length,
                    byGroup: {
                        backlog: issues.filter(i => i.stateGroup === "backlog").length,
                        unstarted: issues.filter(i => i.stateGroup === "unstarted").length,
                        started: issues.filter(i => i.stateGroup === "started").length,
                        completed: issues.filter(i => i.stateGroup === "completed").length,
                        cancelled: issues.filter(i => i.stateGroup === "cancelled").length
                    }
                };

                const result = {
                    project: {
                        id: project.id,
                        name: project.name,
                        identifier: project.identifier
                    },
                    summary,
                    board: boardByState,
                    totalIssues: issues.length,
                    statesCount: states.length
                };

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };

            } catch (error: any) {
                return {
                    isError: true,
                    content: [
                        { type: "text", text: `Error al leer el board: ${error.message}` }
                    ]
                };
            }
        }
    );

    // ═══════════════════════════════════════════════════════════════════════════════
    // TOOL 2: agile_submit_intake
    // ═══════════════════════════════════════════════════════════════════════════════
    
    server.registerTool(
        "agile_submit_intake",
        {
            title: "Submit Intake to Triage - SOLO CANAL DE ESCRITURA PERMITIDO",
            description: `
                [ESCRITURA CONTROLADA: ÚNICA herramienta disponible para proponer cambios al proyecto]
                
                ⚠️⚠️⚠️ RESTRICCIÓN CRÍTICA PARA MODELOS DE IA:
                Esta herramienta es el ÚNICO canal permitido para proponer modificaciones al proyecto.
                NO existe ninguna otra herramienta que permita crear o modificar issues directamente.
                
                QUÉ HACE:
                Crea una sugerencia (intake) en la bandeja de entrada (tabla agile_intakes) con estado 'pending'.
                NUNCA escribe directamente en la tabla agile_issues (board visible).
                
                ARQUITECTURA DE SEGURIDAD:
                ┌────────────────────────────────────────────────────────────────┐
                │  TU LLAMADA (agile_submit_intake)                              │
                │     ↓                                                          │
                │  CREA intake en agile_intakes (status='pending')              │
                │     ↓                                                          │
                │  HUMANO revisa en bandeja de entrada                          │
                │     ↓                                                          │
                │  HUMANO decide: [Aprobar] o [Rechazar]                        │
                │     ↓ (si aprueba)                                             │
                │  SISTEMA crea issue en agile_issues (transacción atómica)     │
                │     ↓                                                          │
                │  Issue visible en board (agile_read_board)                    │
                └────────────────────────────────────────────────────────────────┘
                
                CONSECUENCIAS DE ESTA ARQUITECTURA:
                - Las sugerencias de IA NO aparecen inmediatamente en el board
                - Requieren aprobación humana explícita
                - Evita que la IA contamine el backlog con issues no deseados
                - Mantiene el control humano sobre el proyecto
                
                CUÁNDO DEBES USAR ESTA HERRAMIENTA (OBLIGATORIO):
                ✅ Siempre que detectes un bug o error
                ✅ Siempre que tengas una sugerencia de mejora
                ✅ Siempre que quieras proponer una nueva feature
                ✅ Si un usuario te pide "crear un ticket" o "reportar un issue"
                ✅ Si identificas trabajo técnico que debe hacerse
                
                CUÁNDO NO USAR (NO APLICA):
                ❌ No existe alternativa - esta es la única forma de proponer cambios
                
                PARÁMETRO 'payload' - OBJETO FLEXIBLE:
                El campo 'payload' acepta CUALQUIER objeto JSON válido. Úsalo para incluir:
                - Logs de error (stack traces, mensajes de error)
                - Metadatos técnicos (versiones, entornos, URLs)
                - Contexto de análisis (confianza de la predicción, fuentes)
                - Datos de soporte (screenshots en base64, JSON de request/response)
                - Cualquier información que ayude al humano a evaluar la sugerencia
                
                Ejemplo de payload rico:
                {
                  "errorLog": "TypeError: Cannot read property...",
                  "confidence": 0.95,
                  "affectedEndpoints": ["/api/login", "/api/register"],
                  "lastWorkingVersion": "v2.1.0"
                }
                
                NOTA SOBRE URGENCIA:
                Si consideras que algo es "urgente", usa suggestedPriority="urgent", pero entiende
                que aún así requiere aprobación humana. No hay bypass para el proceso de triage.
            `.trim(),
            inputSchema: z.object({
                projectId: z.string().uuid()
                    .describe("UUID del proyecto donde se creará el intake"),
                title: z.string().min(1).max(255)
                    .describe("Título descriptivo de la sugerencia o bug"),
                description: z.string().max(5000).optional()
                    .describe("Descripción detallada del issue (opcional)"),
                suggestedType: z.enum(["issue", "feature", "bug", "improvement", "spike"]).default("issue")
                    .describe("Tipo sugerido: issue | feature | bug | improvement | spike"),
                suggestedPriority: z.enum(["urgent", "high", "medium", "low"]).default("medium")
                    .describe("Prioridad sugerida: urgent | high | medium | low"),
                payload: z.record(z.any()).optional()
                    .describe("Datos adicionales en formato JSON (logs, metadatos, contexto técnico, etc.)"),
                source: z.string().default("ai_agent")
                    .describe("Origen de la sugerencia: ai_agent | api | slack | email | web_form")
            }),
            outputSchema: z.any()
        },
        async ({ 
            projectId, 
            title, 
            description, 
            suggestedType, 
            suggestedPriority, 
            payload = {},
            source = "ai_agent"
        }: {
            projectId: string;
            title: string;
            description?: string;
            suggestedType: string;
            suggestedPriority: string;
            payload?: Record<string, any>;
            source?: string;
        }) => {
            try {
                // Verificar que el proyecto existe
                const [project] = await db
                    .select({ id: agileProjects.id, name: agileProjects.name })
                    .from(agileProjects)
                    .where(eq(agileProjects.id, projectId))
                    .limit(1);

                if (!project) {
                    return {
                        isError: true,
                        content: [
                            { type: "text", text: `Error: Proyecto con ID '${projectId}' no encontrado` }
                        ]
                    };
                }

                // Crear el intake en la bandeja de entrada
                const [intake] = await db
                    .insert(agileIntakes)
                    .values({
                        projectId,
                        title,
                        description: description || null,
                        suggestedType: suggestedType as any,
                        suggestedPriority: suggestedPriority as any,
                        source,
                        sourceData: {
                            ...payload,
                            aiAgentId: "mcp-agent",
                            timestamp: new Date().toISOString()
                        },
                        status: "pending",
                        createdBy: "mcp-agent",
                        createdByName: "MCP Agent"
                    } as any)
                    .returning();

                const result = {
                    success: true,
                    message: `Intake creado exitosamente y enviado a la bandeja de entrada para triage`,
                    intake: {
                        id: intake.id,
                        title: intake.title,
                        status: intake.status,
                        project: {
                            id: project.id,
                            name: project.name
                        },
                        suggestedType: intake.suggestedType,
                        suggestedPriority: intake.suggestedPriority,
                        createdAt: intake.createdAt
                    },
                    nextSteps: [
                        "El intake está en estado 'pending' esperando aprobación",
                        "Un humano debe revisar y aprobar/rechazar el intake",
                        "Solo después de aprobación se creará el issue en el board"
                    ]
                };

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };

            } catch (error: any) {
                return {
                    isError: true,
                    content: [
                        { type: "text", text: `Error al crear intake: ${error.message}` }
                    ]
                };
            }
        }
    );
}

/**
 * Definiciones de herramientas para registro manual
 * 
 * Útil si el servidor MCP no usa el método registerTool del SDK
 */
export const agileMcpToolDefinitions = [
    {
        name: "agile_read_board",
        description: "[READ-ONLY] Obtiene el estado actual del tablero Kanban. NUNCA modifica datos. Usar para consultar estado del proyecto, issues por estado, asignaciones y métricas. Para proponer cambios usar agile_submit_intake.",
        warning: "Esta herramienta es SOLO LECTURA. No puede crear ni modificar issues.",
        inputSchema: {
            type: "object" as const,
            properties: {
                projectId: {
                    type: "string",
                    description: "UUID del proyecto ágil a consultar"
                },
                limit: {
                    type: "number",
                    description: "Máximo número de issues a retornar (1-100)",
                    default: 50
                },
                stateGroup: {
                    type: "string",
                    enum: ["backlog", "unstarted", "started", "completed", "cancelled"],
                    description: "Filtrar por grupo de estado"
                },
                assigneeId: {
                    type: "string",
                    description: "Filtrar por ID del asignado (opcional)"
                }
            },
            required: ["projectId"]
        }
    },
    {
        name: "agile_submit_intake",
        description: "[ÚNICO CANAL DE ESCRITURA] Crea sugerencia en bandeja de entrada (agile_intakes). ÚNICA forma de proponer cambios. NUNCA escribe directamente en agile_issues. Requiere aprobación humana. El campo 'payload' acepta cualquier objeto JSON flexible para logs/metadatos.",
        warning: "ÚNICA herramienta disponible para proponer cambios. Las sugerencias quedan en estado 'pending' hasta aprobación humana.",
        inputSchema: {
            type: "object" as const,
            properties: {
                projectId: {
                    type: "string",
                    description: "UUID del proyecto donde se creará el intake"
                },
                title: {
                    type: "string",
                    description: "Título descriptivo de la sugerencia o bug"
                },
                description: {
                    type: "string",
                    description: "Descripción detallada del issue (opcional)"
                },
                suggestedType: {
                    type: "string",
                    enum: ["issue", "feature", "bug", "improvement", "spike"],
                    description: "Tipo sugerido",
                    default: "issue"
                },
                suggestedPriority: {
                    type: "string",
                    enum: ["urgent", "high", "medium", "low"],
                    description: "Prioridad sugerida",
                    default: "medium"
                },
                payload: {
                    type: "object",
                    description: "Datos adicionales flexibles en formato JSON. Acepta cualquier estructura: logs, metadatos técnicos, contexto de análisis, etc.",
                    additionalProperties: true,
                    properties: {},
                    examples: [
                        { "errorLog": "TypeError: Cannot read property...", "confidence": 0.95 },
                        { "endpoint": "/api/login", "method": "POST", "statusCode": 500 },
                        { "screenshot": "base64...", "browser": "Chrome 120", "os": "Windows 11" }
                    ]
                },
                source: {
                    type: "string",
                    description: "Origen de la sugerencia",
                    default: "ai_agent"
                }
            },
            required: ["projectId", "title"]
        }
    }
];

/**
 * Handlers para ejecución manual de las herramientas
 * 
 * Útil para integración con el servidor MCP existente
 */
export async function executeAgileTool(
    name: string,
    args: any,
    db: Database
): Promise<{ content: any[]; isError?: boolean }> {
    
    switch (name) {
        case "agile_read_board": {
            const { projectId, limit = 50, stateGroup, assigneeId } = args;
            
            try {
                const [project] = await db
                    .select({ id: agileProjects.id, name: agileProjects.name, identifier: agileProjects.identifier })
                    .from(agileProjects)
                    .where(eq(agileProjects.id, projectId))
                    .limit(1);

                if (!project) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: `Proyecto '${projectId}' no encontrado` }]
                    };
                }

                const states = await db
                    .select({ id: agileStates.id, name: agileStates.name, color: agileStates.color, group: agileStates.group })
                    .from(agileStates)
                    .where(eq(agileStates.projectId, projectId))
                    .orderBy(asc(agileStates.sequence));

                let query = db
                    .select({
                        id: agileIssues.id,
                        key: agileIssues.key,
                        name: agileIssues.name,
                        type: agileIssues.type,
                        priority: agileIssues.priority,
                        assigneeId: agileIssues.assigneeId,
                        estimate: agileIssues.estimate,
                        stateId: agileIssues.stateId,
                        stateName: agileStates.name,
                        stateColor: agileStates.color,
                        stateGroup: agileStates.group
                    })
                    .from(agileIssues)
                    .leftJoin(agileStates, eq(agileIssues.stateId, agileStates.id))
                    .where(eq(agileIssues.projectId, projectId));

                if (stateGroup) {
                    query = (query as any).where(and(eq(agileIssues.projectId, projectId), eq(agileStates.group, stateGroup)));
                }

                if (assigneeId) {
                    query = (query as any).where(and(eq(agileIssues.projectId, projectId), eq(agileIssues.assigneeId, assigneeId)));
                }

                const issues = await query.limit(limit);

                const board = states.map(state => ({
                    state: { name: state.name, color: state.color, group: state.group },
                    issues: issues.filter(i => i.stateId === state.id).map(i => ({
                        key: i.key,
                        name: i.name,
                        priority: i.priority,
                        assigneeId: i.assigneeId
                    }))
                }));

                return {
                    content: [{ type: "text", text: JSON.stringify({ project, board }, null, 2) }]
                };

            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Error: ${error.message}` }]
                };
            }
        }

        case "agile_submit_intake": {
            const { projectId, title, description, suggestedType = "issue", suggestedPriority = "medium", payload = {}, source = "ai_agent" } = args;
            
            try {
                const [project] = await db
                    .select({ id: agileProjects.id })
                    .from(agileProjects)
                    .where(eq(agileProjects.id, projectId))
                    .limit(1);

                if (!project) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: `Proyecto '${projectId}' no encontrado` }]
                    };
                }

                const [intake] = await db
                    .insert(agileIntakes)
                    .values({
                        projectId,
                        title,
                        description: description || null,
                        suggestedType: suggestedType as any,
                        suggestedPriority: suggestedPriority as any,
                        source,
                        sourceData: payload,
                        status: "pending",
                        createdBy: "mcp-agent"
                    })
                    .returning();

                return {
                    content: [{
                        type: "text",
                        text: `Intake creado: ${intake.id} (status: ${intake.status})`
                    }]
                };

            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Error: ${error.message}` }]
                };
            }
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}
