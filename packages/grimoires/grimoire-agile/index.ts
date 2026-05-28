/**
 * @gremius/grimoire-agile — Agile Project Management (Modern)
 * 
 * Sistema profesional de gestión ágil con:
 * - Projects, States, Issues (Core)
 * - Cycles (Sprints - Time tracking)
 * - Modules (Epics - Scope tracking)
 * - Intakes (Triage for AI with human approval)
 * 
 * Layer: Grimoire Core (Nivel 3 — loaded via module-loader)
 * Mount: /api/agile
 * 
 * @version 1.1.0
 */

import { Hono } from "hono";
import type { GrimoireContext, GrimoireDefinition } from "@gremius/shared";
import { defineGrimoire } from "@gremius/shared";
import { createAgileRouter } from "./agile.routes";

// ═══════════════════════════════════════════════════════════════════════════════
// Schema Exports
// ═══════════════════════════════════════════════════════════════════════════════

export {
    // Enums
    issueTypeEnum,
    issuePriorityEnum,
    cycleStatusEnum,
    moduleStatusEnum,
    intakeStatusEnum,
    linkTypeEnum,
    estimateTypeEnum,
    stateGroupEnum,
    // Tablas
    agileProjects,
    agileStates,
    agileIssues,
    agileCycles,
    agileModules,
    agileIntakes,
    agileComments,
    agileLabels,
    agileEstimates,
    agileModuleIssues,
    agileIssueLabels,
    agileIssueLinks,
    agileActivityLog,
    // Relaciones
    agileProjectsRelations,
    agileStatesRelations,
    agileIssuesRelations,
    agileCyclesRelations,
    agileModulesRelations,
    agileIntakesRelations,
    agileCommentsRelations,
    agileLabelsRelations,
    agileModuleIssuesRelations,
    agileIssueLabelsRelations,
    agileIssueLinksRelations,
    agileActivityLogRelations,
} from "./agile.schema";

// ═══════════════════════════════════════════════════════════════════════════════
// Type Exports
// ═══════════════════════════════════════════════════════════════════════════════

export type {
    AgileProject,
    NewAgileProject,
    AgileState,
    NewAgileState,
    AgileIssue,
    NewAgileIssue,
    AgileCycle,
    NewAgileCycle,
    AgileModule,
    NewAgileModule,
    AgileIntake,
    NewAgileIntake,
    AgileComment,
    NewAgileComment,
    AgileLabel,
    NewAgileLabel,
    AgileEstimate,
    NewAgileEstimate,
    AgileIssueLink,
    NewAgileIssueLink,
    AgileActivityLog,
    NewAgileActivityLog,
} from "./agile.schema";

// ═══════════════════════════════════════════════════════════════════════════════
// Grimoire Definition (Modern DI Pattern)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Factory function que crea el router con Dependency Injection
 * Usado por el module-loader para montar el grimoire
 */
export function createGrimoireAgile(ctx: GrimoireContext): Hono {
    return createAgileRouter(ctx);
}

/**
 * Definición completa del grimoire para registro automático
 * Compatible con el sistema de module-loader v3
 */
export const grimoire: GrimoireDefinition = defineGrimoire({
    id: "grimoire-agile",
    name: "Agile Tracker",
    version: "1.1.0",
    description: "Sistema de gestión ágil con aprobación humana para sugerencias de IA",
    icon: "Kanban",
    mountPath: "/api/agile",
    
    // Factory que crea el router con contexto inyectado
    createRouter: createGrimoireAgile,
    
    // Hooks de ciclo de vida
    hooks: {
        onStartup: async (ctx) => {
            ctx.logger.info("📋 Agile grimoire initialized");
            
            // Verificar tablas principales
            const requiredTables = [
                "agile_projects",
                "agile_states", 
                "agile_issues",
                "agile_cycles",
                "agile_modules",
                "agile_intakes"
            ];
            
            for (const table of requiredTables) {
                const exists = await ctx.db.tableExists(table);
                if (!exists) {
                    ctx.logger.warn(`⚠️ Table '${table}' not found. Run migrations!`);
                }
            }
        },
        
        onEnable: async (ctx) => {
            ctx.logger.info("📋 Agile Tracker enabled");
        },
        
        onDisable: async (ctx) => {
            ctx.logger.info("📋 Agile Tracker disabled");
        }
    },
    
    // Admin UI configuration
    admin: {
        category: "productivity",
        views: [
            { id: "projects", type: "grid", title: "Projects", table: "agile_projects" },
            { id: "board", type: "custom", title: "Board View" },
            { id: "intakes", type: "grid", title: "Intake Triage", table: "agile_intakes" },
            { id: "cycles", type: "grid", title: "Sprints", table: "agile_cycles" },
            { id: "modules", type: "grid", title: "Epics", table: "agile_modules" }
        ]
    },
    
    // Tablas que administra
    tables: [
        "agile_projects",
        "agile_states",
        "agile_issues",
        "agile_cycles",
        "agile_modules",
        "agile_intakes",
        "agile_comments",
        "agile_labels",
        "agile_estimates",
        "agile_module_issues",
        "agile_issue_labels",
        "agile_issue_links",
        "agile_activity_log"
    ],
    
    // Dependencias
    dependencies: {
        grimoires: [],
        core: ["auth"]
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MCP Tools Exports
// ═══════════════════════════════════════════════════════════════════════════════

export {
    registerAgileTools,
    agileMcpToolDefinitions,
    executeAgileTool,
} from "./mcp";

// ═══════════════════════════════════════════════════════════════════════════════
// Metadata
// ═══════════════════════════════════════════════════════════════════════════════

export const grimoireMetadata = {
    id: "grimoire-agile",
    name: "Agile Tracker",
    version: "1.1.0",
    description: "Sistema de gestión ágil con aprobación humana para sugerencias de IA",
    mountPath: "/api/agile",
    layer: 3,
    features: [
        "project-management",
        "custom-workflows",
        "kanban-board",
        "sprint-management",
        "epic-tracking",
        "ai-triage",
        "human-approval",
        "mcp-integration"
    ],
    tables: [
        "agile_projects",
        "agile_states",
        "agile_issues",
        "agile_cycles",
        "agile_modules",
        "agile_intakes",
        "agile_comments",
        "agile_labels",
        "agile_estimates",
        "agile_module_issues",
        "agile_issue_labels",
        "agile_issue_links",
        "agile_activity_log"
    ],
    mcpTools: [
        "agile_read_board",
        "agile_submit_intake"
    ]
};

// Legacy exports for compatibility
export { createAgileRouter as agileRoutes };
export { createAgileRouter as agileModuleRoutes };
