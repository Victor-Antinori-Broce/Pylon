#!/usr/bin/env node
/**
 * Worktree setup for this site (what `orca.yaml` runs; works with Orca).
 *
 *   setup    gives this worktree its own dev-server port and an `.env`
 *   dev      runs `astro dev` on that port
 *   status   prints the port and the API this worktree uses
 *
 * The site has no database: it reads a Kitsuden API. Each worktree gets its
 * own port (derived from the worktree path) so several agents can run the
 * site at once. The API comes from `KITSUDEN_API_URL` when setup runs, else
 * from the copied `.env`, else from `.env.example`.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

const root = resolve(process.env.ORCA_WORKTREE_PATH || process.cwd());
const stateFile = join(root, ".kitsuden", "worktree.json");
const envFile = join(root, ".env");
// Blocks of 10 ports from 13000, as in the Kitsuden monorepo: site = block + 3
const FIRST_PORT = 13000;
const BLOCKS = 500;

function portIsFree(port) {
  return new Promise((done) => {
    const server = createServer();
    server.once("error", () => done(false));
    server.listen(port, "127.0.0.1", () => server.close(() => done(true)));
  });
}

async function pickPort() {
  const hash = createHash("sha1").update(root.toLowerCase()).digest("hex");
  const block = parseInt(hash.slice(6, 14), 16) % BLOCKS;
  for (let i = 0; i < 20; i++) {
    const port = FIRST_PORT + ((block + i) % BLOCKS) * 10 + 3;
    if (await portIsFree(port)) return port;
  }
  throw new Error("No free port between 13000 and 17999.");
}

/** Sets `key=value` in an env file's text, replacing the line if present. */
function setVar(text, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(text)
    ? text.replace(pattern, line)
    : `${text.replace(/\n?$/, "\n")}${line}\n`;
}

function readState() {
  return existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : null;
}

async function setup() {
  const port = readState()?.sitePort ?? (await pickPort());
  let env = existsSync(envFile)
    ? readFileSync(envFile, "utf8")
    : readFileSync(join(root, ".env.example"), "utf8");
  env = setVar(env, "SITE_URL", `http://localhost:${port}`);
  if (process.env.KITSUDEN_API_URL)
    env = setVar(env, "KITSUDEN_API_URL", process.env.KITSUDEN_API_URL);
  writeFileSync(envFile, env);

  const apiUrl = env.match(/^KITSUDEN_API_URL=(.*)$/m)?.[1] ?? "";
  mkdirSync(join(root, ".kitsuden"), { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ sitePort: port, apiUrl }, null, 2) + "\n");
  console.log(`site  http://localhost:${port}`);
  console.log(`api   ${apiUrl || "(not set: put KITSUDEN_API_URL in .env)"}`);
}

function dev() {
  const state = readState();
  if (!state) throw new Error("Run `node scripts/orca-worktree.mjs setup` first.");
  const r = spawnSync("pnpm", ["exec", "astro", "dev", "--port", String(state.sitePort)], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  process.exit(r.status ?? 1);
}

const command = process.argv[2] ?? "status";
try {
  if (command === "setup") await setup();
  else if (command === "dev") dev();
  else if (command === "status")
    console.log(JSON.stringify(readState() ?? { pending: "setup" }, null, 2));
  else throw new Error(`Unknown command "${command}": setup, dev or status.`);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
