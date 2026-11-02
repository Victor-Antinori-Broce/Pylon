/**
 * Qué kons hay INSTALADOS — por configuración, no recorriendo una carpeta
 * ============================================================================
 *
 * ── EL REPARTO (fase C, 2026-10-24) ────────────────────────────────────────
 *
 * Kitsuden es el núcleo (API, motor, auth, agentes, MCP, RLS, datasets, media,
 * bloques…). Los kons —blog, wiki, CRM, juegos…— viven en otro repositorio
 * (`kitsuden-kons`) y se INSTALAN: `kitsuden kon add <nombre>`.
 *
 * Antes el cargador recorría `packages/kons/` y todo lo que hubiera en disco
 * existía para la API: el núcleo y los kons eran el mismo árbol. Ahora hay dos
 * preguntas distintas, cada una con su fuente:
 *
 *   · ¿qué kons están INSTALADOS?  → la configuración (este módulo)
 *        - `kitsuden.kons.json` en la raíz (lo escribe `kitsuden kon add`)
 *        - `KITSUDEN_KONS` en el entorno (para Docker y para probar)
 *        - los módulos del núcleo de `packages/core/*` (siempre)
 *   · ¿cuáles están ACTIVOS?       → la tabla `modules` (el panel)
 *
 * Un kon activo en la base y no instalado no se monta: se avisa con su nombre y
 * con la orden que lo arregla. Un kon instalado y apagado se reserva para
 * activarlo sin reiniciar (`kons-diferidos.ts`).
 *
 * ── DÓNDE SE BUSCA UN KON DECLARADO ────────────────────────────────────────
 *
 *   1. `path` de su entrada (ruta local, absoluta o relativa a la raíz)
 *   2. `packages/kons/<id>/` — la carpeta donde `kitsuden kon add` copia
 *   3. `node_modules` — `@kitsuden/<id>`, `<id>` o el `package` de la entrada
 *
 * ── KITSUDEN_KONS ──────────────────────────────────────────────────────────
 *
 * Lista separada por comas. Cada elemento es un id (`blog` o `kon-blog`), o un
 * id con origen: `wiki=../kitsuden-kons/kons/kon-wiki` (ruta) o
 * `shop=@acme/kon-shop` (paquete). Se SUMA a lo que diga el fichero; si el
 * mismo kon está en los dos, manda el entorno.
 *
 * Este módulo no toca la base ni el runtime de Bun: lo usan el cargador, el
 * registro del panel, el runner de migraciones y `kitsuden.config.ts`, y tiene
 * que poder leerse en cualquier momento del arranque.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { VERSION_SDK_DE_KONS } from "@kitsuden/shared";

/** Nombre del fichero de configuración de kons, en la raíz del proyecto. */
export const FICHERO_DE_KONS = "kitsuden.kons.json";

/** Una entrada de `kitsuden.kons.json` (todas las claves son opcionales). */
export interface EntradaDeKon {
  /** De dónde se instaló: ruta del repo de kons o URL de git. Informativo. */
  source?: string;
  /** Versión del kon al instalarlo (de su package.json). */
  version?: string;
  /** Versión del SDK de kons que declaraba al instalarlo. */
  sdk?: number;
  /** `copy` (copiado a packages/kons) o `link` (se usa en su sitio). */
  mode?: "copy" | "link";
  /** Carpeta del kon: absoluta o relativa a la raíz del proyecto. */
  path?: string;
  /** Nombre del paquete en node_modules, si no es `@kitsuden/<id>`. */
  package?: string;
  /** Huella del contenido copiado (para no pisar cambios locales al reinstalar). */
  hash?: string;
  /**
   * Si se enciende al sembrar la tabla `modules` por primera vez. Solo es la
   * SEMILLA: en cuanto la base tiene una fila para el kon, manda la base.
   */
  enabled?: boolean;
  installedAt?: string;
}

export interface FicheroDeKons {
  kons: Record<string, EntradaDeKon>;
}

