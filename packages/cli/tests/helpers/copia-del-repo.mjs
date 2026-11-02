/**
 * Copia MÍNIMA del monorepo de Kitsuden para probar `kitsuden make kon` sin
 * tocar el repositorio de verdad.
 *
 * Se copia solo lo que leen las guardias de kons (tests/unit, packages/kons,
 * packages/core, schemas, shared, engine, el mapa de iconos del admin y
 * apps/api/src + drizzle). Los `node_modules` NO se copian: se enlazan
 * (junction en Windows, symlink en el resto) a los del repo original, así que
 * la copia pesa unos 15 MB y tarda segundos.
 *
 * Consecuencia que conviene saber: `@kitsuden/engine` y `@kitsuden/shared` se
 * resuelven por esos node_modules y apuntan al código del repo ORIGINAL. Las
 * guardias leen los kons de la copia (por `__dirname`), que es lo que importa.
 */

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";

const COPIAR = [
  "package.json",
  "pnpm-workspace.yaml",
  // Los kons INSTALADOS (fase C): sin esta lista, la API de la copia no conoce
  // ninguno de los que hay en packages/kons.
  "kitsuden.kons.json",
  "tsconfig.json",
  "vitest.config.ts",
  "tests/unit",
  "packages/kons",
  "packages/tsconfig.kons.json",
  "packages/core",
  "packages/schemas",
  "packages/shared",
  "packages/engine",
  "packages/grimoires",
  "packages/admin/src/lib",
  "apps/api/package.json",
  "apps/api/tsconfig.json",
  "apps/api/kitsuden.config.ts",
  "apps/api/src",
  "apps/api/drizzle",
];

const FUERA = new Set(["node_modules", "dist", ".turbo", "coverage"]);

function enlazar(origen, destino) {
  symlinkSync(origen, destino, process.platform === "win32" ? "junction" : "dir");
}

/** Copia `raiz` a `destino` y enlaza los node_modules. Devuelve `destino`. */
export function copiarRepo(raiz, destino) {
  mkdirSync(destino, { recursive: true });
  for (const rel of COPIAR) {
    const o = join(raiz, rel);
    if (!existsSync(o)) continue;
    mkdirSync(dirname(join(destino, rel)), { recursive: true });
    cpSync(o, join(destino, rel), {
      recursive: true,
      filter: (f) => !FUERA.has(f.split(/[\\/]/).pop()),
    });
  }

  // node_modules: raíz, apps/api y cada paquete copiado que los tenga.
  const conModulos = [".", "apps/api", "packages/shared", "packages/engine"];
  for (const grupo of ["packages/kons", "packages/core"]) {
    for (const e of readdirSync(join(raiz, grupo), { withFileTypes: true })) {
      if (e.isDirectory() && e.name !== "node_modules") conModulos.push(`${grupo}/${e.name}`);
    }
  }
  conModulos.push("packages/kons", "packages/core");
  for (const rel of conModulos) {
    const o = join(raiz, rel, "node_modules");
    const d = join(destino, rel, "node_modules");
    if (existsSync(o) && existsSync(join(destino, rel)) && !existsSync(d)) enlazar(o, d);
  }
  return destino;
}

/**
 * Borra la copia. Primero QUITA los enlaces de node_modules (unlink no sigue
 * el enlace) y comprueba que ya no están; solo entonces borra el resto. Un
 * borrado recursivo que atravesara una junction vaciaría los node_modules del
 * repo de verdad.
 */
export function borrarCopia(destino) {
  if (!existsSync(destino)) return;
  const pendientes = [destino];
  while (pendientes.length) {
    const dir = pendientes.pop();
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name);
      const st = lstatSync(ruta);
      if (st.isSymbolicLink()) {
        unlinkSync(ruta);
        if (existsSync(ruta)) throw new Error(`no se pudo quitar el enlace ${ruta}`);
      } else if (st.isDirectory() && e.name !== ".git") pendientes.push(ruta);
    }
  }
  rmSync(destino, { recursive: true, force: true });
}
