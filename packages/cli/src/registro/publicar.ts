/**
 * Publishing side: pack + sign + add to a LOCAL registry folder, yank, revoke
 * ============================================================================
 *
 * `kon publish` never uploads anything. It writes into a registry folder on
 * disk (index.json, its signature, packages/<id>/…); hosting that folder
 * (GitHub Pages, R2, a git repo) is a separate, deliberate step.
 *
 * Published versions are IMMUTABLE: the same id@version cannot be published
 * twice; a bad release is yanked (hidden from new resolution) or revoked by an
 * advisory (refused everywhere), and a new version is published.
 *
 * Before changing an existing index, its current signature is verified with the
 * registry key being used: nobody re-signs an index someone else tampered with.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { manifiestoDeCarpeta } from "./cliente.js";
import { firmarDatos, idDeClave, leerClaveSecreta, publicaDeSecreta, verificarFirma, type ClaveSecreta } from "./firma.js";
import {
  ErrorDeRegistro,
  anadirEditor,
  comentarioDelPaquete,
  escribirIndiceLocal,
  leerIndiceLocal,
  type Aviso,
  type Indice,
} from "./indice.js";
import { KONS_DEL_NUCLEO, type ManifiestoNormalizado } from "./manifiesto.js";
import { parse, validRange } from "./semver.js";
import { empaquetar, ficherosParaEmpaquetar, huellaDeFicheros, leerPaquete, sha256 } from "./tar.js";

export function abrirClave(ruta: string): ClaveSecreta {
  if (!existsSync(ruta)) throw new ErrorDeRegistro(`signing key not found: ${ruta}`);
  return leerClaveSecreta(readFileSync(ruta, "utf8"), process.env.KITSUDEN_SIGNING_PASSPHRASE || undefined);
}

/** Opens the local index and checks its current signature with the registry key. */
export function abrirIndiceParaEscribir(carpeta: string, claveDelRegistro: ClaveSecreta, nombre: string): Indice {
  const ruta = join(carpeta, "index.json");
  if (existsSync(ruta)) {
    const sig = join(carpeta, "index.json.minisig");
    if (!existsSync(sig)) throw new ErrorDeRegistro(`${ruta} exists but is not signed: refusing to sign over it`);
    try {
      verificarFirma(readFileSync(ruta), readFileSync(sig, "utf8"), publicaDeSecreta(claveDelRegistro));
    } catch (e) {
      throw new ErrorDeRegistro(`the current index does not verify with this registry key: ${(e as Error).message}`);
    }
  }
  return leerIndiceLocal(carpeta, nombre);
}

export interface ResultadoDePublicacion {
  id: string;
  version: string;
  sha256: string;
  contentHash: string;
  size: number;
  tarball: string;
  keyId: string;
  avisos: string[];
  manifiesto: ManifiestoNormalizado;
}

export interface OpcionesDePublicacion {
  dir: string;
  carpetaDelRegistro: string;
  nombreDelRegistro?: string;
  clave: ClaveSecreta;
  claveDelRegistro?: ClaveSecreta;
  /** Let the registry key holder add this publisher as a new owner of an existing kon. */
  anadirDueno?: boolean;
  dryRun?: boolean;
}

