/**
 * `kitsuden kon search|info|add <id>@<range>|update|outdated|sync|publish|verify|yank|keygen`
 * ============================================================================
 *
 * The registry side of `kitsuden kon`. The logic lives in `../registro/*` (no
 * processes, tested apart); here are the prompts, the output and the call to
 * the same pnpm-install + migration-runner step as a source install.
 *
 * Confirmation rules (like the code promotion pipeline, docs/agents/promotion.md):
 *   · a NEW kon shows its declared permissions and needs a yes: an interactive
 *     answer, or --yes;
 *   · an UPDATE that widens scopes, outbound hosts or sensitive operations (or
 *     changes the signing key) needs an interactive yes, or BOTH --yes and
 *     --accept-wider: --yes alone never accepts wider permissions on update;
 *   · without a terminal and without the flags, nothing is installed (exit 3).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

import chalk from "chalk";

import {
  ErrorDeKon,
  idDeKon,
  instalarKons,
  leerFichero,
  rutaDeEntrada,
  type KonInstaladoAhora,
} from "../kons/instalacion.js";
import {
  abrirRegistro,
  actualizarBloqueo,
  limpiarStaging,
  manifiestoDeCarpeta,
  prepararInstalacion,
  verificarDesdeCache,
  versionDelNucleoDelCodigo,
  type Preparacion,
} from "../registro/cliente.js";
import { generarClaves, idDeClave, leerClavePublica, verificarFirma, camposDelComentario } from "../registro/firma.js";
import { avisosDe, carpetaLocal, estaRevocada, versionesDe } from "../registro/indice.js";
import { compatibleConElNucleo } from "../registro/manifiesto.js";
import { amplia, textoDelDiff } from "../registro/permisos.js";
import { abrirClave, anadirAviso, publicar, retirar, revocarClave } from "../registro/publicar.js";
import { escribirBloqueo, leerBloqueo, leerPedido, FICHERO_DE_BLOQUEO } from "../registro/resolver.js";
import { maxSatisfying, satisfies } from "../registro/semver.js";
import { huellaDeFicheros, leerPaquete, sha256 } from "../registro/tar.js";
import { fallar, pasosTrasInstalar, raizDe, sdkDelNucleo, type KonCommandOptions } from "./kon.js";

export interface OpcionesDeRegistro extends KonCommandOptions {
  registry?: string;
  registryKey?: string;
  allowUnsigned?: boolean;
  yes?: boolean;
  acceptWider?: boolean;
  dryRun?: boolean;
  // publish / yank
  key?: string;
  indexKey?: string;
  registryName?: string;
  addOwner?: boolean;
  reason?: string;
  undo?: boolean;
  revoke?: boolean;
  advisory?: string;
  severity?: string;
  range?: string;
  revokeKey?: string;
  // verify / keygen
  file?: string;
  sig?: string;
  out?: string;
}

async function preguntar(texto: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const r = (await rl.question(`${texto} [y/N] `)).trim().toLowerCase();
    return r === "y" || r === "yes";
  } finally {
    rl.close();
  }
}

async function nucleo(raiz: string, o: OpcionesDeRegistro): Promise<{ version: string | null; sdk: number | null }> {
  try {
    const s = await sdkDelNucleo(raiz, o.apiUrl);
    return { version: s.version ?? versionDelNucleoDelCodigo(raiz), sdk: s.sdk };
  } catch {
    return { version: versionDelNucleoDelCodigo(raiz), sdk: null };
  }
}

function instaladosDe(raiz: string) {
  const salida: Record<string, { version?: string; hash?: string; mode?: string; source?: string; dir?: string | null }> = {};
  for (const [id, e] of Object.entries(leerFichero(raiz).kons)) {
    salida[id] = { version: e.version, hash: e.hash, mode: e.mode, source: e.source, dir: rutaDeEntrada(raiz, id, e) };
  }
  return salida;
}

/** Shows the plan and the permission diff; returns whether to go ahead. */
async function confirmarPlan(p: Preparacion, o: OpcionesDeRegistro, esActualizacion: boolean): Promise<boolean> {
  const conCambios = p.kons.filter((k) => !k.sinCambios);
  console.log(
    chalk.gray(
      `  registry ${p.registro.nombre} (${p.verificado.url.href}) — index serial ${p.verificado.indice.serial}, ` +
        (p.verificado.firmado ? `signed by ${p.verificado.keyId}` : chalk.yellow("UNSIGNED (--allow-unsigned)"))
    )
  );
  for (const a of p.avisos) console.log(chalk.yellow(`  ! ${a}`));
  if (!conCambios.length) {
    console.log(chalk.green("✔ Everything is already installed at the resolved versions."));
    return false;
  }
  console.log(chalk.bold("\nPermissions declared by what will be installed:"));
  for (const k of conCambios) {
    const lineas = textoDelDiff(k.diff, k.manifiesto);
    const firma = k.entradaDeBloqueo.signed ? `signed by ${k.entradaDeBloqueo.keyId}` : chalk.yellow("UNSIGNED");
    console.log(`  ${chalk.bold(lineas[0])}${k.eleccion.directo ? "" : chalk.gray(" (dependency)")} ${chalk.gray(firma)}`);
    for (const l of lineas.slice(1)) console.log(l.startsWith("    ! ") ? chalk.red(l) : l.includes("+ ") ? chalk.yellow(l) : chalk.gray(l));
  }
  console.log(chalk.gray("  (+ = new compared with what is installed)"));
  if (o.dryRun) {
    console.log(chalk.cyan("\n--dry-run: nothing installed."));
    return false;
  }
  const amplian = conCambios.filter((k) => !k.diff.nuevo && amplia(k.diff));
  const nuevos = conCambios.filter((k) => k.diff.nuevo);
  if (amplian.length) {
    const lista = amplian.map((k) => k.eleccion.id).join(", ");
    console.log(chalk.red(`\n! ${lista}: the update WIDENS the declared permissions.`));
    if (o.yes && o.acceptWider) return true;
    if (await preguntar("Accept the wider permissions?")) return true;
    console.error(
      chalk.red("✖ Not installed. Review the diff above; to accept it non-interactively pass --yes --accept-wider.")
    );
    process.exitCode = 3;
    return false;
  }
  if (o.yes) return true;
  if (await preguntar(nuevos.length || !esActualizacion ? "Install with these permissions?" : "Update?")) return true;
  console.error(chalk.red("✖ Not installed: confirmation required (answer y, or pass --yes after reviewing)."));
  process.exitCode = 3;
  return false;
}

