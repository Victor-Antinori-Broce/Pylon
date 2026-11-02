/**
 * `kitsuden kon add|remove|list` — instalar kons en un proyecto Kitsuden
 * ============================================================================
 *
 *   kitsuden kon add blog                      ← de ../kitsuden-kons o del repo oficial
 *   kitsuden kon add wiki --from ../kitsuden-kons
 *   kitsuden kon add shop --from https://github.com/acme/kons.git --ref v1.2.0
 *   kitsuden kon add blog --link               ← sin copiar (desarrollar el kon)
 *   kitsuden kon remove blog                   ← deja las tablas y los datos
 *   kitsuden kon list [--available] [--json]
 *
 * La lógica vive en `../kons/instalacion.ts` (sin procesos, probada aparte).
 * Aquí se añade lo que sí lanza procesos: clonar el origen de git, `pnpm
 * install` y el runner normal de migraciones (`apps/api/scripts/migrate.ts
 * --kon <id>`), que es el mismo que corre el contenedor al arrancar.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

import chalk from "chalk";

import {
  ErrorDeKon,
  ORIGEN_POR_DEFECTO,
  encontrarRaiz,
  esUrlDeGit,
  estadoDeLaInstalacion,
  instalarKons,
  konsDelOrigen,
  nombreCorto,
  quitarKons,
  sdkDelCodigo,
  type KonInstaladoAhora,
} from "../kons/instalacion.js";
import { hayRegistroConfigurado } from "../registro/cliente.js";
import { konAddDesdeRegistro, quitarDelBloqueo, type OpcionesDeRegistro } from "./kon-registro.js";

export interface KonCommandOptions {
  from?: string;
  ref?: string;
  link?: boolean;
  enable?: boolean;
  force?: boolean;
  install?: boolean; // --no-install → false
  migrate?: boolean; // --no-migrate → false
  keepFiles?: boolean;
  available?: boolean;
  json?: boolean;
  root?: string;
  apiUrl?: string;
}

export function raizDe(opciones: KonCommandOptions): string {
  const raiz = opciones.root ? resolve(opciones.root) : encontrarRaiz(process.cwd());
  if (!raiz || !existsSync(join(raiz, "packages", "kons"))) {
    throw new ErrorDeKon(
      "Not inside a Kitsuden project (no pnpm-workspace.yaml + packages/kons found). " +
        "Run it from the project, or pass --root <dir>."
    );
  }
  return raiz;
}

/**
 * La versión del SDK de kons de este núcleo: la que publica la API en marcha
 * (`GET /api/version` → `sdk.kons`) y, si no responde, la del código.
 */
export async function sdkDelNucleo(
  raiz: string,
  apiUrl?: string
): Promise<{ sdk: number; desde: string; version?: string }> {
  const url = (apiUrl || process.env.KITSUDEN_API_URL || "").replace(/\/+$/, "");
  if (url) {
    try {
      const r = await fetch(`${url}/api/version`, { signal: AbortSignal.timeout(2500) });
      if (r.ok) {
        const json = (await r.json()) as { producto?: string; version?: unknown; sdk?: { kons?: unknown } };
        if (json.producto === "kitsuden" && typeof json.sdk?.kons === "number") {
          return {
            sdk: json.sdk.kons,
            desde: `${url}/api/version`,
            ...(typeof json.version === "string" ? { version: json.version } : {}),
          };
        }
      }
    } catch {
      // API apagada o inaccesible: se usa el código
    }
  }
  const delCodigo = sdkDelCodigo(raiz);
  if (delCodigo === null) {
    throw new ErrorDeKon(
      "Could not find this Kitsuden's kon SDK version (packages/shared/src/operaciones.ts). " +
        "Pass --api-url of a running API, or reinstall Kitsuden."
    );
  }
  return { sdk: delCodigo, desde: "packages/shared (source)" };
}

/** El origen pedido, o `KITSUDEN_KONS_SOURCE`, o `../kitsuden-kons`, o el repo oficial. */
function origenPedido(raiz: string, opciones: KonCommandOptions): string {
  if (opciones.from) return opciones.from;
  if (process.env.KITSUDEN_KONS_SOURCE) return process.env.KITSUDEN_KONS_SOURCE;
  const hermano = resolve(raiz, "..", "kitsuden-kons");
  if (existsSync(join(hermano, "kons"))) return hermano;
  return ORIGEN_POR_DEFECTO;
}

