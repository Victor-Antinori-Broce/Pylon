/**
 * Kitsuden — Kon Classification System (La Jerarquía Mágica)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LORE REFACTOR: Jerarquía Mágica de Kitsuden
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ARCHITECTURE:
 *
 *   ENGINE (invisible, always active, NOT kons):
 *     Schema Engine, Auth Manager, API Gateway, Valkey, Kon Loader
 *     Media Hub ← Infrastructure, not a kon
 *     Data Sets ← NOW A CORE KON (kon-datasets), toggleable
 *
 *   CORE KONS (shown, toggleable, grimoire-agnostic):
 *     Blog, Webhooks, Connectors, Blocks, Formulas KPI
 *
 *   OPTIONAL KONS (shown, toggleable, vertical features):
 *     Academy, DMS, Booking, Directory, CRM, Blog
 *
 *   GRIMOIRE KONS (shown in OPTIONAL section with "Enabled by Grimoire" badge):
 *     Games, Streamers, Platforms, Tags, Collections (when Grimoire Esports active)
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { sql } from "drizzle-orm";

import { db } from "../db";

export type KonCategory = "core" | "core-den" | "optional" | "grimoire";

export interface KonDef {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: KonCategory;
  tables: string[];
  dependsOn: string[];
  grimoireId?: string;
  referencedBy: Array<{
    kon: string;
    table: string;
    column: string;
    label: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════
// KON REGISTRY
// ═══════════════════════════════════════════════════════════════

/**
 * Entradas CURADAS a mano.
 *
 * Lo que se escribe aquí es lo que ningún kon.json sabe de sí mismo: el color
 * de la ficha, la categoría de conmutación (core / core-den / optional /
 * grimoire) y, sobre todo, `referencedBy` — el grafo de claves ajenas que dice
 * qué otro kon se rompe si apagas éste. Eso se deduce del esquema, no del
 * manifiesto.
 *
 * El resto del registro se completa solo desde packages/kons/. Ver
 * KON_REGISTRY, más abajo.
 */
