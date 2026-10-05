/**
 * Kitsuden — Dynamic Kon Loader v3 (Node Modules Support)
 *
 * Loads kons from:
 *   1. packages/kons/{name}/ (local)
 *   2. node_modules/@kitsuden/kon-{name}/ (published)
 *   3. node_modules/{scope}/kon-{name}/ (3rd party)
 *   4. apps/api/src/modules/{name}/ (legacy)
 *   5. packages/grimoires/{grimoire}/kons/{name}/ (grimoire bundled)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 3-TIER ARCHITECTURE:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nivel 1 — ENGINE (packages/engine/):
 *   Always active. Auth, DB, Workers. NOT loaded here.
 *
 * Nivel 2 — CORE (packages/core/):
 *   Switchable. Connectors and Webhooks gated here via Core flags.
 *
 * Nivel 3 — KONS (packages/kons/ + node_modules/):
 *   Loaded dynamically. Modern kons use dependency injection.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KON RESOLUTION ORDER:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. Local packages/kons/
 * 2. @kitsuden/kon-{name} (official)
 * 3. @kitsuden/{name} (official shorthand)
 * 4. kon-{name} (community)
 * 5. {scope}/kon-{name} (3rd party)
 * 6. Legacy fallbacks
 */

import type {
  ContentTarget,
  ContentTargetInfo,
  KonContentPublishing,
  KonContext,
  KonDefinition,
  PromotionData,
  PublishResult,
} from "@kitsuden/shared";
import type { Hono } from "hono";

let cachedLoadedKons: KonDefinition[] = [];
import { db } from "../db";
import { urlPublicaDelSitio } from "./ajustes-del-sitio";
import { siteSettings, modules as modulesTable, installedKons } from "../db/schema";
import { authUsers } from "../db/schema-core";

import { join } from "node:path";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { requireAuth, requireRole, optionalAuth } from "../middleware/auth";
import { registrarRouterDeKon } from "./rutas-de-kons";
import { KON_REGISTRY } from "../services/module-registry";

import { auth } from "./auth";
import { invalidateCache } from "./cache";
import { leerKonsDelGrimoire, leerManifiestoKon } from "./grimoire-manifest";
import { events } from "./events";
import { checkKonCompatibility } from "./kitsuden-compat";
import type { KonDiferido } from "./kons-diferidos";

import { eq, inArray } from "drizzle-orm";

import { borrarObjeto, guardarObjeto, urlPublicaDe } from "./almacen";
import { logger } from "./logger";
import { rateLimit } from "./rate-limiter";
import { realtimeManager } from "./realtime";

// Deep import (NO la fachada): el index del engine re-exporta loadKons/
// loadModules desde este mismo archivo — la fachada aquí crearía un ciclo.
// Vale para TODO lo que venga del engine, no solo para registerKon: importar
// `@kitsuden/engine` para una utilidad suelta cierra el mismo ciclo. Ya pasó.
import { messageOf } from "../../../../packages/engine/src/errors";
import { registerKon } from "../../../../packages/engine/src/kon";
/**
 * Content Publishing Registry — definido aquí para no importar desde el engine.
 *
 * Los tipos SÍ vienen de `@kitsuden/shared`, que es donde vive el contrato
 * (`ContentTarget`, `PromotionData`, `PublishResult`). Antes la clase entera
 * era `any`: se guardaban targets sin comprobar que tuvieran `publish`, y
 * `promote` devolvía cualquier cosa. Implementar `KonContentPublishing`
 * explícitamente hace que un cambio en el contrato rompa aquí, que es donde
 * hay que enterarse.
 */
class ContentPublishingRegistry implements KonContentPublishing {
  private targets = new Map<string, ContentTarget>();

  /**
   * El contexto se lee de forma DIFERIDA, no se guarda.
   *
   * Es huevo y gallina: el registro forma parte del `KonContext` y a la vez lo
   * necesita. Guardar una referencia obligaba a construir el contexto a medias
   * y completarlo después, que es por lo que todo esto era `any`. Con un
   * getter, el contexto ya está entero para cuando alguien publica algo.
   */
  private readonly leerCtx: () => KonContext;

  constructor(leerCtx: () => KonContext) {
    this.leerCtx = leerCtx;
  }

  private get ctx(): KonContext {
    return this.leerCtx();
  }

  register(target: ContentTarget): void {
    if (this.targets.has(target.id)) {
      this.ctx.logger.warn(
        `ContentTarget '${target.id}' is being re-registered by ${target.konId}`
      );
    }
    this.targets.set(target.id, target);
    this.ctx.logger.info(`ContentTarget registered: '${target.id}' (${target.name})`);
  }

  unregister(targetId: string): void {
    const target = this.targets.get(targetId);
    if (target) {
      this.targets.delete(targetId);
      this.ctx.logger.info(`ContentTarget unregistered: '${targetId}' (${target.name})`);
    }
  }

  getAvailableTargets(): ContentTargetInfo[] {
    return Array.from(this.targets.values()).map((target) => ({
      id: target.id,
      name: target.name,
      konId: target.konId,
      capabilities: target.capabilities,
    }));
  }

  hasTarget(targetId: string): boolean {
    return this.targets.has(targetId);
  }

  async promote(targetId: string, data: PromotionData): Promise<PublishResult> {
    const target = this.targets.get(targetId);
    if (!target) {
      throw new Error(`Content target '${targetId}' is not available`);
    }
    return target.publish(data, this.ctx);
  }

  async unpublish(targetId: string, contentId: string): Promise<void> {
    const target = this.targets.get(targetId);
    if (!target?.unpublish) {
      throw new Error(`Content target '${targetId}' does not support unpublish`);
    }
    return target.unpublish(contentId, this.ctx);
  }

  getPublishedUrl(targetId: string, result: PublishResult): string {
    const target = this.targets.get(targetId);
    if (!target) return result.url ?? "";
    return target.getPublishedUrl(result);
  }
}

/**
 * Get grimoire kon keys dynamically from both hardcoded registry and active grimoire.
 * This ensures kons defined in grimoire.json are correctly identified as grimoire kons.
 */
