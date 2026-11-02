/**
 * Kon packages: a deterministic tarball in, a safe extraction out
 * ============================================================================
 *
 * WRITING (`kon publish`). The same folder always gives the same bytes: plain
 * ustar, entries sorted by path, every file under `package/`, mode 0644, uid/gid
 * 0, mtime 0, no user or group names, no directory entries (the reader creates
 * parents), gzip level 9 with mtime 0 and OS byte 255. Two publishers packing
 * the same commit get the same `sha256` (with the same zlib).
 *
 * What is packed is what `kitsuden kon add --from` copies (no node_modules,
 * dist, .git, coverage, .turbo, *.tsbuildinfo), so the installed copy's hash in
 * kitsuden.kons.json equals the package's `contentHash`. Packing REFUSES
 * symlinks and files that look like secrets (.env, private keys, .npmrc).
 *
 * READING (`kon add`). The archive is untrusted until its signature and hash
 * checked out, and even then it is parsed defensively:
 *
 *   · only regular files and directories; symlinks, hard links, devices, FIFOs,
 *     pax/GNU extension headers are refused (a link entry is how an archive
 *     writes outside its folder on extraction);
 *   · every path must be `package/<relative>` with no empty, `.` or `..`
 *     segment, no backslash, colon, NUL or control character, no Windows
 *     reserved name (CON, NUL, COM1…), no trailing dot or space; duplicates are
 *     refused, case-insensitively (two names that are one file on Windows);
 *   · header checksums are verified; sizes are capped (compressed, expanded,
 *     per file, number of entries);
 *   · extraction goes into a NEW empty folder, files are created with `wx`
 *     (never through an existing file or link), each target is checked to stay
 *     inside the folder before writing, and the result is checked again after
 *     `realpath` — the same three layers as the admin asset route.
 */

import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { gunzipSync, gzipSync, constants as zlib } from "node:zlib";

export const LIMITES = {
  comprimido: 20 * 1024 * 1024,
  expandido: 64 * 1024 * 1024,
  porFichero: 16 * 1024 * 1024,
  entradas: 10_000,
  ruta: 255,
};

const NO_SE_EMPAQUETA = new Set(["node_modules", "dist", ".git", "coverage", ".turbo"]);

/** Names that must never leave the publisher's machine. */
export function pareceSecreto(nombre: string): boolean {
  const n = nombre.toLowerCase();
  if (n === ".env" || (n.startsWith(".env.") && !/\.(example|sample|template)$/.test(n))) return true;
  if (n === ".npmrc" || n === ".pypirc" || n === ".netrc") return true;
  if (/\.(pem|key|p12|pfx|jks|keystore)$/.test(n)) return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/.test(n)) return true;
  if (n.endsWith(".minisign_key") || n.endsWith(".kitsuden-key") || n.endsWith(".sec")) return true;
  return false;
}

export class ErrorDePaquete extends Error {}

export interface FicheroDelPaquete {
  ruta: string; // relative, forward slashes
  datos: Buffer;
}

/** The files a kon folder publishes, sorted. Refuses symlinks and secrets. */
export function ficherosParaEmpaquetar(dir: string): FicheroDelPaquete[] {
  const salida: FicheroDelPaquete[] = [];
  let total = 0;
  const visitar = (actual: string): void => {
    for (const nombre of readdirSync(actual).sort()) {
      if (NO_SE_EMPAQUETA.has(nombre) || nombre.endsWith(".tsbuildinfo")) continue;
      const ruta = join(actual, nombre);
      const rel = relative(dir, ruta).split(sep).join("/");
      const st = lstatSync(ruta);
      if (st.isSymbolicLink()) throw new ErrorDePaquete(`${rel}: symlinks cannot be published`);
      if (st.isDirectory()) {
        visitar(ruta);
        continue;
      }
      if (!st.isFile()) throw new ErrorDePaquete(`${rel}: not a regular file`);
      if (pareceSecreto(nombre)) {
        throw new ErrorDePaquete(`${rel}: looks like a secret (env file, private key or registry credentials); remove it before publishing`);
      }
      validarRutaRelativa(rel);
      if (st.size > LIMITES.porFichero) throw new ErrorDePaquete(`${rel}: larger than ${LIMITES.porFichero} bytes`);
      total += st.size;
      if (total > LIMITES.expandido) throw new ErrorDePaquete(`the kon is larger than ${LIMITES.expandido} bytes`);
      salida.push({ ruta: rel, datos: readFileSync(ruta) });
      if (salida.length > LIMITES.entradas) throw new ErrorDePaquete(`more than ${LIMITES.entradas} files`);
    }
  };
  visitar(dir);
  return salida.sort((a, b) => (a.ruta < b.ruta ? -1 : a.ruta > b.ruta ? 1 : 0));
}