const KONS_CURADOS: KonDef[] = [
  // ═════════════════════════════════════════════════════════════
  // NIVEL 2 — CORE KONS (switchable via kitsuden.config.ts)
  // category: "core" | "core-den" — Shown in admin, gated by feature flags
  // NOTE: media-library is ENGINE infrastructure (Level 1), NOT here
  // NOTE: DataSets is NOW a kon (was: engine feature, now: core kon)
  // ═══════════════════════════════════════════════════════════════

  // MEDIA LIBRARY - Core kon, file uploads & storage
  {
    key: "kon-media",
    name: "Media Library",
    description: "File uploads, image optimization, and pluggable storage (MinIO, S3, Local, R2).",
    icon: "🖼️",
    color: "#EC4899",
    category: "core",
    tables: ["media", "media_folders"],
    dependsOn: [],
    referencedBy: [
      {
        kon: "kon-blog",
        table: "blog_posts",
        column: "cover_image_id",
        label: "Blog post cover images",
      },
    ],
  },
  // DATASETS - Core kon, enabled by default, positioned first in admin
  {
    key: "kon-datasets",
    name: "DataSets",
    description:
      "Dynamic data collections with automatic REST API, validation, and RLS. The foundation of Kitsuden content management.",
    icon: "🗃️",
    color: "#3B82F6",
    category: "core",
    tables: ["data_sets", "data_entries"],
    dependsOn: [],
    referencedBy: [
      {
        kon: "kon-blog",
        table: "blog_posts",
        column: "dataset_id",
        label: "Blog posts using datasets",
      },
      {
        kon: "kon-crm",
        table: "crm_deals",
        column: "dataset_id",
        label: "CRM deals using datasets",
      },
    ],
  },
  // NOTE: Webhooks merged into Actions Engine (Nivel 1). Not a standalone kon.
  // NOTE: Data Connectors moved to Settings > Integrations. Not a kon.
  {
    key: "kon-blocks",
    name: "Page Builder",
    description:
      "Lego-style block system for dynamic page layouts (Hero, Grid, Filter, etc.) with drag & drop, templates, and scheduling.",
    icon: "🧱",
    color: "#3B82F6",
    category: "core-den",
    tables: ["pages", "blocks", "block_templates"],
    dependsOn: [],
    referencedBy: [],
  },
  // ═══════════════════════════════════════════════════════════════
  // OPTIONAL KONS — Vertical/enterprise features
  // ═══════════════════════════════════════════════════════════════
  {
    key: "kon-academy-lms",
    name: "Kitsuden Academy LMS",
    description:
      "Learning Management System with courses, modules, quizzes, learning paths, progress tracking, groups, and satisfaction surveys.",
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
      "actividad_log",
    ],
    dependsOn: [],
    referencedBy: [],
  },
  {
    key: "kon-dms",
    name: "Document Management",
    description:
      "Versioned document storage with hierarchical categories, semantic versioning, approval workflows, and comprehensive audit trail. Optimized for manuals and corporate documentation.",
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
    key: "kon-booking",
    name: "Booking Engine",
    description:
      "Room reservations with conflict detection, amenities management, approval workflows, and check-in/out tracking.",
    icon: "📅",
    color: "#00BFA5",
    category: "optional",
    tables: ["rooms", "amenities", "room_amenities", "bookings", "booking_notes", "blackout_dates"],
    dependsOn: [],
    referencedBy: [],
  },
  {
    key: "kon-directory",
    name: "Employee Directory",
    description:
      "Employee profiles, departments, positions, and organizational hierarchy with org charts, reporting chains, and document management.",
    icon: "👥",
    color: "#448AFF",
    category: "optional",
    tables: [
      "organizations",
      "departments",
      "positions",
      "employees",
      "employee_documents",
      "org_chart_cache",
    ],
    dependsOn: [],
    referencedBy: [],
  },
  {
    key: "kon-crm",
    name: "Kitsuden CRM",
    description:
      "Contacts, deals pipeline, and activity log built on Data Sets with automation hooks.",
    icon: "💼",
    color: "#E91E63",
    category: "optional",
    tables: [],
    dependsOn: [],
    referencedBy: [],
  },
  {
    key: "kon-analytics",
    name: "Analítica",
    description: "Vistas por sujeto y día, sin cookies ni datos personales. Ordena la portada y mide el blog y los torneos.",
    icon: "📊",
    color: "#38BDF8",
    category: "core-den",
    tables: ["analytics_views"],
    dependsOn: [],
    referencedBy: [],
  },
  {
    key: "kon-blog",
    name: "Blog & Content Publishing",
    description:
      "Complete CMS publishing with editorial workflow, SEO, slugs, scheduling. Includes former 'Promote' functionality.",
    icon: "📝",
    color: "#76FF03",
    category: "core-den",
    tables: ["blog_posts", "blog_posts_to_tags", "blog_posts_to_games"],
    dependsOn: ["kon-media"],
    referencedBy: [],
  },
  {
    key: "ai-memories",
    name: "AI Memories",
    description:
      "Vector-based semantic memory storage with pgvector. Supports OpenAI embeddings, document chunking, and similarity search for RAG applications.",
    icon: "🧠",
    color: "#9C27B0",
    category: "optional",
    tables: ["ai_memories", "ai_memory_chunks"],
    dependsOn: [],
    referencedBy: [],
  },

  // ═══════════════════════════════════════════════════════════════
  // GRIMOIRE KONS — Bundled with Kitsuden CMS Grimoire (Consolidados)
  // Show in OPTIONAL section with "Enabled by Grimoire" badge when active
  // ═══════════════════════════════════════════════════════════════
  {
    key: "kon-games",
    name: "Games Catalog",
    description:
      "Complete game library with IGDB integration: games, platforms, tags, and collections.",
    icon: "🎮",
    color: "#00E5FF",
    category: "grimoire",
    grimoireId: "grimoire-gremius",
    tables: [
      "games",
      "platforms",
      "tags",
      "game_collections",
      "game_collection_entries",
      "games_to_platforms",
      "games_to_tags",
    ],
    dependsOn: [],
    referencedBy: [
      {
        kon: "blog",
        table: "blog_posts_to_games",
        column: "game_id",
        label: "Blog posts referencing games",
      },
      {
        kon: "kon-streamers",
        table: "games_to_streamers",
        column: "game_id",
        label: "Streamers linked to games",
      },
      {
        kon: "kon-esports",
        table: "tournaments",
        column: "game_id",
        label: "Tournaments using games",
      },
    ],
  },
  {
    key: "kon-esports",
    name: "Esports",
    description: "Complete competitive ecosystem: players, teams, tournaments, and matches.",
    icon: "🏆",
    color: "#FFD600",
    category: "grimoire",
    grimoireId: "grimoire-gremius",
    tables: [
      "players",
      "teams",
      "players_to_teams",
      "tournaments",
      "tournament_participants",
      "matches",
    ],
    dependsOn: ["kon-games"],
    referencedBy: [],
  },
  {
    key: "kon-streamers",
    name: "Streamers",
    description: "Track live streamers across Twitch, YouTube, and Kick with real-time sync.",
    icon: "📡",
    color: "#FF6E40",
    category: "grimoire",
    grimoireId: "grimoire-gremius",
    tables: ["streamers", "games_to_streamers"],
    dependsOn: ["kon-games"],
    referencedBy: [],
  },

  // ═════════════════════════════════════════════════════════════
  // ENGINE INFRASTRUCTURE (Nivel 1) — NOT KONS:
  //   - media-library: File uploads, always active via /api/media
  // NOTE: datasets WAS a native engine feature, NOW is a core kon (kon-datasets)
  // It can be toggled via kitsuden.config.ts or admin UI
  // ═══════════════════════════════════════════════════════════════
];

