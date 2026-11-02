/**
 * Instalar kons en un proyecto Kitsuden — la lógica de `kitsuden kon add|remove|list`
 * ============================================================================
 *
 * Desde la fase C los kons no viven en el repo del núcleo: están en
 * `kitsuden-kons` (o en cualquier repo/paquete que siga el mismo formato) y se
 * INSTALAN. Instalar un kon es:
 *
 *   1. encontrarlo en el origen (ruta local o URL de git);
 *   2. comprobar que su SDK es compatible con este núcleo
 *      (`GET /api/version` → `sdk.kons`, o la constante del código si la API no
 *      está arrancada);
 *   3. traer también los kons de los que depende;
 *   4. copiarlo a `packages/kons/<id>/` (modo `copy`, el normal) o dejarlo donde
 *      está y apuntar a él (modo `link`, para desarrollar el kon);
 *   5. declararlo en `kitsuden.kons.json`, que es lo que lee la API
 *      (`apps/api/src/lib/kons-instalados.ts`);
 *   6. `pnpm install` y el runner normal de migraciones con `--kon <id>`.
 *
 * Este módulo hace 1–5 y no lanza procesos: así se prueba sin red, sin pnpm y
 * sin base. El comando (`commands/kon.ts`) añade el paso 6.
 *
 * ── POR QUÉ COPIAR Y NO ENLAZAR POR DEFECTO ───────────────────────────────
 *
 * Una copia dentro de `packages/kons/` es un paquete más del workspace: pnpm
 * resuelve sus `peerDependencies` (`@kitsuden/shared`, `@kitsuden/engine`,
 * hono, drizzle-orm, zod) contra las del propio núcleo, así que hay UNA sola
 * instancia de cada una. Con dos copias del motor, un `AppError` del kon no es
 * `instanceof AppError` para la API y un 404 sale como 500. La copia guarda una
 * huella (`hash`) para no pisar cambios hechos a mano al reinstalar.
 */

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

export const FICHERO_DE_KONS = "kitsuden.kons.json";

/** Módulos que vienen con el núcleo (`packages/core`): nunca se instalan. */
export const KONS_DEL_NUCLEO = new Set(["kon-datasets", "kon-media", "kon-blocks"]);

/** Origen por defecto si no hay `--from` ni `KITSUDEN_KONS_SOURCE`. */
export const ORIGEN_POR_DEFECTO = "https://github.com/Victor-Antinori-Broce/kitsuden-kons.git";

export interface EntradaDeKon {
  source?: string;
  version?: string;
  sdk?: number;
  mode?: "copy" | "link";
  path?: string;
  package?: string;
  hash?: string;
  enabled?: boolean;
  installedAt?: string;
}

export interface FicheroDeKons {
  $comment?: string;
  kons: Record<string, EntradaDeKon>;
}

export interface ManifiestoDeKon {
  id: string;
  name?: string;
  version?: string;
  sdk?: unknown;
  madurez?: string;
  description?: string;
  dependencies?: unknown;
  [k: string]: unknown;
}

/** `blog`, `kon-blog`, `@kitsuden/kon-blog` → `kon-blog`. */
export function idDeKon(nombre: string): string {
  const limpio = nombre.trim().replace(/^@kitsuden\//, "");
  return limpio.startsWith("kon-") ? limpio : `kon-${limpio}`;
}

/** Nombre corto para mostrar y para las órdenes: `kon-blog` → `blog`. */
export function nombreCorto(id: string): string {
  return id.replace(/^kon-/, "");
}

/** Raíz del proyecto: `pnpm-workspace.yaml` + `packages/kons` (la carpeta de instalación). */
export function encontrarRaiz(desde: string): string | null {
  let dir = resolve(desde);
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml")) && existsSync(join(dir, "packages", "kons"))) {
      return dir;
    }
    const padre = dirname(dir);
    if (padre === dir) return null;
    dir = padre;
  }
}

// ── kitsuden.kons.json ──────────────────────────────────────────────────────

const COMENTARIO =
  "Kons installed in this Kitsuden project. Written by `kitsuden kon add|remove`; " +
  "read by the API (apps/api/src/lib/kons-instalados.ts). KITSUDEN_KONS in the " +
  "environment adds more. Which installed kons are ACTIVE is decided in the admin panel.";

export function leerFichero(raiz: string): FicheroDeKons {
  const ruta = join(raiz, FICHERO_DE_KONS);
  if (!existsSync(ruta)) return { kons: {} };
  const json = JSON.parse(readFileSync(ruta, "utf8")) as Partial<FicheroDeKons>;
  const kons: Record<string, EntradaDeKon> = {};
  for (const [id, e] of Object.entries(json.kons ?? {})) kons[idDeKon(id)] = e ?? {};
  return { kons };
}