/**
 * Content hash: the same algorithm as `huellaDe` of the copy installer
 * (path, NUL, bytes, NUL; sorted by path), so the installed copy can be checked.
 */
export function huellaDeFicheros(ficheros: FicheroDelPaquete[]): string {
  const h = createHash("sha256");
  for (const f of [...ficheros].sort((a, b) => (a.ruta < b.ruta ? -1 : a.ruta > b.ruta ? 1 : 0))) {
    h.update(f.ruta);
    h.update("\0");
    h.update(f.datos);
    h.update("\0");
  }
  return h.digest("hex");
}

export function sha256(datos: Buffer): string {
  return createHash("sha256").update(datos).digest("hex");
}

// ── ustar ───────────────────────────────────────────────────────────────────

function octal(n: number, ancho: number): string {
  return n.toString(8).padStart(ancho - 1, "0") + "\0";
}

function partirRuta(ruta: string): { nombre: string; prefijo: string } {
  if (Buffer.byteLength(ruta) <= 100) return { nombre: ruta, prefijo: "" };
  for (let i = ruta.length - 1; i > 0; i--) {
    if (ruta[i] !== "/") continue;
    const prefijo = ruta.slice(0, i);
    const nombre = ruta.slice(i + 1);
    if (Buffer.byteLength(prefijo) <= 155 && Buffer.byteLength(nombre) <= 100) return { nombre, prefijo };
  }
  throw new ErrorDePaquete(`path too long for the package format: ${ruta}`);
}