async function instalarPreparado(raiz: string, p: Preparacion, o: OpcionesDeRegistro): Promise<KonInstaladoAhora[]> {
  const ids = p.kons.filter((k) => !k.sinCambios).map((k) => k.eleccion.id);
  let hechos: KonInstaladoAhora[] = [];
  try {
    hechos = instalarKons(ids, {
      raiz,
      origen: p.staging,
      origenDeclarado: `registry:${p.registro.nombre}`,
      enable: o.enable,
      force: o.force,
      sdkDelNucleo: (await nucleo(raiz, o)).sdk ?? 1,
    });
    actualizarBloqueo(raiz, p, (b) => escribirBloqueo(raiz, b));
  } finally {
    limpiarStaging(p);
  }
  for (const k of hechos) {
    const dep = k.comoDependencia ? chalk.gray(" (dependency)") : "";
    console.log(chalk.green(`✔ ${k.id}@${k.version}`) + dep + chalk.gray(` → packages/kons/${k.id}`));
  }
  console.log(chalk.gray(`  ${FICHERO_DE_BLOQUEO} updated`));
  return hechos;
}

// ── add / update / sync ─────────────────────────────────────────────────────

export async function konAddDesdeRegistro(nombres: string[], o: OpcionesDeRegistro): Promise<void> {
  try {
    const raiz = raizDe(o);
    const pedidos: Record<string, string> = {};
    for (const n of nombres) {
      const { id, rango } = leerPedido(n, idDeKon);
      pedidos[id] = rango;
    }
    const bloqueo = leerBloqueo(raiz);
    // Keep the ranges of what was asked before, so a new add does not drop them.
    for (const [id, e] of Object.entries(bloqueo.kons)) if (e.requested && !(id in pedidos)) pedidos[id] = e.requested;
    const n = await nucleo(raiz, o);
    const p = await prepararInstalacion({
      raiz,
      pedidos,
      actualizar: new Set(nombres.map((x) => leerPedido(x, idDeKon).id)),
      registry: o.registry,
      registryKey: o.registryKey,
      allowUnsigned: o.allowUnsigned,
      versionDelNucleo: n.version,
      sdkDelNucleo: n.sdk,
      instalados: instaladosDe(raiz),
    });
    if (!(await confirmarPlan(p, o, false))) {
      limpiarStaging(p);
      return;
    }
    const hechos = await instalarPreparado(raiz, p, o);
    pasosTrasInstalar(raiz, hechos, o);
  } catch (e) {
    fallar(e);
  }
}

