/**
 * kitsuden make model <name> · kitsuden makemigrations — defineModelo (fase H3)
 * ============================================================================
 *
 *   kitsuden make model note --kon notas    → packages/kons/kon-notas/src/note.modelo.ts
 *   kitsuden make model note --dir apps/api/src/modelos
 *
 *   kitsuden makemigrations                 → por cada kon con modelos (`*.modelo.ts`
 *                                             o `modelos.ts`), compara con
 *                                             migrations/modelos.snapshot.json y
 *                                             escribe migrations/NNNN_<name>.sql
 *   kitsuden makemigrations --kon notas     → solo ese kon
 *   kitsuden makemigrations --dir <carpeta> → una carpeta cualquiera (la app, un fixture)
 *   --dry-run                               → enseña el SQL, no escribe
 *   --allow-destructive                     → emite los DROP (por defecto, comentados)
 *
 * ── NUNCA EJECUTA NADA CONTRA UNA BASE ─────────────────────────────────────
 *
 * Genera texto. Lo aplica el runner de migraciones de siempre, con la conexión
 * de DDL, cuando alguien lo decide. No lee `DATABASE_URL`.
 *
 * ── POR QUÉ BUN ────────────────────────────────────────────────────────────
 *
 * Los modelos son TypeScript que importa `@kitsuden/shared`. El CLI corre en
 * Node compilado; para cargarlos sin un paso de build se lanza `bun` con un
 * script de un solo uso DENTRO de la carpeta del modelo (así `@kitsuden/shared`
 * se resuelve igual que lo resuelve el propio modelo) y se borra al acabar.
 * El diff es `generarMigracionDeModelos` de @kitsuden/shared: el mismo código
 * que prueban los tests, no una copia.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import chalk from "chalk";

import { encontrarRaizDelRepo } from "./make-kon.js";

// ── Lo que se lee del modelo (forma de @kitsuden/shared, sin importarlo) ───

interface Instantanea {
  version: number;
  modelos: Record<string, unknown>;
}

interface ResultadoDelRunner {
  sql: string;
  instantanea: Instantanea;
  cambios: string[];
  avisos: string[];
  cabecera: string;
  modelos: string[];
}

export interface DestinoDeModelos {
  /** Carpeta con los modelos (un kon, la app, un fixture). */
  dir: string;
  /** Nombre corto del kon para la RLS (`notas`), o `app`. */
  kon: string;
  /** Ficheros de modelos encontrados. */
  ficheros: string[];
  migraciones: string;
}

export interface ResultadoDeMakemigrations {
  destino: DestinoDeModelos;
  modelos: string[];
  cambios: string[];
  avisos: string[];
  /** Fichero escrito (o el que se escribiría con --dry-run); null si no hay cambios. */
  fichero: string | null;
  sql: string;
}

export interface OpcionesDeMakemigrations {
  kon?: string;
  dir?: string;
  name?: string;
  dryRun?: boolean;
  allowDestructive?: boolean;
  root?: string;
  /** Ejecutable de bun (pruebas). */
  bun?: string;
}

const INSTANTANEA = "modelos.snapshot.json";
const IGNORAR = new Set(["node_modules", "dist", "migrations", ".git", "build"]);

/** `*.modelo.ts` y `modelos.ts` bajo `dir` (sin node_modules, dist, migrations). */
export function ficherosDeModelos(dir: string): string[] {
  const salida: string[] = [];
  const recorrer = (d: string, profundidad: number) => {
    if (profundidad > 6) return;
    for (const nombre of readdirSync(d)) {
      if (IGNORAR.has(nombre) || nombre.startsWith("__")) continue;
      const ruta = join(d, nombre);
      const st = statSync(ruta);
      if (st.isDirectory()) recorrer(ruta, profundidad + 1);
      else if (nombre.endsWith(".modelo.ts") || nombre === "modelos.ts") salida.push(ruta);
    }
  };
  if (existsSync(dir)) recorrer(dir, 0);
  return salida.sort();
}

function konCortoDe(dir: string): string {
  const manifiesto = join(dir, "kon.json");
  if (existsSync(manifiesto)) {
    const id = (JSON.parse(readFileSync(manifiesto, "utf8")) as { id?: string }).id;
    if (id) return id.replace(/^kon-/, "");
  }
  return "app";
}

export function destinosDeModelos(o: OpcionesDeMakemigrations): DestinoDeModelos[] {
  if (o.dir) {
    const dir = resolve(o.dir);
    if (!existsSync(dir)) throw new Error(`${o.dir} does not exist`);
    return [{ dir, kon: konCortoDe(dir), ficheros: ficherosDeModelos(dir), migraciones: join(dir, "migrations") }];
  }
  const raiz = o.root ? resolve(o.root) : encontrarRaizDelRepo(process.cwd());
  if (!raiz) throw new Error("Not inside a Kitsuden monorepo. Pass --dir <folder with models> or --root <repo>.");
  const kons = join(raiz, "packages", "kons");
  const lista: DestinoDeModelos[] = [];
  for (const nombre of existsSync(kons) ? readdirSync(kons).sort() : []) {
    if (!nombre.startsWith("kon-")) continue;
    if (o.kon && nombre !== `kon-${o.kon.replace(/^kon-/, "")}`) continue;
    const dir = join(kons, nombre);
    const ficheros = ficherosDeModelos(dir);
    if (ficheros.length === 0) continue;
    lista.push({ dir, kon: konCortoDe(dir), ficheros, migraciones: join(dir, "migrations") });
  }
  if (o.kon && lista.length === 0) {
    throw new Error(`kon-${o.kon.replace(/^kon-/, "")} has no models (*.modelo.ts or modelos.ts)`);
  }
  return lista;
}

