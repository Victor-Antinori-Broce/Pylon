/**
 * Kitsuden — Sync Kon Schema (codegen del agregador para drizzle-kit)
 * ============================================================================
 *
 * ANTES: `apps/api/src/db/schema-all.ts` se editaba A MANO por cada kon, y
 * los enums globales de Postgres obligaban a curar qué exportar (colisiones).
 *
 * AHORA: este script escanea los manifiestos (`kon.json` con un bloque
 * `schema`) y GENERA `schema-kons.generated.ts`. Cada kon declara su
 * estrategia:
 *   - "drizzle": tablas gestionadas por drizzle-kit → se exportan al agregador.
 *   - "sql":     auto-migra por SQL propio → se EXCLUYE (solo tipos), evitando
 *                colisiones de enums.
 *
 * Seguridad de colisiones: se leen los símbolos exportados de cada schema
 * (vía el indexer determinista de @kitsuden/engine) y, si dos kons exportan el
 * mismo nombre, el segundo se OMITE con un warning — nunca se genera un archivo
 * que no compile.
 *
 * Uso:  bun run apps/api/scripts/sync-kon-schema.ts
 *       (o `kitsuden sync-schema`)
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Import directo del módulo code-graph (NO desde el index del engine, que
// arrastraría repo()→apps/api/db y exigiría DATABASE_URL en un script offline).
import { indexFiles } from "../../../packages/engine/src/code-graph/indexer";

// `import.meta.dir` es de Bun y en Node vale undefined. El agregado lo vigila
// un test de vitest, que corre en Node: con el bunismo, la ruta salía de un
// join(undefined, "..") y el test no podía ni arrancar. fileURLToPath vale en
// los dos entornos.
const SCRIPT_FILE = fileURLToPath(import.meta.url);
const API_DIR = join(dirname(SCRIPT_FILE), "..");
const ROOT = join(API_DIR, "..", "..");
export const GENERATED = join(API_DIR, "src", "db", "schema-kons.generated.ts");

interface SchemaSource {
  konId: string;
  /** Ruta absoluta al archivo de schema. */
  file: string;
  strategy: "drizzle" | "sql";
  /**
   * Si true, los símbolos de este kon GANAN sobre los de schema-core cuando
   * colisionan (se emiten igual; en el agregador el `export {}` explícito
   * sobreescribe al `export *` de schema-core — misma mecánica del archivo
   * manual). Úsalo cuando la tabla canónica vive en el kon, no en el core
   * (p.ej. `media`: schema-core tiene una definición legacy duplicada).
   */
  authoritative: boolean;
}

/**
 * Solo `packages/core`. Desde la fase C los kons no son parte del núcleo: se
 * instalan (kitsuden-kons) y crean sus tablas con SUS migraciones SQL, así que
 * no entran en el agregado que lee drizzle-kit. Si entraran, el fichero
 * versionado cambiaría según qué kons tenga instalados cada uno.
 */
function listManifestDirs(): string[] {
  const dirs: string[] = [];
  for (const tier of ["core"]) {
    const base = join(ROOT, "packages", tier);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = join(base, entry.name, "kon.json");
      if (existsSync(manifest)) dirs.push(join(base, entry.name));
    }
  }
  return dirs.sort();
}

function discover(): SchemaSource[] {
  const out: SchemaSource[] = [];
  for (const dir of listManifestDirs()) {
    let manifest: any;
    try {
      manifest = JSON.parse(readFileSync(join(dir, "kon.json"), "utf8"));
    } catch {
      continue;
    }
    const schema = manifest.schema;
    if (!schema || !schema.entry) continue;
    if (schema.strategy !== "drizzle") continue; // "sql"/ausente → types-only, no drizzle-kit
    const file = join(dir, schema.entry);
    if (!existsSync(file)) {
      console.warn(`⚠️  ${manifest.id}: schema.entry no existe: ${schema.entry}`);
      continue;
    }
    out.push({
      konId: manifest.id ?? relative(ROOT, dir),
      file,
      strategy: "drizzle",
      authoritative: schema.authoritative === true,
    });
  }
  return out;
}

/** Nombres de símbolos exportados por schema-core (reservados). */
async function coreExportNames(): Promise<Set<string>> {
  const coreFile = join(API_DIR, "src", "db", "schema-core.ts");
  const content = readFileSync(coreFile, "utf8");
  const graph = await indexFiles([{ path: "schema-core.ts", content }]);
  return new Set(graph.symbols.filter((s) => s.exported).map((s) => s.name));
}

/** Convierte una ruta absoluta a un import relativo desde src/db/. */
function toImportPath(file: string): string {
  const rel = relative(join(API_DIR, "src", "db"), file).replace(/\\/g, "/");
  return (rel.startsWith(".") ? rel : `./${rel}`).replace(/\.ts$/, "");
}

export interface Agregado {
  /** El contenido completo del fichero, tal cual debe quedar en disco. */
  contenido: string;
  /** Kons con strategy "drizzle" encontrados. */
  fuentes: number;
  /** Kons que aportaron al menos un símbolo. */
  bloques: number;
  /** Símbolos omitidos por chocar con core o con otro kon. */
  colisiones: string[];
}