export function escribirFichero(raiz: string, fichero: FicheroDeKons): void {
  const ordenado: Record<string, EntradaDeKon> = {};
  for (const id of Object.keys(fichero.kons).sort()) ordenado[id] = fichero.kons[id]!;
  writeFileSync(
    join(raiz, FICHERO_DE_KONS),
    JSON.stringify({ $comment: COMENTARIO, kons: ordenado }, null, 2) + "\n"
  );
}

// ── Manifiestos ─────────────────────────────────────────────────────────────

export function leerManifiesto(dir: string): ManifiestoDeKon | null {
  const konJson = join(dir, "kon.json");
  if (existsSync(konJson)) {
    const m = JSON.parse(readFileSync(konJson, "utf8")) as ManifiestoDeKon;
    return typeof m?.id === "string" ? m : null;
  }
  const pkgJson = join(dir, "package.json");
  if (existsSync(pkgJson)) {
    const pkg = JSON.parse(readFileSync(pkgJson, "utf8"));
    const k = pkg?.kitsuden;
    if (k && (k.type === "kon" || typeof k.id === "string")) {
      return { ...k, id: k.id || pkg.name, name: k.name || pkg.name, version: pkg.version };
    }
  }
  return null;
}

function versionDelPaquete(dir: string): string | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
  } catch {
    return undefined;
  }
}

/**
 * Kons de los que depende uno: `dependencies.kons` / `dependencies.required` del
 * manifiesto y los `@kitsuden/kon-*` de su package.json. Sin los del núcleo.
 */
export function dependenciasDe(dir: string, manifiesto: ManifiestoDeKon): string[] {
  const deps = new Set<string>();
  const d = manifiesto.dependencies as
    | { kons?: unknown; required?: unknown }
    | unknown[]
    | undefined;
  const listas: unknown[] = Array.isArray(d) ? [d] : [d?.kons, d?.required];
  for (const lista of listas) {
    if (!Array.isArray(lista)) continue;
    for (const x of lista) if (typeof x === "string" && x.startsWith("kon-")) deps.add(x);
  }
  try {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    for (const campo of ["dependencies", "peerDependencies"]) {
      for (const nombre of Object.keys(pkg[campo] ?? {})) {
        if (nombre.startsWith("@kitsuden/kon-")) deps.add(idDeKon(nombre));
      }
    }
  } catch {
    // sin package.json: solo el manifiesto
  }
  return [...deps].filter((id) => !KONS_DEL_NUCLEO.has(id) && id !== idDeKon(manifiesto.id));
}

// ── SDK ─────────────────────────────────────────────────────────────────────

/** La versión del SDK de kons que da el código de este núcleo. */
export function sdkDelCodigo(raiz: string): number | null {
  for (const ruta of [
    join(raiz, "packages", "shared", "src", "operaciones.ts"),
    join(raiz, "node_modules", "@kitsuden", "shared", "dist", "index.js"),
  ]) {
    if (!existsSync(ruta)) continue;
    const m = readFileSync(ruta, "utf8").match(/VERSION_SDK_DE_KONS\s*=\s*(\d+)/);
    if (m) return Number(m[1]);
  }
  return null;
}

/** Motivo para NO instalar, o `null` (mismo criterio que el cargador de la API). */
export function motivoDeSdkIncompatible(id: string, sdk: unknown, delNucleo: number): string | null {
  if (sdk === undefined || sdk === null) return null;
  if (typeof sdk !== "number" || !Number.isInteger(sdk) || sdk < 1) {
    return `${id}: "sdk" in its manifest is not an integer >= 1 (${JSON.stringify(sdk)})`;
  }
  if (sdk > delNucleo) {
    return (
      `${id} needs kon SDK v${sdk} and this Kitsuden provides v${delNucleo} ` +
      `(GET /api/version → sdk.kons). Upgrade Kitsuden or install a version of the kon ` +
      `written for SDK v${delNucleo}.`
    );
  }
  return null;
}

// ── Origen ──────────────────────────────────────────────────────────────────