// ═══════════════════════════════════════════════════════════════
// AUTODESCUBRIMIENTO — el registro se completa desde los manifiestos
// ═══════════════════════════════════════════════════════════════

/**
 * De los 33 kons en disco, esta tabla clasificaba 13.
 *
 * Los otros 24 arrancaban igual —el loader escanea el sistema de ficheros, no
 * esta lista— pero quedaban sin metadatos: sin categoría con la que agruparlos
 * en el panel, sin `tables` con las que contar filas y sin `dependsOn`. Y el
 * modo de fallo era el peor: no había hueco visible, simplemente no salían.
 *
 * Ahora la lista curada de arriba manda, y todo kon que exista en disco y no
 * esté en ella entra derivado de su propio kon.json. Añadir un kon deja de
 * exigir tocar este fichero; curarlo sigue siendo opcional y para eso está
 * KONS_CURADOS.
 */
function resolverDirKons(): string {
  const cwdCheck = join(process.cwd(), "packages", "kons", "package.json");
  const raiz = existsSync(cwdCheck) ? process.cwd() : join(process.cwd(), "../../");
  return join(raiz, "packages", "kons");
}

/** `tables` admite cadenas o fichas con `name`; los consumidores aceptan ambas. */
function nombresDeTablas(tables: unknown): string[] {
  if (!Array.isArray(tables)) return [];
  return tables
    .map((t) => (typeof t === "string" ? t : (t as { name?: string })?.name))
    .filter((n): n is string => typeof n === "string" && n.length > 0);
}

/**
 * El tier del manifiesto es lo más cercano a una categoría de conmutación que
 * un kon declara de sí mismo: "essential" arranca siempre, el resto se activa.
 */
function categoriaDesdeTier(tier: unknown, core: unknown): KonCategory {
  if (core === true || tier === "essential") return "core";
  return "optional";
}