export async function konUpdateCommand(nombres: string[], o: OpcionesDeRegistro): Promise<void> {
  try {
    const raiz = raizDe(o);
    const bloqueo = leerBloqueo(raiz);
    const pedidos: Record<string, string> = {};
    for (const [id, e] of Object.entries(bloqueo.kons)) if (e.requested) pedidos[id] = e.requested;
    const ids = nombres.map(idDeKon);
    for (const id of ids) {
      if (!bloqueo.kons[id]) throw new ErrorDeKon(`${id} was not installed from a registry (not in ${FICHERO_DE_BLOQUEO})`);
    }
    if (!Object.keys(pedidos).length) throw new ErrorDeKon(`nothing to update: no registry kons in ${FICHERO_DE_BLOQUEO}`);
    const n = await nucleo(raiz, o);
    const p = await prepararInstalacion({
      raiz,
      pedidos,
      actualizar: ids.length ? new Set(ids) : "all",
      registry: o.registry,
      registryKey: o.registryKey,
      allowUnsigned: o.allowUnsigned,
      versionDelNucleo: n.version,
      sdkDelNucleo: n.sdk,
      instalados: instaladosDe(raiz),
    });
    if (!(await confirmarPlan(p, o, true))) {
      limpiarStaging(p);
      return;
    }
    const hechos = await instalarPreparado(raiz, p, o);
    pasosTrasInstalar(raiz, hechos, o);
  } catch (e) {
    fallar(e);
  }
}

/** Install exactly what the lockfile says (CI, a fresh checkout, a container build). */
export async function konSyncCommand(o: OpcionesDeRegistro): Promise<void> {
  try {
    const raiz = raizDe(o);
    const bloqueo = leerBloqueo(raiz);
    const pedidos: Record<string, string> = {};
    for (const [id, e] of Object.entries(bloqueo.kons)) pedidos[id] = `=${e.version}`;
    if (!Object.keys(pedidos).length) {
      console.log(chalk.gray(`Nothing in ${FICHERO_DE_BLOQUEO}.`));
      return;
    }
    const n = await nucleo(raiz, o);
    const p = await prepararInstalacion({
      raiz,
      pedidos,
      registry: o.registry,
      registryKey: o.registryKey,
      allowUnsigned: o.allowUnsigned,
      versionDelNucleo: n.version,
      sdkDelNucleo: n.sdk,
      instalados: instaladosDe(raiz),
    });
    for (const k of p.kons) {
      const b = bloqueo.kons[k.eleccion.id];
      if (b && (b.sha256 !== k.entradaDeBloqueo.sha256 || b.contentHash !== k.entradaDeBloqueo.contentHash)) {
        limpiarStaging(p);
        throw new ErrorDeKon(`${k.eleccion.id}@${k.eleccion.version}: the registry package differs from the lockfile`);
      }
    }
    // The lockfile was already accepted: no permission prompt, unless the
    // signing key changed.
    const claveCambiada = p.kons.filter((k) => k.diff.keyChanged);
    if (claveCambiada.length && !(o.yes && o.acceptWider)) {
      limpiarStaging(p);
      throw new ErrorDeKon(`${claveCambiada.map((k) => k.eleccion.id).join(", ")}: signing key changed since the lockfile`);
    }
    if (!p.kons.some((k) => !k.sinCambios)) {
      limpiarStaging(p);
      console.log(chalk.green("✔ Installed kons match the lockfile."));
      return;
    }
    const hechos = await instalarPreparado(raiz, p, o);
    pasosTrasInstalar(raiz, hechos, o);
  } catch (e) {
    fallar(e);
  }
}

