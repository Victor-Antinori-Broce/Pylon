/**
 * GremiusCMS — Grimoire Classification System (La Jerarquía Mágica)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LORE REFACTOR: Jerarquía Mágica de Gremius
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ARCHITECTURE:
 *
 *   ENGINE (invisible, always active, NOT grimoires):
 *     Schema Engine, Auth Manager, API Gateway, Valkey, Grimoire Loader
 *     Media Hub ← Infrastructure, not a grimoire
 *     Data Sets ← NOW A CORE GRIMOIRE (grimoire-datasets), toggleable
 *
 *   CORE GRIMOIRES (shown, toggleable, realm-agnostic):
 *     Blog, Webhooks, Connectors, Blocks, Formulas KPI
 *
 *   OPTIONAL GRIMOIRES (shown, toggleable, vertical features):
 *     Academy, DMS, Booking, Directory, CRM, Blog
 *
 *   REALM GRIMOIRES (shown in OPTIONAL section with "Enabled by Realm" badge):
 *     Games, Streamers, Platforms, Tags, Collections (when Realm Esports active)
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
// ═══════════════════════════════════════════════════════════════
// GRIMOIRE REGISTRY
// ═══════════════════════════════════════════════════════════════
export const GRIMOIRE_REGISTRY = [
    // ═════════════════════════════════════════════════════════════
    // NIVEL 2 — CORE GRIMOIRES (switchable via gremius.config.ts)
    // category: "core" | "grimoire-core" — Shown in admin, gated by feature flags
    // NOTE: media-library is ENGINE infrastructure (Level 1), NOT here
    // NOTE: DataSets is NOW a grimoire (was: engine feature, now: core grimoire)
    // ═══════════════════════════════════════════════════════════════
    // MEDIA LIBRARY - Core grimoire, file uploads & storage
    {
        key: "grimoire-media",
        name: "Media Library",
        description: "File uploads, image optimization, and pluggable storage (MinIO, S3, Local, R2).",
        icon: "🖼️",
        color: "#EC4899",
        category: "core",
        tables: ["media", "media_folders"],
        dependsOn: [],
        referencedBy: [
            { grimoire: "grimoire-blog", table: "blog_posts", column: "cover_image_id", label: "Blog post cover images" },
        ],
    },
    // DATASETS - Core grimoire, enabled by default, positioned first in admin
    {
        key: "grimoire-datasets",
        name: "DataSets",
        description: "Dynamic data collections with automatic REST API, validation, and RLS. The foundation of Gremius content management.",
        icon: "🗃️",
        color: "#3B82F6",
        category: "core",
        tables: ["data_sets", "data_entries"],
        dependsOn: [],
        referencedBy: [
            { grimoire: "grimoire-blog", table: "blog_posts", column: "dataset_id", label: "Blog posts using datasets" },
            { grimoire: "grimoire-crm", table: "crm_deals", column: "dataset_id", label: "CRM deals using datasets" },
        ],
    },
    // NOTE: Webhooks merged into Actions Engine (Nivel 1). Not a standalone grimoire.
    // NOTE: Data Connectors moved to Settings > Integrations. Not a grimoire.
    {
        key: "grimoire-blocks",
        name: "Page Builder",
        description: "Lego-style block system for dynamic page layouts (Hero, Grid, Filter, etc.) with drag & drop, templates, and scheduling.",
        icon: "🧱",
        color: "#3B82F6",
        category: "grimoire-core",
        tables: ["pages", "blocks", "block_templates"],
        dependsOn: [],
        referencedBy: [],
    },
    // ═══════════════════════════════════════════════════════════════
    // OPTIONAL GRIMOIRES — Vertical/enterprise features
    // ═══════════════════════════════════════════════════════════════
    {
        key: "grimoire-academy-lms",
        name: "Gremius Academy LMS",
        description: "Learning Management System with courses, modules, quizzes, learning paths, progress tracking, groups, and satisfaction surveys.",
        icon: "🎓",
        color: "#6366F1",
        category: "optional",
        tables: [
            "perfil_usuario_capacitaciones",
            "cursos",
            "grupos_asignacion",
            "grupo_usuarios",
            "grupo_supervisores",
            "modulos",
            "temas",
            "archivos_adicionales",
            "quizzes",
            "preguntas",
            "opciones",
            "progreso_cursos",
            "progreso_modulos",
            "progreso_temas",
            "respuestas_usuario",
            "resultados_quiz",
            "learning_paths",
            "learning_path_cursos",
            "progreso_learning_paths",
            "asignaciones_learning_path",
            "asignaciones",
            "feedback",
            "encuestas_satisfaccion",
            "certificados",
            "actividad_log"
        ],
        dependsOn: ["users"],
        referencedBy: [],
    },
    {
        key: "grimoire-dms",
        name: "Document Management",
        description: "Versioned document storage with hierarchical categories, semantic versioning, approval workflows, and comprehensive audit trail. Optimized for manuals and corporate documentation.",
        icon: "📄",
        color: "#FF9100",
        category: "optional",
        tables: [
            "dms_categories",
            "dms_documents",
            "dms_document_versions",
            "dms_document_files",
            "dms_document_relations",
            "dms_document_acknowledgments",
            "dms_access_log",
        ],
        dependsOn: [],
        referencedBy: [],
    },
    {
        key: "grimoire-booking",
        name: "Booking Engine",
        description: "Room reservations with conflict detection, amenities management, approval workflows, and check-in/out tracking.",
        icon: "📅",
        color: "#00BFA5",
        category: "optional",
        tables: ["rooms", "amenities", "room_amenities", "bookings", "booking_notes", "blackout_dates"],
        dependsOn: [],
        referencedBy: [],
    },
    {
        key: "grimoire-directory",
        name: "Employee Directory",
        description: "Employee profiles, departments, positions, and organizational hierarchy with org charts, reporting chains, and document management.",
        icon: "👥",
        color: "#448AFF",
        category: "optional",
        tables: ["organizations", "departments", "positions", "employees", "employee_documents", "org_chart_cache"],
        dependsOn: [],
        referencedBy: [],
    },
    {
        key: "grimoire-crm",
        name: "Gremius CRM",
        description: "Contacts, deals pipeline, and activity log built on Data Sets with automation hooks.",
        icon: "💼",
        color: "#E91E63",
        category: "optional",
        tables: [],
        dependsOn: [],
        referencedBy: [],
    },
    {
        key: "grimoire-blog",
        name: "Blog & Content Publishing",
        description: "Complete CMS publishing with editorial workflow, SEO, slugs, scheduling. Includes former 'Promote' functionality.",
        icon: "📝",
        color: "#76FF03",
        category: "grimoire-core",
        tables: ["blog_posts", "blog_posts_to_tags", "blog_posts_to_games"],
        dependsOn: ["grimoire-media"],
        referencedBy: [],
    },
    {
        key: "ai-memories",
        name: "AI Memories",
        description: "Vector-based semantic memory storage with pgvector. Supports OpenAI embeddings, document chunking, and similarity search for RAG applications.",
        icon: "🧠",
        color: "#9C27B0",
        category: "optional",
        tables: ["ai_memories", "ai_memory_chunks"],
        dependsOn: [],
        referencedBy: [],
    },
    // ═══════════════════════════════════════════════════════════════
    // REALM GRIMOIRES — Bundled with Gremius CMS Realm (Consolidados)
    // Show in OPTIONAL section with "Enabled by Realm" badge when active
    // ═══════════════════════════════════════════════════════════════
    {
        key: "grimoire-games",
        name: "Games Catalog",
        description: "Complete game library with IGDB integration: games, platforms, tags, and collections.",
        icon: "🎮",
        color: "#00E5FF",
        category: "realm",
        realmId: "gremius-cms-realm",
        tables: ["games", "platforms", "tags", "game_collections", "game_collection_entries", "games_to_platforms", "games_to_tags"],
        dependsOn: [],
        referencedBy: [
            { grimoire: "blog", table: "blog_posts_to_games", column: "game_id", label: "Blog posts referencing games" },
            { grimoire: "grimoire-streamers", table: "games_to_streamers", column: "game_id", label: "Streamers linked to games" },
            { grimoire: "grimoire-esports", table: "tournaments", column: "game_id", label: "Tournaments using games" },
        ],
    },
    {
        key: "grimoire-esports",
        name: "Esports",
        description: "Complete competitive ecosystem: players, teams, tournaments, and matches.",
        icon: "🏆",
        color: "#FFD600",
        category: "realm",
        realmId: "gremius-cms-realm",
        tables: ["players", "teams", "players_to_teams", "tournaments", "tournament_participants", "matches"],
        dependsOn: ["grimoire-games"],
        referencedBy: [],
    },
    {
        key: "grimoire-streamers",
        name: "Streamers",
        description: "Track live streamers across Twitch, YouTube, and Kick with real-time sync.",
        icon: "📡",
        color: "#FF6E40",
        category: "realm",
        realmId: "gremius-cms-realm",
        tables: ["streamers", "games_to_streamers"],
        dependsOn: ["grimoire-games"],
        referencedBy: [],
    },
    // ═════════════════════════════════════════════════════════════
    // ENGINE INFRASTRUCTURE (Nivel 1) — NOT GRIMOIRES:
    //   - media-library: File uploads, always active via /api/media
    // NOTE: datasets WAS a native engine feature, NOW is a core grimoire (grimoire-datasets)
    // It can be toggled via gremius.config.ts or admin UI
    // ═══════════════════════════════════════════════════════════════
];
export const GRIMOIRE_KEYS = GRIMOIRE_REGISTRY.map((g) => g.key);
// ═══════════════════════════════════════════════════════════════
// Helpers (Legacy aliases maintained for backward compatibility)
// ═══════════════════════════════════════════════════════════════
export function getCoreGrimoires() {
    return GRIMOIRE_REGISTRY.filter((g) => g.category === "core");
}
export function getGrimoireCoreGrimoires() {
    return GRIMOIRE_REGISTRY.filter((g) => g.category === "grimoire-core");
}
export function getOptionalGrimoires() {
    return GRIMOIRE_REGISTRY.filter((g) => g.category === "optional");
}
export function getRealmGrimoires(realmId) {
    if (realmId) {
        return GRIMOIRE_REGISTRY.filter((g) => g.category === "realm" && g.realmId === realmId);
    }
    return GRIMOIRE_REGISTRY.filter((g) => g.category === "realm");
}
export function getGrimoiresByRealm(realmId) {
    return GRIMOIRE_REGISTRY.filter((g) => g.realmId === realmId);
}
/** @deprecated Use GRIMOIRE_REGISTRY instead */
export const CORE_MODULES = GRIMOIRE_REGISTRY;
/** @deprecated Use GRIMOIRE_KEYS instead */
export const CORE_MODULE_KEYS = GRIMOIRE_KEYS;
/** @deprecated Use getCoreGrimoires instead */
export const getCoreModules = getCoreGrimoires;
/** @deprecated Use getOptionalGrimoires instead */
export const getOptionalModules = getOptionalGrimoires;
/** @deprecated Use getRealmGrimoires instead */
export const getThemeModules = getRealmGrimoires;
/** @deprecated Use getGrimoiresByRealm instead */
export const getModulesByTheme = getGrimoiresByRealm;
export async function checkCanDisable(grimoireKey, enabledGrimoireKeys) {
    const grimoireDef = GRIMOIRE_REGISTRY.find((g) => g.key === grimoireKey);
    if (!grimoireDef) {
        return { canDisable: true, blockers: [], warnings: [] };
    }
    const blockers = [];
    const warnings = [];
    for (const ref of grimoireDef.referencedBy) {
        if (!enabledGrimoireKeys.has(ref.grimoire))
            continue;
        try {
            const result = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM "${ref.table}" WHERE "${ref.column}" IS NOT NULL`));
            const row = result.rows?.[0];
            const count = Number(row?.cnt || 0);
            if (count > 0) {
                const refGrimoireDef = GRIMOIRE_REGISTRY.find((g) => g.key === ref.grimoire);
                blockers.push({
                    grimoire: ref.grimoire,
                    grimoireName: refGrimoireDef?.name || ref.grimoire,
                    table: ref.table,
                    column: ref.column,
                    label: ref.label,
                    rowCount: count,
                });
            }
        }
        catch {
            warnings.push(`Could not check ${ref.table}.${ref.column}: table may not exist`);
        }
    }
    for (const otherGrim of GRIMOIRE_REGISTRY) {
        if (otherGrim.key === grimoireKey)
            continue;
        if (!enabledGrimoireKeys.has(otherGrim.key))
            continue;
        if (!otherGrim.dependsOn.includes(grimoireKey))
            continue;
        let hasData = false;
        for (const table of otherGrim.tables) {
            try {
                const result = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM "${table}" LIMIT 1`));
                const row = result.rows?.[0];
                if (Number(row?.cnt || 0) > 0) {
                    hasData = true;
                    break;
                }
            }
            catch {
                // Ignore errors for individual table checks
            }
        }
        if (hasData) {
            blockers.push({
                grimoire: otherGrim.key,
                grimoireName: otherGrim.name,
                table: "(dependency)",
                column: "(dependsOn)",
                label: `${otherGrim.name} depends on ${grimoireDef.name} and has existing data`,
                rowCount: -1,
            });
        }
    }
    return {
        canDisable: blockers.length === 0,
        blockers,
        warnings,
    };
}
//# sourceMappingURL=module-registry.js.map