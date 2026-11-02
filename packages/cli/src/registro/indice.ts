/**
 * The registry index — one signed JSON document, hostable anywhere static
 * ============================================================================
 *
 *   <registry>/index.json            the index (format below)
 *   <registry>/index.json.minisig    its signature, by the REGISTRY key
 *   <registry>/packages/<id>/<id>-<version>.tgz          the package
 *   <registry>/packages/<id>/<id>-<version>.tgz.minisig  by the PUBLISHER key
 *
 * The folder can be served as is by GitHub Pages, R2/S3, any static host, or a
 * git repository (`file://` or a checkout path). "API mode" is a server that
 * answers the same three paths (it may generate them): the client only ever
 * GETs `index.json`, `index.json.minisig` and the tarball URLs the index names.
 *
 * Trust: the user configures the REGISTRY public key (kitsuden.registries.json).
 * The signed index says which PUBLISHER keys may publish each kon (`owners`),
 * lists yanked versions, advisories (revocations) and revoked keys. A package is
 * accepted only if its own signature verifies with an owner key of the signed
 * index AND its signed comment names the same id, version and SHA-256 as the
 * index. Compromising the static host alone is not enough to ship code: it
 * needs the registry key (to change owners) or a publisher key (to sign).
 *
 * Rollback: the index carries a `serial` that only grows; the client remembers
 * the highest one it saw per registry (.kitsuden/registry-state.json) and
 * refuses an older index. `expires`, when present, is enforced.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  ErrorDeFirma,
  camposDelComentario,
  clavePublicaEnBase64,
  firmarDatos,
  idDeClave,
  leerClavePublica,
  verificarFirma,
  type ClavePublica,
  type ClaveSecreta,
} from "./firma.js";
import type { ManifiestoNormalizado } from "./manifiesto.js";
import { satisfies, sortDesc } from "./semver.js";
import { LIMITES, sha256 } from "./tar.js";

export const FORMATO_DEL_INDICE = "kitsuden-kon-index";
export const VERSION_DEL_INDICE = 1;

export interface VersionPublicada {
  tarball: string;
  signature: string;
  sha256: string;
  size: number;
  contentHash: string;
  keyId: string;
  manifest: ManifiestoNormalizado;
  publishedAt: string;
  yanked?: boolean;
  yankReason?: string | null;
}

export interface KonDelIndice {
  owners: string[];
  description?: string;
  license?: string | null;
  repository?: string | null;
  versions: Record<string, VersionPublicada>;
}

export interface Aviso {
  id: string;
  kon: string;
  /** Semver range of affected versions. */
  versions: string;
  severity: "low" | "moderate" | "high" | "critical";
  summary: string;
  /** Revoked: refused even when the lockfile pins it. */
  revoked: boolean;
  publishedAt: string;
}

export interface Indice {
  format: typeof FORMATO_DEL_INDICE;
  version: number;
  registry: string;
  serial: number;
  generatedAt: string;
  expires?: string | null;
  publishers: Record<string, { name: string; publicKey: string }>;
  revokedKeys?: string[];
  kons: Record<string, KonDelIndice>;
  advisories: Aviso[];
}

export class ErrorDeRegistro extends Error {}

export function indiceVacio(nombre: string): Indice {
  return {
    format: FORMATO_DEL_INDICE,
    version: VERSION_DEL_INDICE,
    registry: nombre,
    serial: 0,
    generatedAt: new Date(0).toISOString(),
    expires: null,
    publishers: {},
    revokedKeys: [],
    kons: {},
    advisories: [],
  };
}

// ── Locations ───────────────────────────────────────────────────────────────

/** `./reg`, `/abs/reg/index.json`, `file:///…`, `https://…/index.json` → URL of index.json. */
export function urlDelIndice(ubicacion: string, cwd = process.cwd()): URL {
  if (/^https?:\/\//i.test(ubicacion) || /^file:\/\//i.test(ubicacion)) {
    const u = new URL(ubicacion);
    if (!u.pathname.endsWith(".json")) u.pathname = u.pathname.replace(/\/?$/, "/index.json");
    if (u.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) {
      throw new ErrorDeRegistro(`refusing plain http for a registry (${u.host}); use https`);
    }
    return u;
  }
  const ruta = isAbsolute(ubicacion) ? ubicacion : resolve(cwd, ubicacion);
  return pathToFileURL(ruta.endsWith(".json") ? ruta : join(ruta, "index.json"));
}

/** The local folder of a file-based registry (for publish/yank). */
export function carpetaLocal(ubicacion: string, cwd = process.cwd()): string {
  const u = urlDelIndice(ubicacion, cwd);
  if (u.protocol !== "file:") {
    throw new ErrorDeRegistro("publish and yank write to a LOCAL registry folder; upload that folder to your host afterwards");
  }
  return dirname(fileURLToPath(u));
}

