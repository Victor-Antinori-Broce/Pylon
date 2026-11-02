/**
 * Modules API Routes
 *
 * Returns modules organized by category:
 *   - core: Official Kitsuden BaaS features (toggleable)
 *   - optional: Enterprise/vertical features (toggleable)
 *   - grimoire: Bundled with active grimoire (auto-loaded) — DYNAMIC
 *   - uninstalled: Kons with preserved data (can recover or purge)
 *
 * GET    /api/modules              — list all modules with categories
 * GET    /api/modules/:key         — get a single module by key
 * GET    /api/modules/:key/check   — can this module be disabled?
 * PATCH  /api/modules/:key         — toggle enabled / update settings
 * POST   /api/modules/:key/uninstall — uninstall but preserve data
 * POST   /api/modules/:key/recover   — recover uninstalled kon
 * DELETE /api/modules/:key         — delete kon and its data
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { eq, sql as drizzleSql } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";

import { db } from "../db";
import { modules, siteSettings } from "../db/schema";
import {
  CORE_MODULES,
  CORE_MODULE_KEYS,
  checkCanDisable,
  getCoreModules,
  getOptionalModules,
  getCoreDenKons,
} from "../services/module-registry";
import { buscarPorClaveDeKon, claveCanonica, fusionarPorKon } from "../lib/clave-kon";
import { leerManifiestoGrimoire } from "../lib/grimoire-manifest";
import { getInformeDeCarga } from "../lib/module-loader";
import { scanPackages } from "../services/scanner";
import { rutaDeKon } from "../lib/kons-instalados";
import { fichero } from "../lib/fichero";

/**
 * Check if a kon has data in the database
 * Returns table names and row counts if data exists
 */
/**
 * ¿Están montadas las rutas de este kon en el proceso que está corriendo?
 *
 * ── POR QUÉ ESTO NO SE PUEDE ARREGLAR MONTÁNDOLAS ──────────────────────────
 *
 * Porque Hono no deja. Los kons se montan con `app.route()` en `loadKons()`,
 * que corre UNA vez al arrancar, y en cuanto el router atiende la primera
 * petición congela su matcher:
 *
 *     Can not add a route since the matcher is already built.
 *
 * Así que activar un kon en caliente puede crear sus tablas —eso sí funciona—
 * pero sus endpoints no existirán hasta el siguiente reinicio.
 *
 * Callarlo dejaría exactamente el estado que costó esta sesión entera: el kon
 * aparece en el menú, el usuario entra, y cada pantalla suya devuelve 404 sin
 * que nada explique por qué. Media instalación presentada como completa.
 */
function rutasMontadas(key: string): boolean {
  const informe = getInformeDeCarga();
  const sinPrefijo = key.replace(/^kon-/, "");
  return informe.cargados.some((c) => c === key || c.replace(/^kon-/, "") === sinPrefijo);
}

/**
 * Deja el kon sirviendo YA, sin reiniciar.
 *
 * `loadKons()` reservó en el arranque un camino comodín para cada kon apagado
 * (ver `lib/kons-diferidos.ts`). Aquí solo hay que importar el kon y colgar su
 * router de ese camino — la tabla de rutas de Hono no se toca, que es lo que la
 * hacía imposible.
 *
 * Se hace aquí y no en la primera petición para que un kon roto se vea en la
 * respuesta del interruptor, que es donde el usuario está mirando, y no como un
 * 500 suelto cinco minutos después.
 */
