#!/usr/bin/env node
/**
 * Una base de datos por worktree — lo que corren `scripts.setup` y
 * `scripts.archive` de `orca.yaml` (docs/agents/orca.md)
 * ============================================================================
 *
 * POR QUÉ EXISTE
 *
 * Varios agentes trabajando a la vez, cada uno en su worktree, compartían la
 * misma base. Y la suite no se limita a leer: `clearTestData()` borra TODOS
 * los datasets. El 2026-10-25 la matriz de autorización de un agente se quedó
 * sin datos a mitad de ejecución porque otro había lanzado los tests. Con una
 * base por worktree, lo que borra uno no lo ve el otro.
 *
 * LO QUE HACE
 *
 *   setup     crea `kitsuden_test_wt_<worktree>_<hash>` en el Postgres de
 *             pruebas (docker-compose.test.yml, 5434), le reserva un bloque de
 *             puertos, escribe `apps/api/.env` y `.kitsuden/worktree.json`, y
 *             aplica las migraciones.
 *   archive   borra esa base y los dos ficheros que escribió setup.
 *   status    dice qué base y qué puertos le tocan a este worktree.
 *   prune     lista las bases `kitsuden_test_wt_…` cuyo worktree ya no está en
 *             `git worktree list`; con `--apply` las borra. Hace falta porque
 *             Claude Code y Codex quitan worktrees sin avisar a nadie: sin
 *             esto, sus bases se quedarían para siempre. Nunca borra una base
 *             con conexiones abiertas (puede ser de otro clon del repo).
 *
 *   --dry-run      dice lo que haría sin tocar nada
 *   --no-migrate   setup sin migraciones
 *   --apply        prune: borrar de verdad (sin él, solo lista)
 *
 * LO QUE NO HACE NUNCA
 *
 * Tocar una base que no se llame `kitsuden_test_wt_…`, conectarse al puerto
 * 5432 (el de `kitsuden_db_prod` en esta máquina) o a un host que no sea
 * local, ni trabajar en un servidor que tenga alguna base con «prod» en el
 * nombre. Son comprobaciones redundantes a propósito: cada una cubre un error
 * distinto (un `.env.test` editado, un túnel, un puerto remapeado), y
 * equivocarse aquí borra datos reales.
 *
 * El nombre lleva «test» porque la suite se niega a conectarse a una base que
 * no lo lleve (`looksLikeTestDatabase`, src/db/index.ts): así los tests del
 * worktree usan su base y no caen a pg-mem.
 *
 * VARIABLES
 *
 *   ORCA_WORKTREE_PATH, ORCA_WORKSPACE_NAME   las pone Orca; sin ellas, el
 *                                             directorio actual y su nombre
 *   KITSUDEN_WT_PG_URL    servidor de pruebas, conectando a la base `postgres`
 *                         (por defecto se arma con POSTGRES_* de `.env.test`)
 */

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { basename, dirname, join, resolve } from "node:path";

const MARCA = "# kitsuden-worktree: escrito por scripts/orca/worktree.mjs";
const PREFIJO_BASE = "kitsuden_test_wt_";
const NOMBRE_VALIDO = /^kitsuden_test_wt_[a-z0-9_]{1,40}$/;
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const PUERTO_PROHIBIDO = 5432;
// Bloques de 10 puertos desde 13000: lejos de 3000-3002, 4321-4372, 5173 y 5432-5434
const PUERTO_BASE = 13000;
const BLOQUES = 500;

class Rechazo extends Error {}

function args() {
  const [orden = "status", ...resto] = process.argv.slice(2);
  return {
    orden,
    simulacro: resto.includes("--dry-run"),
    sinMigrar: resto.includes("--no-migrate"),
    aplicar: resto.includes("--apply"),
  };
}