export async function traer(url: URL, limite: number): Promise<Buffer> {
  if (url.protocol === "file:") {
    const ruta = fileURLToPath(url);
    if (!existsSync(ruta)) throw new ErrorDeRegistro(`not found: ${ruta}`);
    const datos = readFileSync(ruta);
    if (datos.length > limite) throw new ErrorDeRegistro(`${ruta}: larger than ${limite} bytes`);
    return datos;
  }
  const r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new ErrorDeRegistro(`GET ${url.href} → ${r.status}`);
  const largo = Number(r.headers.get("content-length") ?? 0);
  if (largo > limite) throw new ErrorDeRegistro(`${url.href}: larger than ${limite} bytes`);
  const datos = Buffer.from(await r.arrayBuffer());
  if (datos.length > limite) throw new ErrorDeRegistro(`${url.href}: larger than ${limite} bytes`);
  return datos;
}

/** Resolves a tarball/signature path of the index against the index URL; never leaves its origin. */
export function urlRelativa(base: URL, ruta: string): URL {
  if (/^[a-z][a-z0-9+.-]*:/i.test(ruta) || ruta.startsWith("/") || ruta.includes("..") || ruta.includes("\\")) {
    throw new ErrorDeRegistro(`index path must be relative and inside the registry: ${JSON.stringify(ruta)}`);
  }
  return new URL(ruta, base);
}

// ── Load and verify ─────────────────────────────────────────────────────────

export interface IndiceVerificado {
  indice: Indice;
  url: URL;
  firmado: boolean;
  keyId: string | null;
}

export interface OpcionesDeCarga {
  /** Registry public key (minisign). Without it, only --allow-unsigned loads the index. */
  clave?: string | null;
  permitirSinFirma?: boolean;
  /** Highest serial seen before (rollback protection). */
  serialVisto?: number;
  ahora?: Date;
}

export function validarFormaDelIndice(j: unknown): Indice {
  const i = j as Indice;
  if (!i || i.format !== FORMATO_DEL_INDICE) throw new ErrorDeRegistro("not a kitsuden kon index");
  if (i.version !== VERSION_DEL_INDICE) throw new ErrorDeRegistro(`index version ${i.version} is not supported by this CLI`);
  if (!Number.isInteger(i.serial) || i.serial < 0) throw new ErrorDeRegistro("index: bad serial");
  if (!i.kons || typeof i.kons !== "object") throw new ErrorDeRegistro("index: no kons");
  i.advisories ??= [];
  i.publishers ??= {};
  i.revokedKeys ??= [];
  return i;
}

export async function cargarIndice(ubicacion: string, o: OpcionesDeCarga = {}): Promise<IndiceVerificado> {
  const url = urlDelIndice(ubicacion);
  const datos = await traer(url, 8 * 1024 * 1024);
  let firmado = false;
  let keyId: string | null = null;
  let serialFirmado: string | undefined;
  if (o.clave) {
    const clave = leerClavePublica(o.clave);
    let firma: Buffer;
    try {
      firma = await traer(new URL(url.href + ".minisig"), 4096);
    } catch {
      throw new ErrorDeRegistro(`the registry index is not signed (${url.href}.minisig missing)`);
    }
    let comentario: string;
    try {
      comentario = verificarFirma(datos, firma.toString("utf8"), clave);
    } catch (e) {
      throw new ErrorDeRegistro(`registry index signature: ${(e as ErrorDeFirma).message}`);
    }
    const c = camposDelComentario(comentario);
    if (c["#"] !== "kitsuden-index" || c.sha256 !== sha256(datos)) {
      throw new ErrorDeRegistro("registry index: the signed comment does not describe this index");
    }
    firmado = true;
    keyId = idDeClave(clave.keyId);
    serialFirmado = c.serial;
  } else if (!o.permitirSinFirma) {
    throw new ErrorDeRegistro(
      "no public key is configured for this registry: add its key to kitsuden.registries.json " +
        "(or --registry-key). --allow-unsigned exists for local development only."
    );
  }
  let indice: Indice;
  try {
    indice = validarFormaDelIndice(JSON.parse(datos.toString("utf8")));
  } catch (e) {
    throw e instanceof ErrorDeRegistro ? e : new ErrorDeRegistro(`index is not valid JSON: ${(e as Error).message}`);
  }
  if (firmado && serialFirmado !== String(indice.serial)) {
    throw new ErrorDeRegistro("registry index: the signed serial does not match the index");
  }
  if (o.serialVisto !== undefined && indice.serial < o.serialVisto) {
    throw new ErrorDeRegistro(
      `registry index serial ${indice.serial} is older than one already seen (${o.serialVisto}): possible rollback, refusing`
    );
  }
  if (indice.expires && new Date(indice.expires).getTime() < (o.ahora ?? new Date()).getTime()) {
    throw new ErrorDeRegistro(`registry index expired at ${indice.expires}: the registry must re-sign it`);
  }
  return { indice, url, firmado, keyId };
}

// ── Questions about the index ───────────────────────────────────────────────

/** Advisories that revoke (or just warn about) this version. */
export function avisosDe(indice: Indice, id: string, version: string): Aviso[] {
  return indice.advisories.filter((a) => a.kon === id && satisfies(version, a.versions));
}

