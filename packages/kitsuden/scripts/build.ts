/**
 * Build del paquete distribuible `kitsuden`
 * ============================================================================
 *
 * El monorepo tiene `@kitsuden/engine` importando módulos del host por ruta
 * relativa (`../../apps/api/src/...`). Eso funciona DENTRO del workspace, pero
 * un paquete npm no puede llevar rutas que salen de su carpeta.
 *
 * Solución: publicar UN solo paquete con varios entry points — el modelo de
 * Next.js (`next`, `next/server`, `next/link`). El bundler resuelve las rutas
 * relativas en tiempo de build, así que el tarball es autocontenido:
 *
 *   kitsuden          → el runtime completo (la app Hono lista para servir)
 *   kitsuden/engine   → las capas del framework (repo, policies, validación…)
 *   kitsuden/shared   → tipos y schemas Zod
 *
 * Las dependencias nativas y de terceros quedan EXTERNAS (van en el
 * package.json), no se bundlean: sharp/argon2/pg tienen binarios por
 * plataforma y bundlearlos rompería la instalación.
 */

import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PKG_DIR = join(import.meta.dir, "..");
const ROOT = join(PKG_DIR, "..", "..");
const OUT = join(PKG_DIR, "dist");

const pkg = await Bun.file(join(PKG_DIR, "package.json")).json();

/**
 * Guardián de deriva.
 *
 * Este paquete bundlea el código de `apps/api` pero declara sus dependencias
 * aparte, así que las dos listas pueden separarse sin que nada avise: el
 * tarball instalaría una versión distinta de la que el código bundleado usa.
 * Ya pasó con `redis` (aquí ^4, el código llamando la API de v5).
 *
 * Regla: si una dependencia existe en ambos, el rango debe ser idéntico.
 */
const apiPkg = await Bun.file(join(ROOT, "apps/api/package.json")).json();
const apiDeps: Record<string, string> = {
  ...(apiPkg.dependencies ?? {}),
  ...(apiPkg.optionalDependencies ?? {}),
};
const ourDeps: Record<string, string> = {
  ...(pkg.dependencies ?? {}),
  ...(pkg.optionalDependencies ?? {}),
  ...(pkg.peerDependencies ?? {}),
};

const drift = Object.entries(ourDeps)
  .filter(([name, range]) => apiDeps[name] !== undefined && apiDeps[name] !== range)
  .map(
    ([name, range]) => `  ${name}: kitsuden declara "${range}", apps/api usa "${apiDeps[name]}"`
  );

if (drift.length > 0) {
  console.error("❌ Las dependencias derivaron respecto a apps/api:\n");
  console.error(drift.join("\n"));
  console.error("\nIguala los rangos en packages/kitsuden/package.json y vuelve a construir.\n");
  process.exit(1);
}

/**
 * Externals: todo lo declarado como dependencia + los subpaths de drizzle.
 *
 * Lo que NO está declarado (en `devDependencies`) se mete en el bundle: las
 * utilidades pequeñas y de JS puro (croner, openapi3-ts, hono-rate-limiter,
 * graphql-type-json, @hono/swagger-ui, @hono/zod-validator, la de TRON). Así
 * quien instala `kitsuden` baja menos paquetes, y solo quedan fuera las
 * pesadas o con estado propio (kitsuden2.md D2): postgres/pg, drizzle-orm,
 * hono, better-auth, sharp, argon2, el SDK de MCP, aws, redis, pino, graphql.
 * Si se bundlearan, los binarios nativos y los `require` dinámicos de los
 * drivers dejarían de resolverse en la máquina del usuario.
 */
const EXTERNAL = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.optionalDependencies ?? {}),
  // Las pesadas que se importan solo al usarlas (SDK de LLM, PGlite, correo,
  // PDF): peerDependencies OPCIONALES (kitsuden2.md D1). Externas igual: quien
  // las use las instala; quien no, no paga su peso.
  ...Object.keys(pkg.peerDependencies ?? {}),
  "drizzle-orm/*",
  "better-auth/*",
  "@aws-sdk/*",
  "node:*",
  "bun:*",
];

const ENTRIES = [
  { name: "index", path: join(ROOT, "apps/api/src/index.ts") },
  { name: "engine", path: join(ROOT, "packages/engine/index.ts") },
  { name: "framework", path: join(ROOT, "packages/engine/framework.ts") },
  { name: "shared", path: join(ROOT, "packages/shared/src/index.ts") },
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log("📦 Construyendo paquete `kitsuden`…\n");

for (const entry of ENTRIES) {
  const result = await Bun.build({
    entrypoints: [entry.path],
    outdir: OUT,
    target: "bun",
    format: "esm",
    external: EXTERNAL,
    naming: `${entry.name}.[ext]`,
    // El module-loader importa kons dinámicamente en runtime desde el
    // filesystem del usuario: no deben resolverse aquí.
    splitting: false,
  });

  if (!result.success) {
    console.error(`❌ Falló el bundle de ${entry.name}:`);
    for (const log of result.logs) console.error("  ", log.message);
    process.exit(1);
  }

  const bytes = result.outputs.reduce((n, o) => n + o.size, 0);
  console.log(
    `  ✓ kitsuden/${entry.name === "index" ? "" : entry.name} — ${(bytes / 1024).toFixed(0)} KB`
  );

  // Declaración de tipos: reexporta desde el fuente del monorepo. Para el
  // tarball publicado se generan con `tsc --emitDeclarationOnly` (ver README).
  writeFileSync(
    join(OUT, `${entry.name}.d.ts`),
    `export * from "${entry.path.replace(/\\/g, "/")}";\n`
  );
}

console.log("\n✅ dist/ listo. Verifica con: npm pack --dry-run\n");
