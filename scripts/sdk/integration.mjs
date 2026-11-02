#!/usr/bin/env node
/**
 * Integration run of both typed clients against a REAL local API
 * ============================================================================
 *
 * 1. migrates the test database given in KITSUDEN_SDK_IT_DATABASE_URL;
 * 2. starts the API (`bun --no-env-file src/index.ts`) on a free 127.0.0.1 port;
 * 3. seeds an admin session and two agents (apps/api/scripts/sdk-integracion-semilla.ts);
 * 4. runs the TypeScript suite (packages/sdk/tests/integration) and the Python
 *    one (packages/sdk-python/tests/integration, with uv) against it;
 * 5. stops the API.
 *
 *   KITSUDEN_SDK_IT_DATABASE_URL=postgres://user:pass@127.0.0.1:<port>/<name with test> \
 *   KITSUDEN_SDK_IT_REDIS_URL=redis://127.0.0.1:<port> \
 *   node scripts/sdk/integration.mjs [--solo=ts|py] [--sin-migrar]
 *
 * Refuses a database that is not local, whose name lacks `test` or has
 * `prod`, or on port 5432 (the production database on the owner's machine;
 * in CI, where 5432 is the job's own service, set CI=true).
 * The containers are yours: this script never starts or removes any.
 */

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const API = join(RAIZ, "apps/api");
const args = process.argv.slice(2);
const solo = args.find((a) => a.startsWith("--solo="))?.slice(7);
const sinMigrar = args.includes("--sin-migrar");

function fallar(msg) {
  console.error(`[sdk-it] ${msg}`);
  process.exit(2);
}

const dbUrl = process.env.KITSUDEN_SDK_IT_DATABASE_URL;
if (!dbUrl) fallar("set KITSUDEN_SDK_IT_DATABASE_URL (a local test database)");
const u = new URL(dbUrl);
const nombre = u.pathname.slice(1);
if (!["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)) fallar("the database must be local");
if (!nombre.includes("test") || nombre.includes("prod"))
  fallar(`database '${nombre}' does not look like a test database`);
if ((u.port || "5432") === "5432" && process.env.CI !== "true")
  fallar("port 5432 is refused outside CI (production on the owner's machine)");

const puertoLibre = () =>
  new Promise((ok, mal) => {
    const s = createServer();
    s.once("error", mal);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => ok(p));
    });
  });

const puerto = await puertoLibre();
const origen = `http://127.0.0.1:${puerto}`;
const envApi = {
  ...process.env,
  NODE_ENV: "test",
  KITSUDEN_TEST_DB: "postgres",
  DATABASE_URL: dbUrl,
  ...(process.env.KITSUDEN_SDK_IT_REDIS_URL
    ? { REDIS_URL: process.env.KITSUDEN_SDK_IT_REDIS_URL }
    : {}),
  PORT: String(puerto),
  HOST: "127.0.0.1",
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  BETTER_AUTH_URL: origen,
  ALLOWED_ORIGINS: origen,
  RATE_LIMIT_ENABLED: "false",
  LOG_LEVEL: "error",
};
delete envApi.KITSUDEN_API_TOKEN;

const bun = process.platform === "win32" ? "bun.exe" : "bun";

if (!sinMigrar) {
  console.error("[sdk-it] migrating the test database…");
  const m = spawnSync(bun, ["--no-env-file", "scripts/migrate.ts"], {
    cwd: API,
    env: envApi,
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (m.status !== 0) fallar(`migrations failed (${m.status})`);
}

console.error(`[sdk-it] starting the API on ${origen}…`);
const servidor = spawn(bun, ["--no-env-file", "src/index.ts"], {
  cwd: API,
  env: envApi,
  stdio: ["ignore", "ignore", "pipe"],
});
let errores = "";
servidor.stderr.on("data", (d) => (errores = (errores + d).slice(-4000)));
const parar = () => {
  if (!servidor.killed) servidor.kill();
};
process.on("exit", parar);

let listo = false;
for (let i = 0; i < 240 && !listo; i++) {
  if (servidor.exitCode !== null) break;
  try {
    const r = await fetch(`${origen}/api/health`);
    listo = r.status < 500;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
if (!listo) {
  console.error(errores);
  parar();
  fallar("the API did not start");
}

const tmp = mkdtempSync(join(tmpdir(), "kitsuden-sdk-it-"));
const semilla = join(tmp, "seed.json");
const s = spawnSync(
  bun,
  ["--no-env-file", "scripts/sdk-integracion-semilla.ts", `--api=${origen}`, `--out=${semilla}`],
  {
    cwd: API,
    env: envApi,
    stdio: ["ignore", "ignore", "inherit"],
  }
);
if (s.status !== 0) {
  parar();
  // Seen once under load: src/db gives Postgres 3 s for `SELECT 1` and then
  // falls back to pg-mem without failing (the log fills with "[pg-mem]").
  fallar(
    "seeding failed (if the log shows [pg-mem], Postgres did not answer in 3 s: run it again)"
  );
}
const datos = JSON.parse(readFileSync(semilla, "utf8"));
rmSync(tmp, { recursive: true, force: true });

const envTests = {
  ...process.env,
  KITSUDEN_API_URL: origen,
  KITSUDEN_API_TOKEN: datos.direct.token,
  KITSUDEN_SDK_IT: "1",
  KITSUDEN_SDK_IT_COOKIE: datos.cookie,
  KITSUDEN_SDK_IT_PROPOSE_TOKEN: datos.propose.token,
  KITSUDEN_SDK_IT_PROPOSE_ID: datos.propose.id,
  KITSUDEN_SDK_IT_DIRECT_ID: datos.direct.id,
};

const resultados = [];
if (solo !== "py") {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const r = spawnSync(
    npx,
    ["vitest", "run", "--config", "packages/sdk/tests/integration/vitest.config.ts"],
    {
      cwd: RAIZ,
      env: envTests,
      stdio: "inherit",
      shell: process.platform === "win32",
    }
  );
  resultados.push(["typescript", r.status]);
}
if (solo !== "ts") {
  const r = spawnSync(
    "uv",
    [
      "run",
      "--no-project",
      "--python",
      "3.12",
      "--with",
      "httpx>=0.24",
      "--with",
      "pytest",
      "--",
      "python",
      "-m",
      "pytest",
      "-q",
      "-p",
      "no:cacheprovider",
      "tests/integration",
    ],
    { cwd: join(RAIZ, "packages/sdk-python"), env: envTests, stdio: "inherit" }
  );
  resultados.push(["python", r.status]);
}

parar();
for (const [q, st] of resultados)
  console.error(`[sdk-it] ${q}: ${st === 0 ? "passed" : `FAILED (${st})`}`);
process.exit(resultados.every(([, st]) => st === 0) ? 0 : 1);
