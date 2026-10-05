/**
 * Admin Registry Service — Zero Config Kon Registration
 *
 * Auto-discovers admin configuration from kons and grimoires:
 * 1. Scans kon.json for admin.tables[]
 * 2. Scans grimoire.json for grimoire-specific kons (DYNAMIC)
 * 3. Detects custom views by checking for .svelte files
 * 4. Generates default DataExplorer config for tables without custom UI
 * 5. Exposes unified registry at /api/admin/registry
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { leerManifiestoGrimoire } from "../lib/grimoire-manifest";
import { logger } from "../lib/logger";

import { scanPackages, KitsudenManifest } from "./scanner";
import { introspectTable, type IntrospectedColumn } from "./schema-introspector";

// Resolve workspace root (Docker vs dev)
function getPackagesRoot(): string {
  const cwdCheck = join(process.cwd(), "packages", "kons", "package.json");
  const root = existsSync(cwdCheck) ? process.cwd() : join(process.cwd(), "../../");
  return join(root, "packages");
}

// @ts-ignore - Reserved for future use
const _ADMIN_VIEWS_PATH = "../../../packages/admin/src/views";

/**
 * Grimoire manifest structure
 */
interface GrimoireManifest {
  id: string;
  name: string;
  description?: string;
  version: string;
  type: "grimoire";
  kons: string[];
  optional_kons?: string[];
  config?: {
    theme?: {
      css_entry?: string;
      primary_color?: string;
      accent_color?: string;
    };
  };
  /** Per-kon admin overrides */
  konConfig?: Record<
    string,
    {
      displayName?: string;
      hiddenTables?: string[];
      extraViews?: Array<{
        id: string;
        type: "grid" | "kanban" | "calendar" | "custom" | "element";
        /** Solo para `element`: nombre de la etiqueta del Web Component. */
        element?: string;
        /** Solo para `element`: ruta del script dentro del kon. */
        src?: string;
        title: string;
        table?: string;
      }>;
      defaultView?: string;
    }
  >;
  /** Seed configuration */
  seed?: {
    sql?: string;
    datasets?: string;
    runOnce?: boolean;
  };
}

/**
 * Dynamic grimoire info with its kons
 */
interface GrimoireInfo {
  id: string;
  name: string;
  description?: string;
  kons: string[];
  optionalKons: string[];
}

/** Admin table configuration */
export interface AdminTableConfig {
  name: string;
  label: string;
  icon?: string;
  description?: string;
  primaryKey?: string;
  searchableFields?: string[];
  filterableFields?: string[];
  readonly?: boolean;
}

/**
 * Admin view configuration
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Sobre las vistas a medida y por qué hay dos mecanismos
 *
 * El admin sirve a DOS audiencias que no tienen por qué compartir framework:
 *
 *   1. El núcleo (page builder, kanban, knowledge graph) lo escribe el equipo
 *      de Kitsuden en Svelte, y ahí Svelte gana por la forma de esa UI.
 *   2. Las vistas de un kon de terceros las escribe otro — y en la práctica,
 *      siendo esto un BaaS para vibecoders, las escribe su agente de IA.
 *
 * Obligar a (2) a escribir Svelte acopla el punto de extensión al framework
 * interno del admin. La forma agnóstica (`type: "element"`) recibe un ARTEFACTO
 * YA COMPILADO que se carga en runtime, no código fuente que entra en el build
 * del admin: cada extensión trae su propio runtime dentro, aislada por Shadow
 * DOM, y el bundler del admin nunca necesita entender JSX ni nada ajeno.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface AdminViewConfig {
  id: string;
  /**
   * `element` es la forma recomendada para vistas a medida: un Web Component
   * agnóstico. `custom` queda para el legacy de Svelte.
   */
  type: "grid" | "kanban" | "calendar" | "custom" | "element";
  title: string;
  table?: string;
  /**
   * @deprecated Ruta a un `.svelte`, importado como FUENTE dentro del build del
   * admin. Acopla la extensión al framework del host y mete el código de todos
   * los kons en el bundle aunque nadie abra esa vista. Usa `element` + `src`.
   */
  component?: string;
  /**
   * Nombre del custom element que la vista registra, p. ej. `broadcast-scoreboard`.
   * Debe llevar guion: lo exige la especificación de Custom Elements.
   */
  element?: string;
  /**
   * Ruta al bundle ESM ya compilado, relativa a la raíz del paquete del kon
   * (`./admin/scoreboard.js`). La sirve la API bajo una URL estable; el admin
   * la carga con `import(url)` en runtime, nunca en tiempo de build.
   */
  src?: string;
  // Extra props forwarded from kon.json admin.views declarations
  groupBy?: string;
  /** Filtro fijo de la vista: lo que la define. Ver el mapeo más abajo. */
  defaultFilter?: Record<string, unknown>;
  /** Nombre en singular para el botón de alta («Agregar torneo»). */
  singularName?: string;
  dateField?: string;
  titleField?: string;
  icon?: string;
  [key: string]: any;
}