async function getGrimoireKonKeys(activeGrimoire: string | null): Promise<Set<string>> {
  const keys = new Set<string>();

  // Add hardcoded registry grimoire kons
  for (const g of KON_REGISTRY.filter((g) => g.category === "grimoire")) {
    keys.add(g.key);
    // Also add without kon- prefix for flexibility
    keys.add(g.key.replace(/^kon-/, ""));
  }

  // Add kons from active grimoire (from grimoire.json)
  if (activeGrimoire) {
    const grimoireKons = await getGrimoireKons(activeGrimoire);
    for (const konId of grimoireKons) {
      keys.add(konId);
      // Also add without kon- prefix
      keys.add(konId.replace(/^kon-/, ""));
    }
  }

  return keys;
}

/** Kon metadata from any source */
interface KonSource {
  id: string;
  name: string;
  source: "local" | "npm" | "grimoire" | "legacy";
  path: string;
  manifest?: KonManifest;
  enabled: boolean;
}

/** Check if a value is a Hono router */
export function isHonoRouter(val: unknown): val is Hono {
  return (
    typeof val === "object" &&
    val !== null &&
    typeof (val as { fetch?: unknown }).fetch === "function" &&
    typeof (val as { route?: unknown }).route === "function"
  );
}

/** Check if value is a KonDefinition (modern) */
export function isKonDefinition(val: unknown): val is KonDefinition {
  return (
    typeof val === "object" &&
    val !== null &&
    "id" in val &&
    "createRouter" in val &&
    typeof (val as { createRouter?: unknown }).createRouter === "function"
  );
}

/**
 * Monta los rate limits que el kon declara para sus propias rutas.
 *
 * POR QUÉ EXISTE ESTO
 *
 * El host aplica un límite global generoso (300 req/min), calibrado para
 * lectura. Pero solo el kon sabe cuáles de sus rutas son CARAS — las que
 * mandan un correo, cobran, o lanzan un trabajo pesado. Sin este mecanismo la
 * única alternativa era añadir la ruta del kon al mapa del host, lo que
 * rompe el aislamiento: `apps/api` no debe nombrar a ningún kon.
 *
 * Las rutas declaradas son relativas al `mountPath`, así que el límite viaja
 * con el kon aunque se remonte en otro sitio.
 */
export function applyKonRateLimits(app: Hono<any>, konDef: KonDefinition, mountPath: string): void {
  const limits = konDef.rateLimits;
  if (!limits?.length) return;

  const base = mountPath.replace(/\/$/, "");

  for (const rule of limits) {
    const path = `${base}${rule.path.startsWith("/") ? rule.path : `/${rule.path}`}`;

    app.use(
      path,
      rateLimit({
        limit: rule.limit,
        window: rule.window,
        message: rule.message,
        failClosed: rule.failClosed,
      })
    );

    if (process.env.LOG_LEVEL === "debug") {
      console.log(
        `  [${konDef.id}] Rate limit: ${path} → ${rule.limit}/${rule.window}s` +
          (rule.failClosed ? " (fail-closed)" : "")
      );
    }
  }
}

/** Check if value is an Auto-Kon (created by defineKon) */
export function isAutoKon(val: unknown): boolean {
  return (
    typeof val === "object" &&
    val !== null &&
    "id" in val &&
    "config" in val &&
    "initialize" in val &&
    typeof (val as { initialize?: unknown }).initialize === "function"
  );
}

/**
 * Create KonContext with all dependencies injected
 */
/**
 * `NODE_ENV` acotado a los tres valores que declara `KonContext`.
 *
 * Antes era `(process.env.NODE_ENV as any) || "development"`, que dejaba
 * llegar a los kons cualquier cosa que hubiera en el entorno —un
 * `NODE_ENV=staging` se colaba como si fuera un valor válido— y todo kon que
 * hiciera `if (env === "production")` decidía mal en silencio.
 */
function entornoValido(valor: string | undefined): KonContext["config"]["environment"] {
  return valor === "production" || valor === "test" ? valor : "development";
}

