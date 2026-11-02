/**
 * The registry client — fetch, verify, stage, diff, install, lock
 * ============================================================================
 *
 * No processes here (no pnpm, no migrations): `commands/kon.ts` adds those,
 * exactly as for a source install. The order is the point:
 *
 *   1. load the index and verify its signature with the configured registry key
 *      (and its serial against the lockfile: no rollback);
 *   2. resolve versions (semver, yanked, advisories, core range, SDK);
 *   3. download each package, check size + SHA-256 against the index, verify the
 *      publisher signature and its signed comment, parse the tarball
 *      defensively and extract it into a fresh staging folder;
 *   4. re-validate the manifest INSIDE the package and require it to equal the
 *      one the signed index announced; recompute the content hash;
 *   5. compute the permission diff against what is installed;
 *   — only now does the caller ask the human —
 *   6. hand the staged folder to the normal copy installer (`instalarKons`) and
 *      write the lockfile.
 *
 * Nothing in packages/kons or kitsuden.kons.json changes before step 6, and a
 * failure anywhere before it leaves the project as it was.
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { idDeClave, leerClavePublica } from "./firma.js";
import {
  ErrorDeRegistro,
  cargarIndice,
  claveDelEditor,
  traer,
  urlRelativa,
  verificarPaquete,
  type IndiceVerificado,
} from "./indice.js";
import { validarManifiesto, type ManifiestoNormalizado } from "./manifiesto.js";
import { diffDePermisos, type DiffDePermisos } from "./permisos.js";
import { leerBloqueo, resolver, type Bloqueo, type Eleccion, type EntradaDeBloqueo } from "./resolver.js";
import { LIMITES, extraer, huellaDeFicheros, leerPaquete, sha256 } from "./tar.js";

export const FICHERO_DE_REGISTROS = "kitsuden.registries.json";

export interface RegistroConfigurado {
  url: string;
  /** Registry public key (minisign base64 line or file contents). */
  key?: string;
  /** Optional: only these publisher key ids are accepted from this registry. */
  trustedPublishers?: string[];
}

export interface FicheroDeRegistros {
  default?: string;
  registries: Record<string, RegistroConfigurado>;
}

export function leerRegistros(raiz: string): FicheroDeRegistros {
  const ruta = join(raiz, FICHERO_DE_REGISTROS);
  if (!existsSync(ruta)) return { registries: {} };
  const j = JSON.parse(readFileSync(ruta, "utf8")) as FicheroDeRegistros;
  return { default: j.default, registries: j.registries ?? {} };
}

export function hayRegistroConfigurado(raiz: string): boolean {
  return Boolean(process.env.KITSUDEN_KON_REGISTRY) || Object.keys(leerRegistros(raiz).registries).length > 0;
}

export interface RegistroElegido {
  nombre: string;
  url: string;
  clave: string | null;
  editoresDeConfianza?: string[];
}

/** A key given as a file path, or inline (base64 line / minisign file text). */
function textoDeClave(valor: string | undefined, raiz: string): string | null {
  if (!valor) return null;
  const ruta = isAbsolute(valor) ? valor : resolve(raiz, valor);
  if (!valor.includes("\n") && valor.length < 300 && existsSync(ruta)) return readFileSync(ruta, "utf8");
  return valor;
}