export function quitarDelBloqueo(raiz: string, ids: string[]): void {
  if (!existsSync(join(raiz, FICHERO_DE_BLOQUEO))) return;
  const b = leerBloqueo(raiz);
  let cambio = false;
  for (const id of ids) {
    if (b.kons[id]) {
      delete b.kons[id];
      cambio = true;
    }
  }
  if (cambio) escribirBloqueo(raiz, b);
}

// ── search / info / outdated ────────────────────────────────────────────────

export async function konSearchCommand(texto: string | undefined, o: OpcionesDeRegistro): Promise<void> {
  try {
    const raiz = raizDe(o);
    const { verificado } = await abrirRegistro(raiz, o, leerBloqueo(raiz));
    const q = (texto ?? "").toLowerCase();
    const filas = Object.entries(verificado.indice.kons)
      .filter(([id, k]) => !q || id.includes(q) || (k.description ?? "").toLowerCase().includes(q))
      .map(([id, k]) => {
        const versiones = versionesDe(verificado.indice, id).filter((v) => !k.versions[v]!.yanked);
        return { id, latest: versiones[0] ?? null, license: k.license ?? null, description: k.description ?? "" };
      });
    if (o.json) return void console.log(JSON.stringify(filas, null, 2));
    if (!filas.length) console.log(chalk.gray("No kons match."));
    for (const f of filas) {
      console.log(`${chalk.bold(f.id.padEnd(26))} ${String(f.latest ?? "-").padEnd(10)} ${String(f.license ?? "").padEnd(10)} ${chalk.gray(f.description.slice(0, 60))}`);
    }
  } catch (e) {
    fallar(e);
  }
}

export async function konInfoCommand(nombre: string, o: OpcionesDeRegistro): Promise<void> {
  try {
    const raiz = raizDe(o);
    const { verificado } = await abrirRegistro(raiz, o, leerBloqueo(raiz));
    const { indice } = verificado;
    const { id, rango } = leerPedido(nombre, idDeKon);
    const k = indice.kons[id];
    if (!k) throw new ErrorDeKon(`${id} is not in the registry`);
    const versiones = versionesDe(indice, id);
    const elegida = maxSatisfying(versiones.filter((v) => !k.versions[v]!.yanked && !estaRevocada(indice, id, v)), rango) ?? versiones[0]!;
    const v = k.versions[elegida]!;
    if (o.json) return void console.log(JSON.stringify({ id, owners: k.owners, versions: k.versions, advisories: indice.advisories.filter((a) => a.kon === id) }, null, 2));
    const m = v.manifest;
    console.log(`${chalk.bold(`${id}@${elegida}`)}  ${m.name}`);
    console.log(chalk.gray(`  ${m.description}`));
    console.log(`  license     ${m.license}\n  author      ${m.author?.name ?? "-"}\n  repository  ${m.repository?.url ?? "-"}`);
    console.log(`  kitsuden    ${m.kitsuden ?? "*"}   sdk ${m.sdk ?? "-"}`);
    console.log(`  depends on  ${Object.entries(m.dependencies).map(([d, r]) => `${d}@${r}`).join(", ") || "-"}`);
    console.log(`  scopes      ${m.permissions?.scopes.join(", ") || "(none)"}`);
    console.log(`  hosts       ${m.permissions?.hosts.join(", ") || "(none)"}`);
    console.log(`  sensitive   ${m.permissions?.sensitive.join(", ") || "(none)"}`);
    console.log(`  tables      ${m.tables.join(", ") || "-"}`);
    console.log(`  migrations  ${m.migrations.join(", ") || "-"}`);
    console.log(`  signed by   ${v.keyId} (${indice.publishers[v.keyId]?.name ?? "?"})   sha256 ${v.sha256.slice(0, 16)}…  ${v.size} B`);
    console.log(chalk.bold("  versions"));
    for (const x of versiones) {
      const e = k.versions[x]!;
      const rev = estaRevocada(indice, id, x);
      const marca = rev ? chalk.red(`revoked ${rev.id}`) : e.yanked ? chalk.yellow(`yanked${e.yankReason ? `: ${e.yankReason}` : ""}`) : "";
      console.log(`    ${x.padEnd(12)} ${e.publishedAt.slice(0, 10)} ${marca}`);
    }
    for (const a of indice.advisories.filter((a) => a.kon === id)) {
      console.log(chalk.yellow(`  advisory ${a.id} [${a.severity}] ${a.versions}: ${a.summary}${a.revoked ? " (revoked)" : ""}`));
    }
  } catch (e) {
    fallar(e);
  }
}