export function createKonContext(): KonContext {
  // Se declara como `KonContext` desde el principio, no como `any` con un
  // `as KonContext` al final. Con el cast al salir, un campo que sobrara, uno
  // que faltara o uno con la forma cambiada pasaban sin que nada avisara —
  // justo en la función que construye lo que reciben los 29 kons.
  //
  // `contentPublishing` se asigna después (necesita el propio contexto), así
  // que se omite aquí y se completa abajo.
  const context: Omit<KonContext, "contentPublishing"> & {
    contentPublishing?: KonContext["contentPublishing"];
  } = {
    // Database
    db: {
      instance: db,
      execute: async (sql: string) => db.execute(sql),
      tableExists: async (tableName: string) => {
        try {
          await db.execute(`SELECT 1 FROM "${tableName}" LIMIT 1`);
          return true;
        } catch {
          return false;
        }
      },
    },

    // Cache
    cache: {
      get: async <T>(_key: string) => {
        return null as T | null;
      },
      set: async <T>(_key: string, _value: T, _ttlSeconds?: number) => {
        // Implementation
      },
      invalidate: async (pattern: string) => {
        await invalidateCache(pattern);
      },
    },

    // Events
    events: {
      emit: (event: string, data: unknown) => {
        events.emit(event, data);
      },
      on: (event: string, handler: (data: unknown) => void) => {
        events.on(event, handler);
      },
    },

    // Realtime
    realtime: {
      broadcast: (channel: string, message: unknown) => {
        realtimeManager.broadcast(channel, message);
      },
      sendToUser: (userId: string, message: unknown) => {
        realtimeManager.sendToUser(userId, message);
      },
    },

    // Auth
    auth: {
      requireAuth: requireAuth as any,
      requireRole: (roles: string[]) => requireRole(roles) as any,
      optionalAuth: optionalAuth as any,
      getSession: async (headers: Headers) => {
        return auth.api.getSession({ headers });
      },
      /**
       * Lo público de unas cuentas, para que un kon pueda firmar lo que
       * publica sin leer `auth_users` —que es del anfitrión—.
       *
       * Se devuelve `name` e `image` y nada más: ni correo ni rol. Lo que no
       * sale de aquí no puede acabar en una respuesta pública por descuido.
       */
      usuariosPorId: async (ids: string[]) => {
        const limpios = [...new Set(ids.filter(Boolean))];
        if (limpios.length === 0) return new Map();
        const filas = await db
          .select({ id: authUsers.id, name: authUsers.name, image: authUsers.image })
          .from(authUsers)
          .where(inArray(authUsers.id, limpios));
        return new Map(filas.map((u) => [u.id, { ...u, image: u.image ?? null }]));
      },
    },

    // Almacenamiento de ficheros (disco local o S3/MinIO, segun
    // DEFAULT_STORAGE_PROVIDER).
    //
    // Esto era un esqueleto: `getSignedUploadUrl` devolvia "" y `delete` no
    // hacia nada. La ruta de subida pedia esa URL y hacia `fetch("")`, asi que
    // TODA subida moria con «fetch() URL must not be a blank string» y el
    // endpoint respondia 207 —exito parcial— sin que nadie se alarmara.
    //
    // `put` y `delete` son ahora las operaciones de verdad. Las de URL firmada
    // se conservan porque forman parte del contrato que ven los kons, pero solo
    // significan algo con S3: en modo local no hay a quien firmarle nada, y
    // devuelven la URL publica directa en lugar de una cadena vacia.
    storage: {
      put: async (key: string, contenido: Buffer, contentType: string) =>
        guardarObjeto(key, contenido, contentType),
      delete: async (key: string) => borrarObjeto(key),
      publicUrl: (key: string) => urlPublicaDe(key),
      getSignedUploadUrl: async (_key: string, _contentType: string, _expiresIn = 3600) => {
        // Subir directamente desde el navegador al bucket exige S3; con disco
        // local el fichero tiene que pasar por la API. Se declara explicito en
        // vez de devolver "" y que reviente mas adelante.
        throw new Error(
          "getSignedUploadUrl requiere DEFAULT_STORAGE_PROVIDER=s3|minio. " +
            "Con almacenamiento local, usa ctx.storage.put()."
        );
      },
      getSignedDownloadUrl: async (key: string, _expiresIn = 3600) => urlPublicaDe(key),
    },

    // Logger
    logger: {
      info: (message: string, meta?: Record<string, unknown>) => {
        logger.info(meta || {}, message);
      },
      warn: (message: string, meta?: Record<string, unknown>) => {
        logger.warn(meta || {}, message);
      },
      error: (message: string, meta?: Record<string, unknown>) => {
        logger.error(meta || {}, message);
      },
      debug: (message: string, meta?: Record<string, unknown>) => {
        logger.debug(meta || {}, message);
      },
    },

    // Config
    config: {
      siteName: process.env.SITE_NAME || "Kitsuden CMS",
      // Origen de la API para newsletter y broadcast. NO es el sitio público:
      // ese es `sitio.urlPublica()`, que sale del panel.
      siteUrl: process.env.SITE_URL || "http://localhost:3000",
      environment: entornoValido(process.env.NODE_ENV),
    },

    // Configuración general → Site URL, en vivo (ver ajustes-del-sitio.ts)
    sitio: {
      urlPublica: urlPublicaDelSitio,
    },
  };

  // Inicializar Content Publishing Registry con el contexto
  context.contentPublishing = new ContentPublishingRegistry(() => context as KonContext);

  return context as KonContext;
}

/**
 * Get the currently active grimoire from database.
 */
async function getActiveGrimoire(): Promise<string | null> {
  try {
    const [settings] = await db.select().from(siteSettings).limit(1);
    return (
      (settings as any)?.activeGrimoire ||
      settings?.activeTheme ||
      process.env.KITSUDEN_ACTIVE_GRIMOIRE ||
      process.env.KITSUDEN_ACTIVE_THEME ||
      null
    );
  } catch {
    return process.env.KITSUDEN_ACTIVE_GRIMOIRE || process.env.KITSUDEN_ACTIVE_THEME || null;
  }
}

/**
 * Grimoire manifest interface (grimoire.json)
 */
interface GrimoireManifest {
  id: string;
  name: string;
  description?: string;
  version?: string;
  type: "grimoire";
  kons: string[];
  optional_kons?: string[];
  config?: Record<string, unknown>;
  /** Ajustes por kon: la opinión del grimoire sobre cómo arranca cada uno. */
  konConfig?: Record<string, Record<string, unknown>>;
  bundled_modules?: string[];
}

/**
 * Kon manifest interface (kon.json)
 */
interface KonManifest {
  id: string;
  name: string;
  version?: string;
  description?: string;
  author?: string;
  license?: string;
  /** Rango de compatibilidad con el core, ej. ">=0.9.0" (ver lib/kitsuden-compat.ts) */
  kitsuden?: string;
  /** Legacy: version minima del core (equivale a kitsuden: ">=x.y.z") */
  minKitsudenVersion?: string;
  mount?: {
    path: string;
  };
  tables?: string[];
  dependencies?: string[];
  [key: string]: any;
}

/**
 * Resolve workspace root directory.
 */
// ── Versión del core para validación de compatibilidad de kons ──
let cachedCoreVersion: string | null = null;

async function getKitsudenCoreVersion(): Promise<string> {
  if (cachedCoreVersion) return cachedCoreVersion;
  try {
    const pkg = await Bun.file(join(process.cwd(), "package.json")).json();
    cachedCoreVersion = (pkg?.version as string) || "0.0.0";
  } catch {
    cachedCoreVersion = "0.0.0";
  }
  return cachedCoreVersion;
}

export async function resolveWorkspaceRoot(): Promise<string> {
  const cwdPackages = join(process.cwd(), "packages", "kons", "package.json");
  const devRoot = join(process.cwd(), "../../");
  try {
    const cwdCheck = Bun.file(cwdPackages);
    if (await cwdCheck.exists()) {
      return process.cwd();
    }
  } catch {}
  return devRoot;
}

/**
 * Resolve node_modules directory (handles monorepos)
 */
export async function resolveNodeModules(workspaceRoot: string): Promise<string[]> {
  const paths: string[] = [];

  // 1. Root node_modules
  paths.push(join(workspaceRoot, "node_modules"));

  // 2. Apps/api node_modules (if in monorepo)
  paths.push(join(workspaceRoot, "apps", "api", "node_modules"));

  // 3. Current working directory
  paths.push(join(process.cwd(), "node_modules"));

  return paths.filter((p) => existsSync(p));
}