export function elegirRegistro(raiz: string, o: { registry?: string; registryKey?: string }): RegistroElegido {
  const conf = leerRegistros(raiz);
  const pedido = o.registry || process.env.KITSUDEN_KON_REGISTRY || conf.default || Object.keys(conf.registries)[0];
  if (!pedido) {
    throw new ErrorDeRegistro(
      `no kon registry configured: create ${FICHERO_DE_REGISTROS} or pass --registry <name|path|url> (see docs/kons/registry.md)`
    );
  }
  const r = conf.registries[pedido];
  const url = r ? (/^[a-z]+:\/\//i.test(r.url) || isAbsolute(r.url) ? r.url : resolve(raiz, r.url)) : pedido;
  const clave = textoDeClave(o.registryKey || process.env.KITSUDEN_KON_REGISTRY_KEY || r?.key, raiz);
  if (clave) leerClavePublica(clave); // fail early on a malformed key
  return { nombre: r ? pedido : "cli", url, clave, editoresDeConfianza: r?.trustedPublishers };
}

/** `--allow-unsigned` is for local development: refused when KITSUDEN_PUBLIC=true. */
export function permitirSinFirma(pedido: boolean | undefined): boolean {
  if (!pedido) return false;
  if (String(process.env.KITSUDEN_PUBLIC ?? "").toLowerCase() === "true") {
    throw new ErrorDeRegistro("--allow-unsigned is refused when KITSUDEN_PUBLIC=true (a public deployment installs signed kons only)");
  }
  return true;
}

export async function abrirRegistro(
  raiz: string,
  o: { registry?: string; registryKey?: string; allowUnsigned?: boolean },
  bloqueo?: Bloqueo
): Promise<{ registro: RegistroElegido; verificado: IndiceVerificado; sinFirma: boolean }> {
  const registro = elegirRegistro(raiz, o);
  const sinFirma = permitirSinFirma(o.allowUnsigned);
  const visto = bloqueo?.registries[registro.nombre]?.serial;
  const verificado = await cargarIndice(registro.url, {
    clave: registro.clave,
    permitirSinFirma: sinFirma,
    serialVisto: visto,
  });
  return { registro, verificado, sinFirma };
}

/** The core version: running API (`/api/version` → version) or the root package.json. */
export function versionDelNucleoDelCodigo(raiz: string): string | null {
  try {
    return JSON.parse(readFileSync(join(raiz, "package.json"), "utf8")).version ?? null;
  } catch {
    return null;
  }
}

function migracionesDe(dir: string): string[] {
  const m = join(dir, "migrations");
  if (!existsSync(m)) return [];
  return readdirSync(m, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".sql"))
    .map((e) => e.name)
    .sort();
}

/** Validate a kon folder as the spec requires (publish, and again after extraction). */
export function manifiestoDeCarpeta(dir: string, paraPublicar: boolean) {
  const konJson = join(dir, "kon.json");
  if (!existsSync(konJson)) throw new ErrorDeRegistro(`${dir}: no kon.json`);
  let crudo: unknown;
  try {
    crudo = JSON.parse(readFileSync(konJson, "utf8"));
  } catch (e) {
    throw new ErrorDeRegistro(`${konJson}: not valid JSON (${(e as Error).message})`);
  }
  let paquete: Record<string, unknown> | null = null;
  if (existsSync(join(dir, "package.json"))) {
    try {
      paquete = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    } catch (e) {
      throw new ErrorDeRegistro(`${dir}/package.json: not valid JSON (${(e as Error).message})`);
    }
  }
  return validarManifiesto(crudo, { paraPublicar, paquete, migraciones: migracionesDe(dir) });
}

export interface KonPreparado {
  eleccion: Eleccion;
  manifiesto: ManifiestoNormalizado;
  diff: DiffDePermisos;
  /** Already installed at this exact version and content: nothing to copy. */
  sinCambios: boolean;
  entradaDeBloqueo: EntradaDeBloqueo;
}

export interface Preparacion {
  staging: string;
  kons: KonPreparado[];
  avisos: string[];
  verificado: IndiceVerificado;
  registro: RegistroElegido;
}

export interface OpcionesDePreparacion {
  raiz: string;
  pedidos: Record<string, string>;
  actualizar?: Set<string> | "all";
  registry?: string;
  registryKey?: string;
  allowUnsigned?: boolean;
  versionDelNucleo: string | null;
  sdkDelNucleo: number | null;
  /** id → {version, hash, mode, source} from kitsuden.kons.json */
  instalados: Record<string, { version?: string; hash?: string; mode?: string; source?: string; dir?: string | null }>;
}