export function estaRevocada(indice: Indice, id: string, version: string): Aviso | null {
  return avisosDe(indice, id, version).find((a) => a.revoked) ?? null;
}

export function versionesDe(indice: Indice, id: string): string[] {
  return sortDesc(Object.keys(indice.kons[id]?.versions ?? {}));
}

/** The publisher key of a version, checked against the index (owner, not revoked). */
export function claveDelEditor(indice: Indice, id: string, v: VersionPublicada): ClavePublica {
  const kon = indice.kons[id];
  if (!kon) throw new ErrorDeRegistro(`${id} is not in the index`);
  if (!kon.owners.includes(v.keyId)) throw new ErrorDeRegistro(`${id}: key ${v.keyId} is not an owner of this kon`);
  if (indice.revokedKeys?.includes(v.keyId)) throw new ErrorDeRegistro(`${id}: publisher key ${v.keyId} has been revoked`);
  const p = indice.publishers[v.keyId];
  if (!p) throw new ErrorDeRegistro(`${id}: publisher key ${v.keyId} is not listed in the index`);
  const clave = leerClavePublica(p.publicKey);
  if (idDeClave(clave.keyId) !== v.keyId) throw new ErrorDeRegistro(`${id}: publisher key id mismatch`);
  return clave;
}

export function comentarioDelPaquete(id: string, version: string, sha: string, contentHash: string): string {
  return `kitsuden-kon id=${id} version=${version} sha256=${sha} content=${contentHash} timestamp=${Math.floor(Date.now() / 1000)}`;
}

/**
 * Checks a downloaded package against the signed index: size, SHA-256, the
 * publisher's signature and its signed comment. Throws on any mismatch.
 */
export function verificarPaquete(
  indice: Indice,
  id: string,
  version: string,
  tgz: Buffer,
  firma: string | null,
  o: { permitirSinFirma?: boolean } = {}
): { firmado: boolean; keyId: string | null } {
  const v = indice.kons[id]?.versions[version];
  if (!v) throw new ErrorDeRegistro(`${id}@${version} is not in the index`);
  if (tgz.length !== v.size) throw new ErrorDeRegistro(`${id}@${version}: size ${tgz.length} ≠ index ${v.size} (tampered?)`);
  if (tgz.length > LIMITES.comprimido) throw new ErrorDeRegistro(`${id}@${version}: package too large`);
  const sha = sha256(tgz);
  if (sha !== v.sha256) throw new ErrorDeRegistro(`${id}@${version}: SHA-256 does not match the index (tampered?)`);
  if (!firma) {
    if (o.permitirSinFirma) return { firmado: false, keyId: null };
    throw new ErrorDeRegistro(`${id}@${version} is not signed. Unsigned packages are refused (--allow-unsigned is for local development only).`);
  }
  const clave = claveDelEditor(indice, id, v);
  let comentario: string;
  try {
    comentario = verificarFirma(tgz, firma, clave);
  } catch (e) {
    throw new ErrorDeRegistro(`${id}@${version}: ${(e as Error).message}`);
  }
  const c = camposDelComentario(comentario);
  if (c["#"] !== "kitsuden-kon" || c.id !== id || c.version !== version || c.sha256 !== sha || c.content !== v.contentHash) {
    throw new ErrorDeRegistro(`${id}@${version}: the signature was made for a different package (${comentario})`);
  }
  return { firmado: true, keyId: v.keyId };
}

// ── Writing (local registry folder) ─────────────────────────────────────────

export function leerIndiceLocal(carpeta: string, nombre = "local"): Indice {
  const ruta = join(carpeta, "index.json");
  if (!existsSync(ruta)) return indiceVacio(nombre);
  return validarFormaDelIndice(JSON.parse(readFileSync(ruta, "utf8")));
}

/** Writes index.json (serial + 1) and signs it with the registry key. */
export function escribirIndiceLocal(carpeta: string, indice: Indice, claveDelRegistro: ClaveSecreta): Indice {
  mkdirSync(carpeta, { recursive: true });
  const siguiente: Indice = { ...indice, serial: indice.serial + 1, generatedAt: new Date().toISOString() };
  const ordenado: Indice = { ...siguiente, kons: Object.fromEntries(Object.entries(siguiente.kons).sort(([a], [b]) => a.localeCompare(b))) };
  const datos = Buffer.from(JSON.stringify(ordenado, null, 2) + "\n", "utf8");
  writeFileSync(join(carpeta, "index.json"), datos);
  const comentario = `kitsuden-index registry=${indice.registry} serial=${siguiente.serial} sha256=${sha256(datos)}`;
  writeFileSync(join(carpeta, "index.json.minisig"), firmarDatos(datos, claveDelRegistro, comentario));
  return ordenado;
}

export function anadirEditor(indice: Indice, clave: ClavePublica, nombre: string): string {
  const id = idDeClave(clave.keyId);
  if (indice.revokedKeys?.includes(id)) throw new ErrorDeRegistro(`key ${id} is revoked in this registry`);
  indice.publishers[id] ??= { name: nombre, publicKey: clavePublicaEnBase64(clave) };
  return id;
}