/**
 * Read kon.json manifest from a path
 *
 * "No hay manifiesto" y "el manifiesto está roto" son cosas MUY distintas y
 * antes las dos devolvían null en silencio, dentro de un `catch {}` que
 * envolvía la función entera. Un kon.json con una coma de más desaparecía del
 * arranque sin una sola línea de aviso, exactamente igual que un directorio
 * que no es un kon. Ahora lo primero sigue siendo normal y lo segundo grita.
 */
export async function readKonManifest(dir: string): Promise<KonManifest | null> {
  try {
    // Try kon.json first
    // La lectura vive en el módulo hoja: no arrastra `db` ni `Bun`, así que
    // se puede probar de verdad desde la suite en vez de reimplementarla.
    const desdeKonJson = await leerManifiestoKon(dir);
    if (desdeKonJson) {
      return desdeKonJson as KonManifest;
    }

    // Fall back to package.json with kitsuden field
    const packageJsonPath = join(dir, "package.json");
    const pkgFile = Bun.file(packageJsonPath);
    if (await pkgFile.exists()) {
      let pkg: any;
      try {
        pkg = await pkgFile.json();
      } catch (err) {
        console.warn(`  ⚠️  ${packageJsonPath} no es JSON válido: ${messageOf(err)}`);
        return null;
      }
      if (pkg.kitsuden?.type === "kon") {
        return {
          id: pkg.kitsuden.id || pkg.name,
          name: pkg.kitsuden.name || pkg.name,
          version: pkg.version,
          description: pkg.description,
          author: pkg.author,
          license: pkg.license,
          minKitsudenVersion: pkg.kitsuden.minVersion,
          ...pkg.kitsuden,
        };
      }
    }

    return null;
  } catch (err) {
    // Aquí solo llegan fallos de E/S (permisos, disco). También merecen ruido:
    // un kon que no carga por no poder leerse es un kon que falta.
    console.warn(`  ⚠️  No se pudo leer el manifiesto en ${dir}: ${messageOf(err)}`);
    return null;
  }
}

/**
 * Get bundled kons for a grimoire by reading its grimoire.json manifest.
 */
export async function getGrimoireKons(
  grimoireId: string,
  workspaceRoot?: string
): Promise<string[]> {
  const root = workspaceRoot || process.cwd();
  try {
    // El respaldo a kitsuden.json y la comprobación de que lo leído sea un
    // grimoire (y no el TEMA del mismo directorio) están en el helper.
    return await leerKonsDelGrimoire(join(root, "packages/grimoires", grimoireId));
  } catch (err) {
    console.warn(`  ⚠️  Could not read grimoire manifest for ${grimoireId}:`, err);
    return [];
  }
}

/**
 * Ajustes por kon que declara el grimoire activo (`konConfig`).
 *
 * Se lee del mismo manifiesto que la lista de kons, y se entrega al contexto
 * compartido para que cada kon consulte SU entrada. Un fallo de lectura no
 * puede tumbar el arranque: sin configuración, cada kon usa sus defaults, que
 * es exactamente lo que pasa cuando no hay grimoire activo.
 */
export async function getGrimoireKonConfig(
  grimoireId: string,
  workspaceRoot?: string
): Promise<Record<string, Record<string, unknown>>> {
  const root = workspaceRoot || process.cwd();
  try {
    const file = Bun.file(join(root, "packages/grimoires", grimoireId, "grimoire.json"));
    if (!(await file.exists())) return {};
    const manifest: GrimoireManifest = await file.json();
    return manifest.konConfig ?? {};
  } catch (err) {
    console.warn(`  ⚠️  Could not read konConfig for ${grimoireId}:`, err);
    return {};
  }
}

/**
 * Get kons enabled in DB (from `modules` table).
 * This allows filesystem-discovered kons to be loaded after being
 * toggled ON in the admin UI, even if they're not in kitsuden.config.ts.
 */
async function getEnabledKonsFromDB(): Promise<string[]> {
  try {
    const rows = await db
      .select({ key: modulesTable.key, enabled: modulesTable.enabled })
      .from(modulesTable)
      .where(eq(modulesTable.enabled, true));

    return rows.map((r) => r.key);
  } catch {
    // Table might not exist yet on first run
    return [];
  }
}

/**
 * Get kons installed via npm/marketplace from `installed_kons` table.
 * These kons may not be in kitsuden.config.ts but were installed with
 * `kitsuden install <pkg>` and registered in the database.
 */
async function getInstalledKonsFromDB(): Promise<
  { konId: string; sourceUrl: string | null; path: string }[]
> {
  try {
    const rows = await db
      .select({
        konId: installedKons.konId,
        sourceUrl: installedKons.sourceUrl,
        path: installedKons.path,
      })
      .from(installedKons)
      .where(eq(installedKons.enabled, true));

    return rows;
  } catch {
    // Table might not exist yet on first run
    return [];
  }
}

/**
 * Topological sort kons by dependencies.kons
 * Ensures dependencies are loaded before dependents.
 * Detects circular dependencies and throws.
 */