/** Deja el origen en una carpeta local: si es git, lo clona (en .kitsuden/kons-cache). */
function prepararOrigen(raiz: string, origen: string, ref?: string): { local: string; declarado: string } {
  if (!esUrlDeGit(origen)) {
    const local = resolve(process.cwd(), origen);
    if (!existsSync(local)) throw new ErrorDeKon(`Source not found: ${local}`);
    return { local, declarado: origen };
  }
  const url = origen.replace(/^github:/, "https://github.com/").replace(/(#.*)$/, "");
  const refDeUrl = origen.match(/#(.+)$/)?.[1];
  const rama = ref ?? refDeUrl;
  const cache = join(
    raiz,
    ".kitsuden",
    "kons-cache",
    createHash("sha256").update(`${url}#${rama ?? ""}`).digest("hex").slice(0, 16)
  );
  mkdirSync(join(raiz, ".kitsuden", "kons-cache"), { recursive: true });
  if (existsSync(join(cache, ".git"))) {
    const r = spawnSync("git", ["-C", cache, "pull", "--ff-only", "--depth", "1"], { stdio: "inherit" });
    if (r.status !== 0) console.warn(chalk.yellow(`  ! git pull failed; using the cached copy of ${url}`));
  } else {
    const args = ["clone", "--depth", "1", ...(rama ? ["--branch", rama] : []), url, cache];
    const r = spawnSync("git", args, { stdio: "inherit" });
    if (r.status !== 0) throw new ErrorDeKon(`git clone ${url} failed.`);
  }
  return { local: cache, declarado: rama ? `${url}#${rama}` : url };
}

function ejecutar(orden: string, args: string[], cwd: string): number {
  const r = spawnSync(orden, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  return r.status ?? 1;
}

export function fallar(e: unknown): never {
  console.error(chalk.red(`✖ ${(e as Error).message}`));
  process.exit(1);
}

// ── add ─────────────────────────────────────────────────────────────────────

export async function konAddCommand(nombres: string[], opciones: KonCommandOptions): Promise<void> {
  // A registry install: `kon add blog@^2`, --registry, or a configured registry
  // (kitsuden.registries.json / KITSUDEN_KON_REGISTRY) and no --from/--link.
  if (!opciones.from && !opciones.link) {
    let raizDelRegistro: string | null = null;
    try {
      raizDelRegistro = raizDe(opciones);
    } catch (e) {
      fallar(e);
    }
    const pideVersion = nombres.some((n) => n.lastIndexOf("@") > 0);
    if ((opciones as { registry?: string }).registry || pideVersion || hayRegistroConfigurado(raizDelRegistro)) {
      return konAddDesdeRegistro(nombres, opciones as KonCommandOptions & OpcionesDeRegistro);
    }
  }
  let raiz: string;
  let hechos: KonInstaladoAhora[];
  try {
    raiz = raizDe(opciones);
    const { sdk, desde } = await sdkDelNucleo(raiz, opciones.apiUrl);
    const { local, declarado } = prepararOrigen(raiz, origenPedido(raiz, opciones), opciones.ref);
    hechos = instalarKons(nombres, {
      raiz,
      origen: local,
      origenDeclarado: declarado,
      link: opciones.link,
      enable: opciones.enable,
      force: opciones.force,
      sdkDelNucleo: sdk,
    });
    console.log(chalk.gray(`  kon SDK of this Kitsuden: v${sdk} (${desde})`));
  } catch (e) {
    fallar(e);
  }

  for (const k of hechos) {
    const dep = k.comoDependencia ? chalk.gray(" (dependency)") : "";
    const donde = k.modo === "link" ? `linked from ${k.dir}` : `packages/kons/${k.id}`;
    console.log(chalk.green(`✔ ${k.id}${k.version ? `@${k.version}` : ""}`) + dep + chalk.gray(` → ${donde}`));
  }

  pasosTrasInstalar(raiz, hechos, opciones);
}

/**
 * pnpm install + the normal migration runner (`--kon <id>`), for a source or a
 * registry install alike: a registry kon's migrations go through the same
 * runner and the same DDL role as any other.
 */
export function pasosTrasInstalar(raiz: string, hechos: KonInstaladoAhora[], opciones: KonCommandOptions): void {
  // pnpm install: la copia es un paquete del workspace y sus dependencias
  // propias (las de terceros) tienen que estar.
  if (opciones.install !== false && hechos.some((k) => k.modo === "copy")) {
    console.log(chalk.cyan("\n→ pnpm install"));
    if (ejecutar("pnpm", ["install"], raiz) !== 0) {
      console.error(chalk.red("✖ pnpm install failed. The kon is declared; fix the error and run `pnpm install`."));
      process.exit(1);
    }
  }

  // El runner normal, con --kon: aplica las migraciones de lo instalado aunque
  // todavía no esté activo en la base (y las de todo lo activo, como siempre).
  if (opciones.migrate !== false) {
    const runner = join(raiz, "apps", "api", "scripts", "migrate.ts");
    if (!existsSync(runner)) {
      console.warn(chalk.yellow("! apps/api/scripts/migrate.ts not found: migrations not applied."));
    } else {
      const args = ["run", "scripts/migrate.ts", ...hechos.flatMap((k) => ["--kon", k.id])];
      console.log(chalk.cyan(`\n→ bun ${args.join(" ")}  (apps/api)`));
      if (ejecutar("bun", args, join(raiz, "apps", "api")) !== 0) {
        console.error(
          chalk.red(
            `✖ Migrations failed. The kon is installed; run them again with:\n` +
              `    cd apps/api && bun run scripts/migrate.ts ${hechos.map((k) => `--kon ${k.id}`).join(" ")}`
          )
        );
        process.exit(2);
      }
    }
  }

  console.log(`
${chalk.bold("Next steps")}
  · Restart the API so it mounts the new kon(s).
  · Kons that are not on by default are activated in the admin panel (Kons),
    or installed with --enable.`);
}

// ── remove ──────────────────────────────────────────────────────────────────

export async function konRemoveCommand(nombres: string[], opciones: KonCommandOptions): Promise<void> {
  let raiz: string;
  let quitados: string[];
  try {
    raiz = raizDe(opciones);
    quitados = quitarKons(nombres, { raiz, force: opciones.force, keepFiles: opciones.keepFiles });
  } catch (e) {
    fallar(e);
  }
  for (const id of quitados) console.log(chalk.green(`✔ removed ${id}`));
  quitarDelBloqueo(raiz, quitados);
  if (opciones.install !== false) {
    console.log(chalk.cyan("\n→ pnpm install"));
    ejecutar("pnpm", ["install"], raiz);
  }
  console.log(`
${chalk.bold("Note")}
  · Its tables and data are kept in the database (nothing is dropped).
  · Restart the API. If the kon is still active in the panel, the API logs it
    as "active but not installed" and does not mount it.`);
}

// ── list ────────────────────────────────────────────────────────────────────

export async function konListCommand(opciones: KonCommandOptions): Promise<void> {
  let raiz: string;
  try {
    raiz = raizDe(opciones);
  } catch (e) {
    fallar(e);
  }

  if (opciones.available) {
    let local: string;
    try {
      ({ local } = prepararOrigen(raiz, origenPedido(raiz, opciones), opciones.ref));
    } catch (e) {
      fallar(e);
    }
    const kons = konsDelOrigen(local).map((k) => ({
      id: k.id,
      version: k.manifiesto.version,
      sdk: k.manifiesto.sdk ?? null,
      maturity: k.manifiesto.madurez ?? null,
      description: k.manifiesto.description ?? "",
    }));
    if (opciones.json) {
      console.log(JSON.stringify(kons, null, 2));
      return;
    }
    for (const k of kons) {
      console.log(
        `${chalk.bold(nombreCorto(k.id).padEnd(20))} ${String(k.maturity ?? "-").padEnd(13)} ${chalk.gray(k.description.slice(0, 70))}`
      );
    }
    return;
  }

  const sdk = sdkDelCodigo(raiz);
  const estado = estadoDeLaInstalacion(raiz, sdk);
  if (opciones.json) {
    console.log(JSON.stringify({ sdk, kons: estado }, null, 2));
    return;
  }
  for (const k of estado) {
    const color = k.estado === "ok" ? chalk.green : chalk.red;
    const modo = k.origen === "core" ? "core" : k.mode;
    console.log(
      `${color(k.estado.padEnd(17))} ${chalk.bold(k.id.padEnd(24))} ${String(k.version ?? "").padEnd(12)} ${String(modo).padEnd(5)} ${chalk.gray(k.path ?? k.detalle ?? "")}`
    );
    if (k.estado !== "ok" && k.detalle) console.log(chalk.gray(`${" ".repeat(18)}${k.detalle}`));
  }
}