function igual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function prepararInstalacion(o: OpcionesDePreparacion): Promise<Preparacion> {
  const bloqueo = leerBloqueo(o.raiz);
  const { registro, verificado, sinFirma } = await abrirRegistro(o.raiz, o, bloqueo);
  const { indice } = verificado;

  // Kons installed from a source folder satisfy dependencies without the registry.
  const instaladosFuera: Record<string, string | undefined> = {};
  for (const [id, e] of Object.entries(o.instalados)) {
    if (!bloqueo.kons[id] && !(e.source ?? "").startsWith("registry:")) instaladosFuera[id] = e.version;
  }
  const { plan, avisos } = resolver({
    indice,
    pedidos: o.pedidos,
    bloqueo,
    actualizar: o.actualizar,
    versionDelNucleo: o.versionDelNucleo,
    sdkDelNucleo: o.sdkDelNucleo,
    instaladosFuera,
  });

  const staging = join(o.raiz, ".kitsuden", "registry-staging", randomBytes(6).toString("hex"));
  const cache = join(o.raiz, ".kitsuden", "kons-cache", "registry");
  mkdirSync(join(staging, "kons"), { recursive: true });
  mkdirSync(cache, { recursive: true });
  const kons: KonPreparado[] = [];
  try {
    for (const eleccion of plan) {
      const { id, version, entrada } = eleccion;
      if (registro.editoresDeConfianza && !registro.editoresDeConfianza.includes(entrada.keyId)) {
        throw new ErrorDeRegistro(
          `${id}@${version} is signed by ${entrada.keyId}, which is not in trustedPublishers of registry "${registro.nombre}"`
        );
      }
      const fijada = bloqueo.kons[id];
      if (fijada && fijada.version === version && fijada.sha256 !== entrada.sha256) {
        throw new ErrorDeRegistro(
          `${id}@${version}: the registry now serves a different package (SHA-256) than the one in ${"kitsuden.kons.lock"}. ` +
            `Published versions are immutable: refusing.`
        );
      }
      const urlTgz = urlRelativa(verificado.url, entrada.tarball);
      const tgz = await traer(urlTgz, LIMITES.comprimido);
      let firma: string | null = null;
      try {
        firma = (await traer(urlRelativa(verificado.url, entrada.signature), 4096)).toString("utf8");
      } catch {
        firma = null;
      }
      const { firmado, keyId } = verificarPaquete(indice, id, version, tgz, firma, { permitirSinFirma: sinFirma });

      const ficheros = leerPaquete(tgz);
      const contentHash = huellaDeFicheros(ficheros);
      if (contentHash !== entrada.contentHash) {
        throw new ErrorDeRegistro(`${id}@${version}: content hash does not match the index`);
      }
      const dir = join(staging, "kons", id);
      extraer(ficheros, dir);
      const r = manifiestoDeCarpeta(dir, true);
      if (!r.ok || !r.manifiesto) {
        throw new ErrorDeRegistro(`${id}@${version}: the manifest inside the package is invalid:\n  ${r.errores.join("\n  ")}`);
      }
      if (!igual(r.manifiesto, entrada.manifest)) {
        throw new ErrorDeRegistro(`${id}@${version}: the manifest inside the package differs from the one in the signed index`);
      }
      if (r.manifiesto.id !== id || r.manifiesto.version !== version) {
        throw new ErrorDeRegistro(`${id}@${version}: the package declares ${r.manifiesto.id}@${r.manifiesto.version}`);
      }
      writeFileSync(join(cache, `${entrada.sha256}.tgz`), tgz);
      if (firma) writeFileSync(join(cache, `${entrada.sha256}.tgz.minisig`), firma);

      // Baseline for the diff: the lockfile, else the installed kon.json.
      const previo = bloqueo.kons[id];
      let antes: { manifiesto: ManifiestoNormalizado | null; keyId?: string | null } | null = null;
      if (previo) antes = { manifiesto: previo.manifest, keyId: previo.keyId };
      else if (o.instalados[id]?.dir) {
        const v = manifiestoDeCarpeta(o.instalados[id]!.dir!, false);
        antes = { manifiesto: v.manifiesto ?? null };
      }
      const diff = diffDePermisos(antes, { manifiesto: r.manifiesto, keyId });
      const inst = o.instalados[id];
      const sinCambios = Boolean(previo && previo.version === version && inst?.hash === contentHash);
      const clavePublica = firmado ? indice.publishers[entrada.keyId]?.publicKey ?? null : null;
      kons.push({
        eleccion,
        manifiesto: r.manifiesto,
        diff,
        sinCambios,
        entradaDeBloqueo: {
          version,
          registry: registro.nombre,
          tarball: urlTgz.href,
          sha256: entrada.sha256,
          contentHash,
          keyId,
          signed: firmado,
          license: r.manifiesto.license,
          ...(eleccion.directo ? { requested: o.pedidos[id] } : previo?.requested ? { requested: previo.requested } : {}),
          dependencies: r.manifiesto.dependencies,
          manifest: r.manifiesto,
          ...(clavePublica ? { publicKey: clavePublica } : {}),
        } as EntradaDeBloqueo,
      });
    }
  } catch (e) {
    rmSync(staging, { recursive: true, force: true });
    throw e;
  }
  return { staging, kons, avisos, verificado, registro };
}