export async function konOutdatedCommand(o: OpcionesDeRegistro): Promise<void> {
  try {
    const raiz = raizDe(o);
    const bloqueo = leerBloqueo(raiz);
    const { verificado } = await abrirRegistro(raiz, o, bloqueo);
    const { indice } = verificado;
    const n = await nucleo(raiz, o);
    const filas = Object.entries(bloqueo.kons).map(([id, e]) => {
      const usables = versionesDe(indice, id).filter((v) => {
        const x = indice.kons[id]!.versions[v]!;
        return !x.yanked && !estaRevocada(indice, id, v) && compatibleConElNucleo(x.manifest.kitsuden, n.version);
      });
      const wanted = maxSatisfying(usables, e.requested ?? "*");
      const latest = usables[0] ?? null;
      const actual = indice.kons[id]?.versions[e.version];
      const flags = [
        actual?.yanked ? "yanked" : "",
        estaRevocada(indice, id, e.version) ? "REVOKED" : "",
        ...avisosDe(indice, id, e.version).filter((a) => !a.revoked).map((a) => `advisory ${a.id}`),
      ].filter(Boolean);
      return { id, current: e.version, wanted, latest, requested: e.requested ?? null, flags };
    });
    if (o.json) return void console.log(JSON.stringify(filas, null, 2));
    console.log(chalk.gray(`${"kon".padEnd(26)} ${"current".padEnd(10)} ${"wanted".padEnd(10)} ${"latest".padEnd(10)}`));
    for (const f of filas) {
      const color = f.flags.length ? chalk.red : f.current !== f.latest ? chalk.yellow : chalk.green;
      console.log(color(`${f.id.padEnd(26)} ${f.current.padEnd(10)} ${String(f.wanted ?? "-").padEnd(10)} ${String(f.latest ?? "-").padEnd(10)} ${f.flags.join(", ")}`));
    }
  } catch (e) {
    fallar(e);
  }
}

// ── publish / yank / keygen ─────────────────────────────────────────────────

export async function konPublishCommand(dir: string, o: OpcionesDeRegistro): Promise<void> {
  try {
    if (!o.registry) throw new ErrorDeKon("--registry <folder> is required: publish writes to a local registry folder");
    if (!o.key) throw new ErrorDeKon("--key <publisher secret key file> is required (create one with `kitsuden kon keygen`)");
    const carpeta = carpetaLocal(o.registry);
    const r = publicar({
      dir: resolve(dir),
      carpetaDelRegistro: carpeta,
      nombreDelRegistro: o.registryName,
      clave: abrirClave(resolve(o.key)),
      claveDelRegistro: o.indexKey ? abrirClave(resolve(o.indexKey)) : undefined,
      anadirDueno: o.addOwner,
      dryRun: o.dryRun,
    });
    for (const a of r.avisos) console.log(chalk.yellow(`  ! ${a}`));
    const p = r.manifiesto.permissions!;
    console.log(chalk.green(`${o.dryRun ? "✔ (dry run) would publish" : "✔ published"} ${r.id}@${r.version}`) + chalk.gray(` → ${carpeta}/${r.tarball}`));
    console.log(chalk.gray(`  sha256 ${r.sha256}\n  content ${r.contentHash}\n  ${r.size} bytes, signed by ${r.keyId}, license ${r.manifiesto.license}`));
    console.log(chalk.gray(`  scopes [${p.scopes.join(", ")}]  hosts [${p.hosts.join(", ")}]  sensitive [${p.sensitive.join(", ")}]`));
  } catch (e) {
    fallar(e);
  }
}

