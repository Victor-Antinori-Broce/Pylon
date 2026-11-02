/**
 * kitsuden new <name> — proyecto de FRONTEND a partir del starter neutro
 * ============================================================================
 *
 * Crea una web Astro que lee de una API de Kitsuden que ya está en marcha.
 * NO crea ni arranca la API.
 *
 * ── POR QUÉ SOLO EL FRONTEND ───────────────────────────────────────────────
 *
 * La versión anterior de este comando prometía un proyecto completo y no
 * funcionaba: no estaba registrada en `index.ts`, usaba `__dirname` en ESM,
 * copiaba el starter entero (node_modules y dist incluidos) y ejecutaba
 * `db:push` en un `apps/api` que el starter no tiene.
 *
 * La API de Kitsuden no se puede montar desde aquí con honestidad: a
 * 2026-10-18 no hay imágenes publicadas en ningún registro (Docker Hub
 * responde 404 a `kitsuden/api` y a `gremius/api`, las dos que aparecen en el
 * repositorio), así que un docker-compose generado apuntaría a imágenes que
 * no existen. `--api` lo explica y manda a `docs/instalacion/`. Desde
 * 2026-10-29 el workflow `docker-publish.yml` publica en
 * `ghcr.io/<dueño>/kitsuden/{api,admin,mcp}` al crear una etiqueta `v*`;
 * hasta que salga la primera, esto sigue igual.
 *
 * ── QUÉ HACE ───────────────────────────────────────────────────────────────
 *
 *   1. copia `kitsuden-starter-basic` sin node_modules, dist, .astro ni .env
 *      (filtro en utils/copiar-starter.ts);
 *   2. renombra el paquete y le quita lo que era del monorepo (repository,
 *      author, license);
 *   3. escribe `.env` desde `.env.example` con KITSUDEN_API_URL, SITE_URL y
 *      SITE_NAME;
 *   4. con `--install` (o `--quickstart`), ejecuta `pnpm install`;
 *   5. imprime los siguientes pasos.
 *
 * Sin TTY (CI, tuberías) no pregunta nada: usa las opciones o los valores por
 * defecto.
 */

import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

import chalk from "chalk";
import { execa } from "execa";
import inquirer from "inquirer";

import { copiarStarter, encontrarStarter } from "../utils/copiar-starter.js";

export interface NewOptions {
  apiUrl?: string;
  siteUrl?: string;
  siteName?: string;
  from?: string;
  install?: boolean;
  quickstart?: boolean;
  yes?: boolean;
  api?: boolean;
}

export const API_URL_POR_DEFECTO = "http://localhost:3000";
export const SITE_URL_POR_DEFECTO = "http://localhost:4321";

/** El mismo que trae el starter (packages/starters/kitsuden-starter-basic/.gitignore). */
const GITIGNORE_POR_DEFECTO = `# Build output and local state of this site
dist/
.astro/
node_modules/
.env
.inti/
.kitsuden/
`;

/** Nombre de paquete npm válido sin scope, derivado del nombre de carpeta. */
export function nombreDePaquete(nombre: string): string {
  return (
    basename(nombre)
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[._-]+/, "")
      .replace(/-+$/, "") || "kitsuden-site"
  );
}