function cabecera(ruta: string, tamano: number): Buffer {
  const b = Buffer.alloc(512, 0);
  const { nombre, prefijo } = partirRuta(ruta);
  b.write(nombre, 0, 100, "utf8");
  b.write(octal(0o644, 8), 100, 8, "ascii");
  b.write(octal(0, 8), 108, 8, "ascii");
  b.write(octal(0, 8), 116, 8, "ascii");
  b.write(octal(tamano, 12), 124, 12, "ascii");
  b.write(octal(0, 12), 136, 12, "ascii");
  b.write("        ", 148, 8, "ascii");
  b.write("0", 156, 1, "ascii");
  b.write("ustar\0", 257, 6, "ascii");
  b.write("00", 263, 2, "ascii");
  b.write(prefijo, 345, 155, "utf8");
  let suma = 0;
  for (const x of b) suma += x;
  b.write(suma.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return b;
}

/** Deterministic `.tgz` of the files, each under `package/`. */
export function empaquetar(ficheros: FicheroDelPaquete[]): Buffer {
  const partes: Buffer[] = [];
  for (const f of [...ficheros].sort((a, b) => (a.ruta < b.ruta ? -1 : a.ruta > b.ruta ? 1 : 0))) {
    validarRutaRelativa(f.ruta);
    partes.push(cabecera(`package/${f.ruta}`, f.datos.length), f.datos);
    const relleno = (512 - (f.datos.length % 512)) % 512;
    if (relleno) partes.push(Buffer.alloc(relleno, 0));
  }
  partes.push(Buffer.alloc(1024, 0));
  const gz = gzipSync(Buffer.concat(partes), { level: 9, memLevel: 9, strategy: zlib.Z_DEFAULT_STRATEGY });
  gz.writeUInt32LE(0, 4); // mtime
  gz[9] = 255; // OS: unknown (zlib writes the build platform's)
  return gz;
}

// ── Reading ─────────────────────────────────────────────────────────────────

const RESERVADOS_WINDOWS = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;

/** A relative path inside a package that is safe on every OS. Throws otherwise. */
export function validarRutaRelativa(rel: string): void {
  if (!rel || Buffer.byteLength(rel) > LIMITES.ruta) throw new ErrorDePaquete(`invalid path length: ${JSON.stringify(rel)}`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\:*?"<>|]/.test(rel)) throw new ErrorDePaquete(`forbidden character in path: ${JSON.stringify(rel)}`);
  if (rel.startsWith("/") || /^[a-z]:/i.test(rel)) throw new ErrorDePaquete(`absolute path: ${JSON.stringify(rel)}`);
  for (const seg of rel.split("/")) {
    if (!seg || seg === "." || seg === "..") throw new ErrorDePaquete(`path traversal or empty segment: ${JSON.stringify(rel)}`);
    if (/[. ]$/.test(seg)) throw new ErrorDePaquete(`segment ends with a dot or space: ${JSON.stringify(rel)}`);
    if (RESERVADOS_WINDOWS.test(seg)) throw new ErrorDePaquete(`reserved file name: ${JSON.stringify(rel)}`);
  }
}

function leerCadena(b: Buffer, inicio: number, largo: number): string {
  const trozo = b.subarray(inicio, inicio + largo);
  const fin = trozo.indexOf(0);
  return trozo.subarray(0, fin < 0 ? largo : fin).toString("utf8");
}

function leerOctal(b: Buffer, inicio: number, largo: number): number {
  const s = leerCadena(b, inicio, largo).trim();
  if (!/^[0-7]*$/.test(s)) throw new ErrorDePaquete("corrupt tar header (number)");
  return s ? parseInt(s, 8) : 0;
}

/** Parses a kon `.tgz` into its files, refusing anything unsafe. Nothing is written. */
export function leerPaquete(tgz: Buffer): FicheroDelPaquete[] {
  if (tgz.length > LIMITES.comprimido) throw new ErrorDePaquete(`package larger than ${LIMITES.comprimido} bytes`);
  let tar: Buffer;
  try {
    tar = gunzipSync(tgz, { maxOutputLength: LIMITES.expandido + 2048 });
  } catch (e) {
    throw new ErrorDePaquete(`not a valid gzip package, or it expands beyond ${LIMITES.expandido} bytes (${(e as Error).message})`);
  }
  const ficheros: FicheroDelPaquete[] = [];
  const vistos = new Set<string>();
  let pos = 0;
  while (pos + 512 <= tar.length) {
    const h = tar.subarray(pos, pos + 512);
    if (h.every((x) => x === 0)) break;
    let suma = 0;
    for (let i = 0; i < 512; i++) suma += i >= 148 && i < 156 ? 32 : h[i]!;
    if (suma !== leerOctal(h, 148, 8)) throw new ErrorDePaquete("corrupt tar header (checksum)");
    const tipo = String.fromCharCode(h[156]!);
    const nombre = leerCadena(h, 0, 100);
    const prefijo = leerCadena(h, 257, 6).startsWith("ustar") ? leerCadena(h, 345, 155) : "";
    const ruta = prefijo ? `${prefijo}/${nombre}` : nombre;
    const tamano = leerOctal(h, 124, 12);
    pos += 512;
    if (tipo === "2" || tipo === "1") throw new ErrorDePaquete(`links are not allowed in a kon package: ${ruta}`);
    if (tipo !== "0" && tipo !== "\0" && tipo !== "5") {
      throw new ErrorDePaquete(`entry type ${JSON.stringify(tipo)} is not allowed (only files and folders): ${ruta}`);
    }
    if (!ruta.startsWith("package/")) throw new ErrorDePaquete(`entry outside package/: ${JSON.stringify(ruta)}`);
    const rel = ruta.slice("package/".length).replace(/\/$/, "");
    if (tipo === "5") {
      if (rel) validarRutaRelativa(rel);
      if (tamano !== 0) throw new ErrorDePaquete(`folder entry with data: ${ruta}`);
      continue;
    }
    validarRutaRelativa(rel);
    if (tamano > LIMITES.porFichero) throw new ErrorDePaquete(`${rel}: larger than ${LIMITES.porFichero} bytes`);
    if (pos + tamano > tar.length) throw new ErrorDePaquete(`truncated package at ${rel}`);
    const clave = rel.normalize("NFC").toLowerCase();
    if (vistos.has(clave)) throw new ErrorDePaquete(`duplicate entry (case-insensitive): ${rel}`);
    vistos.add(clave);
    ficheros.push({ ruta: rel, datos: Buffer.from(tar.subarray(pos, pos + tamano)) });
    if (ficheros.length > LIMITES.entradas) throw new ErrorDePaquete(`more than ${LIMITES.entradas} entries`);
    pos += Math.ceil(tamano / 512) * 512;
  }
  // A file that is also used as a folder (`a` and `a/b`) cannot be extracted.
  for (const f of ficheros) {
    const partes = f.ruta.toLowerCase().split("/");
    for (let i = 1; i < partes.length; i++) {
      if (vistos.has(partes.slice(0, i).join("/"))) throw new ErrorDePaquete(`${f.ruta}: a parent is also a file`);
    }
  }
  return ficheros;
}

/** Writes the files into `destino`, which must be a new, empty folder. */
export function extraer(ficheros: FicheroDelPaquete[], destino: string): void {
  const raiz = resolve(destino);
  mkdirSync(raiz, { recursive: true });
  if (readdirSync(raiz).length) throw new ErrorDePaquete(`extraction folder is not empty: ${raiz}`);
  const raizReal = realpathSync(raiz);
  for (const f of ficheros) {
    validarRutaRelativa(f.ruta);
    const objetivo = resolve(raiz, ...f.ruta.split("/"));
    if (!objetivo.startsWith(raiz + sep)) throw new ErrorDePaquete(`path escapes the package: ${f.ruta}`);
    const padre = resolve(objetivo, "..");
    mkdirSync(padre, { recursive: true });
    const padreReal = realpathSync(padre);
    if (padreReal !== raizReal && !padreReal.startsWith(raizReal + sep)) {
      throw new ErrorDePaquete(`path escapes the package after realpath: ${f.ruta}`);
    }
    writeFileSync(objetivo, f.datos, { flag: "wx", mode: 0o644 });
  }
}