/** Kon admin configuration */
export interface KonAdminConfig {
  id: string;
  name: string;
  icon?: string;
  category: "core" | "content" | "data" | "esports";
  hasCustomView: boolean;
  tables: AdminTableConfig[];
  views: AdminViewConfig[];
  /** Vista inicial, o `null` si el kon no expone ninguna (no tiene datos). */
  defaultView: string | null;
  /** Custom API base path (e.g., /api/directory) - if not set, uses /api/explorer */
  apiBase?: string;
}

/** Core module with custom view */
interface CoreModuleWithView {
  id: string;
  name: string;
  category: KonAdminConfig["category"];
  tables?: string[];
}

// Cache para evitar lecturas de disco frecuentes
let registryCache: KonAdminConfig[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 1 minuto en desarrollo

/**
 * Core modules with custom admin views
 * These are loaded from apps/api/src/modules/, not packages/kons/
 *
 * NOTE: Webhooks and Workers are part of the Actions Engine (framework level),
 * not Kons. They are managed through the Actions UI at /actions.
 *
 * This list is intentionally empty as all current core features are either:
 * - Kons (DataSets, Media, Blocks)
 * - Engine features (Actions with Webhooks/Workers)
 * - Settings features (Connectors)
 */
const CORE_MODULES_WITH_VIEWS: CoreModuleWithView[] = [
  // Empty - all core features are now proper Kons or Engine features
];

/**
 * Scan all available grimoires and their kons
 * This is DYNAMIC - no hardcoded grimoire data needed
 */
async function scanGrimoires(): Promise<GrimoireInfo[]> {
  const grimoiresDir = join(getPackagesRoot(), "grimoires");
  const grimoires: GrimoireInfo[] = [];

  try {
    const entries = await readdir(grimoiresDir, { withFileTypes: true });
    const grimoireDirs = entries.filter(
      (e: { isDirectory: () => boolean; name: string }) =>
        e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules"
    );

    for (const dir of grimoireDirs) {
      // grimoire.json, con respaldo a kitsuden.json SOLO si de verdad contiene
      // un grimoire: en ese mismo directorio kitsuden.json es el tema.
      const manifest = (await leerManifiestoGrimoire(
        join(grimoiresDir, dir.name)
      )) as GrimoireManifest | null;

      if (manifest && manifest.id) {
        grimoires.push({
          id: manifest.id,
          name: manifest.name || manifest.id,
          description: manifest.description,
          kons: manifest.kons || [],
          optionalKons: manifest.optional_kons || [],
        });
      }
    }
  } catch (err) {
    // Esto era un `console.log` para un ERROR. Que la carpeta de grimoires no
    // exista es normal y no merece ruido; que el escaneo falle por otra razón,
    // sí — y con `console.log` las dos cosas eran la misma línea invisible.
    logger.debug({ err }, "[AdminRegistry] no hay carpeta de grimoires o falló el escaneo");
  }

  return grimoires;
}

/**
 * La vista por defecto, comprobada contra las vistas que existen de verdad.
 *
 * ── POR QUE ES UNA SOLA FUNCION ────────────────────────────────────────────
 *
 * Porque `defaultView` se asignaba en TRES sitios —dos constructores y el
 * parcheo por override— y solo uno comprobaba nada. Se corrigió el primero y
 * `kon-esports` siguió anunciando `"grid"` con una sola vista llamada
 * `to-panel`: el fallo entero, intacto, por la rama que no se tocó.
 *
 * Con una función, la pregunta es la misma en los tres sitios y el cuarto que
 * alguien añada la encuentra escrita.
 *
 * ── QUE ROMPIA ─────────────────────────────────────────────────────────────
 *
 * Nueve kons declaran `admin.defaultView: "grid"`, que no es el id de ninguna
 * vista: las generadas se llaman `grid-<tabla>`. El panel abría con ese id, el
 * filtro por vista devolvía CERO vistas, sin vista no había tabla, y el modal
 * de alta terminaba pidiendo el esquema de una tabla llamada como el kon:
 *
 *     Could not load schema for table "kon-character-builder"
 *
 * Cuatro capas entre la causa y el mensaje, y el mensaje acusa a una tabla que
 * nunca existió.
 */
function vistaPorDefectoValida(
  declarada: string | undefined | null,
  views: { id: string }[],
  konId: string
): string | null {
  if (declarada && views.some((v) => v.id === declarada)) return declarada;

  if (declarada) {
    console.warn(
      `  ⚠️  ${konId}: admin.defaultView es "${declarada}" y no hay ninguna vista ` +
        `con ese id (${views.map((v) => v.id).join(", ") || "ninguna"}). Se usa la primera.`
    );
  }

  // `?? null` y no un id inventado: "este kon no expone vistas" es una
  // respuesta válida, y fabricar una convierte eso en un error de tabla.
  return views[0]?.id ?? null;
}

/**
 * Extract admin views from kon manifest (Hybrid Rendering support).
 * Reads kon.json `admin.views` as the primary source.
 * Returns empty array if no admin.views declared — caller should fallback.
 */
function extractViewsFromManifest(kon: KitsudenManifest): AdminViewConfig[] {
  const adminConfig = (kon as any).admin;
  if (!adminConfig || !Array.isArray(adminConfig.views)) {
    return [];
  }

  const views: AdminViewConfig[] = [];

  for (const raw of adminConfig.views) {
    if (!raw.id || !raw.type) continue;

    // Normalize unknown/invalid types to valid AdminViewConfig types
    let type = raw.type;
    // `element` es un tipo de PRIMERA CLASE, no una rareza: es como un kon
    // aporta su propia pantalla sin compilarse contra el admin (un Web
    // Component servido desde el propio kon).
    //
    // Faltaba en esta lista, asi que caia en la normalizacion de abajo y se
    // convertia en "grid" sin avisar. Cuatro kons —tierlist, broadcast,
    // broadcast-moba y esports— traian su vista, la API la servia
    // correctamente, y el admin acababa pintando una rejilla en su lugar.
    const validTypes = new Set(["grid", "kanban", "calendar", "custom", "element"]);
    const typeNormalization: Record<string, string> = {
      list: "grid",
      table: "grid",
      dashboard: "custom",
    };

    if (!validTypes.has(type)) {
      type = typeNormalization[type] || "grid";
    }

    const view: AdminViewConfig = {
      id: raw.id,
      type: type as AdminViewConfig["type"],
      title: raw.title || raw.id,
      table: raw.table,
    };

    // For custom views, derive component path if not explicitly set
    if (type === "custom") {
      view.component = raw.component || `$views/${getViewPath(kon.id)}`;
    }

    // Un Web Component necesita saber COMO se llama la etiqueta y DONDE esta el
    // fichero; sin esos dos datos el admin no puede montarlo.
    if (type === "element") {
      view.element = raw.element;
      view.src = raw.src;
    }

    // Pass through extra properties used by DataExplorer and UI
    if (raw.groupBy !== undefined) view.groupBy = raw.groupBy;
    if (raw.dateField !== undefined) view.dateField = raw.dateField;
    if (raw.titleField !== undefined) view.titleField = raw.titleField;
    if (raw.icon !== undefined) view.icon = raw.icon;
    if (raw.description !== undefined) view.description = raw.description;
    if (raw.rowActions !== undefined) view.rowActions = raw.rowActions;
    if (raw.bulkActions !== undefined) view.bulkActions = raw.bulkActions;

    /**
     * ── EL FILTRO DE LA VISTA, QUE SE PERDIA AQUI ──────────────────────────
     *
     * `defaultFilter` es lo que hace que «Publicados» enseñe los publicados y
     * «Borradores» los borradores. Sin él, dos pestañas sobre la misma tabla
     * piden lo mismo y enseñan lo mismo — un post en borrador aparecía bajo
     * «Publicados».
     *
     * Ya se arregló una vez en el cliente (`generateExplorerConfig` no lo
     * copiaba) y siguió sin funcionar, porque el dato NUNCA LLEGABA: este
     * mapeo copia campo por campo y `defaultFilter` no estaba en la lista. Se
     * arregló la segunda mitad del camino mientras la primera seguía cortada.
     *
     * Copiar campo a campo falla en silencio por diseño: lo que no se nombra
     * desaparece sin un aviso. Por eso hay una prueba que compara las claves
     * que usan los `kon.json` con las que este bloque reenvía.
     */
    if (raw.defaultFilter !== undefined) view.defaultFilter = raw.defaultFilter;

    /**
     * Nombre en singular para el botón «Agregar».
     *
     * Sustituye a la singularización por expresión regular que producía
     * «Agregar All Gam»: ahora el kon lo declara y el panel lo usa tal cual.
     * Si no llega, el botón dice «Agregar» a secas — feo pero nunca inventado.
     */
    if (raw.singularName !== undefined) view.singularName = raw.singularName;

    views.push(view);
  }

  return views;
}

/**
 * Build kon config as part of a grimoire (dynamic)
 */
/**
 * La base de API que el kon declara, o nada.
 *
 * ── POR QUÉ ES UNA FUNCIÓN Y NO DOS LÍNEAS ─────────────────────────────────
 *
 * Porque había dos constructores del mismo objeto —`buildKonAdminConfig` y
 * `buildGrimoireKonConfig`— y solo uno rellenaba este campo. Un kon que
 * perteneciera a un grimoire perdía su `apiBase` declarada sin que nada lo
 * dijera: kon-dms declara `/api/dms` en su manifiesto y el registro devolvía
 * `undefined`. Dos sitios calculando lo mismo divergen; uno no puede.
 *
 * ── POR QUÉ NO SE DEDUCE DE `mount.path` ───────────────────────────────────
 *
 * Aquí ponía `admin?.apiBase || mount?.path`, y eso es una promesa falsa:
 * `mount.path` dice dónde se engancha el router del kon; `apiBase` promete que
 * `<apiBase>/<tabla>` lista esa tabla. Academy monta en `/api/academy` y no
 * sirve nada parecido a `/cursos`.
 *
 * Con la deducción, el panel fijaba un endpoint por kon y lo usaba en TODAS sus
 * pestañas: en Academy las once pedían `cursos`. Era la causa de «no puedo
 * moverme entre opciones dentro de cada kon».
 */
function apiBaseDeclarada(kon: KitsudenManifest): string | undefined {
  return (kon as { admin?: { apiBase?: string } }).admin?.apiBase;
}

async function buildGrimoireKonConfig(
  kon: KitsudenManifest,
  _grimoire: GrimoireInfo
): Promise<KonAdminConfig | null> {
  // Skip engine infrastructure
  if (isEngineInfrastructure(kon.id)) {
    return null;
  }

  const konPath = join(getPackagesRoot(), "kons", getKonDirName(kon.id));

  // Get tables from kon.json or infer from id
  const tables = await detectTables(kon, konPath);

  // 1. Try to read admin.views from kon.json (Hybrid Rendering)
  const views = extractViewsFromManifest(kon);

  // 2. Fallback to legacy behavior if no admin.views declared
  let hasCustomViewLegacy = false;
  if (views.length === 0) {
    hasCustomViewLegacy = await detectCustomView(kon.id);
    if (hasCustomViewLegacy) {
      views.push({
        id: "custom",
        type: "custom",
        title: "Overview",
        component: `$views/${getViewPath(kon.id)}`,
      });
    }
    for (const table of tables) {
      views.push({
        id: `grid-${table.name}`,
        type: "grid",
        title: table.label,
        table: table.name,
      });
    }
  }

  const hasCustomView = views.some((v) => v.type === "custom") || hasCustomViewLegacy;
  const defaultView = vistaPorDefectoValida((kon as any).admin?.defaultView, views, kon.id);

  return {
    id: kon.id,
    name: kon.name || kon.id,
    icon: kon.icon || getDefaultIcon(kon.id),
    category: "esports", // Grimoires are always esports category
    hasCustomView,
    tables,
    views,
    defaultView,
    // Faltaba: un kon de grimoire perdía su `apiBase` declarada.
    apiBase: apiBaseDeclarada(kon),
  };
}

/**
 * Scan all kons and build admin registry
 */
/**
 * Load the manifest of the currently active grimoire (grimoire.json).
 */
async function loadActiveGrimoireManifest(): Promise<GrimoireManifest | null> {
  const activeGrimoireId =
    process.env.KITSUDEN_ACTIVE_GRIMOIRE || process.env.KITSUDEN_ACTIVE_THEME || null;
  if (!activeGrimoireId) return null;

  const manifiesto = await leerManifiestoGrimoire(
    join(getPackagesRoot(), "grimoires", activeGrimoireId)
  );
  return manifiesto as GrimoireManifest | null;
}

/**
 * Apply grimoire-level overrides to a kon admin config.
 */
function applyGrimoireOverrides(
  config: KonAdminConfig,
  grimoireManifest: GrimoireManifest | null
): KonAdminConfig {
  if (!grimoireManifest?.konConfig) return config;

  const override = grimoireManifest.konConfig[config.id];
  if (!override) return config;

  // Clone to avoid mutating original
  const patched = { ...config };

  // Override display name
  if (override.displayName) {
    patched.name = override.displayName;
  }

  // Override default view — comprobada igual que las otras dos: un override
  // que apunta a una vista inexistente rompe lo mismo que un manifiesto.
  if (override.defaultView) {
    patched.defaultView = vistaPorDefectoValida(override.defaultView, patched.views, patched.id);
  }

  // Hide tables
  if (override.hiddenTables && override.hiddenTables.length > 0) {
    const hiddenSet = new Set(override.hiddenTables);
    patched.tables = patched.tables.filter((t) => !hiddenSet.has(t.name));
    patched.views = patched.views.filter((v) => !v.table || !hiddenSet.has(v.table));
  }

  // Add extra views
  if (override.extraViews && override.extraViews.length > 0) {
    patched.views = [...patched.views, ...override.extraViews];
  }

  return patched;
}

export async function buildAdminRegistry(): Promise<KonAdminConfig[]> {
  // Check cache
  if (registryCache && Date.now() - cacheTimestamp < CACHE_TTL) {
    return registryCache;
  }

  const kons = await scanPackages("kons");
  const grimoires = await scanGrimoires();
  const activeGrimoireManifest = await loadActiveGrimoireManifest();
  const configs: KonAdminConfig[] = [];

  /**
   * Kons que construye el segundo bucle, para no construirlos dos veces.
   *
   * ── EL HUECO QUE ESTO CIERRA ─────────────────────────────────────────────
   *
   * Aquí se añadían también los `optionalKons`, y el segundo bucle solo recorre
   * `grimoire.kons`. Resultado: un kon que solo aparezca como OPCIONAL de algún
   * grimoire se saltaba aquí y no se añadía allí — desaparecía del registro sin
   * que nada fallara.
   *
   * Eran TRECE de veintiséis: booking, members, payments, newsletter, wiki,
   * maps, cardsim, tierlist, builder, formulas, directory, ocr-training y
   * broadcast-moba. Todos listados como opcionales en grimoire-gremius,
   * grimoire-viggo o grimoire-vekdocs.
   *
   * El síntoma no se parecía a esto: `/api/admin/registry/kon-booking` devolvía
   * 404, el panel caía a su configuración por defecto —una sola vista con
   * `table = <id del kon>`— y el formulario decía
   *
   *     Could not load schema for table "kon-booking"
   *
   * o sea, el id del kon disfrazado de tabla que falta. Las tres pestañas que
   * declara su manifiesto no aparecían por ningún lado.
   *
   * Que un kon sea OPCIONAL de un grimoire no lo hace propiedad de ese
   * grimoire: sigue siendo un kon suelto que se muestra por sí mismo. Solo se
   * excluyen los que el segundo bucle va a construir de verdad.
   */
  const grimoireKonIds = new Set<string>();
  for (const grimoire of grimoires) {
    for (const gId of grimoire.kons) {
      grimoireKonIds.add(gId);
    }
  }

  // Scan standalone kons (not part of any grimoire)
  for (const kon of kons) {
    // Skip kons that belong to grimoires - they'll be handled separately
    if (grimoireKonIds.has(kon.id)) {
      continue;
    }

    const config = await buildKonAdminConfig(kon);
    if (config) {
      configs.push(config);
    }
  }

  /**
   * ── UN KON, UNA ENTRADA ──────────────────────────────────────────────────
   *
   * Un mismo kon puede estar listado en VARIOS grimoires: `kon-dms` aparece en
   * `grimoire-corporate`, `grimoire-sharepoint` y `grimoire-vekdocs`. Sin este
   * control se empujaba una configuración por cada uno, y el registro devolvía
   * TRES entradas idénticas con el mismo `id`.
   *
   * Lo que se ve en el panel: el kon repetido tres veces en la barra lateral.
   * Y como Svelte indexa las listas por clave, un id duplicado es además la
   * clase de cosa que rompe el renderizado entero de la lista, no solo su
   * aspecto.
   *
   * Se queda el primero: es el mismo que ya se estaba usando —los tres
   * generaban una configuración idéntica— y el orden de escaneo es estable.
   */
  const yaRegistrados = new Set(configs.map((c) => c.id));

  for (const grimoire of grimoires) {
    for (const konId of grimoire.kons) {
      if (yaRegistrados.has(konId)) continue;

      // Find the kon manifest
      const kon = kons.find((g) => g.id === konId);
      if (kon) {
        const config = await buildGrimoireKonConfig(kon, grimoire);
        if (config) {
          configs.push(config);
          yaRegistrados.add(config.id);
        }
      } else {
        console.warn(`[AdminRegistry] Grimoire ${grimoire.id} references unknown kon: ${konId}`);
      }
    }
  }

  // Scan core modules with custom views
  for (const coreModule of CORE_MODULES_WITH_VIEWS) {
    const config = await buildCoreModuleAdminConfig(coreModule);
    if (config) {
      configs.push(config);
    }
  }

  // Apply grimoire overrides (name changes, hidden tables, extra views)
  for (let i = 0; i < configs.length; i++) {
    configs[i] = applyGrimoireOverrides(configs[i], activeGrimoireManifest);
  }

  // Sort: custom views first, then alphabetically
  configs.sort((a, b) => {
    if (a.hasCustomView && !b.hasCustomView) return -1;
    if (!a.hasCustomView && b.hasCustomView) return 1;
    return a.name.localeCompare(b.name);
  });

  registryCache = configs;
  cacheTimestamp = Date.now();
  return configs;
}

/**
 * Build admin config for a single kon
 */
async function buildKonAdminConfig(kon: KitsudenManifest): Promise<KonAdminConfig | null> {
  // Skip engine infrastructure (Level 1 - always active, not user-facing)
  if (isEngineInfrastructure(kon.id)) {
    return null;
  }

  const konPath = join(getPackagesRoot(), "kons", getKonDirName(kon.id));

  // 2. Get tables from kon.json or infer from id
  const tables = await detectTables(kon, konPath);

  // 3. Build views config — read admin.views from kon.json (Hybrid Rendering)
  const views = extractViewsFromManifest(kon);

  // Fallback to legacy behavior if no admin.views declared
  let hasCustomViewLegacy = false;
  if (views.length === 0) {
    hasCustomViewLegacy = await detectCustomView(kon.id);
    if (hasCustomViewLegacy) {
      views.push({
        id: "custom",
        type: "custom",
        title: "Overview",
        component: `$views/${getViewPath(kon.id)}`,
      });
    }
    for (const table of tables) {
      views.push({
        id: `grid-${table.name}`,
        type: "grid",
        title: table.label,
        table: table.name,
      });
    }
  }

  const hasCustomView = views.some((v) => v.type === "custom") || hasCustomViewLegacy;

  const apiBase = apiBaseDeclarada(kon);

  const defaultView = vistaPorDefectoValida((kon as any).admin?.defaultView, views, kon.id);

  return {
    id: kon.id,
    name: kon.name || kon.id,
    icon: kon.icon || getDefaultIcon(kon.id),
    category: mapCategory(kon.category, kon.grimoireId),
    hasCustomView,
    tables,
    views,
    defaultView,
    apiBase,
  };
}

/**
 * Build admin config for a core module (from apps/api/src/modules/)
 */
async function buildCoreModuleAdminConfig(
  coreModule: CoreModuleWithView
): Promise<KonAdminConfig | null> {
  // 1. Detect custom view by convention
  const hasCustomView = await detectCustomView(coreModule.id);

  // 2. Build tables config
  const tables: AdminTableConfig[] = [];
  if (coreModule.tables) {
    for (const tableName of coreModule.tables) {
      const introspected = await introspectTable(tableName);
      tables.push({
        name: tableName,
        label: humanize(tableName),
        icon: getTableIcon(tableName),
        primaryKey: introspected?.primaryKey[0] || "id",
        searchableFields: introspected?.columns
          .filter((c) => isSearchableType(c))
          .map((c) => c.name),
        filterableFields: introspected?.columns
          .filter((c) => isFilterableType(c))
          .map((c) => c.name),
      });
    }
  }

  // 3. Build views config
  const views: AdminViewConfig[] = [];

  if (hasCustomView) {
    views.push({
      id: "custom",
      type: "custom",
      title: "Overview",
      component: `$views/${getViewPath(coreModule.id)}`,
    });
  }

  // Add grid views for each table
  for (const table of tables) {
    views.push({
      id: `grid-${table.name}`,
      type: "grid",
      title: table.label,
      table: table.name,
    });
  }

  return {
    id: coreModule.id,
    name: coreModule.name,
    icon: getDefaultIcon(coreModule.id),
    category: coreModule.category,
    hasCustomView,
    tables,
    views,
    // Sin vistas NO se inventa ninguna.
    //
    // Esto acababa en `|| "grid"`, un identificador que no corresponde a nada.
    // Un kon sin tablas ni vista propia —los hay que solo registran
    // perfiles de juego en `kon-broadcast`— recibia asi una vista de rejilla
    // inexistente, y el admin la abria como explorador de una tabla llamada
    // igual que el kon. De ahi «Collection '<kon>' not found» y
    // «0 columnas»: no faltaba nada, es que ese kon no tiene datos que mostrar.
    defaultView: hasCustomView ? "custom" : (views[0]?.id ?? null),
  };
}

/**
 * Detect if kon has custom Svelte view by convention.
 * Uses getViewPath() which already handles all special mappings.
 * Avoids false positives from shared view files (e.g., PostsView.svelte
 * being incorrectly detected for every kon).
 */
async function detectCustomView(konId: string): Promise<boolean> {
  const viewPath = getViewPath(konId);

  // Primary: the mapped view path (handles all special cases)
  if (await Bun.file(join(process.cwd(), "../../packages/admin/src/views", viewPath)).exists()) {
    return true;
  }

  // Fallback: index.svelte in the same folder
  const indexPath = viewPath.includes("/")
    ? viewPath.replace(/\/[^/]+\.svelte$/, "/index.svelte")
    : `${viewPath.replace(/\.svelte$/, "")}/index.svelte`;

  if (await Bun.file(join(process.cwd(), "../../packages/admin/src/views", indexPath)).exists()) {
    return true;
  }

  return false;
}

/**
 * Table config from kon manifest
 */
interface KonTableConfig {
  name?: string;
  table?: string;
  label?: string;
  icon?: string;
  description?: string;
  primaryKey?: string;
  searchableFields?: string[];
  filterableFields?: string[];
  readonly?: boolean;
}

/**
 * Detect tables for a kon
 */
async function detectTables(
  kon: KitsudenManifest,

  _konPath: string
): Promise<AdminTableConfig[]> {
  // Priority 1: Tables defined in kon.json
  if (kon.tables && Array.isArray(kon.tables)) {
    const configs: AdminTableConfig[] = [];

    for (const t of kon.tables) {
      if (typeof t === "string") {
        // Try to introspect from DB for extra metadata
        const introspected = await introspectTable(t);

        configs.push({
          name: t,
          label: humanize(t),
          icon: getTableIcon(t),
          primaryKey: introspected?.primaryKey[0] || "id",
          searchableFields: introspected?.columns
            .filter((c) => isSearchableType(c))
            .map((c) => c.name),
          filterableFields: introspected?.columns
            .filter((c) => isFilterableType(c))
            .map((c) => c.name),
        });
      } else {
        const tableConfig = t as KonTableConfig;
        const name = tableConfig.name || tableConfig.table || "";
        configs.push({
          name,
          label: tableConfig.label || humanize(name),
          icon: tableConfig.icon || getTableIcon(name),
          description: tableConfig.description,
          primaryKey: tableConfig.primaryKey || "id",
          searchableFields: tableConfig.searchableFields,
          filterableFields: tableConfig.filterableFields,
          readonly: tableConfig.readonly || false,
        });
      }
    }

    return configs;
  }

  // Priority 2: Auto-detect table from DB introspection
  const baseName = kon.id.replace(/^kon-/, "").replace(/-/g, "_");

  // Try to find table with same name or plural
  const introspected =
    (await introspectTable(baseName)) ||
    (await introspectTable(baseName + "s")) ||
    (await introspectTable(baseName.replace(/s$/, "")));

  if (introspected) {
    const searchableFields = introspected.columns
      .filter((c) => isSearchableType(c))
      .map((c) => c.name);
    const filterableFields = introspected.columns
      .filter((c) => isFilterableType(c))
      .map((c) => c.name);

    return [
      {
        name: introspected.name,
        label: kon.name || humanize(kon.id),
        icon: getDefaultIcon(kon.id),
        primaryKey: introspected.primaryKey[0] || "id",
        searchableFields,
        filterableFields,
      },
    ];
  }

  // Priority 3: Fallback to basic config
  return [
    {
      name: baseName,
      label: kon.name || humanize(kon.id),
      icon: getDefaultIcon(kon.id),
      primaryKey: "id",
    },
  ];
}

/** Column with type info */
interface ColumnInfo {
  name: string;
  type: string;
}

// Helper to determine if column is searchable
function isSearchableType(col: ColumnInfo): boolean {
  const searchableTypes = ["text", "varchar", "char"];
  const type = col.type.toLowerCase();
  const searchableNames = ["name", "title", "label", "email", "description", "slug"];

  return (
    searchableTypes.some((t) => type.includes(t)) ||
    searchableNames.some((n) => col.name.toLowerCase().includes(n))
  );
}

// Helper to determine if column is filterable
function isFilterableType(col: IntrospectedColumn): boolean {
  if (col.name === "id") return false;
  if (col.name.endsWith("_id")) return true; // FKs are filterable
  if (col.type.toLowerCase().includes("json")) return false;
  return true;
}

/**
 * Get the directory name for a kon ID
 */
function getKonDirName(id: string): string {
  // Common patterns
  if (id.startsWith("kon-")) return id;
  if (id.startsWith("core-")) return id.replace("core-", "core/");
  return `kon-${id}`;
}

/**
 * Get view path for custom component
 * Handles kon- prefix stripping for view paths
 */
function getViewPath(konId: string): string {
  const shortId = konId.replace(/^kon-/, "");
  const pascal = pascalCase(shortId);

  // Special cases for kon IDs that map to different view paths

  // blog: stored in content/ folder with PostsView name
  if (konId === "kon-blog") {
    return "content/PostsView.svelte";
  }

  // Page Builder (Blocks): maps to blocks/ folder
  if (konId === "kon-blocks") {
    return "blocks/BlocksView.svelte";
  }

  // Academy LMS: maps to academy/ folder
  if (konId === "kon-academy-lms") {
    return "academy/AcademyView.svelte";
  }

  // Games (esports grimoire): maps to games/ folder
  if (konId === "kon-games") {
    return "games/GamesView.svelte";
  }

  // Streamers: maps to users/ folder
  if (konId === "kon-streamers") {
    return "users/StreamersView.svelte";
  }

  // Webhooks: maps to webhooks/ folder
  if (konId === "kon-webhooks" || konId === "webhooks") {
    return "webhooks/WebhooksView.svelte";
  }

  // Workers: maps to workers/ folder
  if (konId === "kon-workers" || konId === "workers") {
    return "workers/WorkersView.svelte";
  }

  // Media Library: maps to Media.svelte
  if (konId === "media-library" || konId === "media" || konId === "kon-media") {
    return "Media.svelte";
  }

  // DataSets: Core kon - maps to DataSets.svelte
  if (konId === "kon-datasets" || konId === "datasets") {
    return "DataSets.svelte";
  }

  // Page Builder (Blocks): maps to blocks/BlocksView.svelte
  if (konId === "kon-blocks" || konId === "blocks") {
    return "blocks/BlocksView.svelte";
  }

  // Blog: maps to content/PostsView.svelte
  if (konId === "kon-blog" || konId === "blog") {
    return "content/PostsView.svelte";
  }

  // Default: use short ID without kon- prefix
  return `${shortId}/${pascal}View.svelte`;
}

/**
 * Engine infrastructure kons that should be hidden from admin
 * These are Level 1 - always active, not user-facing
 *
 * NOTE: Media Library is now a Core Kon (toggleable), not engine infrastructure.
 * The underlying MinIO storage service remains always-on as engine infrastructure,
 * but the API routes and UI are toggleable via kon system.
 */
const ENGINE_INFRASTRUCTURE: string[] = [];

/**
 * Check if kon is engine infrastructure (should be hidden)
 */
function isEngineInfrastructure(id: string): boolean {
  return ENGINE_INFRASTRUCTURE.includes(id);
}

/**
 * Map category to admin category
 *
 * Category mapping:
 * - "core-den" | "core" → "core" (Level 2 - Core kons: blog, blocks, webhooks, connectors)
 * - "optional" → "content" or "data" (Level 3 - Optional features)
 * - "grimoire" | grimoireId present → "esports" (Level 4 - Grimoire-specific, dynamic)
 */
function mapCategory(category?: string, grimoireId?: string): KonAdminConfig["category"] {
  // Grimoires are dynamic and separate from optional kons
  if (grimoireId || category === "grimoire") return "esports";
  // Core kons (both core-den and core/system infrastructure)
  if (category === "core-den" || category === "core") return "core";
  // Content kons
  if (["blog", "media", "content"].includes(category || "")) return "content";
  // System/Infrastructure kons also go to core
  if (["webhooks", "workers", "system"].includes(category || "")) return "core";
  // La familia de herramientas (builders, wikis, mapas, simuladores) declara
  // `tools`, que aún no existe en el contrato versionado del registry: viaja
  // como `data` hasta que se suba la versión y el panel le dé sección propia.
  if (category === "tools") return "data";
  // Default to data for other optional kons
  return "data";
}

/**
 * Get default icon for kon/table
 */
function getDefaultIcon(id: string): string {
  const icons: Record<string, string> = {
    games: "Gamepad2",
    streamers: "Tv",
    platforms: "Monitor",
    tags: "Tag",
    collections: "Library",
    teams: "Users",
    players: "UserCircle",
    matches: "Swords",
    tournaments: "Trophy",
    webhooks: "Webhook",
    workers: "Cpu",
    academy: "GraduationCap",
    booking: "CalendarDays",
    directory: "Contact",
    crm: "Briefcase",
    dms: "FileStack",
    blog: "FileText",
    media: "Image",
    datasets: "Database",
  };
  return icons[id] || "Database";
}

/**
 * Get icon for specific table
 */
function getTableIcon(tableName: string): string {
  if (tableName.includes("user") || tableName.includes("contact")) return "User";
  if (tableName.includes("game")) return "Gamepad2";
  if (tableName.includes("media") || tableName.includes("image")) return "Image";
  if (tableName.includes("post") || tableName.includes("article")) return "FileText";
  if (tableName.includes("category") || tableName.includes("tag")) return "Tag";
  if (tableName.includes("order") || tableName.includes("sale")) return "ShoppingCart";
  return "Table";
}

/**
 * Convert snake_case or camelCase to Human Readable
 */
function humanize(str: string): string {
  return str
    .replace(/^kon-/, "")
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

/**
 * Convert to PascalCase
 */
function pascalCase(str: string): string {
  return str
    .replace(/^kon-/, "")
    .replace(/[-_]/g, " ")
    .replace(/(?:^|\s)(\w)/g, (_, c) => c.toUpperCase())
    .replace(/\s/g, "");
}

/**
 * Clear registry cache (useful after kon installation)
 */
export function clearAdminRegistryCache() {
  registryCache = null;
  cacheTimestamp = 0;
}

/**
 * Get admin config for a specific kon
 */
export async function getKonAdminConfig(konId: string): Promise<KonAdminConfig | null> {
  const registry = await buildAdminRegistry();
  return registry.find((g) => g.id === konId) || null;
}