function leerEnv(fichero) {
  if (!existsSync(fichero)) return {};
  const vars = {};
  for (const linea of readFileSync(fichero, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return vars;
}

/** Sufijo de la base: sale de la ruta, no del nombre (dos repos pueden repetir nombre). */
function hashDeRuta(raiz) {
  return createHash("sha1").update(resolve(raiz).toLowerCase()).digest("hex");
}

function identidad(raiz) {
  const nombre = process.env.ORCA_WORKSPACE_NAME || basename(raiz);
  const slug = nombre
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  if (!slug) throw new Rechazo(`No se puede sacar un nombre de base de «${nombre}».`);
  const hash = hashDeRuta(raiz);
  return {
    nombre,
    base: `${PREFIJO_BASE}${slug}_${hash.slice(0, 6)}`,
    bloque: parseInt(hash.slice(6, 14), 16) % BLOQUES,
  };
}

function comprobarNombre(base) {
  if (!NOMBRE_VALIDO.test(base)) {
    throw new Rechazo(`«${base}» no parece la base de un worktree (${NOMBRE_VALIDO}); no se toca.`);
  }
}

function urlDelServidor(raiz) {
  if (process.env.KITSUDEN_WT_PG_URL) return new URL(process.env.KITSUDEN_WT_PG_URL);
  const env = leerEnv(join(raiz, ".env.test"));
  if (!env.POSTGRES_USER || !env.POSTGRES_PORT) {
    throw new Rechazo("Falta .env.test con POSTGRES_USER y POSTGRES_PORT (o KITSUDEN_WT_PG_URL).");
  }
  const url = new URL("postgres://127.0.0.1/postgres");
  url.username = env.POSTGRES_USER;
  url.password = env.POSTGRES_PASSWORD ?? "";
  url.port = env.POSTGRES_PORT;
  return url;
}

function comprobarServidor(url) {
  if (!HOSTS_LOCALES.has(url.hostname)) {
    throw new Rechazo(`El servidor de pruebas debe ser local; «${url.hostname}» no lo es.`);
  }
  const puerto = Number(url.port || 5432);
  if (puerto === PUERTO_PROHIBIDO) {
    throw new Rechazo(
      `Puerto ${PUERTO_PROHIBIDO}: es el de la base de producción (kitsuden_db_prod). ` +
        "Usa el Postgres de pruebas (pnpm test:db:up, 5434)."
    );
  }
  return puerto;
}

/** URL sin contraseña, para mostrarla. */
function sinSecreto(url) {
  const copia = new URL(url);
  if (copia.password) copia.password = "***";
  return copia.toString();
}

function cargarPg(raiz) {
  try {
    return createRequire(join(raiz, "package.json"))("pg");
  } catch {
    throw new Rechazo("No encuentro el paquete `pg`: corre `pnpm install` antes del setup.");
  }
}

async function conectar(raiz, url) {
  const { Client } = cargarPg(raiz);
  const cliente = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  try {
    await cliente.connect();
  } catch (e) {
    throw new Rechazo(
      `No conecto con ${sinSecreto(url)} (${e.code || e.message}). ¿Está levantado? pnpm test:db:up`
    );
  }
  // Un `.env.test` editado o un puerto remapeado podrían llevarnos al
  // servidor de producción: si aloja alguna base «prod», no se sigue.
  const { rows } = await cliente.query(
    "SELECT datname FROM pg_database WHERE datname ~* 'prod' ORDER BY 1"
  );
  if (rows.length > 0) {
    await cliente.end();
    throw new Rechazo(
      `El servidor ${sinSecreto(url)} tiene bases de producción (${rows.map((r) => r.datname).join(", ")}); no se toca.`
    );
  }
  return cliente;
}

function puertoLibre(puerto) {
  return new Promise((ok) => {
    const s = createServer();
    s.once("error", () => ok(false));
    s.listen(puerto, "127.0.0.1", () => s.close(() => ok(true)));
  });
}

/** Primer bloque de 10 puertos libre a partir del que toca por hash. */
async function elegirPuertos(bloque) {
  for (let i = 0; i < 20; i++) {
    const base = PUERTO_BASE + ((bloque + i) % BLOQUES) * 10;
    const libres = await Promise.all([0, 1, 2, 3].map((d) => puertoLibre(base + d)));
    if (libres.every(Boolean)) return { api: base, admin: base + 1, mcp: base + 2, site: base + 3 };
  }
  throw new Rechazo("No hay un bloque de puertos libre entre 13000 y 17999.");
}

function rutas(raiz) {
  return {
    estado: join(raiz, ".kitsuden", "worktree.json"),
    envApi: join(raiz, "apps", "api", ".env"),
  };
}

function leerEstado(raiz) {
  const { estado } = rutas(raiz);
  if (!existsSync(estado)) return null;
  return JSON.parse(readFileSync(estado, "utf8"));
}

/** Solo se pisa o borra un fichero que escribió este script. */
function esNuestro(fichero) {
  return !existsSync(fichero) || readFileSync(fichero, "utf8").startsWith(MARCA);
}

function envDeLaApi({ urlBase, puertos, redis }) {
  const origenes = [puertos.site, puertos.admin, puertos.api].map((p) => `http://localhost:${p}`);
  return [
    MARCA,
    "# Base y puertos SOLO de este worktree. Lo borra `node scripts/orca/worktree.mjs archive`.",
    `DATABASE_URL=${urlBase}`,
    `PORT=${puertos.api}`,
    `API_PORT=${puertos.api}`,
    `REDIS_URL=${redis}`,
    `BETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}`,
    `BETTER_AUTH_URL=http://localhost:${puertos.api}`,
    `ADMIN_URL=http://localhost:${puertos.admin}`,
    `ADMIN_PORT=${puertos.admin}`,
    `ALLOWED_ORIGINS=${origenes.join(",")}`,
    "KITSUDEN_TEST_DB=postgres",
    "",
  ].join("\n");
}

async function setup(raiz, { simulacro, sinMigrar }) {
  const id = identidad(raiz);
  comprobarNombre(id.base);
  const servidor = urlDelServidor(raiz);
  const puertoPg = comprobarServidor(servidor);
  const { estado, envApi } = rutas(raiz);

  if (!esNuestro(envApi)) {
    throw new Rechazo(
      `${envApi} ya existe y no lo escribió este script. Puede apuntar a otra base (incluso a ` +
        "producción): bórralo o muévelo y repite el setup."
    );
  }

  const anterior = leerEstado(raiz);
  const puertos = anterior?.puertos ?? (await elegirPuertos(id.bloque));
  const urlBase = new URL(servidor);
  urlBase.pathname = `/${id.base}`;
  const envTest = leerEnv(join(raiz, ".env.test"));
  const redis = `${envTest.REDIS_URL || "redis://localhost:6380"}/${id.bloque % 16}`;

  console.log(`worktree  ${id.nombre}`);
  console.log(`base      ${id.base} en ${sinSecreto(servidor).replace(/\/postgres$/, "")}`);
  console.log(
    `puertos   api ${puertos.api} · admin ${puertos.admin} · mcp ${puertos.mcp} · web ${puertos.site}`
  );
  if (simulacro) {
    console.log("(simulacro: no se crea nada)");
    return;
  }

  const cliente = await conectar(raiz, servidor);
  try {
    const { rowCount } = await cliente.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      id.base,
    ]);
    if (rowCount === 0) {
      await cliente.query(`CREATE DATABASE "${id.base}"`);
      console.log("base creada");
    } else {
      console.log("la base ya existía: se reutiliza");
    }
  } finally {
    await cliente.end();
  }

  mkdirSync(dirname(estado), { recursive: true });
  writeFileSync(envApi, envDeLaApi({ urlBase: urlBase.toString(), puertos, redis }));
  writeFileSync(
    estado,
    JSON.stringify(
      {
        workspace: id.nombre,
        database: id.base,
        pgPort: puertoPg,
        puertos,
        apiUrl: `http://localhost:${puertos.api}`,
        creado: anterior?.creado ?? new Date().toISOString(),
      },
      null,
      2
    ) + "\n"
  );

  if (sinMigrar) return;
  console.log("aplicando migraciones…");
  const r = spawnSync("bun", ["run", "scripts/migrate.ts"], {
    cwd: join(raiz, "apps", "api"),
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: urlBase.toString(), NODE_ENV: "development" },
  });
  if (r.status !== 0)
    throw new Rechazo(`Las migraciones fallaron (salida ${r.status ?? r.error?.message}).`);
}