/** El siguiente `NNNN` de la carpeta de migraciones. */
export function siguienteNumero(migraciones: string): string {
  let max = -1;
  if (existsSync(migraciones)) {
    for (const f of readdirSync(migraciones)) {
      const m = /^(\d{4})_.*\.sql$/.exec(f);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return String(max + 1).padStart(4, "0");
}

const MARCA = "@@KITSUDEN_MODELOS@@";

const RUNNER = `// Generated by kitsuden makemigrations; deleted when it finishes.
import { pathToFileURL } from "node:url";
import * as shared from "@kitsuden/shared";
const args = JSON.parse(process.env.KITSUDEN_MAKEMIGRATIONS_ARGS ?? "{}");
if (typeof shared.generarMigracionDeModelos !== "function") {
  throw new Error("@kitsuden/shared has no generarMigracionDeModelos: rebuild it (pnpm --filter @kitsuden/shared build)");
}
const modelos = [];
for (const fichero of args.ficheros) {
  const mod = await import(pathToFileURL(fichero).href);
  for (const valor of Object.values(mod)) {
    if (shared.esModelo(valor) && !modelos.includes(valor)) modelos.push(valor);
  }
}
const r = shared.generarMigracionDeModelos(args.anterior, modelos, {
  kon: args.kon,
  permitirDestructivo: args.destructivo === true,
});
const cabecera = shared.cabeceraDeMigracion(r.cambios, r.avisos);
console.log("${MARCA}" + JSON.stringify({ ...r, cabecera, modelos: modelos.map((m) => m.nombre) }));
`;

/** Carga los modelos con bun y devuelve la migración calculada por @kitsuden/shared. */
function ejecutarRunner(d: DestinoDeModelos, anterior: Instantanea | null, o: OpcionesDeMakemigrations): ResultadoDelRunner {
  const runner = join(d.dir, `__kitsuden_makemigrations_${process.pid}.ts`);
  writeFileSync(runner, RUNNER, "utf8");
  try {
    const r = spawnSync(o.bun ?? "bun", ["run", runner], {
      cwd: d.dir,
      encoding: "utf8",
      env: {
        ...process.env,
        KITSUDEN_MAKEMIGRATIONS_ARGS: JSON.stringify({
          ficheros: d.ficheros,
          anterior,
          kon: d.kon,
          destructivo: o.allowDestructive === true,
        }),
      },
      shell: process.platform === "win32",
      maxBuffer: 32 * 1024 * 1024,
    });
    if (r.error) throw new Error(`could not run bun (${r.error.message}). Install bun: https://bun.sh`);
    const salida = r.stdout ?? "";
    const linea = salida.split(/\r?\n/).find((l) => l.startsWith(MARCA));
    if (r.status !== 0 || !linea) {
      throw new Error(`loading the models failed:\n${(r.stderr || salida).trim()}`);
    }
    return JSON.parse(linea.slice(MARCA.length)) as ResultadoDelRunner;
  } finally {
    rmSync(runner, { force: true });
  }
}

/** Genera (y escribe, salvo `dryRun`) la migración de cada destino. */
export async function generarMigracionesDeModelos(o: OpcionesDeMakemigrations): Promise<ResultadoDeMakemigrations[]> {
  const resultados: ResultadoDeMakemigrations[] = [];
  const nombre = (o.name ?? "models").replace(/[^a-z0-9_]+/gi, "_").toLowerCase() || "models";
  for (const d of destinosDeModelos(o)) {
    if (d.ficheros.length === 0) throw new Error(`${d.dir} has no models (*.modelo.ts or modelos.ts)`);
    const rutaInstantanea = join(d.migraciones, INSTANTANEA);
    const anterior = existsSync(rutaInstantanea)
      ? (JSON.parse(readFileSync(rutaInstantanea, "utf8")) as Instantanea)
      : null;
    const r = ejecutarRunner(d, anterior, o);
    if (!r.sql) {
      resultados.push({ destino: d, modelos: r.modelos, cambios: [], avisos: r.avisos, fichero: null, sql: "" });
      continue;
    }
    const fichero = join(d.migraciones, `${siguienteNumero(d.migraciones)}_${nombre}.sql`);
    const sql = `${r.cabecera}${r.sql}\n`;
    if (!o.dryRun) {
      await mkdir(d.migraciones, { recursive: true });
      await writeFile(fichero, sql, "utf8");
      await writeFile(rutaInstantanea, `${JSON.stringify(r.instantanea, null, 2)}\n`, "utf8");
    }
    resultados.push({ destino: d, modelos: r.modelos, cambios: r.cambios, avisos: r.avisos, fichero, sql });
  }
  return resultados;
}

/** `kitsuden makemigrations` (modelos). */
export async function makemigrationsDeModelos(o: OpcionesDeMakemigrations): Promise<number> {
  const resultados = await generarMigracionesDeModelos(o);
  if (resultados.length === 0) {
    console.log(chalk.gray("No models found (*.modelo.ts or modelos.ts in packages/kons/kon-*/). Nothing to do."));
    return 0;
  }
  let escritos = 0;
  for (const r of resultados) {
    const donde = relative(process.cwd(), r.destino.dir) || ".";
    if (!r.fichero) {
      console.log(chalk.gray(`  ${donde}: no changes (${r.modelos.join(", ")})`));
      continue;
    }
    escritos++;
    console.log(chalk.yellow(`  ${donde}:`) + ` ${r.cambios.length} change(s)`);
    for (const c of r.cambios) console.log(`    · ${c}`);
    for (const a of r.avisos) console.log(chalk.red(`    ! ${a}`));
    if (o.dryRun) {
      console.log(chalk.cyan(`\n-- ${relative(process.cwd(), r.fichero)} (dry run)\n`) + r.sql);
    } else {
      console.log(chalk.green(`    ✓ ${relative(process.cwd(), r.fichero)}`));
    }
  }
  if (escritos && !o.dryRun) {
    console.log(chalk.gray("\nReview the SQL, then apply it with the migration runner (it never runs by itself)."));
  }
  return escritos;
}

// ── make model ──────────────────────────────────────────────────────────────

export interface OpcionesDeMakeModel {
  kon?: string;
  dir?: string;
  root?: string;
  force?: boolean;
}

const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function aKebab(s: string): string {
  return s
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function aCamel(s: string): string {
  return s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function plantillaDeModelo(nombre: string): string {
  const variable = aCamel(nombre);
  return `/**
 * Model '${nombre}' — declared ONCE (docs/agents/models.md).
 *
 * From this declaration Kitsuden derives the table, the migration
 * (\`kitsuden makemigrations\`), REST + OpenAPI + MCP operations, validation,
 * RLS by the access policy, the agent scopes ${nombre}:read / ${nombre}:write and
 * the admin panel view. Register it in the kon: defineKonDeModelos({ modelos: [${variable}] }).
 */
import { campo, defineModelo } from "@kitsuden/shared";

export const ${variable} = defineModelo({
  nombre: "${nombre}",
  descripcion: "TODO: what one ${nombre} is, for humans and agents",
  campos: {
    title: campo.texto({ max: 200, requerido: true, etiqueta: "Title" }),
    notes: campo.textoLargo({ etiqueta: "Notes" }),
  },
  // REQUIRED. Who reads: "publico" | "dueno" | "staff". Who writes: "dueno" | "staff".
  // Agents never write without the ${nombre}:write scope.
  acceso: { leer: "dueno", escribir: "dueno" },
});
`;
}

export async function makeModel(nombreCrudo: string, o: OpcionesDeMakeModel): Promise<string[]> {
  const nombre = aKebab(nombreCrudo);
  if (!SLUG.test(nombre)) throw new Error(`'${nombreCrudo}' is not a valid model name (kebab-case singular, e.g. note, task-item)`);
  let carpeta: string;
  if (o.dir) carpeta = resolve(o.dir);
  else if (o.kon) {
    const raiz = o.root ? resolve(o.root) : encontrarRaizDelRepo(process.cwd());
    if (!raiz) throw new Error("Not inside a Kitsuden monorepo. Pass --root <repo> or --dir <folder>.");
    const corto = aKebab(o.kon).replace(/^kon-/, "");
    const dirKon = join(raiz, "packages", "kons", `kon-${corto}`);
    if (!existsSync(join(dirKon, "kon.json"))) {
      throw new Error(`packages/kons/kon-${corto} does not exist. Create it first: kitsuden make kon ${corto}`);
    }
    carpeta = join(dirKon, "src");
  } else {
    throw new Error("Say where the model lives: --kon <name> or --dir <folder> (e.g. apps/api/src/modelos)");
  }
  const fichero = join(carpeta, `${nombre}.modelo.ts`);
  if (existsSync(fichero) && !o.force) throw new Error(`Already exists: ${fichero} (use --force to overwrite)`);
  await mkdir(carpeta, { recursive: true });
  await writeFile(fichero, plantillaDeModelo(nombre), "utf8");
  return [
    `created ${fichero}`,
    `register it: defineKonDeModelos({ id, name, version, modelos: [${aCamel(nombre)}] }) from @kitsuden/engine`,
    `then: kitsuden makemigrations${o.kon ? ` --kon ${aKebab(o.kon).replace(/^kon-/, "")}` : ` --dir ${relative(process.cwd(), carpeta) || "."}`}`,
  ];
}