export function esUrlHttp(valor: string): boolean {
  try {
    const u = new URL(valor);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Sustituye el valor de `CLAVE=` en un .env, solo en líneas NO comentadas.
 * Si la clave no está, la añade al final. Exportada para las pruebas.
 */
export function fijarVariable(env: string, clave: string, valor: string): string {
  const linea = new RegExp(`^${clave}=.*$`, "m");
  if (linea.test(env)) return env.replace(linea, () => `${clave}=${valor}`);
  return `${env.replace(/\n?$/, "\n")}${clave}=${valor}\n`;
}

/** Comillas solo si el valor las necesita (espacios, #, comillas). */
function valorEnv(v: string): string {
  return /[\s#"'$]/.test(v) ? JSON.stringify(v) : v;
}

export function textoDeLaApi(): string {
  return [
    chalk.bold("About the Kitsuden API"),
    "",
    "  This project is only the public website. It needs a running Kitsuden API.",
    "  There are no published Kitsuden API images yet, so `kitsuden new` does not",
    "  generate a docker-compose for it. Install the API from the Kitsuden",
    "  repository (https://github.com/Victor-Antinori-Broce/kitsuden) following:",
    "",
    "    docs/instalacion/servidor.md   Docker (recommended)",
    "    docs/instalacion/local.md      local development (Bun + Postgres + Valkey)",
    "    docs/instalacion/primer-arranque.md   migrations and the first admin",
    "",
    "  (Those guides are in Spanish.) Then set KITSUDEN_API_URL in .env to its address.",
  ].join("\n");
}

async function carpetaVacia(dir: string): Promise<boolean> {
  if (!existsSync(dir)) return true;
  return (await readdir(dir)).length === 0;
}

async function preguntar(
  opciones: NewOptions,
  nombre: string
): Promise<{ apiUrl: string; siteUrl: string; siteName: string }> {
  const interactivo = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const sinPreguntas = opciones.yes || opciones.quickstart || !interactivo;

  let apiUrl = opciones.apiUrl;
  if (!apiUrl && !sinPreguntas) {
    const r = await inquirer.prompt([
      {
        type: "input",
        name: "apiUrl",
        message: "URL of your Kitsuden API (as this server will reach it):",
        default: API_URL_POR_DEFECTO,
        validate: (v: string) => esUrlHttp(v) || "Use an http:// or https:// URL",
      },
    ]);
    apiUrl = r.apiUrl as string;
  }
  apiUrl = apiUrl || API_URL_POR_DEFECTO;
  if (!esUrlHttp(apiUrl)) throw new Error(`--api-url is not an http(s) URL: ${apiUrl}`);

  const siteUrl = opciones.siteUrl || SITE_URL_POR_DEFECTO;
  if (!esUrlHttp(siteUrl)) throw new Error(`--site-url is not an http(s) URL: ${siteUrl}`);

  return { apiUrl, siteUrl, siteName: opciones.siteName || nombre };
}

/**
 * El trabajo de verdad, sin `process.exit` ni prompts: lo usan el comando y
 * las pruebas. Devuelve la carpeta creada.
 */
export async function crearProyecto(
  nombre: string,
  valores: { apiUrl: string; siteUrl: string; siteName: string; from?: string; cwd?: string }
): Promise<{ destino: string; origen: string; tipoDeOrigen: string }> {
  const destino = resolve(valores.cwd ?? process.cwd(), nombre);
  if (!(await carpetaVacia(destino))) {
    throw new Error(`${destino} already exists and is not empty`);
  }

  const starter = encontrarStarter(valores.from);
  if (!starter) {
    throw new Error(
      valores.from
        ? `--from ${valores.from} is not a Kitsuden starter (needs package.json, astro.config.mjs and .env.example)`
        : "The Kitsuden starter was not found. Run from the Kitsuden repository, use a CLI " +
            "installed from npm (it bundles the starter), or pass --from <path-to-kitsuden-starter-basic>."
    );
  }

  await copiarStarter(starter.dir, destino);

  // package.json: nombre propio y fuera lo que describía al starter del monorepo.
  const rutaPkg = join(destino, "package.json");
  const pkg = JSON.parse(await readFile(rutaPkg, "utf8")) as Record<string, unknown>;
  pkg.name = nombreDePaquete(nombre);
  pkg.version = "0.1.0";
  pkg.description = `Website built on Kitsuden (from kitsuden-starter-basic)`;
  delete pkg.repository;
  delete pkg.author;
  delete pkg.license;
  await writeFile(rutaPkg, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

  // npm nunca publica un `.gitignore` dentro de un paquete, así que el starter
  // que viaja en el CLI de npm llega sin él. Sin esto, el `.env` de abajo
  // (que puede acabar con KITSUDEN_SITE_KEY) entraría en el primer commit.
  if (!existsSync(join(destino, ".gitignore"))) {
    await writeFile(join(destino, ".gitignore"), GITIGNORE_POR_DEFECTO, "utf8");
  }

  // .env desde .env.example. KITSUDEN_SITE_KEY se queda comentada: es un
  // secreto, y pedirlo como opción lo dejaría en el historial del shell.
  let env = await readFile(join(destino, ".env.example"), "utf8");
  env = fijarVariable(env, "KITSUDEN_API_URL", valorEnv(valores.apiUrl));
  env = fijarVariable(env, "SITE_URL", valorEnv(valores.siteUrl));
  env = fijarVariable(env, "SITE_NAME", valorEnv(valores.siteName));
  await writeFile(join(destino, ".env"), env, "utf8");

  return { destino, origen: starter.dir, tipoDeOrigen: starter.origen };
}

export async function newCommand(nombre: string | undefined, opciones: NewOptions = {}) {
  if (!nombre && opciones.api) {
    apiInfoCommand();
    return;
  }
  if (!nombre) {
    console.error(chalk.red("Missing project name. Example: kitsuden new my-site"));
    process.exit(1);
  }

  try {
    const valores = await preguntar(opciones, basename(nombre));
    const { destino, origen, tipoDeOrigen } = await crearProyecto(nombre, {
      ...valores,
      from: opciones.from,
    });

    console.log(chalk.green(`✔ Created ${destino}`));
    console.log(chalk.gray(`  starter: ${origen} (${tipoDeOrigen})`));
    console.log(
      chalk.gray(`  .env: KITSUDEN_API_URL=${valores.apiUrl} SITE_URL=${valores.siteUrl}`)
    );

    const instalar = opciones.install || opciones.quickstart;
    if (instalar) {
      console.log(chalk.cyan("\n→ pnpm install"));
      try {
        await execa("pnpm", ["install"], { cwd: destino, stdio: "inherit" });
      } catch (e) {
        console.error(
          chalk.red(`pnpm install failed: ${(e as Error).message.split("\n")[0]}`) +
            "\nThe project was created; run `pnpm install` inside it once the problem is fixed."
        );
        process.exit(1);
      }
    }

    const ir = relative(process.cwd(), destino) || ".";
    console.log(`\n${chalk.bold("Next steps")}\n`);
    console.log(`  cd ${ir}`);
    if (!instalar) console.log("  pnpm install");
    console.log("  pnpm dev            # http://localhost:4321 (needs the API running)");
    console.log("  pnpm build          # production build; it does not call the API");
    console.log("  pnpm start          # serve dist/ (reads KITSUDEN_API_URL at start)");
    console.log(
      `\n  In the Kitsuden admin, publish a page with the slug "home" to fill "/".` +
        `\n  Optional: set KITSUDEN_SITE_KEY in .env (see the project's README).\n`
    );

    if (opciones.api) console.log(`${textoDeLaApi()}\n`);
    else
      console.log(
        chalk.gray(
          "  No Kitsuden API yet? Run `kitsuden new --api` or read docs/instalacion/ in the Kitsuden repository.\n"
        )
      );
  } catch (e) {
    console.error(chalk.red(`✖ ${(e as Error).message}`));
    process.exit(1);
  }
}

/** `kitsuden new --api` sin nombre: solo la explicación. */
export function apiInfoCommand(): void {
  console.log(`${textoDeLaApi()}\n`);
}