/** Color estable derivado del id: mismo kon, mismo color en cada arranque. */
function colorDesdeId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h}, 65%, 55%)`;
}

function derivarKonsDelDisco(yaCurados: Set<string>): KonDef[] {
  const dir = resolverDirKons();
  if (!existsSync(dir)) return [];

  const derivados: KonDef[] = [];

  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (!entrada.isDirectory() || yaCurados.has(entrada.name)) continue;

    const manifiesto = join(dir, entrada.name, "kon.json");
    if (!existsSync(manifiesto)) continue;

    let m: Record<string, any>;
    try {
      m = JSON.parse(readFileSync(manifiesto, "utf8"));
    } catch (err) {
      // Un manifiesto ilegible NO puede desaparecer sin más: sería volver al
      // problema que este bloque arregla, solo que de uno en uno.
      console.warn(`[KonRegistry] ${manifiesto} no es JSON válido: ${(err as Error).message}`);
      continue;
    }

    derivados.push({
      key: entrada.name,
      name: m.name || entrada.name,
      description: m.description || "",
      icon: m.icon || "Package",
      color: colorDesdeId(entrada.name),
      category: categoriaDesdeTier(m.tier, m.core),
      tables: nombresDeTablas(m.tables),
      dependsOn: Array.isArray(m.dependencies?.kons) ? m.dependencies.kons : [],
      // El grafo de referencias sale del esquema, no del manifiesto: se cura a
      // mano en KONS_CURADOS cuando hace falta.
      referencedBy: [],
    });
  }

  return derivados;
}

/**
 * Rellena desde el manifiesto los huecos que la entrada curada dejó vacíos.
 *
 * `kon-crm` estaba curado con `tables: []`. No fue descuido: sus 6 tablas
 * estaban declaradas en `database.tables`, un campo que no lee nadie, así que
 * quien escribió la ficha a mano no las encontró. Corregido el manifiesto, lo
 * correcto es que la ficha se complete sola — teclear aquí los seis nombres
 * sería volver a tener dos listas que se separan con el tiempo.
 *
 * Lo curado que SÍ tiene valor manda siempre.
 */
function completarDesdeManifiesto(kon: KonDef): KonDef {
  if (kon.tables.length > 0 && kon.dependsOn.length > 0) return kon;

  const manifiesto = join(resolverDirKons(), kon.key, "kon.json");
  if (!existsSync(manifiesto)) return kon; // los kons de core no viven ahí

  try {
    const m = JSON.parse(readFileSync(manifiesto, "utf8"));
    return {
      ...kon,
      tables: kon.tables.length ? kon.tables : nombresDeTablas(m.tables),
      dependsOn: kon.dependsOn.length
        ? kon.dependsOn
        : Array.isArray(m.dependencies?.kons)
          ? m.dependencies.kons
          : [],
    };
  } catch {
    return kon; // el manifiesto roto ya se avisa al derivar
  }
}

export const KON_REGISTRY: KonDef[] = (() => {
  const curados = new Set(KONS_CURADOS.map((k) => k.key));
  return [...KONS_CURADOS.map(completarDesdeManifiesto), ...derivarKonsDelDisco(curados)];
})();

export const KON_KEYS = KON_REGISTRY.map((g) => g.key);

// ═══════════════════════════════════════════════════════════════
// Helpers (Legacy aliases maintained for backward compatibility)
// ═══════════════════════════════════════════════════════════════

export function getCoreKons(): KonDef[] {
  return KON_REGISTRY.filter((g) => g.category === "core");
}

export function getCoreDenKons(): KonDef[] {
  return KON_REGISTRY.filter((g) => g.category === "core-den");
}

export function getOptionalKons(): KonDef[] {
  return KON_REGISTRY.filter((g) => g.category === "optional");
}

export function getGrimoireKons(grimoireId?: string): KonDef[] {
  if (grimoireId) {
    return KON_REGISTRY.filter((g) => g.category === "grimoire" && g.grimoireId === grimoireId);
  }
  return KON_REGISTRY.filter((g) => g.category === "grimoire");
}

export function getKonsByGrimoire(grimoireId: string): KonDef[] {
  return KON_REGISTRY.filter((g) => g.grimoireId === grimoireId);
}

// ═══════════════════════════════════════════════════════════════
// Legacy aliases for backward compatibility
// ═══════════════════════════════════════════════════════════════

/** @deprecated Use KonDef instead */
export type CoreModuleDef = KonDef;

/** @deprecated Use KON_REGISTRY instead */
export const CORE_MODULES = KON_REGISTRY;

/** @deprecated Use KON_KEYS instead */
export const CORE_MODULE_KEYS = KON_KEYS;

/** @deprecated Use getCoreKons instead */
export const getCoreModules = getCoreKons;

/** @deprecated Use getOptionalKons instead */
export const getOptionalModules = getOptionalKons;

/** @deprecated Use getGrimoireKons instead */
export const getThemeModules = getGrimoireKons;

/** @deprecated Use getKonsByGrimoire instead */
export const getModulesByTheme = getKonsByGrimoire;

// ═══════════════════════════════════════════════════════════════
// Dependency Checking
// ═══════════════════════════════════════════════════════════════

export interface DisableCheckResult {
  canDisable: boolean;
  blockers: Array<{
    kon: string;
    konName: string;
    table: string;
    column: string;
    label: string;
    rowCount: number;
  }>;
  warnings: string[];
}

/** Query row from database execution */

interface QueryRow extends Record<string, unknown> {}

export async function checkCanDisable(
  konKey: string,
  enabledKonKeys: Set<string>
): Promise<DisableCheckResult> {
  const konDef = KON_REGISTRY.find((g) => g.key === konKey);
  if (!konDef) {
    return { canDisable: true, blockers: [], warnings: [] };
  }

  const blockers: DisableCheckResult["blockers"] = [];
  const warnings: string[] = [];

  for (const ref of konDef.referencedBy) {
    if (!enabledKonKeys.has(ref.kon)) continue;

    try {
      const result = await db.execute(
        sql.raw(`SELECT COUNT(*) as cnt FROM "${ref.table}" WHERE "${ref.column}" IS NOT NULL`)
      );
      const row = result.rows?.[0] as QueryRow;
      const count = Number(row?.cnt || 0);

      if (count > 0) {
        const refKonDef = KON_REGISTRY.find((g) => g.key === ref.kon);
        blockers.push({
          kon: ref.kon,
          konName: refKonDef?.name || ref.kon,
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

  for (const otherGrim of KON_REGISTRY) {
    if (otherGrim.key === konKey) continue;
    if (!enabledKonKeys.has(otherGrim.key)) continue;
    if (!otherGrim.dependsOn.includes(konKey)) continue;

    let hasData = false;
    for (const table of otherGrim.tables) {
      try {
        const result = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM "${table}" LIMIT 1`));
        const row = result.rows?.[0] as QueryRow;
        if (Number(row?.cnt || 0) > 0) {
          hasData = true;
          break;
        }
      } catch {
        // Ignore errors for individual table checks
      }
    }

    if (hasData) {
      blockers.push({
        kon: otherGrim.key,
        konName: otherGrim.name,
        table: "(dependency)",
        column: "(dependsOn)",
        label: `${otherGrim.name} depends on ${konDef.name} and has existing data`,
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