export async function konYankCommand(spec: string, o: OpcionesDeRegistro): Promise<void> {
  try {
    if (!o.registry) throw new ErrorDeKon("--registry <folder> is required");
    if (!o.indexKey) throw new ErrorDeKon("--index-key <registry secret key file> is required");
    const carpeta = carpetaLocal(o.registry);
    const claveDelRegistro = abrirClave(resolve(o.indexKey));
    if (o.revokeKey) {
      revocarClave(carpeta, claveDelRegistro, o.revokeKey.toUpperCase());
      console.log(chalk.green(`✔ publisher key ${o.revokeKey} revoked: every package it signed is now refused`));
      return;
    }
    const at = spec.lastIndexOf("@");
    if (at <= 0) throw new ErrorDeKon("give <kon>@<version>");
    const id = idDeKon(spec.slice(0, at));
    const version = spec.slice(at + 1);
    if (o.revoke) {
      if (!o.advisory) throw new ErrorDeKon("--revoke needs --advisory \"<summary>\"");
      const a = anadirAviso({
        carpetaDelRegistro: carpeta,
        claveDelRegistro,
        id,
        versiones: o.range ?? `=${version}`,
        resumen: o.advisory,
        severidad: (o.severity ?? "high") as "high",
        revocar: true,
      });
      console.log(chalk.green(`✔ ${a.id}: ${id}@${a.versions} revoked (refused even when locked)`));
      return;
    }
    if (o.advisory) {
      const a = anadirAviso({
        carpetaDelRegistro: carpeta,
        claveDelRegistro,
        id,
        versiones: o.range ?? `=${version}`,
        resumen: o.advisory,
        severidad: (o.severity ?? "moderate") as "moderate",
        revocar: false,
      });
      console.log(chalk.green(`✔ advisory ${a.id} for ${id}@${a.versions}`));
    }
    retirar({ carpetaDelRegistro: carpeta, claveDelRegistro, id, version, motivo: o.reason, deshacer: o.undo });
    console.log(chalk.green(`✔ ${id}@${version} ${o.undo ? "un-yanked" : "yanked"}`));
  } catch (e) {
    fallar(e);
  }
}

function dentroDeUnRepo(ruta: string): string | null {
  let dir = resolve(ruta);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const padre = dirname(dir);
    if (padre === dir) return null;
    dir = padre;
  }
}

export async function konKeygenCommand(o: OpcionesDeRegistro): Promise<void> {
  try {
    if (!o.out) throw new ErrorDeKon("--out <path> is required (writes <path>.pub and <path>.key)");
    const base = resolve(o.out);
    const repo = dentroDeUnRepo(dirname(base));
    if (repo && !o.force) {
      throw new ErrorDeKon(
        `${dirname(base)} is inside a git repository (${repo}): a secret key must not live there. ` +
          `Choose a folder outside it (or --force if you really mean it).`
      );
    }
    for (const f of [`${base}.pub`, `${base}.key`]) if (existsSync(f)) throw new ErrorDeKon(`${f} already exists`);
    const pass = process.env.KITSUDEN_SIGNING_PASSPHRASE || undefined;
    const { publica, secreta, keyId } = generarClaves(pass);
    mkdirSync(dirname(base), { recursive: true });
    writeFileSync(`${base}.pub`, publica);
    writeFileSync(`${base}.key`, secreta, { mode: 0o600 });
    console.log(chalk.green(`✔ key ${keyId}`));
    console.log(chalk.gray(`  public  ${base}.pub   (share it; registry operators put it in kitsuden.registries.json)`));
    console.log(chalk.gray(`  secret  ${base}.key   (${pass ? "encrypted with KITSUDEN_SIGNING_PASSPHRASE" : chalk.yellow("NOT encrypted: set KITSUDEN_SIGNING_PASSPHRASE to encrypt")})`));
  } catch (e) {
    fallar(e);
  }
}

// ── verify ──────────────────────────────────────────────────────────────────