/** ¿Es una URL de git (y no una ruta)? */
export function esUrlDeGit(origen: string): boolean {
  return /^(https?:\/\/|git@|ssh:\/\/|git:\/\/|github:)/.test(origen) || /\.git(#.*)?$/.test(origen);
}

/**
 * La carpeta de un kon dentro de un origen local: el propio origen si ES un kon,
 * o `<origen>/kons/<id>`, `<origen>/<id>`, `<origen>/packages/kons/<id>`.
 */
export function carpetaDelKonEnOrigen(origen: string, id: string): string | null {
  const directo = leerManifiestoSeguro(origen);
  if (directo && idDeKon(directo.id) === id) return origen;
  for (const candidata of [
    join(origen, "kons", id),
    join(origen, id),
    join(origen, "packages", "kons", id),
  ]) {
    if (existsSync(candidata) && leerManifiestoSeguro(candidata)) return candidata;
  }
  return null;
}

function leerManifiestoSeguro(dir: string): ManifiestoDeKon | null {
  try {
    return statSync(dir).isDirectory() ? leerManifiesto(dir) : null;
  } catch {
    return null;
  }
}

/** Kons que ofrece un origen local (para `kon list --available`). */
export function konsDelOrigen(origen: string): { id: string; dir: string; manifiesto: ManifiestoDeKon }[] {
  const salida: { id: string; dir: string; manifiesto: ManifiestoDeKon }[] = [];
  for (const base of [join(origen, "kons"), origen]) {
    if (!existsSync(base)) continue;
    for (const e of readdirSync(base, { withFileTypes: true })) {
      if (!e.isDirectory() || !e.name.startsWith("kon-")) continue;
      const dir = join(base, e.name);
      const manifiesto = leerManifiestoSeguro(dir);
      if (manifiesto) salida.push({ id: idDeKon(manifiesto.id), dir, manifiesto });
    }
    if (salida.length) break;
  }
  return salida.sort((a, b) => a.id.localeCompare(b.id));
}

// ── Copia y huella ──────────────────────────────────────────────────────────

const NO_SE_COPIA = new Set(["node_modules", "dist", ".git", "coverage", ".turbo"]);

function ficherosDe(dir: string, base = dir, salida: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (NO_SE_COPIA.has(e.name) || e.name.endsWith(".tsbuildinfo")) continue;
    const ruta = join(dir, e.name);
    if (e.isDirectory()) ficherosDe(ruta, base, salida);
    else if (e.isFile()) salida.push(relative(base, ruta).split("\\").join("/"));
  }
  return salida;
}

/** Huella del contenido de un kon (rutas + bytes), sin node_modules ni dist. */
export function huellaDe(dir: string): string {
  const h = createHash("sha256");
  for (const rel of ficherosDe(dir).sort()) {
    h.update(rel);
    h.update("\0");
    h.update(readFileSync(join(dir, rel)));
    h.update("\0");
  }
  return h.digest("hex");
}

function copiarKon(origen: string, destino: string): void {
  rmSync(destino, { recursive: true, force: true });
  cpSync(origen, destino, {
    recursive: true,
    filter: (src) => {
      const nombre = basename(src);
      return !NO_SE_COPIA.has(nombre) && !nombre.endsWith(".tsbuildinfo");
    },
  });
}

// ── add / remove ────────────────────────────────────────────────────────────

export interface OpcionesDeInstalacion {
  raiz: string;
  /** Carpeta local con los kons (ya clonada si venía de git). */
  origen: string;
  /** Lo que se anota como `source` (la ruta o la URL que pidió el usuario). */
  origenDeclarado: string;
  link?: boolean;
  enable?: boolean;
  force?: boolean;
  /** Versión del SDK de este núcleo. */
  sdkDelNucleo: number;
  ahora?: () => string;
}

export interface KonInstaladoAhora {
  id: string;
  dir: string;
  modo: "copy" | "link";
  version?: string;
  sdk?: number;
  /** true si se instaló por ser dependencia de otro. */
  comoDependencia: boolean;
}

export class ErrorDeKon extends Error {}

/**
 * Instala uno o más kons y sus dependencias. Escribe los ficheros y
 * `kitsuden.kons.json`; NO ejecuta pnpm ni migraciones.
 */
