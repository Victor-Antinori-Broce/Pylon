#!/usr/bin/env node
/**
 * El SDK en modo watch (kitsuden2.md C4)
 * ============================================================================
 *
 *   pnpm sdk:watch
 *
 * Cambias un `defineModelo` (o cualquier `defineOperacion`) y, en unos pocos
 * segundos, `packages/sdk/src/generated` ya lo refleja: el editor del frontend
 * marca el campo nuevo o el que se quitó sin tocar nada más. Cierra el
 * «hueco 3» sin Rust: el cuello de botella nunca fue el lenguaje, era que la
 * generación había que lanzarla a mano.
 *
 * Qué hace en cada cambio (con 300 ms de margen para agrupar un guardado
 * múltiple):
 *   1. `apps/api/scripts/sdk-openapi.ts` → el OpenAPI de las operaciones
 *      (offline: sin base de datos ni red; ~4 s medido el 2026-10-28).
 *   2. `scripts/sdk/generate.mjs` → los clientes TS y Python, INCREMENTAL:
 *      solo reescribe los ficheros que cambian, así el servidor de TypeScript
 *      revalida solo el kon tocado.
 * Si llega otro cambio mientras regenera, se hace UNA vuelta más al acabar.
 *
 * Qué vigila: los kons (`packages/kons`), el núcleo (`packages/core`), los
 * modelos y operaciones de `packages/shared` y del engine, y las operaciones
 * propias del núcleo en `apps/api/src`. Ignora tests, `dist`, `node_modules` y
 * lo generado (si no, se despertaría a sí mismo).
 */

import { spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const VIGILADOS = [
  "packages/kons",
  "packages/core",
  "packages/shared/src",
  "packages/engine/src",
  "apps/api/src/lib",
  "apps/api/src/routes",
].map((d) => join(RAIZ, d));

const IGNORAR =
  /(^|[\\/])(node_modules|dist|dist-[^\\/]*|generated|_generated|tests?|__tests__|\.astro|\.svelte-kit)([\\/]|$)|\.(test|spec)\.[mc]?[jt]sx?$|\.d\.ts$/;
const INTERESA = /\.(ts|mts|json)$/;

let temporizador = null;
let enMarcha = false;
let otraVuelta = false;
const tocados = new Set();

function correr(cmd, args, cwd) {
  return new Promise((ok) => {
    const p = spawn(cmd, args, { cwd, stdio: ["ignore", "inherit", "inherit"], shell: process.platform === "win32" });
    p.on("close", (codigo) => ok(codigo ?? 1));
  });
}

async function regenerar() {
  if (enMarcha) {
    otraVuelta = true;
    return;
  }
  enMarcha = true;
  const lista = [...tocados].slice(0, 5).map((f) => relative(RAIZ, f).replaceAll("\\", "/"));
  tocados.clear();
  const inicio = Date.now();
  console.error(`\n[sdk:watch] cambio en ${lista.join(", ")}${lista.length === 5 ? "…" : ""}`);
  const spec = await correr("bun", ["--no-env-file", "scripts/sdk-openapi.ts"], join(RAIZ, "apps/api"));
  if (spec === 0) {
    await correr("node", ["scripts/sdk/generate.mjs"], RAIZ);
    console.error(`[sdk:watch] listo en ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
  } else {
    console.error("[sdk:watch] el OpenAPI no se pudo generar (mira el error de arriba); el SDK no cambia");
  }
  enMarcha = false;
  if (otraVuelta) {
    otraVuelta = false;
    void regenerar();
  }
}

function alCambiar(base, fichero) {
  if (!fichero) return;
  const abs = join(base, fichero.toString());
  if (IGNORAR.test(abs) || !INTERESA.test(abs)) return;
  tocados.add(abs);
  clearTimeout(temporizador);
  temporizador = setTimeout(() => void regenerar(), 300);
}

for (const dir of VIGILADOS) {
  if (!existsSync(dir)) continue;
  // `recursive` funciona en Windows, macOS y Linux (Node >= 20).
  watch(dir, { recursive: true }, (_evento, fichero) => alCambiar(dir, fichero));
}

console.error(
  `[sdk:watch] vigilando ${VIGILADOS.filter(existsSync).length} carpetas; Ctrl+C para salir. Primera generación…`
);
tocados.add(join(RAIZ, "(arranque)"));
void regenerar();