export async function konVerifyCommand(nombres: string[], o: OpcionesDeRegistro): Promise<void> {
  try {
    if (o.file) {
      // Offline check of one package file: signature, signed comment, safe parse, manifest.
      if (!o.key) throw new ErrorDeKon("--key <publisher public key> is required with --file");
      const tgz = readFileSync(resolve(o.file));
      const firma = readFileSync(resolve(o.sig ?? `${o.file}.minisig`), "utf8");
      const clave = leerClavePublica(readFileSync(resolve(o.key), "utf8"));
      const comentario = verificarFirma(tgz, firma, clave);
      const c = camposDelComentario(comentario);
      const ficheros = leerPaquete(tgz);
      const contenido = huellaDeFicheros(ficheros);
      if (c.sha256 !== sha256(tgz) || c.content !== contenido) throw new ErrorDeKon("the signed comment does not describe this file");
      const kj = ficheros.find((f) => f.ruta === "kon.json");
      const pj = ficheros.find((f) => f.ruta === "package.json");
      if (!kj) throw new ErrorDeKon("no kon.json in the package");
      const { validarManifiesto } = await import("../registro/manifiesto.js");
      const migraciones = ficheros.filter((f) => /^migrations\/[^/]+\.sql$/.test(f.ruta)).map((f) => f.ruta.slice(11));
      const r = validarManifiesto(JSON.parse(kj.datos.toString("utf8")), {
        paraPublicar: true,
        paquete: pj ? JSON.parse(pj.datos.toString("utf8")) : null,
        migraciones,
      });
      if (!r.ok) throw new ErrorDeKon(`manifest invalid:\n  ${r.errores.join("\n  ")}`);
      if (r.manifiesto!.id !== c.id || r.manifiesto!.version !== c.version) throw new ErrorDeKon("signed id/version differ from the manifest");
      console.log(chalk.green(`✔ ${c.id}@${c.version} verified — key ${idDeClave(clave.keyId)}, ${ficheros.length} files, sha256 ${c.sha256}`));
      return;
    }
    const raiz = raizDe(o);
    const bloqueo = leerBloqueo(raiz);
    const fichero = leerFichero(raiz);
    const ids = nombres.length ? nombres.map(idDeKon) : Object.keys(bloqueo.kons);
    if (!ids.length) {
      console.log(chalk.gray(`No registry kons in ${FICHERO_DE_BLOQUEO}.`));
      return;
    }
    let malos = 0;
    for (const id of ids) {
      const e = bloqueo.kons[id];
      if (!e) {
        console.log(chalk.red(`✖ ${id}: not in ${FICHERO_DE_BLOQUEO}`));
        malos++;
        continue;
      }
      const problemas = verificarDesdeCache(raiz, id, e);
      const inst = fichero.kons[id];
      const dir = inst ? rutaDeEntrada(raiz, id, inst) : null;
      if (!dir) problemas.push(`${id}: not installed (run kon sync)`);
      else {
        const { huellaDe } = await import("../kons/instalacion.js");
        if (huellaDe(dir) !== e.contentHash) problemas.push(`${id}: installed copy differs from the signed package (local changes or tampering)`);
        const m = manifiestoDeCarpeta(dir, true);
        if (!m.ok) problemas.push(`${id}: installed manifest invalid: ${m.errores.join("; ")}`);
      }
      if (inst && inst.version !== e.version) problemas.push(`${id}: kitsuden.kons.json says ${inst.version}, lockfile ${e.version}`);
      if (problemas.length) {
        malos++;
        for (const p of problemas) console.log(chalk.red(`✖ ${p}`));
      } else {
        console.log(chalk.green(`✔ ${id}@${e.version}`) + chalk.gray(` ${e.signed ? `signed by ${e.keyId}` : "UNSIGNED"}, content ${e.contentHash.slice(0, 16)}…`));
      }
    }
    // Online part, when a registry is reachable: revocations since install.
    try {
      const { verificado } = await abrirRegistro(raiz, o, bloqueo);
      for (const id of ids) {
        const e = bloqueo.kons[id];
        if (!e) continue;
        const rev = estaRevocada(verificado.indice, id, e.version);
        if (rev) {
          malos++;
          console.log(chalk.red(`✖ ${id}@${e.version}: REVOKED by ${rev.id}: ${rev.summary}`));
        }
        if (verificado.indice.revokedKeys?.includes(e.keyId ?? "")) {
          malos++;
          console.log(chalk.red(`✖ ${id}: its signing key ${e.keyId} has been revoked`));
        }
        if (verificado.indice.kons[id]?.versions[e.version]?.yanked) console.log(chalk.yellow(`! ${id}@${e.version} is yanked`));
        if (!satisfies(e.version, e.requested ?? "*")) console.log(chalk.yellow(`! ${id}@${e.version} no longer satisfies ${e.requested}`));
      }
    } catch (err) {
      console.log(chalk.gray(`  (registry not checked for revocations: ${(err as Error).message})`));
    }
    if (malos) {
      process.exitCode = 1;
      console.error(chalk.red(`✖ ${malos} problem(s)`));
    }
  } catch (e) {
    fallar(e);
  }
}