export function instalarKons(nombres: string[], o: OpcionesDeInstalacion): KonInstaladoAhora[] {
  const fichero = leerFichero(o.raiz);
  const plan: { id: string; dir: string; manifiesto: ManifiestoDeKon; comoDependencia: boolean }[] = [];
  const vistos = new Set<string>();

  // 1–3: encontrar, comprobar el SDK y sumar dependencias, sin tocar nada aún.
  const pendientes = nombres.map((n) => ({ id: idDeKon(n), comoDependencia: false }));
  while (pendientes.length) {
    const { id, comoDependencia } = pendientes.shift()!;
    if (vistos.has(id)) continue;
    vistos.add(id);
    if (KONS_DEL_NUCLEO.has(id)) {
      if (!comoDependencia) {
        throw new ErrorDeKon(`${id} is part of the Kitsuden core (packages/core): nothing to install.`);
      }
      continue;
    }
    const dir = carpetaDelKonEnOrigen(o.origen, id);
    if (!dir) {
      throw new ErrorDeKon(
        `${id} not found in ${o.origenDeclarado}` +
          (comoDependencia ? " (needed as a dependency)" : "") +
          `. Expected kons/${id}/ with a kon.json.`
      );
    }
    const manifiesto = leerManifiesto(dir)!;
    const motivo = motivoDeSdkIncompatible(id, manifiesto.sdk, o.sdkDelNucleo);
    if (motivo) throw new ErrorDeKon(motivo);
    plan.push({ id, dir, manifiesto, comoDependencia });
    for (const dep of dependenciasDe(dir, manifiesto)) {
      // Una dependencia ya instalada no se reinstala (salvo que se pida).
      if (fichero.kons[dep] && !nombres.map(idDeKon).includes(dep)) continue;
      pendientes.push({ id: dep, comoDependencia: true });
    }
  }

  // Comprobación de cambios locales ANTES de escribir nada: o todo o nada.
  for (const k of plan) {
    if (o.link) continue;
    const destino = join(o.raiz, "packages", "kons", k.id);
    if (!existsSync(destino) || o.force) continue;
    const previa = fichero.kons[k.id];
    if (!previa?.hash) {
      throw new ErrorDeKon(
        `packages/kons/${k.id} already exists and was not installed by \`kitsuden kon add\`. ` +
          `Move your changes to the kon's repository, or overwrite it with --force.`
      );
    }
    if (previa.mode !== "link" && huellaDe(destino) !== previa.hash) {
      throw new ErrorDeKon(
        `packages/kons/${k.id} has local changes since it was installed. ` +
          `Move them to the kon's repository (e.g. kitsuden-kons), or overwrite with --force.`
      );
    }
  }

  // 4–5: copiar (o apuntar) y declarar.
  const ahora = o.ahora ?? (() => new Date().toISOString());
  const hechos: KonInstaladoAhora[] = [];
  for (const k of plan) {
    const version = versionDelPaquete(k.dir) ?? (k.manifiesto.version as string | undefined);
    const sdk = typeof k.manifiesto.sdk === "number" ? k.manifiesto.sdk : undefined;
    const previa = fichero.kons[k.id] ?? {};
    const entrada: EntradaDeKon = {
      source: o.origenDeclarado,
      ...(version ? { version } : {}),
      ...(sdk !== undefined ? { sdk } : {}),
      mode: o.link ? "link" : "copy",
      installedAt: ahora(),
    };
    if (o.link) {
      const rel = relative(o.raiz, k.dir).split("\\").join("/");
      entrada.path = isAbsolute(rel) || rel.startsWith("..") ? rel : `./${rel}`;
    } else {
      const destino = join(o.raiz, "packages", "kons", k.id);
      copiarKon(k.dir, destino);
      entrada.hash = huellaDe(destino);
    }
    // La semilla de activación: la pide --enable para lo pedido; si ya había
    // una, se conserva.
    if (o.enable && !k.comoDependencia) entrada.enabled = true;
    else if (previa.enabled !== undefined) entrada.enabled = previa.enabled;
    fichero.kons[k.id] = entrada;
    hechos.push({
      id: k.id,
      dir: k.dir,
      modo: o.link ? "link" : "copy",
      version,
      sdk,
      comoDependencia: k.comoDependencia,
    });
  }
  escribirFichero(o.raiz, fichero);
  return hechos;
}

export interface OpcionesDeBorrado {
  raiz: string;
  force?: boolean;
  /** No borrar la copia de packages/kons (solo dejar de declararla). */
  keepFiles?: boolean;
}