/** Pack, sign and add one kon folder to the registry. */
export function publicar(o: OpcionesDePublicacion): ResultadoDePublicacion {
  const r = manifiestoDeCarpeta(o.dir, true);
  if (!r.ok || !r.manifiesto) {
    throw new ErrorDeRegistro(`the manifest is not publishable:\n  ${r.errores.join("\n  ")}`);
  }
  const m = r.manifiesto;
  const avisos = [...r.avisos];
  if (parse(m.version)?.pre.length) avisos.push(`${m.version} is a pre-release: "*" and "^x" ranges will not pick it`);

  const ficheros = ficherosParaEmpaquetar(o.dir);
  if (!ficheros.some((f) => f.ruta === "kon.json")) throw new ErrorDeRegistro("kon.json must be at the root of the kon folder");
  const tgz = empaquetar(ficheros);
  const contentHash = huellaDeFicheros(ficheros);
  if (huellaDeFicheros(leerPaquete(tgz)) !== contentHash) throw new ErrorDeRegistro("internal: package round trip failed");
  const sha = sha256(tgz);

  const claveDelRegistro = o.claveDelRegistro ?? o.clave;
  const indice = abrirIndiceParaEscribir(o.carpetaDelRegistro, claveDelRegistro, o.nombreDelRegistro ?? "local");
  const kon = indice.kons[m.id];
  if (kon?.versions[m.version]) {
    throw new ErrorDeRegistro(`${m.id}@${m.version} is already published; versions are immutable — bump the version`);
  }
  const keyId = anadirEditor(indice, publicaDeSecreta(o.clave), m.author?.name ?? "unknown");
  if (kon && !kon.owners.includes(keyId)) {
    if (!(o.anadirDueno && o.claveDelRegistro)) {
      throw new ErrorDeRegistro(
        `${m.id} is owned by ${kon.owners.join(", ")}; key ${keyId} cannot publish it ` +
          `(the registry key holder can add it with --add-owner)`
      );
    }
    kon.owners.push(keyId);
  }
  for (const dep of Object.keys(m.dependencies)) {
    if (!KONS_DEL_NUCLEO.has(dep) && !indice.kons[dep]) avisos.push(`dependency ${dep} is not in this registry yet`);
  }

  const rel = `packages/${m.id}/${m.id}-${m.version}.tgz`;
  const resultado: ResultadoDePublicacion = {
    id: m.id,
    version: m.version,
    sha256: sha,
    contentHash,
    size: tgz.length,
    tarball: rel,
    keyId,
    avisos,
    manifiesto: m,
  };
  if (o.dryRun) return resultado;

  const firma = firmarDatos(tgz, o.clave, comentarioDelPaquete(m.id, m.version, sha, contentHash));
  mkdirSync(join(o.carpetaDelRegistro, "packages", m.id), { recursive: true });
  const rutaTgz = join(o.carpetaDelRegistro, rel);
  if (existsSync(rutaTgz)) throw new ErrorDeRegistro(`${rel} already exists in the registry folder`);
  writeFileSync(rutaTgz, tgz, { flag: "wx" });
  writeFileSync(rutaTgz + ".minisig", firma);

  const destino = (indice.kons[m.id] ??= { owners: [keyId], versions: {} });
  destino.description = m.description;
  destino.license = m.license;
  destino.repository = m.repository?.url ?? null;
  destino.versions[m.version] = {
    tarball: rel,
    signature: `${rel}.minisig`,
    sha256: sha,
    size: tgz.length,
    contentHash,
    keyId,
    manifest: m,
    publishedAt: new Date().toISOString(),
    yanked: false,
    yankReason: null,
  };
  escribirIndiceLocal(o.carpetaDelRegistro, indice, claveDelRegistro);
  return resultado;
}

export interface OpcionesDeRetirada {
  carpetaDelRegistro: string;
  claveDelRegistro: ClaveSecreta;
  id: string;
  version: string;
  motivo?: string;
  deshacer?: boolean;
}

/** Yank (or un-yank) one version: hidden from new resolution, kept for lockfiles. */
export function retirar(o: OpcionesDeRetirada): void {
  const indice = abrirIndiceParaEscribir(o.carpetaDelRegistro, o.claveDelRegistro, "local");
  const v = indice.kons[o.id]?.versions[o.version];
  if (!v) throw new ErrorDeRegistro(`${o.id}@${o.version} is not in this registry`);
  v.yanked = !o.deshacer;
  v.yankReason = o.deshacer ? null : (o.motivo ?? null);
  escribirIndiceLocal(o.carpetaDelRegistro, indice, o.claveDelRegistro);
}

export interface OpcionesDeAviso {
  carpetaDelRegistro: string;
  claveDelRegistro: ClaveSecreta;
  id: string;
  versiones: string;
  resumen: string;
  severidad: Aviso["severity"];
  revocar: boolean;
}

/** Add an advisory; with `revocar`, the versions are refused even when locked. */
export function anadirAviso(o: OpcionesDeAviso): Aviso {
  if (!validRange(o.versiones)) throw new ErrorDeRegistro(`not a semver range: ${o.versiones}`);
  if (!["low", "moderate", "high", "critical"].includes(o.severidad)) throw new ErrorDeRegistro(`bad severity: ${o.severidad}`);
  const indice = abrirIndiceParaEscribir(o.carpetaDelRegistro, o.claveDelRegistro, "local");
  if (!indice.kons[o.id]) throw new ErrorDeRegistro(`${o.id} is not in this registry`);
  const ano = new Date().getUTCFullYear();
  const n = indice.advisories.filter((a) => a.id.startsWith(`KKA-${ano}-`)).length + 1;
  const aviso: Aviso = {
    id: `KKA-${ano}-${String(n).padStart(4, "0")}`,
    kon: o.id,
    versions: o.versiones,
    severity: o.severidad,
    summary: o.resumen.replace(/[\r\n]+/g, " ").slice(0, 500),
    revoked: o.revocar,
    publishedAt: new Date().toISOString(),
  };
  indice.advisories.push(aviso);
  escribirIndiceLocal(o.carpetaDelRegistro, indice, o.claveDelRegistro);
  return aviso;
}

/** Revoke a publisher key: every package it signed stops verifying. */
export function revocarClave(carpeta: string, claveDelRegistro: ClaveSecreta, keyId: string): void {
  const indice = abrirIndiceParaEscribir(carpeta, claveDelRegistro, "local");
  indice.revokedKeys = [...new Set([...(indice.revokedKeys ?? []), keyId])];
  escribirIndiceLocal(carpeta, indice, claveDelRegistro);
}