export function limpiarStaging(p: Preparacion): void {
  rmSync(p.staging, { recursive: true, force: true });
}

/** Writes the lockfile entries for what was installed (and the registry serial). */
export function actualizarBloqueo(raiz: string, p: Preparacion, escribir: (b: Bloqueo) => void): Bloqueo {
  const b = leerBloqueo(raiz);
  b.registries[p.registro.nombre] = {
    url: p.registro.url,
    keyId: p.verificado.keyId,
    serial: Math.max(p.verificado.indice.serial, b.registries[p.registro.nombre]?.serial ?? 0),
  };
  for (const k of p.kons) b.kons[k.eleccion.id] = k.entradaDeBloqueo;
  escribir(b);
  return b;
}

/** Re-verify a cached package of the lockfile offline: hash + publisher signature. */
export function verificarDesdeCache(raiz: string, id: string, e: EntradaDeBloqueo & { publicKey?: string }): string[] {
  const problemas: string[] = [];
  const cache = join(raiz, ".kitsuden", "kons-cache", "registry", `${e.sha256}.tgz`);
  if (!existsSync(cache)) return [`${id}: package not in the local cache (run kon sync to fetch it again)`];
  const tgz = readFileSync(cache);
  if (sha256(tgz) !== e.sha256) problemas.push(`${id}: cached package SHA-256 differs from the lockfile`);
  if (e.signed) {
    const sig = join(cache + ".minisig");
    if (!existsSync(sig) || !e.publicKey) problemas.push(`${id}: signature or publisher key missing from cache/lockfile`);
    else {
      try {
        const clave = leerClavePublica(e.publicKey);
        if (idDeClave(clave.keyId) !== e.keyId) throw new Error("publisher key id differs from the lockfile");
        const indiceFalso = {
          kons: { [id]: { owners: [e.keyId!], versions: { [e.version]: { sha256: e.sha256, size: tgz.length, contentHash: e.contentHash, keyId: e.keyId!, signature: "", tarball: "", manifest: e.manifest, publishedAt: "" } } } },
          publishers: { [e.keyId!]: { name: "", publicKey: e.publicKey } },
          revokedKeys: [],
          advisories: [],
        } as unknown as Parameters<typeof verificarPaquete>[0];
        verificarPaquete(indiceFalso, id, e.version, tgz, readFileSync(sig, "utf8"));
        claveDelEditor(indiceFalso, id, indiceFalso.kons[id]!.versions[e.version]!);
      } catch (err) {
        problemas.push(`${id}: ${(err as Error).message}`);
      }
    }
  }
  try {
    if (huellaDeFicheros(leerPaquete(tgz)) !== e.contentHash) problemas.push(`${id}: cached package content differs from the lockfile`);
  } catch (err) {
    problemas.push(`${id}: ${(err as Error).message}`);
  }
  return problemas;
}