async function montarKonEnCaliente(key: string): Promise<{ montado: boolean; motivo?: string }> {
  try {
    const { activarKonEnCaliente } = await import("../lib/kons-diferidos");
    return await activarKonEnCaliente(key);
  } catch (err) {
    return { montado: false, motivo: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Instala el esquema de un kon antes de darlo por activo.
 *
 * ── POR QUÉ DEVUELVE EL FALLO EN VEZ DE LANZAR ─────────────────────────────
 *
 * Porque el fallo tiene que llegar al usuario como respuesta, no como un 500
 * genérico. Lo que había era peor todavía:
 *
 *     try { await runModuleMigrations(key); }
 *     catch (err) { console.error(err); }        // ← y a continuación
 *     await db.update(modules).set({ enabled: true });
 *
 * Un `catch` que registra y sigue. El kon quedaba marcado como habilitado sin
 * una sola tabla, aparecía en el menú lateral, y cada pantalla suya devolvía
 * 500 o un formulario sin campos. El único rastro era una línea en los logs del
 * contenedor.
 *
 * Devuelve `null` si todo fue bien, o el cuerpo y el código de la respuesta.
 */
async function instalarEsquemaDeKon(
  key: string
): Promise<{ estado: 409 | 500; cuerpo: Record<string, unknown> } | null> {
  const kons = await scanPackages("kons");
  const manifiesto = kons.find((k) => k.id === key || k.id === `kon-${key}`);

  // El kon no está en esta instalación (la imagen pública lleva solo el núcleo).
  // Sin esto, el interruptor del panel respondía 500 «las migraciones fallaron»,
  // que manda a buscar un error de SQL que no existe.
  if (!manifiesto && !rutaDeKon(key)) {
    return {
      estado: 409,
      cuerpo: {
        error: "Kon no instalado",
        message: `'${key}' no está instalado en esta instancia, así que no se puede activar.`,
        key,
        hint:
          `Con Docker: añádelo a KITSUDEN_KONS y reconstruye la imagen. ` +
          `En local: kitsuden kon add ${key.replace(/^kon-/, "")}. Ver docs/kons/installing.md.`,
      },
    };
  }

  // Las tablas declaradas se comprueban DESPUÉS de migrar: son la promesa
  // explícita del kon, y es lo que separa «migró» de «funciona».
  const declaradas = (
    (manifiesto as { tables?: (string | { name: string })[] } | undefined)?.tables ?? []
  ).map((t) => (typeof t === "string" ? t : t.name));

  try {
    const { aplicarMigracionesDeKon } = await import("../lib/migraciones-kon");
    const r = await aplicarMigracionesDeKon(key, {
      rutaInstalacion: manifiesto?.installPath,
      tablasDeclaradas: declaradas,
    });

    if (r.tablasQueFaltan.length > 0) {
      /**
       * Tres motivos distintos con el mismo síntoma, y hay que separarlos.
       *
       * La versión anterior decía siempre «siguen sin existir DESPUÉS DE
       * APLICAR sus migraciones», y en el caso más común eso era falso: no se
       * aplicó ninguna. Todas constaban ya en `kitsuden_migrations` y se
       * saltaron. El mensaje mandaba a revisar un SQL que no se había
       * ejecutado.
       *
       * El caso se da de verdad —lo provocó la limpieza de una prueba— siempre
       * que el historial y el esquema dejan de coincidir: alguien borra tablas,
       * se restaura una copia parcial, o se marcó `--baseline` sobre una base
       * que no tenía ese esquema.
       */
      const nadaQueAplicar = r.aplicadas.length === 0 && r.yaEstaban.length === 0;
      const historialDesincronizado = r.aplicadas.length === 0 && r.yaEstaban.length > 0;

      const message = historialDesincronizado
        ? `El historial dice que las migraciones de '${key}' YA se aplicaron, ` +
          `pero sus tablas no están en la base. No se ejecutó ninguna migración ` +
          `en este intento: se saltaron todas por constar como aplicadas.`
        : nadaQueAplicar
          ? `'${key}' no trae ficheros de migración, así que nada crea sus ` +
            `tablas. No se activa: hacerlo dejaría sus pantallas devolviendo ` +
            `errores.`
          : `Las migraciones de '${key}' se aplicaron pero no crearon todas las ` +
            `tablas que su manifiesto declara.`;

      const hint = historialDesincronizado
        ? `El historial y el esquema no coinciden. Para que la cadena vuelva a ` +
          `aplicarse, borra su registro y reintenta:

` +
          `    DELETE FROM kitsuden_migrations WHERE name LIKE '${key}/%';

` +
          `Si las tablas se borraron a propósito, esto las recrea vacías.`
        : nadaQueAplicar
          ? `Añade la migración de arranque en packages/kons/${key}/migrations/ ` +
            `(puedes generarla desde su fichero *.schema.ts con drizzle-kit).`
          : `Revisa que packages/kons/${key}/migrations cree exactamente las ` +
            `tablas que declara kon.json.`;

      return {
        estado: 409,
        cuerpo: {
          error: "Esquema incompleto",
          message,
          key,
          missingTables: r.tablasQueFaltan,
          applied: r.aplicadas,
          alreadyRecorded: r.yaEstaban,
          hint,
        },
      };
    }

    if (r.aplicadas.length > 0) {
      console.log(
        `[Modules] ${key}: aplicadas ${r.aplicadas.length} migración(es) (${r.conexion}).`
      );
    }
    return null;
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    console.error(`[Modules] No se pudo instalar el esquema de ${key}:`, detalle);
    return {
      estado: 500,
      cuerpo: {
        error: "No se pudo instalar el esquema",
        message:
          `Las migraciones de '${key}' fallaron, así que el kon NO se ha ` +
          `activado. Activarlo con el esquema a medias produce pantallas rotas ` +
          `sin explicación.`,
        key,
        detail: detalle,
      },
    };
  }
}

async function checkKonData(konKey: string): Promise<{
  hasData: boolean;
  tables: Array<{ name: string; rowCount: number }>;
  totalRows: number;
}> {
  // Get tables from kon.json
  // La carpeta del kon INSTALADO (puede no estar en packages/kons).
  const konDir = rutaDeKon(konKey) ?? join(getWorkspaceRoot(), "packages", "kons", konKey);
  const konJsonPath = join(konDir, "kon.json");

  let tablesToCheck: string[] = [];

  try {
    const file = fichero(konJsonPath);
    if (await file.exists()) {
      const manifest = await file.json();
      if (manifest.tables && Array.isArray(manifest.tables)) {
        tablesToCheck = manifest.tables
          .map((t: any) => (typeof t === "string" ? t : t.name || t.table))
          .filter(Boolean);
      }
    }
  } catch {
    // If can't read kon.json, infer from key
    tablesToCheck = [konKey.replace(/^kon-/, "").replace(/-/g, "_")];
  }

  const existingTables: Array<{ name: string; rowCount: number }> = [];

  for (const tableName of tablesToCheck) {
    try {
      const result = await db.execute(
        drizzleSql.raw(`SELECT COUNT(*) as count FROM "${tableName}"`)
      );
      const rowCount = Number((result.rows?.[0] as any)?.count || 0);
      if (rowCount > 0 || result.rows) {
        existingTables.push({ name: tableName, rowCount });
      }
    } catch {
      // Table doesn't exist or error counting
    }
  }

  const totalRows = existingTables.reduce((sum, t) => sum + t.rowCount, 0);

  return {
    hasData: existingTables.length > 0 && totalRows > 0,
    tables: existingTables,
    totalRows,
  };
}

/**
 * Get all uninstalled kons that have preserved data
 */
async function getUninstalledKonsWithData(): Promise<
  Array<{
    key: string;
    name: string;
    uninstalledAt: string | null;
    data: {
      hasData: boolean;
      tables: Array<{ name: string; rowCount: number }>;
      totalRows: number;
    };
  }>
> {
  const dbModules = await db.select().from(modules);
  const installedKeys = new Set(dbModules.map((m) => m.key));

  // Get all available kons from filesystem
  const availableKons = await scanPackages("kons");
  const uninstalled: Array<any> = [];

  for (const kon of availableKons) {
    if (!installedKeys.has(kon.id)) {
      // Check if this kon has data
      const dataCheck = await checkKonData(kon.id);

      if (dataCheck.hasData) {
        uninstalled.push({
          key: kon.id,
          name: kon.name || kon.id,
          uninstalledAt: null, // Could track this in the future
          data: dataCheck,
        });
      }
    }
  }

  return uninstalled;
}

/**
 * Resolve workspace root (same logic as module-loader / schema-merger).
 * - Dev: process.cwd() = apps/api/ → ../../ = monorepo root
 * - Docker: process.cwd() = /app/apps/api/ → packages/ at /app/packages/
 */
function getWorkspaceRoot(): string {
  const cwdCheck = join(process.cwd(), "packages", "kons", "package.json");
  return existsSync(cwdCheck) ? process.cwd() : join(process.cwd(), "../../");
}

function getPackagesRoot(): string {
  return join(getWorkspaceRoot(), "packages");
}

/**
 * Dynamic grimoire info
 */
interface DynamicGrimoire {
  id: string;
  name: string;
  description?: string;
  kons: string[];
  optionalKons: string[];
}

/**
 * Scan all available grimoires dynamically
 * This reads grimoire.json from packages/grimoires/
 */
async function scanGrimoiresDynamic(): Promise<DynamicGrimoire[]> {
  const grimoiresDir = join(getPackagesRoot(), "grimoires");
  const grimoires: DynamicGrimoire[] = [];

  try {
    const entries = await readdir(grimoiresDir, { withFileTypes: true });
    const grimoireDirs = entries.filter(
      (e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules"
    );

    for (const dir of grimoireDirs) {
      // grimoire.json, con respaldo a kitsuden.json SOLO si de verdad contiene
      // un grimoire: en ese mismo directorio kitsuden.json es el tema.
      const manifest = await leerManifiestoGrimoire(join(grimoiresDir, dir.name));

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
    // Grimoires directory might not exist
  }

  return grimoires;
}

/**
 * Get all grimoire kons dynamically
 * Combines hardcoded registry with dynamically scanned grimoires
 */
async function getDynamicGrimoireKons(): Promise<
  Array<{
    key: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    category: "grimoire";
    grimoireId: string;
    tables: string[];
    dependsOn: string[];
    referencedBy: any[];
  }>
> {
  const grimoires = await scanGrimoiresDynamic();
  const konList = await scanPackages("kons");
  const konMap = new Map(konList.map((g) => [g.id, g]));

  const result: Array<any> = [];

  for (const grimoire of grimoires) {
    for (const konId of grimoire.kons) {
      // Get kon info from scanned packages
      const kon = konMap.get(konId);

      if (kon) {
        result.push({
          // El id TAL CUAL. Antes esto era
          // `konId.replace(/^kon-/,"").replace(/-/g,"_")`, que convertía
          // `kon-blog` en `blog` — una clave que ya no es el id de nada. El
          // resultado era el mismo kon dos veces en la pantalla de Kons, con
          // estados contradictorios, y un interruptor que escribía bajo una
          // clave inexistente.
          key: konId,
          name: kon.name || konId,
          description: kon.description || `${kon.name} module`,
          icon: kon.icon || "📦",
          color: "#6366F1",
          category: "grimoire" as const,
          grimoireId: grimoire.id,
          tables: kon.tables || [],
          dependsOn: [],
          referencedBy: [],
        });
      } else {
        // Fallback if kon not found in packages
        result.push({
          key: konId,
          name: konId
            .replace(/^kon-/, "")
            .replace(/-/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          description: `Kon from ${grimoire.name}`,
          icon: "📦",
          color: "#6366F1",
          category: "grimoire" as const,
          grimoireId: grimoire.id,
          tables: [],
          dependsOn: [],
          referencedBy: [],
        });
      }
    }
  }

  return result;
}

export const modulesRoutes = new Hono();

// ── El fichero de configuración ya NO decide qué está activo ────────────────
//
// Aquí vivía `CORE_FLAG_MAP`, y no era un mapa de consulta: PISABA a la base.
//
//     const enabled = configFlag !== undefined ? configFlag : stored.enabled;
//
// Con `kon-media` en el mapa, apagarlo desde el panel se guardaba en la base y
// `/api/modules` seguía respondiendo lo que decía `kitsuden.config.ts`. El
// interruptor volvía solo al recargar. No era duplicación: el panel mentía
// sobre el estado del sistema.
//
// Ahora el fichero solo SIEMBRA la base en el arranque (`lib/sembrar-modulos.ts`)
// y a partir de ahí manda `modules`. Un kon del núcleo sigue viniendo encendido
// de fábrica —lo dice la semilla— pero se puede apagar, y se queda apagado.

// Helper: get default enabled state by category
function defaultEnabled(category: string): boolean {
  if (category === "core") return true;
  if (category === "core-den") return true;
  if (category === "grimoire") return false; // Grimoire modules OFF unless grimoire is active
  return false; // optional defaults to off
}

/** id canónico del kon → madurez declarada en su kon.json (kons y core). */
async function leerMadurezDeKons(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (const m of await scanPackages("kons")) {
    const valor = (m as unknown as { madurez?: string }).madurez;
    if (m.id && valor) mapa.set(claveCanonica(m.id), valor);
  }
  const dirCore = join(getPackagesRoot(), "core");
  try {
    for (const e of await readdir(dirCore, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const ruta = join(dirCore, e.name, "kon.json");
      if (!existsSync(ruta)) continue;
      try {
        const json = JSON.parse(await fichero(ruta).text()) as { id?: string; madurez?: string };
        if (json.id && json.madurez) mapa.set(claveCanonica(json.id), json.madurez);
      } catch {
        // manifiesto ilegible: sin insignia
      }
    }
  } catch {
    // sin packages/core
  }
  return mapa;
}

// Helper: get active theme/grimoire
async function getActiveTheme(): Promise<string | null> {
  try {
    const [settings] = await db.select().from(siteSettings).limit(1);
    // Support both new activeGrimoire and legacy activeTheme columns
    return (settings as any)?.activeGrimoire || settings?.activeTheme || null;
  } catch {
    return null;
  }
}

// ── GET / — List ALL modules organized by category ──
modulesRoutes.get("/", async (c) => {
  const dbModules = await db.select().from(modules);
  const dbMap = new Map(dbModules.map((m) => [m.key, m]));
  const activeTheme = await getActiveTheme();

  // Transform registry module to API response
  const transformModule = (
    m: (typeof CORE_MODULES)[0],
    source: "core" | "grimoire" | "filesystem"
  ) => {
    // Por clave de KON, no por cadena: la fila de kon-games puede llamarse
    // `games` en la base (filas heredadas de antes del prefijo). Con la
    // búsqueda exacta anterior, ese kon no encontraba su fila y caía al valor
    // por defecto mientras su fila real decía otra cosa.
    const stored = buscarPorClaveDeKon(dbMap, m.key);

    // Grimoire modules are auto-enabled when their grimoire is active
    const isGrimoireActive = m.category === "grimoire" && m.grimoireId === activeTheme;

    // Check if this kon is linked to the active grimoire in DB
    const enabledByGrimoire = stored?.grimoireId === activeTheme && activeTheme !== null;

    // La base primero; el grimoire activo puede encender lo suyo; y solo si la
    // base no sabe nada de este kon se recurre al valor por defecto.
    const enabled = stored ? stored.enabled : enabledByGrimoire ? true : defaultEnabled(m.category);

    // Unify core categories: both "core" and "core-den" become "core"
    const unifiedCategory = m.category === "core-den" ? "core" : m.category;

    return {
      key: m.key,
      name: m.name,
      description: m.description,
      icon: m.icon,
      color: m.color,
      category: unifiedCategory,
      grimoireId: stored?.grimoireId || m.grimoireId || null,
      enabled,
      settings: stored?.settings || {},
      dependsOn: m.dependsOn,
      tables: m.tables,
      source,
      // UI hints
      canToggle: true, // All kons can be toggled individually now
      isGrimoireActive,
      enabledByGrimoire, // Indicates this kon is active because its grimoire is active
      sidebarBadge: enabledByGrimoire ? "Active by Grimoire" : stored?.sidebarBadge,
    };
  };

  // Core modules (media, webhooks, connectors)
  const coreModules = getCoreModules().map((m) => transformModule(m, "core"));

  // Kon-Core modules (blog, blocks, formulas)
  const coreDenModules = getCoreDenKons().map((m) => transformModule(m, "core"));

  // Optional modules (academy, dms, booking, directory, crm, blog)
  const optionalModules = getOptionalModules().map((m) => transformModule(m, "core"));

  // Grimoire modules — DYNAMICALLY loaded from packages/grimoires/*/
  const allGrimoireKons = await getDynamicGrimoireKons();
  const grimoireModulesCrudos = allGrimoireKons.map((m) => transformModule(m, "grimoire"));

  /**
   * Que un kon venga en un grimoire NO lo convierte en otro kon.
   *
   * Antes esta lista se concatenaba entera a las del registro, así que
   * `kon-blog` salía dos veces: una del registro (encendido) y otra del
   * grimoire (apagado). Dos interruptores para lo mismo, y el segundo escribía
   * bajo una clave que no existía.
   *
   * Ahora la pertenencia a un grimoire es un DATO de la única entrada —qué
   * grimoires lo traen y su insignia—, no una entrada aparte. Sigue pudiéndose
   * encender o apagar individualmente: `canToggle` no depende de esto.
   *
   * Y son DATOS EN PLURAL: `kon-dms` lo incluyen Corporate, SharePoint y
   * VekDocs a la vez. En la vista de grimoires sale en los tres, que es lo
   * correcto; aquí sale UNA vez, pero nombrando a los tres.
   */
  const modulosDelRegistro = [...coreModules, ...coreDenModules, ...optionalModules];
  const fusion = fusionarPorKon(modulosDelRegistro, grimoireModulesCrudos);
  const grimoireModules = fusion.soloDeGrimoire;
  const porKon = new Map(
    [...fusion.registro, ...grimoireModules].map((m) => [claveCanonica(m.key), m])
  );

  // Auto-discovered kons from filesystem (not in hardcoded registry)
  // This is the key to zero-config: drop a kon directory with kon.json
  // and it auto-appears in the admin panel.
  // Por clave de KON: `porKon` ya tiene el registro y los del grimoire que no
  // se fusionaron. Comparar cadenas dejaba pasar la misma cosa dos veces en
  // cuanto una de las dos traía el prefijo y la otra no.
  const yaListados = porKon;

  let filesystemModules: any[] = [];
  try {
    const manifestList = await scanPackages("kons");
    filesystemModules = manifestList
      .filter((m) => !yaListados.has(claveCanonica(m.id)))
      .map((m) => {
        const stored = buscarPorClaveDeKon(dbMap, m.id);
        const enabledByGrimoire = stored?.grimoireId === activeTheme && activeTheme !== null;
        const enabled = enabledByGrimoire ? true : stored?.enabled || false;

        return {
          key: m.id,
          name:
            m.name ||
            m.id
              .replace(/^kon-/, "")
              .replace(/-/g, " ")
              .replace(/^\w/, (c: string) => c.toUpperCase()),
          description: m.description || "",
          version: m.version,
          icon: m.icon || "📦",
          category: stored?.grimoireId ? "grimoire" : "optional",
          grimoireId: stored?.grimoireId || null,
          enabled,
          settings: stored?.settings || {},
          sidebarPath: m.admin_route || `/${m.id.replace(/^kon-/, "")}`,
          source: "filesystem" as const,
          canToggle: true,
          enabledByGrimoire,
          sidebarBadge: enabledByGrimoire ? "Active by Grimoire" : stored?.sidebarBadge,
        };
      });
  } catch {
    // No packages dir
  }

  // Get uninstalled kons with preserved data
  const uninstalledKons = await getUninstalledKonsWithData();

  // Build categorized response
  const response = {
    /**
     * Los dos nombres, y no por gusto.
     *
     * El admin lee `activeGrimoire` (states/modules.svelte.ts) y esta respuesta
     * solo traía `activeTheme`, resto del rebrand tema→grimoire. Resultado: el
     * panel creía SIEMPRE que no hay grimoire activo, sin error ninguno — el
     * tipo del store declara `activeGrimoire?: string`, así que ni TypeScript
     * lo delataba.
     *
     * `activeTheme` se mantiene porque hay clientes que aún lo leen; el que
     * sobra se quita cuando no quede ninguno.
     */
    activeGrimoire: activeTheme,
    activeTheme,
    categories: {
      core: {
        label: "Core Infrastructure",
        description: "Nivel 2 — Switchable infrastructure",
        modules: coreModules,
      },
      "core-den": {
        label: "Kon Core",
        description: "Nivel 3 — Official superpowers",
        modules: coreDenModules,
      },
      optional: {
        label: "Optional Kons",
        description: "Enterprise and vertical features",
        modules: [...optionalModules, ...filesystemModules],
      },
      theme: {
        label: "Grimoire Kons",
        description: activeTheme
          ? `Active grimoire: ${activeTheme}`
          : "No grimoire active — all disabled",
        modules: grimoireModules,
      },
      uninstalled: {
        label: "Uninstalled (Data Preserved)",
        description:
          uninstalledKons.length > 0
            ? `${uninstalledKons.length} kons with data available for recovery`
            : "No uninstalled kons with preserved data",
        modules: uninstalledKons.map((g) => ({
          key: g.key,
          name: g.name,
          status: "uninstalled",
          hasPreservedData: true,
          dataSummary: {
            totalRows: g.data.totalRows,
            tables: g.data.tables.map((t) => ({ name: t.name, rows: t.rowCount })),
          },
          canRecover: true,
          canDelete: true, // Can permanently delete from here
          actions: ["recover", "delete"],
        })),
      },
    },
    // Flat list for backward compatibility (sidebar, etc.)
    docs: [
      ...coreModules,
      ...coreDenModules,
      ...optionalModules,
      ...grimoireModules,
      ...filesystemModules,
    ],
    totalDocs:
      coreModules.length +
      coreDenModules.length +
      optionalModules.length +
      grimoireModules.length +
      filesystemModules.length,
  };

  // Madurez declarada en cada kon.json («estable» | «beta» | «experimental»).
  // El panel la pinta como insignia junto al interruptor: activar un kon
  // experimental tiene que ser una decisión a sabiendas.
  const madurez = await leerMadurezDeKons();
  for (const m of response.docs as Array<Record<string, unknown>>) {
    const valor = madurez.get(claveCanonica(String(m.key)));
    if (valor) m.madurez = valor;
  }

  return c.json(response);
});

// ── GET /:key — Get a single module by key ──
export async function getModuleHandler(c: any) {
  const key = c.req.param("key")!;
  const activeTheme = await getActiveTheme();
  const [stored] = await db.select().from(modules).where(eq(modules.key, key)).limit(1);
  const registryDef = CORE_MODULES.find((m) => m.key === key);

  if (!stored && !registryDef) {
    return c.json({ error: `Module '${key}' not found` }, 404);
  }

  // Check if enabled by grimoire (stored in DB and grimoire matches active)
  const enabledByGrimoire = stored?.grimoireId === activeTheme && activeTheme !== null;

  // Calculate isGrimoireActive - either from registry or from DB
  const isGrimoireActive =
    (registryDef?.category === "grimoire" && registryDef?.grimoireId === activeTheme) ||
    enabledByGrimoire;

  // Calculate enabled status
  const enabled = stored
    ? stored.enabled
    : enabledByGrimoire
      ? true
      : defaultEnabled(registryDef?.category || "optional");

  // Check if this is a grimoire kon (either from registry or DB)
  const isGrimoireKon = registryDef?.category === "grimoire" || !!stored?.grimoireId;

  return c.json({
    key,
    name: registryDef?.name || stored?.name || key,
    description: registryDef?.description || stored?.description || "",
    icon: registryDef?.icon || stored?.icon || "📦",
    color: registryDef?.color || "",
    category:
      registryDef?.category === "core-den"
        ? "core"
        : registryDef?.category || stored?.category || "optional",
    grimoireId: stored?.grimoireId || registryDef?.grimoireId || null,
    enabled,
    settings: stored?.settings || {},
    tables: registryDef?.tables || [],
    dependsOn: registryDef?.dependsOn || [],
    canToggle: true, // All kons can be toggled individually
    isGrimoireActive,
    enabledByGrimoire,
    isGrimoireKon,
    sidebarBadge: enabledByGrimoire ? "Active by Grimoire" : stored?.sidebarBadge,
  });
}
modulesRoutes.get("/:key", getModuleHandler);

// ── GET /:key/check — Can this module be disabled? ──
export async function checkModuleHandler(c: any) {
  const key = c.req.param("key")!;

  // Check if this is a grimoire kon - grimoire kons CAN be toggled individually now
  // but we show a warning that it's part of a grimoire
  const moduleDef = CORE_MODULES.find((m) => m.key === key);
  const [stored] = await db.select().from(modules).where(eq(modules.key, key)).limit(1);
  const isGrimoireKon = moduleDef?.category === "grimoire" || !!stored?.grimoireId;

  const dbModules = await db.select().from(modules);
  const dbMap = new Map(dbModules.map((m) => [m.key, m]));

  const enabledKeys = new Set<string>();

  for (const cm of CORE_MODULES) {
    const stored = dbMap.get(cm.key);
    const isEnabled = stored ? stored.enabled : defaultEnabled(cm.category);
    if (isEnabled) enabledKeys.add(cm.key);
  }

  for (const [k, v] of dbMap) {
    if (!CORE_MODULE_KEYS.includes(k) && v.enabled) {
      enabledKeys.add(k);
    }
  }

  const result = await checkCanDisable(key, enabledKeys);

  // Add grimoire info to result
  const checkResult = {
    ...result,
    isGrimoireKon,
    grimoireId: stored?.grimoireId || moduleDef?.grimoireId || null,
    warning: isGrimoireKon
      ? "This kon is part of a grimoire. Disabling it may affect grimoire functionality."
      : undefined,
  };

  return c.json(checkResult);
}
modulesRoutes.get("/:key/check", checkModuleHandler);

export async function updateModuleHandler(c: Context) {
  const key = c.req.param("key")!;
  const body = await c.req.json();

  const registryDef = CORE_MODULES.find((m) => m.key === key);

  // Check if this is a grimoire kon
  const [_existingModule] = await db.select().from(modules).where(eq(modules.key, key)).limit(1);

  // If disabling, run dependency check
  if (body.enabled === false) {
    const dbModules = await db.select().from(modules);
    const dbMap = new Map(dbModules.map((m) => [m.key, m]));

    const enabledKeys = new Set<string>();
    for (const cm of CORE_MODULES) {
      const stored = dbMap.get(cm.key);
      if (stored ? stored.enabled : defaultEnabled(cm.category)) {
        enabledKeys.add(cm.key);
      }
    }
    for (const [k, v] of dbMap) {
      if (!CORE_MODULE_KEYS.includes(k) && v.enabled) enabledKeys.add(k);
    }

    const check = await checkCanDisable(key, enabledKeys);
    if (!check.canDisable) {
      return c.json(
        {
          error: "Cannot disable module",
          message: `${key} has active dependencies that must be removed first.`,
          blockers: check.blockers,
        },
        409
      );
    }
  }

  /**
   * Upsert SOBRE LA FILA DEL KON, no sobre la cadena que llegó en la URL.
   *
   * El `where(key = :key)` exacto no encontraba la fila heredada —la de
   * kon-games se llama `games`— e insertaba una SEGUNDA. A partir de ahí el
   * mismo kon tenía dos filas con estados distintos y ganaba una u otra según
   * quién preguntara. Es el mismo fallo que `lib/sembrar-modulos.ts` ya había
   * evitado al sembrar, y que aquí seguía vivo.
   */
  const todasLasFilas = await db.select().from(modules);
  const filaExistente = buscarPorClaveDeKon(new Map(todasLasFilas.map((m) => [m.key, m])), key);
  const claveDeLaFila = filaExistente?.key ?? key;
  const existing = filaExistente ? [filaExistente] : [];

  if (existing.length === 0) {
    if (body.enabled !== undefined) {
      if (body.enabled === true) {
        const fallo = await instalarEsquemaDeKon(key);
        if (fallo) return c.json(fallo.cuerpo, fallo.estado);
      }

      await db.insert(modules).values({
        key,
        name: registryDef?.name || body.name || key,
        description: registryDef?.description || body.description,
        icon: registryDef?.icon || body.icon,
        category: registryDef?.category || "optional",
        enabled: body.enabled,
        settings: body.settings || {},
      });
    }
  } else {
    const updates: Record<string, unknown> = {};

    if (typeof body.enabled === "boolean") {
      updates.enabled = body.enabled;
      if (body.enabled === true) {
        const fallo = await instalarEsquemaDeKon(key);
        if (fallo) return c.json(fallo.cuerpo, fallo.estado);
      }
    }

    if (body.settings !== undefined) updates.settings = body.settings;

    if (Object.keys(updates).length > 0) {
      // claveDeLaFila, no `key`: puede ser la forma heredada sin prefijo.
      await db.update(modules).set(updates).where(eq(modules.key, claveDeLaFila));
    }
  }

  const [updated] = await db.select().from(modules).where(eq(modules.key, claveDeLaFila));

  if (!updated && registryDef) {
    return c.json({
      key,
      name: registryDef.name,
      enabled: defaultEnabled(registryDef.category),
      settings: {},
      category: registryDef.category,
      grimoireId: null,
      enabledByGrimoire: false,
    });
  }

  // Get active theme to calculate enabledByGrimoire
  const activeTheme = await getActiveTheme();
  const enabledByGrimoire = updated?.grimoireId === activeTheme && activeTheme !== null;

  /**
   * Se acaba de activar y sus rutas NO están montadas en este proceso.
   *
   * Las tablas sí se han creado —eso funciona en caliente—, pero `app.route()`
   * solo se puede llamar antes de la primera petición: Hono congela su matcher
   * después. Los endpoints del kon no existirán hasta reiniciar.
   *
   * Se dice en la respuesta en vez de dejar que el usuario lo descubra
   * pantalla por pantalla. Un kon a medias que se presenta como instalado es el
   * fallo que costó esta sesión entera.
   */
  let necesitaReinicio = false;
  let montadoAhora = false;

  if (body.enabled === true && !rutasMontadas(key)) {
    // No se cargó en el arranque. Se intenta montar en caliente por el camino
    // reservado; solo si eso falla hace falta reiniciar.
    const r = await montarKonEnCaliente(key);
    montadoAhora = r.montado;
    necesitaReinicio = !r.montado;
    if (!r.montado && r.motivo && r.motivo !== "no-diferido") {
      console.warn(`[Modules] ${key}: no se pudo montar en caliente — ${r.motivo}`);
    }
  }

  return c.json(
    updated
      ? {
          ...updated,
          enabledByGrimoire,
          isGrimoireKon: !!updated.grimoireId,
          requiresRestart: necesitaReinicio,
          mountedNow: montadoAhora,
          ...(necesitaReinicio
            ? {
                restartReason:
                  `Las tablas de '${key}' ya están creadas, pero sus rutas de API no ` +
                  `se pudieron montar sin reiniciar. Reinicia la API para que sus ` +
                  `pantallas funcionen.`,
              }
            : {}),
        }
      : { key, enabled: body.enabled || false, grimoireId: null, enabledByGrimoire: false }
  );
}
modulesRoutes.patch("/:key", updateModuleHandler);

// ── POST /:key/uninstall — Uninstall kon but preserve data ──
modulesRoutes.post("/:key/uninstall", async (c) => {
  const key = c.req.param("key")!;

  // Check if module exists in DB
  const [existing] = await db.select().from(modules).where(eq(modules.key, key)).limit(1);

  if (!existing) {
    return c.json({ error: `Kon '${key}' not found` }, 404);
  }

  // Check for dependencies
  const dbModulesList = await db.select().from(modules);
  const dbMap = new Map(dbModulesList.map((m) => [m.key, m]));

  const enabledKeys = new Set<string>();
  for (const cm of CORE_MODULES) {
    const stored = dbMap.get(cm.key);
    if (stored ? stored.enabled : defaultEnabled(cm.category)) {
      enabledKeys.add(cm.key);
    }
  }
  for (const [k, v] of dbMap) {
    if (!CORE_MODULE_KEYS.includes(k) && v.enabled) enabledKeys.add(k);
  }

  const check = await checkCanDisable(key, enabledKeys);

  if (existing.enabled && !check.canDisable) {
    return c.json(
      {
        error: "Cannot uninstall",
        message: `${key} has active dependencies. Disable it first.`,
        blockers: check.blockers,
        enabled: existing.enabled,
      },
      409
    );
  }

  // Get data info before uninstalling
  const dataInfo = await checkKonData(key);

  // Delete the module from DB (preserves data in actual tables)
  await db.delete(modules).where(eq(modules.key, key));

  console.log(`[Modules] Kon ${key} uninstalled, data preserved (${dataInfo.totalRows} rows)`);

  return c.json({
    success: true,
    action: "uninstall",
    key,
    name: existing.name,
    wasEnabled: existing.enabled,
    wasGrimoireKon: !!existing.grimoireId,
    grimoireId: existing.grimoireId,
    dataPreserved: {
      hasData: dataInfo.hasData,
      totalRows: dataInfo.totalRows,
      tables: dataInfo.tables,
    },
    message: `Kon ${key} uninstalled. Data preserved: ${dataInfo.totalRows} rows in ${dataInfo.tables.length} tables.`,
    nextSteps: [
      "Use POST /api/modules/${key}/recover to reinstall and recover data",
      "Use DELETE /api/modules/${key}?purge=true to permanently delete data",
    ],
  });
});

// ── POST /:key/recover — Recover/Reinstall an uninstalled kon ──
modulesRoutes.post("/:key/recover", async (c) => {
  const key = c.req.param("key")!;

  // Check if already installed
  const [existing] = await db.select().from(modules).where(eq(modules.key, key)).limit(1);

  if (existing) {
    return c.json(
      {
        error: "Already installed",
        message: `Kon ${key} is already installed.`,
        key,
        enabled: existing.enabled,
      },
      409
    );
  }

  // Get kon info from filesystem
  const kons = await scanPackages("kons");
  const kon = kons.find((g) => g.id === key);
  const registryDef = CORE_MODULES.find((m) => m.key === key);

  if (!kon && !registryDef) {
    return c.json({ error: `Kon '${key}' not found in filesystem or registry` }, 404);
  }

  // Check if there's preserved data
  const dataInfo = await checkKonData(key);

  // Recuperar es reinstalar: si el esquema no se puede restaurar, no hay kon
  // que recuperar y decir lo contrario deja al usuario con pantallas rotas.
  const fallo = await instalarEsquemaDeKon(key);
  if (fallo) return c.json(fallo.cuerpo, fallo.estado);

  // Re-insert into modules table
  const name = kon?.name || registryDef?.name || key;
  const description = kon?.description || registryDef?.description;
  const icon = kon?.icon || registryDef?.icon || "📦";
  const category = registryDef?.category || "optional";

  await db.insert(modules).values({
    key,
    name,
    description,
    icon,
    category,
    enabled: true,
    settings: {},
  });

  console.log(`[Modules] Kon ${key} recovered, data restored (${dataInfo.totalRows} rows)`);

  return c.json({
    success: true,
    action: "recover",
    key,
    name,
    enabled: true,
    dataRestored: {
      hasData: dataInfo.hasData,
      totalRows: dataInfo.totalRows,
      tables: dataInfo.tables,
    },
    message: dataInfo.hasData
      ? `Kon ${key} recovered successfully with ${dataInfo.totalRows} rows of data.`
      : `Kon ${key} recovered successfully. No previous data found.`,
  });
});

// ── DELETE /:key — Permanently delete kon and its data ──
modulesRoutes.delete("/:key", async (c) => {
  const key = c.req.param("key")!;
  const purge = c.req.query("purge") === "true";
  const force = c.req.query("force") === "true";

  // Check if module exists in DB
  const [existing] = await db.select().from(modules).where(eq(modules.key, key)).limit(1);

  // If still installed, require purge flag
  if (existing && !purge) {
    return c.json(
      {
        error: "Kon is installed",
        message: `Kon ${key} is still installed. Use POST /api/modules/${key}/uninstall first, or use ?purge=true to uninstall and delete in one step.`,
        key,
        status: "installed",
        enabled: existing.enabled,
        canUninstall: true,
      },
      409
    );
  }

  // Check for dependencies if still "enabled" somehow
  if (existing?.enabled) {
    const dbModulesList = await db.select().from(modules);
    const dbMap = new Map(dbModulesList.map((m) => [m.key, m]));

    const enabledKeys = new Set<string>();
    for (const cm of CORE_MODULES) {
      const stored = dbMap.get(cm.key);
      if (stored ? stored.enabled : defaultEnabled(cm.category)) {
        enabledKeys.add(cm.key);
      }
    }

    const check = await checkCanDisable(key, enabledKeys);

    if (!check.canDisable && !force) {
      return c.json(
        {
          error: "Cannot delete",
          message: `${key} has active dependencies. Disable it first or use ?force=true.`,
          blockers: check.blockers,
        },
        409
      );
    }
  }

  // Get data info before deletion
  const dataInfo = await checkKonData(key);

  // Delete from modules table if exists
  if (existing) {
    await db.delete(modules).where(eq(modules.key, key));
  }

  // If purge, also drop the actual tables
  const droppedTables: string[] = [];
  if (purge) {
    for (const table of dataInfo.tables) {
      try {
        await db.execute(drizzleSql.raw(`DROP TABLE IF EXISTS "${table.name}" CASCADE`));
        droppedTables.push(table.name);
      } catch (err) {
        console.error(`[Modules] Error dropping table ${table.name}:`, err);
      }
    }
  }

  console.log(
    `[Modules] Kon ${key} deleted${purge ? ` with ${droppedTables.length} tables dropped` : " (data preserved)"}`
  );

  return c.json({
    success: true,
    action: "delete",
    key,
    name: existing?.name || key,
    purge,
    dataDeleted: purge
      ? {
          tablesDropped: droppedTables.length,
          tables: droppedTables,
          totalRows: dataInfo.totalRows,
        }
      : undefined,
    message: purge
      ? `Kon ${key} permanently deleted. ${droppedTables.length} tables dropped (${dataInfo.totalRows} rows).`
      : `Kon ${key} removed from registry. Data preserved in ${dataInfo.tables.length} tables.`,
    warning: purge ? "This action is irreversible. Data has been permanently deleted." : undefined,
  });
});
