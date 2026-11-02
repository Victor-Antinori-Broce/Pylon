/**
 * `kitsuden new` — de verdad: ejecuta el CLI compilado, instala y compila el
 * proyecto generado en una carpeta temporal, SIN API.
 *
 *   pnpm --filter @kitsuden/cli build && node --test tests/new.test.mjs
 *
 * KITSUDEN_CLI_SIN_INSTALAR=1 se salta `pnpm install` + `pnpm build` (necesitan
 * red para bajar Astro); el resto de comprobaciones se hacen igual.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

const CLI = resolve(import.meta.dirname, "..", "dist", "index.js");
const STARTER = resolve(import.meta.dirname, "..", "..", "starters", "kitsuden-starter-basic");
// Un puerto donde no escucha nadie: si el build llamara a la API, fallaría.
const API_INALCANZABLE = "http://127.0.0.1:9";

let tmp;
let proyecto;

function cli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

before(() => {
  assert.ok(existsSync(CLI), "build the CLI first: pnpm --filter @kitsuden/cli build");
  tmp = mkdtempSync(join(tmpdir(), "kitsuden-new-"));
  proyecto = join(tmp, "mi-web");
});

after(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe("kitsuden new", () => {
  it("crea el proyecto sin preguntar cuando no hay TTY", () => {
    const r = cli(
      ["new", "mi-web", "--api-url", API_INALCANZABLE, "--site-url", "https://example.org"],
      tmp
    );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /Created/);
    assert.match(r.stdout, /Next steps/);
  });

  it("no copia node_modules, dist, .astro ni .env del starter", () => {
    for (const fuera of ["node_modules", "dist", ".astro"]) {
      assert.equal(existsSync(join(proyecto, fuera)), false, `${fuera} was copied`);
    }
    assert.ok(existsSync(join(proyecto, ".env.example")));
    assert.match(readFileSync(join(proyecto, ".gitignore"), "utf8"), /^\.env$/m);
    assert.ok(existsSync(join(proyecto, "src", "pages", "index.astro")));
    assert.ok(existsSync(join(proyecto, "astro.config.mjs")));
  });

  it("renombra el paquete y quita lo que era del monorepo", () => {
    const pkg = JSON.parse(readFileSync(join(proyecto, "package.json"), "utf8"));
    assert.equal(pkg.name, "mi-web");
    assert.equal(pkg.repository, undefined);
    assert.equal(pkg.author, undefined);
    const original = JSON.parse(readFileSync(join(STARTER, "package.json"), "utf8"));
    assert.deepEqual(pkg.dependencies, original.dependencies);
  });

  it("escribe .env desde .env.example con la API y la URL pedidas", () => {
    const env = readFileSync(join(proyecto, ".env"), "utf8");
    assert.match(
      env,
      new RegExp(`^KITSUDEN_API_URL=${API_INALCANZABLE.replace(/[.]/g, "\\.")}$`, "m")
    );
    assert.match(env, /^SITE_URL=https:\/\/example\.org$/m);
    assert.match(env, /^SITE_NAME=mi-web$/m);
    // La clave del sitio es secreta: se queda comentada.
    assert.match(env, /^# KITSUDEN_SITE_KEY=$/m);
  });

  it("no pisa una carpeta que ya tiene algo", () => {
    const r = cli(["new", "mi-web", "--api-url", API_INALCANZABLE], tmp);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /already exists and is not empty/);
  });

  it("rechaza una URL de API que no es http(s)", () => {
    const r = cli(["new", "otra", "--api-url", "ftp://x"], tmp);
    assert.equal(r.status, 1);
    assert.equal(existsSync(join(tmp, "otra")), false);
  });

  it("--api explica cómo conseguir la API sin generar nada", () => {
    const r = cli(["new", "--api"], tmp);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /no published Kitsuden API images/);
    assert.match(r.stdout, /docs\/instalacion\/servidor\.md/);
  });

  it(
    "pnpm install + pnpm build funcionan sin API",
    { skip: process.env.KITSUDEN_CLI_SIN_INSTALAR === "1", timeout: 600_000 },
    () => {
      const opciones = { cwd: proyecto, encoding: "utf8", shell: process.platform === "win32" };
      const i = spawnSync("pnpm", ["install"], opciones);
      assert.equal(i.status, 0, i.stderr + i.stdout);
      const b = spawnSync("pnpm", ["build"], opciones);
      assert.equal(b.status, 0, b.stderr + b.stdout);
      assert.ok(existsSync(join(proyecto, "dist", "server", "entry.mjs")));
    }
  );
});