async function archive(raiz, { simulacro }) {
  const estado = leerEstado(raiz);
  const base = estado?.database ?? identidad(raiz).base;
  comprobarNombre(base);
  const servidor = urlDelServidor(raiz);
  comprobarServidor(servidor);
  const ficheros = rutas(raiz);

  console.log(`borrando ${base}${simulacro ? " (simulacro)" : ""}`);
  if (simulacro) return;

  const cliente = await conectar(raiz, servidor);
  try {
    await cliente.query(`DROP DATABASE IF EXISTS "${base}" WITH (FORCE)`);
  } finally {
    await cliente.end();
  }
  if (esNuestro(ficheros.envApi)) rmSync(ficheros.envApi, { force: true });
  rmSync(ficheros.estado, { force: true });
  console.log("base borrada");
}

/** Rutas de los worktrees vivos de este repositorio, el principal incluido. */
function worktreesVivos(raiz) {
  const r = spawnSync("git", ["worktree", "list", "--porcelain"], { cwd: raiz, encoding: "utf8" });
  if (r.status !== 0) throw new Rechazo(`git worktree list falló: ${(r.stderr || "").trim()}`);
  return r.stdout
    .split(/\r?\n/)
    .filter((l) => l.startsWith("worktree "))
    .map((l) => l.slice("worktree ".length));
}