/**
 * Construye el agregado SIN escribirlo.
 *
 * Separada de `main` para que se pueda comprobar. El fichero generado está
 * versionado, y lo que lo mantiene honesto es un test que lo regenera aquí y
 * compara — si escribiera en disco, ese test "arreglaría" la deriva en vez de
 * denunciarla.
 */
export async function generarAgregado(): Promise<Agregado> {
  // Los kons autoritativos se procesan PRIMERO para que su símbolo gane el
  // slot antes que un kon no-autoritativo con el mismo nombre.
  const sources = discover().sort((a, b) => Number(b.authoritative) - Number(a.authoritative));
  const coreNames = await coreExportNames(); // símbolos de schema-core (export *)
  const konClaimed = new Set<string>(); // símbolos ya emitidos por un kon
  const blocks: string[] = [];
  const collisions: string[] = [];

  for (const src of sources) {
    const content = readFileSync(src.file, "utf8");
    const graph = await indexFiles([{ path: src.file, content }]);
    // Separar TIPOS de VALORES: con `isolatedModules`, re-exportar un tipo
    // requiere `export type { ... }` — mezclarlos rompe el typecheck de todos
    // los paquetes que importan el agregado.
    const exported = graph.symbols
      .filter((s) => s.exported)
      .sort((a, b) => a.name.localeCompare(b.name));

    const keepValues: string[] = [];
    const keepTypes: string[] = [];
    for (const sym of exported) {
      const name = sym.name;
      // Otro kon ya lo exporta explícitamente → dos `export {}` = error TS.
      if (konClaimed.has(name)) {
        collisions.push(`${src.konId}: '${name}' ya exportado por otro kon → omitido`);
        continue;
      }
      // Colisiona con schema-core: solo un kon AUTORITATIVO puede ganarle
      // (el `export {}` explícito sobreescribe al `export *` de core).
      if (coreNames.has(name) && !src.authoritative) {
        collisions.push(`${src.konId}: '${name}' definido en schema-core → core gana`);
        continue;
      }
      konClaimed.add(name);
      if (sym.kind === "interface" || sym.kind === "type") keepTypes.push(name);
      else keepValues.push(name);
    }
    if (keepValues.length === 0 && keepTypes.length === 0) continue;

    const importPath = toImportPath(src.file);
    const parts: string[] = [`// ── ${src.konId} ──`];
    if (keepValues.length) {
      parts.push(`export {\n  ${keepValues.join(",\n  ")},\n} from "${importPath}";`);
    }
    if (keepTypes.length) {
      parts.push(`export type {\n  ${keepTypes.join(",\n  ")},\n} from "${importPath}";`);
    }
    blocks.push(parts.join("\n"));
  }

  const header = `/**
 * Kitsuden — Schema AGREGADO (AUTO-GENERADO)
 * ============================================================================
 * ⚠️ NO EDITAR A MANO. Regenerar con:  kitsuden sync-schema
 *
 * Fuente: bloque \`schema\` de cada kon.json con strategy "drizzle".
 * Los kons con strategy "sql" (auto-migración propia) se excluyen a
 * propósito para evitar colisiones de enums globales de Postgres.
 *
 * Reexporta schema-core primero; los \`export {}\` explícitos de un kon
 * AUTORITATIVO sobreescriben al \`export *\` de core (regla de TS
 * explícito-gana-estrella), resolviendo colisiones sin ambigüedad.
 */

// Core primero: los kons autoritativos (p.ej. media) sobreescriben sus
// símbolos vía export explícito más abajo.
export * from "./schema-core";
`;

  const body = blocks.length
    ? blocks.join("\n\n")
    : "// (sin kons drizzle-managed; todos usan migraciones SQL propias)";

  return {
    contenido: `${header}\n${body}\n`,
    fuentes: sources.length,
    bloques: blocks.length,
    colisiones: collisions,
  };
}

async function main(): Promise<void> {
  const { contenido, fuentes, bloques, colisiones } = await generarAgregado();

  writeFileSync(GENERATED, contenido);

  console.log(`✅ ${relative(ROOT, GENERATED)}`);
  console.log(`   ${fuentes} kons drizzle · ${bloques} con exports`);
  if (colisiones.length) {
    console.log(`   ⚠️  ${colisiones.length} colisiones omitidas:`);
    for (const c of colisiones) console.log(`      ${c}`);
  }
}

// Solo al ejecutarlo como script. Antes `main()` corría al importar el módulo,
// así que el test que lo comprueba habría REESCRITO el fichero nada más
// cargarlo — y habría pasado siempre, comparando el fichero consigo mismo.
const ejecutadoDirectamente =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(SCRIPT_FILE);

if (ejecutadoDirectamente) {
  main().catch((err) => {
    console.error("❌ sync-kon-schema falló:", err);
    process.exit(1);
  });
}
