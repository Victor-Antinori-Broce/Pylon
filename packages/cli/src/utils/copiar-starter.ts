/**
 * Copia del starter de frontend
 * ============================================================================
 *
 * `kitsuden new` y el empaquetado del CLI (`scripts/empaquetar-starter.mjs`)
 * copian el MISMO starter con el MISMO filtro. Vive aquí para que las dos
 * copias no se separen: si una dejara pasar `.env`, el tarball publicado
 * llevaría el `.env` de quien lo empaquetó.
 *
 * Lo que NO se copia, en cualquier nivel de profundidad:
 *
 *   · node_modules, dist, dist-*, .astro, .inti, .turbo, coverage — salida de
 *     compilación o estado local; el proyecto nuevo los regenera;
 *   · .env y .env.* salvo .env.example — pueden llevar secretos
 *     (KITSUDEN_SITE_KEY, INTI_KITSUDEN_TOKEN).
 */

import { existsSync } from "node:fs";
import { cp, readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CARPETAS_EXCLUIDAS = new Set([
  "node_modules",
  "dist",
  ".astro",
  ".inti",
  ".turbo",
  "coverage",
]);

/** ¿Se copia esta entrada? Recibe solo el nombre (sin carpeta). */
export function seCopia(nombre: string): boolean {
  if (CARPETAS_EXCLUIDAS.has(nombre)) return false;
  if (nombre.startsWith("dist-")) return false;
  if (nombre === ".env") return false;
  if (nombre.startsWith(".env.") && nombre !== ".env.example") return false;
  return true;
}

/** Copia `origen` en `destino` con el filtro de arriba. `destino` no debe existir o estar vacío. */
export async function copiarStarter(origen: string, destino: string): Promise<void> {
  await cp(origen, destino, {
    recursive: true,
    filter: (fuente) => fuente === origen || seCopia(basename(fuente)),
  });
}

/** Raíz del paquete del CLI (la carpeta con su package.json), desde dist/ o src/. */
export function raizDelCli(): string {
  // dist/utils/copiar-starter.js → ../.. ; igual desde src/utils con tsx.
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export interface StarterEncontrado {
  dir: string;
  /** De dónde salió: para decirlo en la salida y no adivinar al depurar. */
  origen: "--from" | "bundled" | "monorepo";
}

/** ¿Parece el starter? Lo mínimo para no copiar una carpeta cualquiera. */
export function esStarter(dir: string): boolean {
  return (
    existsSync(join(dir, "package.json")) &&
    existsSync(join(dir, "astro.config.mjs")) &&
    existsSync(join(dir, ".env.example"))
  );
}

/**
 * Dónde está el starter, por orden:
 *
 *   1. `--from <dir>` si se pasa;
 *   2. `templates/starter-basic` dentro del paquete del CLI — lo deja ahí el
 *      `prepack`, así que es lo que trae el CLI instalado desde npm;
 *   3. `packages/starters/kitsuden-starter-basic` del monorepo, cuando el CLI
 *      se ejecuta desde el repositorio de Kitsuden.
 *
 * No hay descarga desde GitHub: el repositorio aún no es público y una
 * descarga que falla en silencio es peor que un error que dice qué pasar.
 */
export function encontrarStarter(from?: string): StarterEncontrado | null {
  if (from) {
    const dir = resolve(from);
    return esStarter(dir) ? { dir, origen: "--from" } : null;
  }
  const cli = raizDelCli();
  const empaquetado = join(cli, "templates", "starter-basic");
  if (esStarter(empaquetado)) return { dir: empaquetado, origen: "bundled" };
  const monorepo = resolve(cli, "..", "starters", "kitsuden-starter-basic");
  if (esStarter(monorepo)) return { dir: monorepo, origen: "monorepo" };
  return null;
}

/** Lista recursiva de rutas relativas copiadas (para las pruebas y el resumen). */
export async function listarRelativo(dir: string, base = dir): Promise<string[]> {
  const fuera: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) fuera.push(...(await listarRelativo(ruta, base)));
    else
      fuera.push(
        ruta
          .slice(base.length + 1)
          .split("\\")
          .join("/")
      );
  }
  return fuera;
}