async function prune(raiz, { aplicar }) {
  const rutasVivas = worktreesVivos(raiz);
  const vivos = new Set(rutasVivas.map((p) => hashDeRuta(p).slice(0, 6)));
  // Además, la que nombra el estado de cada worktree vivo: una ruta escrita de
  // otra forma (8.3 en Windows, otra letra) daría otro hash y la haría pasar
  // por huérfana.
  const nombradas = new Set(rutasVivas.map((p) => leerEstado(p)?.database).filter(Boolean));
  const servidor = urlDelServidor(raiz);
  comprobarServidor(servidor);
  const cliente = await conectar(raiz, servidor);
  try {
    const { rows } = await cliente.query(
      `SELECT d.datname, count(a.pid)::int AS conexiones
         FROM pg_database d LEFT JOIN pg_stat_activity a ON a.datname = d.datname
        WHERE d.datname LIKE 'kitsuden\\_test\\_wt\\_%'
        GROUP BY d.datname ORDER BY 1`
    );
    const huerfanas = rows.filter(
      (r) => !vivos.has(r.datname.slice(-6)) && !nombradas.has(r.datname)
    );
    if (huerfanas.length === 0) {
      console.log(`ninguna huérfana (${rows.length} base(s) de worktree, todas con su worktree)`);
      return;
    }
    for (const { datname, conexiones } of huerfanas) {
      comprobarNombre(datname);
      if (conexiones > 0) {
        console.log(`se queda  ${datname} (${conexiones} conexión(es): puede ser de otro clon)`);
      } else if (!aplicar) {
        console.log(`huérfana  ${datname}`);
      } else {
        await cliente.query(`DROP DATABASE IF EXISTS "${datname}"`);
        console.log(`borrada   ${datname}`);
      }
    }
    if (!aplicar) console.log("(solo lista: repite con --apply para borrarlas)");
  } finally {
    await cliente.end();
  }
}

function status(raiz) {
  const estado = leerEstado(raiz);
  console.log(
    JSON.stringify(estado ?? { pendiente: "setup", database: identidad(raiz).base }, null, 2)
  );
}

const opciones = args();
const raiz = resolve(process.env.ORCA_WORKTREE_PATH || process.cwd());

try {
  if (!existsSync(join(raiz, "apps", "api", "scripts", "migrate.ts"))) {
    throw new Rechazo(
      `${raiz} no parece el monorepo de Kitsuden (falta apps/api/scripts/migrate.ts).`
    );
  }
  if (opciones.orden === "setup") await setup(raiz, opciones);
  else if (opciones.orden === "archive") await archive(raiz, opciones);
  else if (opciones.orden === "status") status(raiz);
  else if (opciones.orden === "prune") await prune(raiz, opciones);
  else throw new Rechazo(`Orden desconocida «${opciones.orden}»: setup, archive, status o prune.`);
} catch (e) {
  console.error(e instanceof Rechazo ? `✗ ${e.message}` : e);
  process.exit(1);
}