export function sortKonsByDependencies(kons: KonSource[]): KonSource[] {
  const map = new Map<string, KonSource>();
  for (const g of kons) {
    map.set(g.id, g);
    // Also register without kon- prefix for flexibility
    map.set(g.id.replace(/^kon-/, ""), g);
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const result: KonSource[] = [];

  function visit(g: KonSource, stack: string[]) {
    const key = g.id;
    if (visited.has(key)) return;
    if (visiting.has(key)) {
      const cycle = stack.slice(stack.indexOf(key)).join(" → ");
      throw new Error(`Circular kon dependency detected: ${cycle}`);
    }

    visiting.add(key);
    stack.push(key);

    const rawDeps =
      (g.manifest?.dependencies as any)?.kons ?? (g.manifest?.dependencies as string[]);
    const deps = Array.isArray(rawDeps) ? rawDeps : [];

    for (const depId of deps) {
      const dep = map.get(depId);
      if (dep && dep.id !== g.id) {
        visit(dep, stack);
      }
    }

    stack.pop();
    visiting.delete(key);
    visited.add(key);
    result.push(g);
  }

  for (const g of kons) {
    visit(g, []);
  }

  return result;
}

/**
 * Try to resolve a kon from various sources
 */
async function resolveKon(
  name: string,
  workspaceRoot: string,
  nodeModulesPaths: string[]
): Promise<KonSource | null> {
  const cleanName = name.replace(/^kon-/, "");
  const dirName = `kon-${cleanName}`;

  // ═══════════════════════════════════════════════════════════════════════
  // SOURCE 0: Kitsuden Core (packages/core/) — las baterías del framework.
  // Los módulos core (datasets, media, blocks) viven aquí, SIN prefijo
  // `kon-` en la carpeta, aunque conservan su manifest id (`kon-datasets`)
  // como clave estable para la config/registry/DB. Se resuelven primero: son
  // infraestructura, no plugins de dominio.
  // ═══════════════════════════════════════════════════════════════════════
  const corePath = join(workspaceRoot, "packages/core", cleanName);
  if (existsSync(join(corePath, "kon.json")) || existsSync(join(corePath, "kitsuden.json"))) {
    const manifest = await readKonManifest(corePath);
    return {
      id: manifest?.id || name,
      name: manifest?.name || name,
      source: "local",
      path: corePath,
      manifest: manifest || undefined,
      enabled: true,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SOURCE 1: Local packages/kons/
  // ═══════════════════════════════════════════════════════════════════════
  const localPaths = [
    join(workspaceRoot, "packages/kons", dirName),
    join(workspaceRoot, "packages/kons", cleanName),
    join(workspaceRoot, "packages/kons", name),
  ];

  for (const localPath of localPaths) {
    if (existsSync(localPath)) {
      const manifest = await readKonManifest(localPath);
      return {
        id: manifest?.id || name,
        name: manifest?.name || name,
        source: "local",
        path: localPath,
        manifest: manifest || undefined,
        enabled: true,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SOURCE 2: node_modules (@kitsuden/kon-xxx)
  // ═══════════════════════════════════════════════════════════════════════
  for (const nmPath of nodeModulesPaths) {
    // Official @kitsuden packages
    const officialPaths = [
      join(nmPath, "@kitsuden", dirName),
      join(nmPath, "@kitsuden", cleanName),
      join(nmPath, "@kitsuden", name),
    ];

    for (const officialPath of officialPaths) {
      if (existsSync(officialPath)) {
        const manifest = await readKonManifest(officialPath);
        return {
          id: manifest?.id || name,
          name: manifest?.name || name,
          source: "npm",
          path: officialPath,
          manifest: manifest || undefined,
          enabled: true,
        };
      }
    }

    // Community kon-xxx packages
    const communityPaths = [join(nmPath, dirName), join(nmPath, `kon-${cleanName}`)];

    for (const communityPath of communityPaths) {
      if (existsSync(communityPath)) {
        const manifest = await readKonManifest(communityPath);
        return {
          id: manifest?.id || name,
          name: manifest?.name || name,
          source: "npm",
          path: communityPath,
          manifest: manifest || undefined,
          enabled: true,
        };
      }
    }

    // Scoped 3rd party packages (@scope/kon-xxx)
    // Try to find any scope that has this kon
    try {
      const entries = await readdir(nmPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith("@")) {
          const scopePath = join(nmPath, entry.name);
          const scopeEntries = await readdir(scopePath, { withFileTypes: true });
          for (const scopeEntry of scopeEntries) {
            if (
              scopeEntry.isDirectory() &&
              (scopeEntry.name === dirName ||
                scopeEntry.name === cleanName ||
                scopeEntry.name === name)
            ) {
              const thirdPartyPath = join(scopePath, scopeEntry.name);
              const manifest = await readKonManifest(thirdPartyPath);
              return {
                id: manifest?.id || name,
                name: manifest?.name || name,
                source: "npm",
                path: thirdPartyPath,
                manifest: manifest || undefined,
                enabled: true,
              };
            }
          }
        }
      }
    } catch {
      // Ignore errors reading node_modules
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SOURCE 3: installed_kons table (fallback)
  // ═══════════════════════════════════════════════════════════════════════
  // If the kon was installed via `kitsuden install` but isn't in
  // kitsuden.config.ts or any standard location, look it up in the DB.
  try {
    const dbResult = await db
      .select({
        konId: installedKons.konId,
        sourceUrl: installedKons.sourceUrl,
        path: installedKons.path,
        manifest: installedKons.manifest,
      })
      .from(installedKons)
      .where(eq(installedKons.enabled, true));

    for (const row of dbResult) {
      if (row.konId === name || row.konId === cleanName || row.konId === dirName) {
        // Try sourceUrl first (npm package name like @kitsuden/kon-crm)
        const sourceUrl = row.sourceUrl;
        if (sourceUrl) {
          for (const nmPath of nodeModulesPaths) {
            const resolvedPath = join(nmPath, sourceUrl);
            if (existsSync(resolvedPath)) {
              const manifest =
                (row.manifest as KonManifest) || (await readKonManifest(resolvedPath)) || undefined;
              return {
                id: manifest?.id || row.konId,
                name: manifest?.name || row.konId,
                source: "npm",
                path: resolvedPath,
                manifest,
                enabled: true,
              };
            }
          }
        }

        // Fallback to stored path
        if (row.path && existsSync(row.path)) {
          const manifest =
            (row.manifest as KonManifest) || (await readKonManifest(row.path)) || undefined;
          return {
            id: manifest?.id || row.konId,
            name: manifest?.name || row.konId,
            source: "npm",
            path: row.path,
            manifest,
            enabled: true,
          };
        }
      }
    }
  } catch {
    // installed_kons table might not exist yet
  }

  return null;
}

/**
 * Load and mount all configured kons.
 * Supports local, npm, and legacy kons.
 *
 * @param app - Hono app instance
 * @param existingContext - Optional existing KonContext to reuse (for Content Publishing)
 */
export async function loadKons(app: Hono<any>, existingContext?: KonContext): Promise<void> {
  // Cargar config dinámica con auto-discovery
  // `kitsuden.config.ts` ya no se lee aquí: no decide nada en caliente. Su
  // único consumidor en ejecución es `lib/sembrar-modulos.ts`, que puebla la
  // tabla `modules` en el arranque y no vuelve a pisarla. Lo vigila
  // `tests/unit/fuente-de-verdad-de-kons.test.ts`.

  const workspaceRoot = await resolveWorkspaceRoot();
  const nodeModulesPaths = await resolveNodeModules(workspaceRoot);

  console.log(`  📁 Workspace root: ${workspaceRoot}`);
  console.log(`  📦 Node modules paths: ${nodeModulesPaths.length}`);

  const activeGrimoire = await getActiveGrimoire();
  const grimoireKons = activeGrimoire ? await getGrimoireKons(activeGrimoire, workspaceRoot) : [];

  // Get kons enabled in DB (includes filesystem-discovered kons toggled ON)
  const dbEnabledKeys = await getEnabledKonsFromDB();

  // Get kons installed via npm/marketplace from installed_kons table
  const dbInstalled = await getInstalledKonsFromDB();
  const dbInstalledKeys = dbInstalled.map((r) => r.konId);

  // ── Qué kons se cargan ────────────────────────────────────────────────────
  //
  // La tabla `modules` manda, más lo que aporte el grimoire activo y lo que se
  // haya instalado por npm.
  //
  // `kitsuden.config.ts` YA NO entra aquí. Antes sí, y ese era el segundo sitio
  // que decidía qué kons hay: un kon apagado desde el panel se volvía a cargar
  // porque el fichero decía que sí. Ahora el fichero solo SIEMBRA la base
  // —`lib/sembrar-modulos.ts`, que corre antes que esto—, así que para cuando
  // llegamos aquí la base ya sabe todo lo que el fichero quería y además
  // respeta lo que el usuario haya cambiado.
  const allKonNames = new Set([...grimoireKons, ...dbEnabledKeys, ...dbInstalledKeys]);

  // ── `webhooks` y `connectors` viven en packages/core, no en packages/kons ──
  //
  // El mapa solo dice DÓNDE encontrarlos; no decide si se cargan. Eso lo decide
  // la base, igual que para cualquier otro kon.
  //
  // Aquí había un `CORE_MODULE_FLAGS` leído de `kitsuden.config.ts` que hacía
  //
  //     allKonNames.delete(moduleName);   // "DISABLED (feature flag)"
  //
  // es decir, BORRABA el kon aunque la base dijera que estaba activo. Y como
  // ninguno de los dos figura en la lista `core` del fichero, la bandera valía
  // `false` siempre: webhooks y connectors no podían cargarse nunca, dijera lo
  // que dijera el panel. Es el mismo pisotón que tenía kon-media, con la
  // agravante de que aquí no había forma de encenderlos.
  const CORE_DIR_MAP: Record<string, string> = {
    webhooks: "webhooks",
    connectors: "connectors",
  };

  if (allKonNames.size === 0) {
    console.log("📜 No kons configured");
    return;
  }

  // ¿Estamos corriendo desde el bundle publicado (paquete npm) en vez del
  // workspace? Se detecta por la ausencia del fuente del host.
  const isBundle = !existsSync(join(workspaceRoot, "apps/api/src/index.ts"));

  if (isBundle) {
    // ANTES: aquí se hacía `return` asumiendo que los kons venían
    // "pre-compilados" dentro del bundle. Es FALSO para el paquete npm: el
    // bundle solo lleva el runtime, así que abortar aquí dejaba la instalación
    // sin datasets, media ni blocks — es decir, sin las baterías del framework.
    //
    // AHORA: se sigue resolviendo, pero desde node_modules (@kitsuden/datasets,
    // @kitsuden/kon-*, …), que es donde viven los módulos instalados. El
    // resolvedor ya prioriza `dist/index.js` sobre `index.ts`, así que los
    // paquetes publicados (JS compilado) cargan igual bajo Node y bajo Bun.
    console.log(`\n📦 Ejecutando desde el paquete publicado — resolviendo kons desde node_modules`);
  }

  console.log(`\n📜 Resolving ${allKonNames.size} kon(s)...`);
  if (activeGrimoire) {
    console.log(`  🏰 Active grimoire: ${activeGrimoire}`);
  }

  // Resolve all kons
  const resolvedKons: KonSource[] = [];
  const unresolved: string[] = [];

  for (const name of allKonNames) {
    // Try to resolve from filesystem
    const resolved = await resolveKon(name, workspaceRoot, nodeModulesPaths);
    if (resolved) {
      resolvedKons.push(resolved);
    } else {
      // Check for legacy core modules
      if (name in CORE_DIR_MAP) {
        const corePath = join(workspaceRoot, `packages/core/${CORE_DIR_MAP[name]}`);
        if (existsSync(corePath)) {
          resolvedKons.push({
            id: name,
            name,
            source: "legacy",
            path: corePath,
            enabled: true,
          });
          continue;
        }
      }

      // Check for legacy modules in apps/api/src/modules/
      const cleanForLegacy = name.replace(/^kon-/, "");
      const legacyPaths = [
        join(process.cwd(), `src/modules/${name}`),
        join(process.cwd(), `src/modules/${cleanForLegacy}`),
      ];
      let legacyFound = false;
      for (const legacyPath of legacyPaths) {
        if (existsSync(legacyPath)) {
          resolvedKons.push({
            id: name,
            name: cleanForLegacy,
            source: "legacy",
            path: legacyPath,
            enabled: true,
          });
          legacyFound = true;
          break;
        }
      }
      if (legacyFound) continue;

      unresolved.push(name);
    }
  }

  if (unresolved.length > 0) {
    console.log(`  ⚠️  Could not resolve: ${unresolved.join(", ")}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPENDENCY RESOLUTION: Topological sort
  // ═══════════════════════════════════════════════════════════════════════════
  const sortedKons = sortKonsByDependencies(resolvedKons);
  const depOrderInfo =
    sortedKons.length === resolvedKons.length
      ? "dependency order applied"
      : "warning: sort mismatch";

  console.log(`\n📜 Loading ${sortedKons.length} kon(s)... (${depOrderInfo})`);

  // Reset cached kons list
  cachedLoadedKons = [];

  // Create shared context for all kons (or reuse existing)
  const context = existingContext || createKonContext();

  // Get dynamic grimoire kon keys for proper mounting
  const grimoireKonKeys = await getGrimoireKonKeys(activeGrimoire);

  // La opinión del grimoire sobre cada kon, ANTES de instanciar routers: un
  // kon lee su configuración al construirse, no después.
  context.konConfig = activeGrimoire
    ? await getGrimoireKonConfig(activeGrimoire, workspaceRoot)
    : {};

  const loaded: string[] = [];
  const failed: string[] = [];
  const modern: string[] = [];
  const legacy: string[] = [];
  const fromNpm: string[] = [];

  for (const kon of sortedKons) {
    const cleanName = kon.id.replace(/^kon-/, "");
    const isGrimoireKon = grimoireKonKeys.has(kon.id) || grimoireKonKeys.has(cleanName);

    // Compatibilidad kon ↔ core (versioning independiente de kons):
    // warning si el manifest declara "kitsuden"/"minKitsudenVersion" y no satisface.
    const compatWarning = checkKonCompatibility(await getKitsudenCoreVersion(), kon.manifest);
    if (compatWarning) {
      console.warn(`  ⚠️  ${compatWarning}`);
    }

    let mountPath = isGrimoireKon ? `/api/${cleanName}` : `/api/custom/${kon.id}`;
    const customMountPath = kon.manifest?.mount?.path;
    if (customMountPath) {
      mountPath = customMountPath;
    }

    try {
      let mod: any;

      // Try to import from the resolved path
      const tryImports = [
        join(kon.path, "index.ts"),
        join(kon.path, "dist", "index.js"),
        join(kon.path, "dist", "index.cjs"),
        join(kon.path, "index.js"),
      ];

      for (const importPath of tryImports) {
        if (existsSync(importPath)) {
          try {
            mod = await import(pathToFileURL(importPath).href);
            break;
          } catch (err) {
            console.log(`    ⚠️  Failed to import from ${importPath}: ${(err as Error).message}`);
            continue;
          }
        }
      }

      if (!mod) {
        throw new Error(`Could not resolve module from any path in ${kon.path}`);
      }

      let routerMounted = false;
      let initExecuted = false;

      const konExport = mod.kon || mod.default;

      // ═══════════════════════════════════════════════════════════════════════
      // MODE 1A: Auto-Generated Kon (Nivel 1)
      // ═══════════════════════════════════════════════════════════════════════
      if (isAutoKon(konExport)) {
        const autoKon = konExport as any;
        registerKon(autoKon);
        cachedLoadedKons.push(autoKon as KonDefinition);

        const category = isGrimoireKon ? "grimoire" : "kon";
        const sourceTag = kon.source === "npm" ? ", npm" : "";
        console.log(`  ✅ ${kon.id} [${category}, auto-api${sourceTag}] → metadata registered`);

        if (kon.source === "npm") {
          fromNpm.push(kon.id);
        }
        loaded.push(kon.id);
        modern.push(kon.id);
        continue;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // MODE 1B: Modern Kon (Dependency Injection)
      // ═══════════════════════════════════════════════════════════════════════
      if (isKonDefinition(konExport)) {
        const konDef = konExport;

        // Create router with injected context
        const router = konDef.createRouter(context);

        // Apply custom mount path: kon definition > kon.json > default
        const finalMountPath = konDef.mountPath || customMountPath || mountPath;

        // Rate limits declarados por el kon. Se montan ANTES del router
        // porque en Hono el middleware solo corre si se registró antes que la
        // ruta que protege. Las rutas son relativas al mountPath: el kon no
        // sabe (ni debe saber) dónde acaba enganchado.
        applyKonRateLimits(app, konDef, finalMountPath);

        app.route(finalMountPath, router);
        // Lo que se monta es lo que se documenta: el OpenAPI, el 404 con
        // sugerencias y la guía para agentes salen de este registro.
        registrarRouterDeKon(kon.id, finalMountPath, router);
        routerMounted = true;

        if (process.env.LOG_LEVEL === "debug") {
          console.log(`  [DEBUG ${kon.id}] Router type: ${router?.constructor?.name}`);
          console.log(
            `  [DEBUG ${kon.id}] Router routes:`,
            (router as any)?.routes?.map((r: any) => `${r.method.toUpperCase()} ${r.path}`) || "N/A"
          );
        }
        modern.push(kon.id);
        cachedLoadedKons.push(konDef);

        // Execute lifecycle hooks
        if (konDef.hooks?.onStartup) {
          await konDef.hooks.onStartup(context);
          initExecuted = true;
        }

        const status = `→ ${finalMountPath}`;
        const initStatus = initExecuted ? " + onStartup()" : "";
        const category = isGrimoireKon ? "grimoire" : "kon";
        const sourceTag = kon.source === "npm" ? ", npm" : "";
        console.log(`  ✅ ${kon.id} [${category}, modern${sourceTag}] ${status}${initStatus}`);

        if (kon.source === "npm") {
          fromNpm.push(kon.id);
        }
        loaded.push(kon.id);
        continue;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // MODE 2: Legacy Router Export
      // ═══════════════════════════════════════════════════════════════════════
      for (const [, exportValue] of Object.entries(mod)) {
        if (isHonoRouter(exportValue)) {
          app.route(mountPath, exportValue as Hono);
          registrarRouterDeKon(kon.id, mountPath, exportValue);
          routerMounted = true;
          break;
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // MODE 3: Legacy Init-only
      // ═══════════════════════════════════════════════════════════════════════
      for (const [exportName, exportValue] of Object.entries(mod)) {
        if (exportName.startsWith("init") && typeof exportValue === "function") {
          await (exportValue as () => Promise<void>)();
          initExecuted = true;
        }
      }

      if (routerMounted || initExecuted) {
        const status = routerMounted ? `→ ${mountPath}` : "(init only)";
        const initStatus = initExecuted ? " + init()" : "";
        const category = isGrimoireKon ? "grimoire" : "kon";
        const sourceTag = kon.source === "legacy" ? ", legacy" : "";
        console.log(`  ✅ ${kon.id} [${category}${sourceTag}] ${status}${initStatus}`);
        cachedLoadedKons.push({
          id: kon.id,
          name: kon.name,
          version: kon.manifest?.version || "0.0.0",
          createRouter: () => {
            throw new Error("Legacy kon has no createRouter");
          },
        } as KonDefinition);
        legacy.push(kon.id);
        loaded.push(kon.id);
      } else {
        console.log(`  ⚠️  ${kon.id} → no router or init found`);
        failed.push(kon.id);
      }
    } catch (err: unknown) {
      console.log(`  ❌ ${kon.id} → ${messageOf(err)}`);
      failed.push(kon.id);
    }
  }

  console.log(
    `\n📜 Kons: ${loaded.length} loaded` +
      (modern.length ? ` (${modern.length} modern)` : "") +
      (legacy.length ? ` (${legacy.length} legacy)` : "") +
      (fromNpm.length ? `, ${fromNpm.length} from npm` : "") +
      (failed.length ? `, ${failed.length} failed` : "")
  );

  // El resumen daba el NÚMERO de kons caídos y nada más. Las líneas con el
  // motivo salen mucho antes y en un arranque normal ya se han ido del scroll,
  // así que "3 failed" era todo lo que quedaba a la vista. Repetirlos aquí, con
  // nombre, es la diferencia entre enterarse y no enterarse.
  if (failed.length) {
    console.warn(`  ⚠️  Kons que NO cargaron: ${failed.join(", ")}`);
  }

  ultimoInforme = {
    cargados: [...loaded],
    fallidos: [...failed],
    modernos: [...modern],
    heredados: [...legacy],
    desdeNpm: [...fromNpm],
  };

  // ── Caminos reservados para los kons que NO se cargaron ───────────────────
  //
  // Este es el ÚLTIMO momento en que se pueden registrar rutas: en cuanto la
  // app atienda una petición, Hono congela su matcher y `app.route()` lanza
  // «Can not add a route since the matcher is already built».
  //
  // Sin esto, activar un kon con el servidor en marcha creaba sus tablas y
  // dejaba sus endpoints inexistentes hasta el siguiente reinicio. Ver
  // `lib/kons-diferidos.ts`.
  await reservarCaminosDeKonsApagados(
    app,
    workspaceRoot,
    new Set(loaded),
    context,
    grimoireKonKeys
  );
}

/**
 * Reserva la ruta de montaje de cada kon del disco que no se cargó.
 *
 * El catálogo sale del sistema de ficheros y no de la configuración: un kon
 * apagado hoy puede encenderse mañana, y para entonces ya no se podrá
 * registrar nada.
 */
async function reservarCaminosDeKonsApagados(
  // El mismo tipo que recibe `loadKons`, sin repetir el `any`: si aquella
  // firma se estrecha algún día, esta la sigue sola.
  app: Parameters<typeof loadKons>[0],
  workspaceRoot: string,
  cargados: Set<string>,
  context: KonContext,
  /**
   * Los kons que aporta el grimoire activo.
   *
   * Hace falta para calcular la ruta de montaje EXACTAMENTE igual que el bucle
   * de arriba. Sin esto, un kon sin `mount.path` declarado se reservaba en
   * `/api/<nombre>` mientras el cargador lo habría montado en
   * `/api/custom/<id>`: la ruta habría cambiado al reiniciar, y el kon habría
   * funcionado en caliente y dejado de funcionar después. Quince de los
   * veintiocho kons del repo no declaran `mount.path`.
   */
  grimoireKonKeys: Set<string>
): Promise<void> {
  try {
    const { registrarKonsDiferidos } = await import("./kons-diferidos");
    const konsDir = join(workspaceRoot, "packages", "kons");
    if (!existsSync(konsDir)) return;

    const { readdir } = await import("node:fs/promises");
    const entradas = await readdir(konsDir, { withFileTypes: true });

    const diferidos: KonDiferido[] = [];
    for (const entrada of entradas) {
      if (!entrada.isDirectory() || !entrada.name.startsWith("kon-")) continue;

      const ruta = join(konsDir, entrada.name);
      const manifest = await readKonManifest(ruta);
      if (!manifest?.id) continue;

      const cleanName = manifest.id.replace(/^kon-/, "");
      if (cargados.has(manifest.id) || cargados.has(cleanName)) continue;

      // Todos los sitios donde este kon puede acabar montado. La ruta la decide,
      // por precedencia: `konDef.mountPath` (en el código, ilegible desde aquí)
      // > `mount.path` del manifiesto > `/api/<nombre>` si es del grimoire >
      // `/api/custom/<id>`. Como la primera no se puede saber sin importar el
      // kon —y para entonces el matcher ya está congelado—, se reservan las
      // candidatas. Ver `KonDiferido.rutasMontaje`.
      const esDelGrimoire = grimoireKonKeys.has(manifest.id) || grimoireKonKeys.has(cleanName);

      diferidos.push({
        id: manifest.id,
        rutasMontaje: [
          ...(manifest.mount?.path ? [manifest.mount.path] : []),
          `/api/${cleanName}`,
          ...(esDelGrimoire ? [] : [`/api/custom/${manifest.id}`]),
        ],
        ruta,
        tieneRateLimits: !!(manifest as { rateLimits?: unknown }).rateLimits,
      });
    }

    registrarKonsDiferidos(app, diferidos, context);
  } catch (err) {
    // No poder reservar caminos NO debe impedir arrancar: el sistema queda
    // como estaba antes de esta mejora — activar un kon exigirá reiniciar.
    console.warn(
      `  ⚠️  No se pudieron reservar caminos para activación en caliente: ${messageOf(err)}`
    );
  }
}

/**
 * Resultado del último loadKons().
 *
 * Existe para que el arranque pueda mirar los fallos en vez de confiar en que
 * alguien lea la consola: un kon caído no rompe el proceso, pero tampoco puede
 * quedarse solo en un mensaje que se pierde.
 */
export interface InformeDeCarga {
  cargados: string[];
  fallidos: string[];
  modernos: string[];
  heredados: string[];
  desdeNpm: string[];
}

let ultimoInforme: InformeDeCarga = {
  cargados: [],
  fallidos: [],
  modernos: [],
  heredados: [],
  desdeNpm: [],
};

export function getInformeDeCarga(): InformeDeCarga {
  return ultimoInforme;
}

/**
 * Get the list of currently loaded kons.
 */
export async function getLoadedKons(): Promise<KonDefinition[]> {
  return cachedLoadedKons;
}

/**
 * @deprecated Use loadKons instead
 */
export const loadModules = loadKons;
