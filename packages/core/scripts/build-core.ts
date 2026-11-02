/**
 * Build de los módulos Kitsuden Core como paquetes npm publicables
 * ============================================================================
 *
 * `datasets`, `media` y `blocks` son las BATERÍAS del framework: toda app las
 * quiere. Se publican como paquetes propios (`@kitsuden/datasets`, …) y no se
 * bundlean dentro de `kitsuden`, para preservar el modelo de plugins — se pueden
 * activar/desactivar como cualquier otro kon.
 *
 * Se compilan a `dist/index.js` porque el module-loader los importa
 * DINÁMICAMENTE en runtime: si se publicaran como `.ts` solo cargarían bajo
 * Bun, y `kitsuden` debe correr también bajo Node. El resolvedor del loader
 * prioriza `dist/index.js` sobre `index.ts`, así que en el monorepo se sigue
 * usando el fuente y en la instalación el compilado.
 *
 * Uso:  bun run packages/core/scripts/build-core.ts
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CORE_DIR = join(import.meta.dir, "..");
const MODULES = ["datasets", "media", "blocks"];

/** Todo lo que no debe bundlearse: peer deps + runtime del host. */
const EXTERNAL = [
  "@kitsuden/shared",
  "@kitsuden/engine",
  "kitsuden",
  "kitsuden/framework",
  "kitsuden/shared",
  "hono",
  "hono/*",
  "drizzle-orm",
  "drizzle-orm/*",
  "zod",
  "@aws-sdk/*",
  "sharp",
  "node:*",
  "bun:*",
];

/**
 * Campos que el tarball necesita y que viven en el package.json fuente.
 *
 * Antes este script los escribía él mismo, junto con una traducción de
 * `workspace:*` a semver — pero escribía sobre el package.json FUENTE, así que
 * construir dejaba el árbol en un estado que `pnpm install` ya no podía
 * resolver (`@kitsuden/shared` no está publicado, y el rango semver lo mandaba al
 * registry). Ahora el manifest es estático y el protocolo `workspace:` lo
 * traduce `pnpm publish` al empaquetar, que es su trabajo.
 */
const REQUIRED_MANIFEST_FIELDS = ["files", "main", "types", "exports"] as const;

let failed = false;

for (const name of MODULES) {
  const dir = join(CORE_DIR, name);
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) {
    console.error(`  ✗ ${name}: sin package.json`);
    failed = true;
    continue;
  }

  const entry = existsSync(join(dir, "index.ts"))
    ? join(dir, "index.ts")
    : join(dir, `${name}.routes.ts`);

  rmSync(join(dir, "dist"), { recursive: true, force: true });

  const result = await Bun.build({
    entrypoints: [entry],
    outdir: join(dir, "dist"),
    target: "node",
    format: "esm",
    external: EXTERNAL,
    naming: "index.[ext]",
  });

  if (!result.success) {
    console.error(`  ✗ @kitsuden/${name}:`);
    for (const log of result.logs) console.error("     ", log.message);
    failed = true;
    continue;
  }

  // Tipos: reexportan del fuente (suficiente en el monorepo). Para el tarball
  // publicado se generan con `tsc --emitDeclarationOnly` desde el CI.
  writeFileSync(join(dir, "dist", "index.d.ts"), `export * from "../index";\n`);

  // El manifest debe viajar en el tarball: el module-loader lee kon.json
  // para conocer el id, el mountPath y las vistas del admin. Se declara en el
  // fuente; aquí solo se comprueba que no falte nada.
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const missing = REQUIRED_MANIFEST_FIELDS.filter((field) => pkg[field] === undefined);
  if (missing.length > 0) {
    console.error(`  ✗ @kitsuden/${name}: falta ${missing.join(", ")} en su package.json`);
    failed = true;
    continue;
  }
  if (!(pkg.files ?? []).includes("kon.json")) {
    console.error(`  ✗ @kitsuden/${name}: "kon.json" debe estar en "files"`);
    failed = true;
    continue;
  }

  const kb = (result.outputs.reduce((n, o) => n + o.size, 0) / 1024).toFixed(0);
  console.log(`  ✓ @kitsuden/${name} — ${kb} KB`);
}

if (failed) process.exit(1);
console.log("\n✅ Módulos core listos para publicar.\n");
