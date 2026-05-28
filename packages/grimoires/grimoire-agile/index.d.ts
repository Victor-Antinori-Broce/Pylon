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
import { createAgileRouter } from "./agile.routes";
export { issueTypeEnum, issuePriorityEnum, cycleStatusEnum, moduleStatusEnum, intakeStatusEnum, linkTypeEnum, estimateTypeEnum, stateGroupEnum, agileProjects, agileStates, agileIssues, agileCycles, agileModules, agileIntakes, agileComments, agileLabels, agileEstimates, agileModuleIssues, agileIssueLabels, agileIssueLinks, agileActivityLog, agileProjectsRelations, agileStatesRelations, agileIssuesRelations, agileCyclesRelations, agileModulesRelations, agileIntakesRelations, agileCommentsRelations, agileLabelsRelations, agileModuleIssuesRelations, agileIssueLabelsRelations, agileIssueLinksRelations, agileActivityLogRelations, } from "./agile.schema";
export type { AgileProject, NewAgileProject, AgileState, NewAgileState, AgileIssue, NewAgileIssue, AgileCycle, NewAgileCycle, AgileModule, NewAgileModule, AgileIntake, NewAgileIntake, AgileComment, NewAgileComment, AgileLabel, NewAgileLabel, AgileEstimate, NewAgileEstimate, AgileIssueLink, NewAgileIssueLink, AgileActivityLog, NewAgileActivityLog, } from "./agile.schema";
/**
 * Factory function que crea el router con Dependency Injection
 * Usado por el module-loader para montar el grimoire
 */
export declare function createGrimoireAgile(ctx: GrimoireContext): Hono;
/**
 * Definición completa del grimoire para registro automático
 * Compatible con el sistema de module-loader v3
 */
export declare const grimoire: GrimoireDefinition;
export { registerAgileTools, agileMcpToolDefinitions, executeAgileTool, } from "./mcp";
export declare const grimoireMetadata: {
    id: string;
    name: string;
    version: string;
    description: string;
    mountPath: string;
    layer: number;
    features: string[];
    tables: string[];
    mcpTools: string[];
};
export { createAgileRouter as agileRoutes };
export { createAgileRouter as agileModuleRoutes };
//# sourceMappingURL=index.d.ts.map