/** Lo mínimo del manifiesto que necesitan los consumidores. */
export interface ManifiestoDeKon {
  id: string;
  name?: string;
  version?: string;
  sdk?: unknown;
  madurez?: string;
  tier?: string;
  core?: boolean;
  defaultEnabled?: boolean;
  mount?: { path?: string };
  tables?: unknown;
  dependencies?: unknown;
  [clave: string]: unknown;
}

export interface KonInstalado {
  /** Id canónico, siempre con prefijo: `kon-blog`. */
  id: string;
  /** Carpeta del kon, o `null` si está declarado pero no se encuentra. */
  ruta: string | null;
  /** `nucleo` = packages/core; `config` = kitsuden.kons.json; `entorno` = KITSUDEN_KONS. */
  origen: "nucleo" | "config" | "entorno";
  /** La entrada tal cual se declaró (vacía para los del núcleo). */
  declarado: EntradaDeKon;
  /** Su manifiesto, si la carpeta existe y se pudo leer. */
  manifiesto: ManifiestoDeKon | null;
}

/** `blog`, `kon-blog` y `@kitsuden/kon-blog` son el mismo kon: `kon-blog`. */
export function idDeKon(nombre: string): string {
  const limpio = nombre.trim().replace(/^@kitsuden\//, "");
  return limpio.startsWith("kon-") ? limpio : `kon-${limpio}`;
}

/** ¿Son el mismo kon, con o sin prefijo? */
export function mismoKon(a: string, b: string): boolean {
  return idDeKon(a) === idDeKon(b);
}

let raizCache: string | null = null;

/**
 * La raíz del proyecto: la carpeta con `pnpm-workspace.yaml` y `packages/core`.
 *
 * Se sube desde este módulo y desde el directorio de trabajo, igual que
 * `migraciones-kon.ts`: vale desde el fuente, desde el bundle de `dist/` y
 * desde un script lanzado en un subdirectorio. `KITSUDEN_ROOT` la fija a mano.
 */
export function raizDelProyecto(): string {
  if (process.env.KITSUDEN_ROOT) return resolve(process.env.KITSUDEN_ROOT);
  if (raizCache) return raizCache;

  const esRaiz = (dir: string) =>
    existsSync(join(dir, "pnpm-workspace.yaml")) && existsSync(join(dir, "packages", "core"));

  const partidas: string[] = [process.cwd()];
  try {
    partidas.unshift(dirname(fileURLToPath(import.meta.url)));
  } catch {
    // sin import.meta.url (algún empaquetado): basta con el cwd
  }

  for (const partida of partidas) {
    let dir = resolve(partida);
    for (let i = 0; i < 30; i++) {
      if (esRaiz(dir)) {
        raizCache = dir;
        return dir;
      }
      const padre = dirname(dir);
      if (padre === dir) break;
      dir = padre;
    }
  }
  raizCache = process.cwd();
  return raizCache;
}

/**
 * Lee `KITSUDEN_KONS`: `blog, wiki=../ruta, shop=@acme/kon-shop`.
 * Un valor vacío o ausente no declara nada.
 */
export function parsearKonsDelEntorno(valor: string | undefined): Map<string, EntradaDeKon> {
  const salida = new Map<string, EntradaDeKon>();
  if (!valor) return salida;
  for (const trozo of valor.split(/[,\s]+/)) {
    const elemento = trozo.trim();
    if (!elemento) continue;
    const igual = elemento.indexOf("=");
    const nombre = igual === -1 ? elemento : elemento.slice(0, igual);
    const origen = igual === -1 ? "" : elemento.slice(igual + 1).trim();
    if (!/^[@a-z0-9][a-z0-9._\/-]*$/i.test(nombre)) continue;
    const entrada: EntradaDeKon = {};
    if (origen) {
      // `@scope/pkg` o un nombre sin barras es un paquete; lo demás, una ruta.
      if (origen.startsWith("@") || !/[\\/]/.test(origen)) entrada.package = origen;
      else entrada.path = origen;
    }
    salida.set(idDeKon(nombre), entrada);
  }
  return salida;
}

/**
 * Lee `kitsuden.kons.json`. Un fichero que no existe es una instalación sin
 * kons; uno roto se dice en voz alta (y cuenta como vacío), porque callarlo
 * haría desaparecer todos los kons sin explicación.
 */
export function leerFicheroDeKons(raiz: string = raizDelProyecto()): FicheroDeKons {
  const ruta = join(raiz, FICHERO_DE_KONS);
  if (!existsSync(ruta)) return { kons: {} };
  try {
    const json = JSON.parse(readFileSync(ruta, "utf8")) as Partial<FicheroDeKons>;
    const kons: Record<string, EntradaDeKon> = {};
    for (const [id, entrada] of Object.entries(json.kons ?? {})) {
      kons[idDeKon(id)] = entrada && typeof entrada === "object" ? entrada : {};
    }
    return { kons };
  } catch (err) {
    console.error(
      `  ✗ ${ruta} no es JSON válido (${err instanceof Error ? err.message : err}): ` +
        `se arranca SIN kons instalados. Corrígelo o reinstálalos con \`kitsuden kon add\`.`
    );
    return { kons: {} };
  }
}

/** Lee `kon.json` o, si no hay, el campo `kitsuden` del package.json. */
export function leerManifiestoSincrono(dir: string): ManifiestoDeKon | null {
  const konJson = join(dir, "kon.json");
  if (existsSync(konJson)) {
    try {
      const m = JSON.parse(readFileSync(konJson, "utf8")) as ManifiestoDeKon;
      return m && typeof m.id === "string" ? m : null;
    } catch (err) {
      console.warn(`  ⚠️  ${konJson} no es JSON válido: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }
  const pkgJson = join(dir, "package.json");
  if (existsSync(pkgJson)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgJson, "utf8"));
      const k = pkg?.kitsuden;
      if (k && (k.type === "kon" || k.type === "core-den" || typeof k.id === "string")) {
        return {
          ...k,
          id: k.id || pkg.name,
          name: k.name || pkg.name,
          version: pkg.version,
        } as ManifiestoDeKon;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function esCarpeta(ruta: string): boolean {
  try {
    return statSync(ruta).isDirectory();
  } catch {
    return false;
  }
}

/** Carpetas `node_modules` donde puede estar un kon publicado. */
function carpetasDeNodeModules(raiz: string): string[] {
  return [
    join(raiz, "node_modules"),
    join(raiz, "apps", "api", "node_modules"),
    join(process.cwd(), "node_modules"),
  ].filter((p, i, todas) => todas.indexOf(p) === i && existsSync(p));
}

/** Dónde está la carpeta de un kon declarado (ver la cabecera). */
export function resolverRutaDeKon(
  id: string,
  entrada: EntradaDeKon,
  raiz: string = raizDelProyecto()
): string | null {
  if (entrada.path) {
    const ruta = isAbsolute(entrada.path) ? entrada.path : resolve(raiz, entrada.path);
    return esCarpeta(ruta) ? ruta : null;
  }

  const copia = join(raiz, "packages", "kons", id);
  if (esCarpeta(copia)) return copia;

  const nombres = [entrada.package, `@kitsuden/${id}`, id].filter(Boolean) as string[];
  for (const nm of carpetasDeNodeModules(raiz)) {
    for (const nombre of nombres) {
      const ruta = join(nm, nombre);
      if (esCarpeta(ruta)) return ruta;
    }
  }
  return null;
}

/** Los módulos del núcleo (`packages/core/*` con kon.json): siempre instalados. */
export function konsDelNucleo(raiz: string = raizDelProyecto()): KonInstalado[] {
  const dir = join(raiz, "packages", "core");
  if (!existsSync(dir)) return [];
  const salida: KonInstalado[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const ruta = join(dir, e.name);
    if (!existsSync(join(ruta, "kon.json"))) continue;
    const manifiesto = leerManifiestoSincrono(ruta);
    if (!manifiesto) continue;
    salida.push({ id: idDeKon(manifiesto.id), ruta, origen: "nucleo", declarado: {}, manifiesto });
  }
  return salida.sort((a, b) => a.id.localeCompare(b.id));
}

let cache: { clave: string; kons: KonInstalado[] } | null = null;

/**
 * Todos los kons instalados: los del núcleo y los declarados, resueltos.
 *
 * Se cachea por (raíz, KITSUDEN_KONS): instalar o quitar un kon cambia el
 * fichero y exige reiniciar la API, igual que cambiar el código.
 */
export function konsInstalados(
  opciones: { raiz?: string; entorno?: string; refrescar?: boolean } = {}
): KonInstalado[] {
  const raiz = opciones.raiz ?? raizDelProyecto();
  const entorno = opciones.entorno ?? process.env.KITSUDEN_KONS ?? "";
  const clave = `${raiz}\u0000${entorno}`;
  if (!opciones.refrescar && cache?.clave === clave) return cache.kons;

  const nucleo = konsDelNucleo(raiz);
  const delNucleo = new Set(nucleo.map((k) => k.id));

  const declarados = new Map<string, { entrada: EntradaDeKon; origen: "config" | "entorno" }>();
  for (const [id, entrada] of Object.entries(leerFicheroDeKons(raiz).kons)) {
    declarados.set(id, { entrada, origen: "config" });
  }
  for (const [id, entrada] of parsearKonsDelEntorno(entorno)) {
    const previa = declarados.get(id);
    // El entorno manda en el ORIGEN; lo demás (versión, semilla) se conserva.
    declarados.set(id, {
      entrada: {
        ...(previa?.entrada ?? {}),
        ...entrada,
        ...(entrada.path ? { package: undefined } : {}),
        ...(entrada.package ? { path: undefined } : {}),
      },
      origen: "entorno",
    });
  }

  const resto: KonInstalado[] = [];
  for (const [id, { entrada, origen }] of declarados) {
    if (delNucleo.has(id)) continue; // declarar un módulo del núcleo no hace nada
    const ruta = resolverRutaDeKon(id, entrada, raiz);
    resto.push({
      id,
      ruta,
      origen,
      declarado: entrada,
      manifiesto: ruta ? leerManifiestoSincrono(ruta) : null,
    });
  }
  resto.sort((a, b) => a.id.localeCompare(b.id));

  const kons = [...nucleo, ...resto];
  cache = { clave, kons };
  return kons;
}

/** El kon instalado con ese id (con o sin prefijo), si lo está. */
export function konInstalado(id: string, kons = konsInstalados()): KonInstalado | undefined {
  const buscado = idDeKon(id);
  return kons.find((k) => k.id === buscado);
}

/** Carpeta de un kon instalado y encontrado en disco, o `null`. */
export function rutaDeKon(id: string): string | null {
  return konInstalado(id)?.ruta ?? null;
}

/** ¿Es un módulo del núcleo (datasets, media, blocks…)? */
export function esModuloDelNucleo(id: string): boolean {
  return konInstalado(id)?.origen === "nucleo";
}

/** Para las pruebas: olvidar la raíz y la lista cacheadas. */
export function olvidarKonsInstalados(): void {
  cache = null;
  raizCache = null;
}

/**
 * ¿Puede este núcleo montar un kon que declara `sdk` en su manifiesto?
 *
 * Devuelve el motivo para NO montarlo, o `null` si es compatible. Un kon sin
 * `sdk` es anterior al campo y se trata como v1. El número que se compara es
 * el que publica `GET /api/version` en `sdk.kons`.
 */
export function motivoDeSdkIncompatible(
  id: string,
  sdk: unknown,
  versionDelNucleo: number = VERSION_SDK_DE_KONS
): string | null {
  if (sdk === undefined || sdk === null) return null;
  if (typeof sdk !== "number" || !Number.isInteger(sdk) || sdk < 1) {
    return `${id}: el "sdk" de su manifiesto no es un entero >= 1 (${JSON.stringify(sdk)})`;
  }
  if (sdk > versionDelNucleo) {
    return (
      `${id} necesita el SDK de kons v${sdk} y este Kitsuden ofrece v${versionDelNucleo} ` +
      `(GET /api/version → sdk.kons). Actualiza Kitsuden o instala una versión del kon ` +
      `escrita para el SDK v${versionDelNucleo}.`
    );
  }
  return null;
}
