/**
 * `kitsuden kon add|remove|list` — con el CLI compilado, sobre un proyecto y un
 * repo de kons de mentira en una carpeta temporal.
 *
 * El proyecto falso tiene lo mínimo que el comando necesita: pnpm-workspace,
 * packages/kons (la carpeta de instalación), un módulo del núcleo, la constante
 * del SDK y un `apps/api/scripts/migrate.ts` que APUNTA sus argumentos: así se
 * comprueba que el comando llama al runner normal con `--kon <id>` sin
 * necesitar una base de datos. El de verdad se prueba en el informe de la fase
 * C (instalación limpia + `kon add blog` contra Postgres).
 *
 *   pnpm --filter @kitsuden/cli build && node --test tests/kon.test.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

const CLI = resolve(import.meta.dirname, "..", "dist", "index.js");

let base, proyecto, origen;

function escribir(ruta, contenido) {
  mkdirSync(join(ruta, ".."), { recursive: true });
  writeFileSync(ruta, typeof contenido === "string" ? contenido : JSON.stringify(contenido, null, 2));
}

function kon(id, extra = {}, pkgExtra = {}) {
  const dir = join(origen, "kons", id);
  escribir(join(dir, "kon.json"), { id, name: id, version: "1.0.0", sdk: 1, madurez: "beta", ...extra });
  escribir(join(dir, "package.json"), { name: `@kitsuden/${id}`, version: "1.2.3", ...pkgExtra });
  escribir(join(dir, "index.ts"), `export const kon = { id: "${id}" };\n`);
  escribir(join(dir, "migrations", "0001_init.sql"), `-- ${id}\n`);
  escribir(join(dir, "node_modules", "basura", "x.js"), "no se copia");
}

function cli(...args) {
  return spawnSync(process.execPath, [CLI, "kon", ...args, "--root", proyecto], {
    encoding: "utf8",
    env: { ...process.env, KITSUDEN_API_URL: "", KITSUDEN_KONS_SOURCE: "" },
  });
}

function declarados() {
  const f = join(proyecto, "kitsuden.kons.json");
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).kons : {};
}

before(() => {
  assert.ok(existsSync(CLI), "build the CLI first: pnpm --filter @kitsuden/cli build");
  base = mkdtempSync(join(tmpdir(), "kitsuden-kon-cli-"));
  proyecto = join(base, "proyecto");
  origen = join(base, "kitsuden-kons");

  escribir(join(proyecto, "pnpm-workspace.yaml"), 'packages:\n  - "packages/kons/*"\n');
  escribir(join(proyecto, "packages", "kons", "package.json"), { name: "@kitsuden/kons", private: true });
  escribir(join(proyecto, "packages", "core", "media", "kon.json"), { id: "kon-media", name: "Media", version: "1.0.0" });
  escribir(
    join(proyecto, "packages", "shared", "src", "operaciones.ts"),
    "export const VERSION_SDK_DE_KONS = 1;\n"
  );
  // Runner falso: anota con qué argumentos lo llamaron.
  escribir(
    join(proyecto, "apps", "api", "scripts", "migrate.ts"),
    `import { writeFileSync } from "node:fs";\nwriteFileSync("migrate-args.json", JSON.stringify(process.argv.slice(2)));\n`
  );

  kon("kon-blog", { dependencies: { kons: ["kon-media"] } });
  kon("kon-formulas");
  kon("kon-builder", { dependencies: { kons: ["kon-formulas"] } });
  kon("kon-cartas");
  kon("kon-mazos", {}, { peerDependencies: { "@kitsuden/kon-cartas": "workspace:*" } });
  kon("kon-futuro", { sdk: 99 });
});

after(() => {
  if (base) rmSync(base, { recursive: true, force: true });
});

describe("kitsuden kon add", () => {
  it("copia el kon a packages/kons, sin node_modules, y lo declara", () => {
    const r = cli("add", "blog", "--from", origen, "--no-install", "--no-migrate");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const dir = join(proyecto, "packages", "kons", "kon-blog");
    assert.ok(existsSync(join(dir, "kon.json")));
    assert.ok(existsSync(join(dir, "migrations", "0001_init.sql")));
    assert.ok(!existsSync(join(dir, "node_modules")), "node_modules no se copia");

    const e = declarados()["kon-blog"];
    assert.equal(e.mode, "copy");
    assert.equal(e.version, "1.2.3");
    assert.equal(e.sdk, 1);
    assert.equal(e.source, origen);
    assert.match(e.hash, /^[0-9a-f]{64}$/);
    // kon-media es del núcleo: no se instala aunque sea dependencia.
    assert.ok(!declarados()["kon-media"]);
  });

  it("trae las dependencias (manifiesto y peer @kitsuden/kon-*)", () => {
    let r = cli("add", "builder", "--from", origen, "--no-install", "--no-migrate");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.ok(declarados()["kon-formulas"], "kon-formulas por dependencies.kons");
    r = cli("add", "mazos", "--from", origen, "--no-install", "--no-migrate");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.ok(declarados()["kon-cartas"], "kon-cartas por peerDependencies");
  });

  it("ejecuta el runner normal de migraciones con --kon <id>", () => {
    const r = cli("add", "blog", "--from", origen, "--no-install");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const args = JSON.parse(readFileSync(join(proyecto, "apps", "api", "migrate-args.json"), "utf8"));
    assert.deepEqual(args, ["--kon", "kon-blog"]);
  });

  it("se niega a instalar un kon de un SDK más nuevo, sin tocar nada", () => {
    const antes = JSON.stringify(declarados());
    const r = cli("add", "futuro", "--from", origen, "--no-install", "--no-migrate");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /needs kon SDK v99 and this Kitsuden provides v1/);
    assert.ok(!existsSync(join(proyecto, "packages", "kons", "kon-futuro")));
    assert.equal(JSON.stringify(declarados()), antes);
  });

  it("no pisa cambios locales de una copia instalada (salvo --force)", () => {
    const fichero = join(proyecto, "packages", "kons", "kon-blog", "index.ts");
    writeFileSync(fichero, "// cambio a mano\n");
    let r = cli("add", "blog", "--from", origen, "--no-install", "--no-migrate");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /local changes/);
    assert.equal(readFileSync(fichero, "utf8"), "// cambio a mano\n");

    r = cli("add", "blog", "--from", origen, "--no-install", "--no-migrate", "--force");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(readFileSync(fichero, "utf8"), /export const kon/);
  });

  it("--link no copia: declara la ruta del kon en su sitio", () => {
    const r = cli("add", "formulas", "--from", origen, "--link", "--no-install", "--no-migrate");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const e = declarados()["kon-formulas"];
    assert.equal(e.mode, "link");
    assert.equal(resolve(proyecto, e.path), join(origen, "kons", "kon-formulas"));
  });

  it("--enable deja la semilla de activación", () => {
    const r = cli("add", "cartas", "--from", origen, "--enable", "--no-install", "--no-migrate", "--force");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(declarados()["kon-cartas"].enabled, true);
  });

  it("un módulo del núcleo no se instala", () => {
    const r = cli("add", "media", "--from", origen, "--no-install", "--no-migrate");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /part of the Kitsuden core/);
  });
});

describe("kitsuden kon list", () => {
  it("lista núcleo e instalados con su estado (--json)", () => {
    const r = cli("list", "--json");
    assert.equal(r.status, 0, r.stderr);
    const { sdk, kons } = JSON.parse(r.stdout);
    assert.equal(sdk, 1);
    const porId = Object.fromEntries(kons.map((k) => [k.id, k]));
    assert.equal(porId["kon-media"].origen, "core");
    assert.equal(porId["kon-blog"].estado, "ok");
    assert.equal(porId["kon-formulas"].mode, "link");
  });

  it("marca una copia modificada", () => {
    writeFileSync(join(proyecto, "packages", "kons", "kon-mazos", "index.ts"), "// otro\n");
    const { kons } = JSON.parse(cli("list", "--json").stdout);
    assert.equal(kons.find((k) => k.id === "kon-mazos").estado, "modified");
  });

  it("--available enseña lo que ofrece el origen con su madurez", () => {
    const r = cli("list", "--available", "--from", origen, "--json");
    assert.equal(r.status, 0, r.stderr);
    const kons = JSON.parse(r.stdout);
    assert.ok(kons.some((k) => k.id === "kon-blog" && k.maturity === "beta"));
  });
});

describe("kitsuden kon remove", () => {
  it("no quita un kon del que depende otro (salvo --force)", () => {
    const r = cli("remove", "cartas", "--no-install");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /kon-mazos depends on kon-cartas/);
  });

  it("no borra una copia con cambios locales", () => {
    const r = cli("remove", "mazos", "--no-install");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /local changes/);
  });

  it("quita la copia y la declaración", () => {
    const r = cli("remove", "blog", "--no-install");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.ok(!existsSync(join(proyecto, "packages", "kons", "kon-blog")));
    assert.ok(!declarados()["kon-blog"]);
  });

  it("un kon enlazado se deja de declarar sin borrar su carpeta", () => {
    const r = cli("remove", "builder", "formulas", "--no-install");
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.ok(existsSync(join(origen, "kons", "kon-formulas", "kon.json")));
    assert.ok(!declarados()["kon-formulas"]);
  });
});
