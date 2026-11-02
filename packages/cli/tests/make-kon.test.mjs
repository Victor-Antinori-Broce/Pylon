/**
 * `kitsuden make kon` — el kon generado pasa las guardias del repo
 * ============================================================================
 *
 * Copia lo mínimo del monorepo a una carpeta temporal (helpers/copia-del-repo),
 * genera un kon con el CLI compilado y ejecuta, EN LA COPIA:
 *
 *   · las guardias de kons de tests/unit (manifiesto, cargable, tablas,
 *     iconos, tarball, typecheck declarado, registro) más la prueba de rutas
 *     que genera el propio comando;
 *   · `tsc --noEmit` del kon generado.
 *
 * El repositorio de verdad no se toca. Necesita los node_modules del monorepo
 * instalados (se enlazan, no se copian).
 *
 *   pnpm --filter @kitsuden/cli build && node --test tests/make-kon.test.mjs
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { borrarCopia, copiarRepo } from "./helpers/copia-del-repo.mjs";

const CLI = resolve(import.meta.dirname, "..", "dist", "index.js");
const REPO = resolve(import.meta.dirname, "..", "..", "..");

const GUARDIAS = [
  "kon-manifest",
  "kon-loadable",
  "tablas-de-kons",
  "kons-no-crean-tablas",
  "iconos-de-kons",
  "paquete-publicado-completo",
  "kon-typecheck-coverage",
  "kon-registry-completo",
];

let copia;

function cli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: copia, encoding: "utf8" });
}

before(() => {
  assert.ok(existsSync(CLI), "build the CLI first: pnpm --filter @kitsuden/cli build");
  copia = copiarRepo(REPO, join(mkdtempSync(join(tmpdir(), "kitsuden-kon-")), "repo"));
});

after(() => {
  if (copia) borrarCopia(resolve(copia, ".."));
});

describe("kitsuden make kon", () => {
  it("genera el kon y su prueba", () => {
    const r = cli(["make", "kon", "demo-notes", "--root", copia]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const k = join(copia, "packages", "kons", "kon-demo-notes");
    for (const f of [
      "kon.json",
      "package.json",
      "tsconfig.json",
      "index.ts",
      "demo-notes.routes.ts",
      "demo-notes.policy.ts",
      "demo-notes.schema.ts",
      "migrations/0000_inicial.sql",
    ]) {
      assert.ok(existsSync(join(k, f)), `missing ${f}`);
    }
    assert.ok(existsSync(join(copia, "tests", "unit", "kon-demo-notes.test.ts")));
    assert.match(
      readFileSync(join(k, "demo-notes.policy.ts"), "utf8"),
      /export function registerDemoNotesPolicy\(\)/
    );
    const manifiesto = JSON.parse(readFileSync(join(k, "kon.json"), "utf8"));
    assert.equal(manifiesto.tables[0].name, "demo_notes_items");
  });

  it("se niega a pisar un kon existente y a usar un icono que el panel no conoce", () => {
    assert.equal(cli(["make", "kon", "demo-notes", "--root", copia]).status, 1);
    const r = cli(["make", "kon", "otro", "--root", copia, "--icon", "NoExiste"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /admin icon map/);
  });

  it("make policy --kon añade la policy a register<Kon>Policy()", () => {
    const r = cli(["make", "policy", "Draft", "--kon", "demo-notes", "--root", copia]);
    assert.equal(r.status, 0, r.stderr);
    const fuente = readFileSync(
      join(copia, "packages", "kons", "kon-demo-notes", "demo-notes.policy.ts"),
      "utf8"
    );
    const registro = fuente.indexOf("export function registerDemoNotesPolicy");
    assert.ok(
      fuente.indexOf('"demo-notes-draft"') > registro,
      "the policy is not inside register…Policy()"
    );
    // Sin --kon no hay dónde registrarla: error, no un fichero huérfano.
    assert.equal(cli(["make", "policy", "Draft", "--root", copia]).status, 1);
  });

  it("pasa las guardias de kons y su propia prueba de rutas", { timeout: 600_000 }, () => {
    const vitest = join(copia, "node_modules", "vitest", "vitest.mjs");
    const ficheros = [...GUARDIAS, "kon-demo-notes"].map((g) => `tests/unit/${g}.test.ts`);
    const r = spawnSync(
      process.execPath,
      [vitest, "run", "--config=tests/unit/vitest.config.ts", "--reporter=verbose", ...ficheros],
      { cwd: copia, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    );
    // Sin colores ANSI (ESC = carácter 27; escrito así para no-control-regex)
    const salida = (r.stdout + r.stderr).replace(
      new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"),
      ""
    );
    assert.equal(r.status, 0, salida.slice(-4000));
    // Que el kon nuevo esté DENTRO de las guardias, no solo que pasen.
    assert.match(
      salida,
      /kon-manifest\.test\.ts > todos los kon\.json cumplen el esquema > kon-demo-notes/
    );
    assert.match(
      salida,
      /kon-loadable\.test\.ts > .* > kon-demo-notes exporta algo que el cargador reconoce/
    );
    assert.match(salida, /paquete-publicado-completo\.test\.ts > .* > kon-demo-notes/);
    assert.match(salida, /kon-demo-notes\.test\.ts > kon-demo-notes > solo el staff crea/);
  });

  it("tsc --noEmit del kon generado no da errores", { timeout: 600_000 }, () => {
    const tsc = join(copia, "node_modules", "typescript", "bin", "tsc");
    const r = spawnSync(process.execPath, [tsc, "--noEmit", "-p", "packages/kons/kon-demo-notes"], {
      cwd: copia,
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
});
