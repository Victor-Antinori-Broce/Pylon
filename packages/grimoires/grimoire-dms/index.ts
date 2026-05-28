/**
 * @gremius/grimoire-dms — Document Management System (Modern)
 * 
 * Sistema profesional de gestión documental con:
 * - Categories (Hierarchical tree structure)
 * - Documents (Metadata, ACL, workflow status)
 * - Versions (Semantic versioning: major.minor.patch)
 * - Files (Multi-file support with checksums)
 * - Relations (linked documents)
 * - Acknowledgments (required reading confirmations)
 * - Audit trail (complete access logging)
 * 
 * Layer: Grimoire Core (Nivel 3 — loaded via module-loader)
 * Mount: /api/dms
 * 
 * @version 1.0.0
 */

import { Hono } from "hono";
import type { GrimoireContext, GrimoireDefinition } from "@gremius/shared";
import { defineGrimoire } from "@gremius/shared";
import { createDMSRouter } from "./dms.routes";

// ═══════════════════════════════════════════════════════════════════════════════
// Schema Exports
// ═══════════════════════════════════════════════════════════════════════════════

export {
    // Enums
    documentTypeEnum,
    documentStatusEnum,
    versionStatusEnum,
    changeTypeEnum,
    // Tablas
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
} from "./dms.schema";

// ═══════════════════════════════════════════════════════════════════════════════
// Type Exports
// ═══════════════════════════════════════════════════════════════════════════════

export type {
    DmsCategory,
    NewDmsCategory,
    DmsDocument,
    NewDmsDocument,
    DmsDocumentVersion,
    NewDmsDocumentVersion,
    DmsDocumentFile,
    NewDmsDocumentFile,
    DmsDocumentRelation,
    NewDmsDocumentRelation,
    DmsDocumentAcknowledgment,
    NewDmsDocumentAcknowledgment,
    DmsAccessLog,
    NewDmsAccessLog,
    DmsWorkflowNotification,
    NewDmsWorkflowNotification,
    DmsDocumentSlugHistory,
    NewDmsDocumentSlugHistory,
    DmsDocumentComment,
    NewDmsDocumentComment,
    DmsDocumentDiagram,
    NewDmsDocumentDiagram,
} from "./dms.schema";

// ═══════════════════════════════════════════════════════════════════════════════
// Grimoire Definition (Modern DI Pattern)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Factory function que crea el router con Dependency Injection
 * Usado por el module-loader para montar el grimoire
 */
export function createGrimoireDMS(ctx: GrimoireContext): Hono {
    return createDMSRouter(ctx);
}

/**
 * Definición completa del grimoire para registro automático
 * Compatible con el sistema de module-loader v3
 */
export const grimoire: GrimoireDefinition = defineGrimoire({
    id: "grimoire-dms",
    name: "Document Management System",
    version: "2.0.0",
    description: "Sistema de gestión documental con versionado semántico, workflows de aprobación y trazabilidad completa",
    icon: "FileText",
    mountPath: "/api/dms",
    
    // Factory que crea el router con contexto inyectado
    createRouter: createGrimoireDMS,
    
    // Hooks de ciclo de vida
    hooks: {
        onStartup: async (ctx) => {
            ctx.logger.info("📄 DMS grimoire initialized");
            
            // Verificar tablas principales
            const requiredTables = [
                "dms_categories",
                "dms_documents",
                "dms_document_versions",
                "dms_document_files",
                "dms_document_relations",
                "dms_document_acknowledgments",
                "dms_access_log",
                "dms_workflow_notifications",
                "dms_document_slug_history",
                "dms_document_comments",
                "dms_document_diagrams",
            ];
            
            for (const table of requiredTables) {
                const exists = await ctx.db.tableExists(table);
                if (!exists) {
                    ctx.logger.warn(`⚠️ Table '${table}' not found. Run migrations!`);
                }
            }
        },
        
        onEnable: async (ctx) => {
            ctx.logger.info("📄 DMS enabled");
        },
        
        onDisable: async (ctx) => {
            ctx.logger.info("📄 DMS disabled");
        }
    },
    
    // Admin UI configuration
    admin: {
        category: "content",
        views: [
            { id: "dashboard", type: "custom", title: "DMS Dashboard" },
            { id: "documents", type: "grid", title: "Documents", table: "dms_documents" },
            { id: "categories", type: "grid", title: "Categories", table: "dms_categories" },
            { id: "pending-review", type: "grid", title: "Pending Review", table: "dms_document_versions" },
            { id: "audit-log", type: "grid", title: "Audit Log", table: "dms_access_log" }
        ]
    },
    
    // Tablas que administra
    tables: [
        "dms_categories",
        "dms_documents",
        "dms_document_versions",
        "dms_document_files",
        "dms_document_relations",
        "dms_document_acknowledgments",
        "dms_access_log",
        "dms_workflow_notifications",
        "dms_document_slug_history",
        "dms_document_comments",
        "dms_document_diagrams",
    ],
    
    // Dependencias
    dependencies: {
        grimoires: [],
        core: ["auth"]
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Re-export routes for compatibility
// ═══════════════════════════════════════════════════════════════════════════════

export { createDMSRouter } from "./dms.routes";

// Legacy exports for compatibility
export { createDMSRouter as dmsRoutes };
export { createGrimoireDMS as default };
