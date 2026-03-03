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
 *     Data Sets ← Native engine feature
 * 
 *   CORE GRIMOIRES (shown, toggleable, realm-agnostic):
 *     Promote, Webhooks, Connectors, Blocks, Formulas KPI
 * 
 *   OPTIONAL GRIMOIRES (shown, toggleable, vertical features):
 *     Academy, DMS, Booking, Directory, CRM, Blog
 * 
 *   REALM GRIMOIRES (shown in OPTIONAL section with "Enabled by Realm" badge):
 *     Games, Streamers, Platforms, Tags, Collections (when Realm Esports active)
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

export type GrimoireCategory = "core" | "optional" | "realm";

export interface GrimoireDef {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: GrimoireCategory;
  tables: string[];
  dependsOn: string[];
  realmId?: string;
  referencedBy: Array<{
    grimoire: string;
    table: string;
    column: string;
    label: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════
// GRIMOIRE REGISTRY
// ═══════════════════════════════════════════════════════════════

export const GRIMOIRE_REGISTRY: GrimoireDef[] = [
  // ═══════════════════════════════════════════════════════════════
  // CORE INFRASTRUCTURE — Nivel 1 (toggleable via gremius.config.ts)
  // These are NOT grimoires but are listed here for the /api/modules
  // endpoint and admin sidebar visibility.
  // ═══════════════════════════════════════════════════════════════
  {
    key: "media-library",
    name: "Media Library",
    description: "File uploads, S3/MinIO storage, image optimization (WebP), signed URLs, and media management.",
    icon: "🖼️",
    color: "#EC4899",
    category: "core",
    tables: ["media"],
    dependsOn: [],
    referencedBy: [],
  },
  {
    key: "promote",
    name: "CMS / Promote to Content",
    description: "Transform BaaS data into publishable CMS content with slugs, SEO, and authorship.",
    icon: "📰",
    color: "#10B981",
    category: "core",
    tables: ["content_metadata"],
    dependsOn: [],
    referencedBy: [],
  },
  {
    key: "webhooks",
    name: "Webhooks Engine",
    description: "Event-driven HTTP callbacks for external integrations with retry logic.",
    icon: "🪝",
    color: "#F59E0B",
    category: "core",
    tables: ["webhooks_config", "webhooks_log"],
    dependsOn: [],
    referencedBy: [],
  },
  {
    key: "connectors",
    name: "Data Connectors",
    description: "Connect to external APIs and databases (MySQL/MariaDB) as read-only data sources.",
    icon: "🔌",
    color: "#8B5CF6",
    category: "core",
    tables: ["data_connectors"],
    dependsOn: [],
    referencedBy: [],
  },
  {
    key: "blocks",
    name: "Page Builder",
    description: "Lego-style block system for dynamic page layouts (Hero, Grid, Filter, etc.).",
    icon: "🧱",
    color: "#3B82F6",
    category: "core",
    tables: [],
    dependsOn: [],
    referencedBy: [],
  },
  {
    key: "formulas",
    name: "Fórmulas KPI",
    description: "Motor de campos virtuales y expresiones de cálculo para KPIs. Universal para cualquier vertical.",
    icon: "📐",
    color: "#B388FF",
    category: "core",
    tables: ["formulas"],
    dependsOn: [],
    referencedBy: [],
  },

  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL GRIMOIRES — Vertical/enterprise features
  // ═══════════════════════════════════════════════════════════════
  {
    key: "academy",
    name: "Gremius Academy",
    description: "LMS with courses, quizzes, certificates, and compliance reporting.",
    icon: "🎓",
    color: "#6366F1",
    category: "optional",
    tables: ["academy_courses", "academy_topics", "academy_quizzes", "academy_questions", "academy_enrollments", "academy_quiz_attempts", "academy_user_progress", "academy_satisfaction_surveys"],
    dependsOn: [],
    referencedBy: [],
  },
  {
    key: "dms",
    name: "Document Management",
    description: "Versioned document storage with department ACL, approval workflows, and audit trail.",
    icon: "📄",
    color: "#FF9100",
    category: "optional",
    tables: ["documents", "document_versions"],
    dependsOn: [],
    referencedBy: [],
  },
  {
    key: "booking",
    name: "Booking Engine",
    description: "Room reservations with conflict detection, amenities, and email confirmations.",
    icon: "📅",
    color: "#00BFA5",
    category: "optional",
    tables: ["rooms", "amenities", "room_amenities", "reservations"],
    dependsOn: [],
    referencedBy: [],
  },
  {
    key: "directory",
    name: "Employee Directory",
    description: "Employee profiles, departments, positions, and organizational hierarchy.",
    icon: "👥",
    color: "#448AFF",
    category: "optional",
    tables: ["employee_profile"],
    dependsOn: [],
    referencedBy: [],
  },
  {
    key: "gremius-crm",
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
    key: "blog",
    name: "Blog Posts",
    description: "Publishing platform with rich text editor, scheduling, tags, and SEO.",
    icon: "📝",
    color: "#76FF03",
    category: "optional",
    tables: ["blog_posts", "blog_posts_to_tags", "blog_posts_to_games"],
    dependsOn: [],
    referencedBy: [],
  },

  // ═══════════════════════════════════════════════════════════════
  // REALM GRIMOIRES — Bundled with Realm Esports
  // Show in OPTIONAL section with "Enabled by Realm" badge when active
  // ═══════════════════════════════════════════════════════════════
  {
    key: "games",
    name: "Games",
    description: "Game library with metadata, trailers, screenshots, IGDB sync, and collections.",
    icon: "🎮",
    color: "#00E5FF",
    category: "realm",
    realmId: "realm-esports",
    tables: ["games", "game_collections", "game_collection_entries", "games_to_platforms", "games_to_tags", "games_to_streamers"],
    dependsOn: [],
    referencedBy: [
      { grimoire: "blog", table: "blog_posts_to_games", column: "game_id", label: "Blog posts referencing games" },
      { grimoire: "streamers", table: "games_to_streamers", column: "game_id", label: "Streamers linked to games" },
    ],
  },
  {
    key: "streamers",
    name: "Streamers",
    description: "Track live streamers across Twitch, YouTube, and Kick with real-time sync.",
    icon: "📡",
    color: "#FF6E40",
    category: "realm",
    realmId: "realm-esports",
    tables: ["streamers", "games_to_streamers"],
    dependsOn: [],
    referencedBy: [],
  },
  {
    key: "platforms",
    name: "Platforms",
    description: "Gaming platforms catalog (PC, PlayStation, Xbox, Nintendo, etc.).",
    icon: "🖥️",
    color: "#9333EA",
    category: "realm",
    realmId: "realm-esports",
    tables: ["platforms", "games_to_platforms"],
    dependsOn: [],
    referencedBy: [],
  },
  {
    key: "tags",
    name: "Tags",
    description: "Content tagging system with categories (genre, feature, topic, series).",
    icon: "🏷️",
    color: "#14B8A6",
    category: "realm",
    realmId: "realm-esports",
    tables: ["tags", "games_to_tags", "blog_posts_to_tags"],
    dependsOn: [],
    referencedBy: [],
  },
  {
    key: "collections",
    name: "Game Collections",
    description: "Curated game collections for featured sections, best of lists, and editor's picks.",
    icon: "📚",
    color: "#F472B6",
    category: "realm",
    realmId: "realm-esports",
    tables: ["game_collections", "game_collection_entries"],
    dependsOn: ["games"],
    referencedBy: [],
  },

  // ═══════════════════════════════════════════════════════════════
  // NOTE: Media Library is ENGINE infrastructure, NOT a grimoire
  // It's always available via /api/media and doesn't appear here
  // ═══════════════════════════════════════════════════════════════
];

export const GRIMOIRE_KEYS = GRIMOIRE_REGISTRY.map((g) => g.key);

// ═══════════════════════════════════════════════════════════════
// Helpers (Legacy aliases maintained for backward compatibility)
// ═══════════════════════════════════════════════════════════════

export function getCoreGrimoires(): GrimoireDef[] {
  return GRIMOIRE_REGISTRY.filter((g) => g.category === "core");
}

export function getOptionalGrimoires(): GrimoireDef[] {
  return GRIMOIRE_REGISTRY.filter((g) => g.category === "optional");
}

export function getRealmGrimoires(realmId?: string): GrimoireDef[] {
  if (realmId) {
    return GRIMOIRE_REGISTRY.filter((g) => g.category === "realm" && g.realmId === realmId);
  }
  return GRIMOIRE_REGISTRY.filter((g) => g.category === "realm");
}

export function getGrimoiresByRealm(realmId: string): GrimoireDef[] {
  return GRIMOIRE_REGISTRY.filter((g) => g.realmId === realmId);
}

// ═══════════════════════════════════════════════════════════════
// Legacy aliases for backward compatibility
// ═══════════════════════════════════════════════════════════════

/** @deprecated Use GrimoireDef instead */
export type CoreModuleDef = GrimoireDef;

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

// ═══════════════════════════════════════════════════════════════
// Dependency Checking
// ═══════════════════════════════════════════════════════════════

export interface DisableCheckResult {
  canDisable: boolean;
  blockers: Array<{
    grimoire: string;
    grimoireName: string;
    table: string;
    column: string;
    label: string;
    rowCount: number;
  }>;
  warnings: string[];
}

export async function checkCanDisable(
  grimoireKey: string,
  enabledGrimoireKeys: Set<string>
): Promise<DisableCheckResult> {
  const grimoireDef = GRIMOIRE_REGISTRY.find((g) => g.key === grimoireKey);
  if (!grimoireDef) {
    return { canDisable: true, blockers: [], warnings: [] };
  }

  const blockers: DisableCheckResult["blockers"] = [];
  const warnings: string[] = [];

  for (const ref of grimoireDef.referencedBy) {
    if (!enabledGrimoireKeys.has(ref.grimoire)) continue;

    try {
      const result = await db.execute(
        sql.raw(`SELECT COUNT(*) as cnt FROM "${ref.table}" WHERE "${ref.column}" IS NOT NULL`)
      );
      const count = Number(result.rows?.[0]?.cnt || 0);

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
    } catch {
      warnings.push(`Could not check ${ref.table}.${ref.column}: table may not exist`);
    }
  }

  for (const otherGrim of GRIMOIRE_REGISTRY) {
    if (otherGrim.key === grimoireKey) continue;
    if (!enabledGrimoireKeys.has(otherGrim.key)) continue;
    if (!otherGrim.dependsOn.includes(grimoireKey)) continue;

    let hasData = false;
    for (const table of otherGrim.tables) {
      try {
        const result = await db.execute(
          sql.raw(`SELECT COUNT(*) as cnt FROM "${table}" LIMIT 1`)
        );
        if (Number(result.rows?.[0]?.cnt || 0) > 0) {
          hasData = true;
          break;
        }
      } catch { }
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
