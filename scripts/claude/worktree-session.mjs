#!/usr/bin/env node
/**
 * Hook `SessionStart` de Claude Code (.claude/settings.json): base propia por worktree
 * ============================================================================
 *
 * Orca corre `scripts/orca/worktree.mjs setup` al crear un worktree; Claude
 * Code no tiene un `setup` así. Su `WorktreeCreate` SUSTITUYE la creación del
 * worktree (habría que reimplementar git y `.worktreeinclude`), y
 * `WorktreeRemove` solo salta para worktrees creados por ese hook. Así que se
 * engancha al arranque de la sesión:
 *
 *   · en el checkout principal no hace nada (allí `apps/api/.env` puede ser
 *     el de producción y no es asunto de este hook);
 *   · en un worktree sin base, corre el setup;
 *   · en uno que ya la tiene, solo le dice al agente cuál es.
 *
 * Nunca falla la sesión: si algo va mal, el agente recibe el motivo como
 * contexto y la sesión sigue. Quitar worktrees no avisa a nadie: las bases
 * que quedan se limpian con `node scripts/orca/worktree.mjs prune`.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join, resolve } from "node:path";

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

function salir(contexto) {
  if (contexto) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: contexto },
      })
    );
  }
  process.exit(0);
}

let entrada = {};
try {
  entrada = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  // sin entrada válida se usa el directorio del proyecto
}
const cwd = resolve(entrada.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd());

const raiz = git(cwd, "rev-parse", "--show-toplevel");
const gitDir = git(cwd, "rev-parse", "--absolute-git-dir");
const comun = git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir");
// Checkout principal (o fuera de git): nada que hacer
if (!raiz || !gitDir || !comun || resolve(gitDir) === resolve(comun)) salir();
// Un worktree de otra rama sin el script (p. ej. una anterior a él)
const script = join(raiz, "scripts", "orca", "worktree.mjs");
if (!existsSync(script) || !existsSync(join(raiz, "apps", "api", "scripts", "migrate.ts"))) salir();

const ficheroDeEstado = join(raiz, ".kitsuden", "worktree.json");

function contextoDe(estado) {
  if (process.env.CLAUDE_ENV_FILE) {
    // `export NOMBRE=valor` sin `$`: Bash la exporta y PowerShell también la lee
    appendFileSync(process.env.CLAUDE_ENV_FILE, `export KITSUDEN_API_URL=${estado.apiUrl}\n`);
  }
  return (
    `Kitsuden: este worktree tiene su propia base, ${estado.database} (Postgres de pruebas, ` +
    `puerto ${estado.pgPort}), y su API va en ${estado.apiUrl} (apps/api/.env, generado). ` +
    "Los tests y las migraciones usan esa base; no apuntes nada a la 5432. " +
    "Antes de quitar el worktree: node scripts/orca/worktree.mjs archive."
  );
}

if (existsSync(ficheroDeEstado))
  salir(contextoDe(JSON.parse(readFileSync(ficheroDeEstado, "utf8"))));

try {
  createRequire(join(raiz, "package.json")).resolve("pg");
} catch {
  salir(
    "Kitsuden: este worktree aún no tiene base propia ni dependencias. Corre " +
      "`pnpm install --frozen-lockfile` y después `node scripts/orca/worktree.mjs setup` " +
      "antes de lanzar tests o la API."
  );
}

const r = spawnSync(process.execPath, [script, "setup"], {
  cwd: raiz,
  encoding: "utf8",
  env: { ...process.env, ORCA_WORKTREE_PATH: raiz, ORCA_WORKSPACE_NAME: basename(raiz) },
});
// La salida del setup no es contexto: a stderr, para el registro de hooks
process.stderr.write(`${r.stdout ?? ""}${r.stderr ?? ""}`);

if (r.status === 0 && existsSync(ficheroDeEstado)) {
  salir(contextoDe(JSON.parse(readFileSync(ficheroDeEstado, "utf8"))));
}
const motivo = `${r.stderr ?? ""}`.trim().split(/\r?\n/).filter(Boolean).slice(-3).join(" / ");
salir(
  "Kitsuden: no se pudo dar a este worktree su base propia" +
    (motivo ? ` (${motivo})` : "") +
    ". No lances tests ni migraciones hasta arreglarlo: `node scripts/orca/worktree.mjs setup`."
);