/** Quita kons de la instalación. No toca la base: sus tablas y datos se quedan. */
export function quitarKons(nombres: string[], o: OpcionesDeBorrado): string[] {
  const fichero = leerFichero(o.raiz);
  const ids = nombres.map(idDeKon);

  for (const id of ids) {
    if (KONS_DEL_NUCLEO.has(id)) throw new ErrorDeKon(`${id} is part of the Kitsuden core: it cannot be removed.`);
    if (!fichero.kons[id]) throw new ErrorDeKon(`${id} is not installed (not in ${FICHERO_DE_KONS}).`);
  }

  // ¿Lo necesita otro kon que se queda?
  if (!o.force) {
    for (const [otro, entrada] of Object.entries(fichero.kons)) {
      if (ids.includes(otro)) continue;
      const dir = rutaDeEntrada(o.raiz, otro, entrada);
      const m = dir ? leerManifiestoSeguro(dir) : null;
      if (!dir || !m) continue;
      const usa = dependenciasDe(dir, m).filter((d) => ids.includes(d));
      if (usa.length) {
        throw new ErrorDeKon(
          `${otro} depends on ${usa.join(", ")}: remove it too, or use --force.`
        );
      }
    }
  }

  // Cambios locales en la copia: no se borran sin --force.
  for (const id of ids) {
    const entrada = fichero.kons[id]!;
    if (entrada.mode === "link" || o.keepFiles || o.force) continue;
    const destino = join(o.raiz, "packages", "kons", id);
    if (existsSync(destino) && entrada.hash && huellaDe(destino) !== entrada.hash) {
      throw new ErrorDeKon(
        `packages/kons/${id} has local changes: move them to the kon's repository, ` +
          `or remove with --force (or --keep-files to keep the folder).`
      );
    }
  }

  for (const id of ids) {
    const entrada = fichero.kons[id]!;
    if (entrada.mode !== "link" && !o.keepFiles) {
      rmSync(join(o.raiz, "packages", "kons", id), { recursive: true, force: true });
    }
    delete fichero.kons[id];
  }
  escribirFichero(o.raiz, fichero);
  return ids;
}

/** Dónde está la carpeta de una entrada declarada (mismo orden que la API). */
export function rutaDeEntrada(raiz: string, id: string, entrada: EntradaDeKon): string | null {
  if (entrada.path) {
    const ruta = isAbsolute(entrada.path) ? entrada.path : resolve(raiz, entrada.path);
    return existsSync(ruta) ? ruta : null;
  }
  const copia = join(raiz, "packages", "kons", id);
  if (existsSync(copia)) return copia;
  for (const nombre of [entrada.package, `@kitsuden/${id}`, id].filter(Boolean) as string[]) {
    const ruta = join(raiz, "node_modules", nombre);
    if (existsSync(ruta)) return ruta;
  }
  return null;
}

export interface EstadoDeKon {
  id: string;
  origen: "core" | "installed";
  mode?: "copy" | "link";
  version?: string;
  sdk?: number | null;
  madurez?: string;
  path: string | null;
  /** ok | missing | sdk-incompatible | modified */
  estado: "ok" | "missing" | "sdk-incompatible" | "modified";
  detalle?: string;
}

/** Lo instalado, con su estado (para `kon list`). */
export function estadoDeLaInstalacion(raiz: string, sdkDelNucleo: number | null): EstadoDeKon[] {
  const salida: EstadoDeKon[] = [];
  const core = join(raiz, "packages", "core");
  if (existsSync(core)) {
    for (const e of readdirSync(core, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const dir = join(core, e.name);
      if (!existsSync(join(dir, "kon.json"))) continue;
      const m = leerManifiestoSeguro(dir);
      if (!m) continue;
      salida.push({
        id: idDeKon(m.id),
        origen: "core",
        version: m.version as string | undefined,
        madurez: m.madurez,
        path: relative(raiz, dir).split("\\").join("/"),
        estado: "ok",
      });
    }
  }
  for (const [id, entrada] of Object.entries(leerFichero(raiz).kons)) {
    const dir = rutaDeEntrada(raiz, id, entrada);
    const m = dir ? leerManifiestoSeguro(dir) : null;
    let estado: EstadoDeKon["estado"] = "ok";
    let detalle: string | undefined;
    if (!dir || !m) {
      estado = "missing";
      detalle = `run: kitsuden kon add ${nombreCorto(id)}`;
    } else if (sdkDelNucleo !== null && motivoDeSdkIncompatible(id, m.sdk, sdkDelNucleo)) {
      estado = "sdk-incompatible";
      detalle = motivoDeSdkIncompatible(id, m.sdk, sdkDelNucleo) ?? undefined;
    } else if (entrada.mode !== "link" && entrada.hash && huellaDe(dir) !== entrada.hash) {
      estado = "modified";
      detalle = "local changes since install";
    }
    salida.push({
      id,
      origen: "installed",
      mode: entrada.mode ?? "copy",
      version: entrada.version ?? (m?.version as string | undefined),
      sdk: typeof m?.sdk === "number" ? m.sdk : null,
      madurez: m?.madurez,
      path: dir ? relative(raiz, dir).split("\\").join("/") : null,
      estado,
      detalle,
    });
  }
  return salida;
}
