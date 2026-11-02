#!/usr/bin/env bun
/**
 * The OpenAPI 3.1 document of the kon SDK operations, offline and deterministic
 * ============================================================================
 *
 * Input of the client generator (`scripts/sdk/generate.mjs`): every operation
 * declared with `defineOperacion` by
 *
 *   - the INSTALLED kons (`packages/core/*`, `kitsuden.kons.json`, `KITSUDEN_KONS`),
 *   - the operations the core mounts itself (`registrarOperacionesDelNucleo`:
 *     agent permissions, approvals, proposals, brain memory, promotion),
 *
 * turned into OpenAPI with the SAME function the API uses for
 * `GET /api/docs/openapi.json` (`operacionOpenApi`). No database, no app, no
 * network: it imports the definitions, never mounts them.
 *
 * Output is sorted (paths, methods, keys of `x-kitsuden-*` objects are kept
 * as generated; tags sorted) so two runs give the same bytes.
 *
 *   bun --no-env-file scripts/sdk-openapi.ts                 # writes the snapshot
 *   bun --no-env-file scripts/sdk-openapi.ts --check         # fails if the snapshot is stale
 *   bun --no-env-file scripts/sdk-openapi.ts --out=<file>    # another destination
 *
 * `--check` compares only the kons that are installed HERE: in a clean clone
 * (CI) the kons from kitsuden-kons are absent, so their part of the snapshot
 * is kept and reported as "not installed, not checked".
 *
 * `--no-env-file` is not optional: in the primary checkout `apps/api/.env`
 * holds production credentials, and Bun would load them. This script also
 * forces the in-memory test database before importing anything.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// ── 0. Nothing here may reach a real database ────────────────────────────────
for (const k of ["DATABASE_URL", "DATABASE_ADMIN_URL", "REDIS_URL", "VALKEY_URL"]) delete process.env[k];
process.env.NODE_ENV = "test";
process.env.KITSUDEN_TEST_DB = "memory";
// src/db refuses to load without a URL; port 1 on loopback never answers, and
// with KITSUDEN_TEST_DB=memory nothing tries it (pg-mem).
process.env.DATABASE_URL = "postgres://offline:offline@127.0.0.1:1/kitsuden_sdk_offline_test";
process.env.LOG_LEVEL = "silent";

const RAIZ_API = resolve(import.meta.dir, "..");
const RAIZ = resolve(RAIZ_API, "../..");
const DESTINO_POR_DEFECTO = join(RAIZ, "packages/sdk/openapi/kitsuden.openapi.json");

const args = process.argv.slice(2);
const comprobar = args.includes("--check");
const destino = resolve(args.find((a) => a.startsWith("--out="))?.slice(6) ?? DESTINO_POR_DEFECTO);

// Quiet: the route modules log while importing.
const log = (s: string) => process.stderr.write(`${s}\n`);
console.log = () => undefined;
console.info = () => undefined;
console.warn = () => undefined;
console.debug = () => undefined;

const { VERSION_DE_KITSUDEN } = await import("@kitsuden/shared");
const { componentesComunes, operacionOpenApi } = await import("../src/lib/operaciones-openapi");
const { operacionesDelNucleo } = await import("../src/lib/operaciones-del-nucleo");
const { konsInstalados } = await import("../src/lib/kons-instalados");
const { operacionesDe } = await import("../../../packages/engine/src/operaciones");

type Op = ReturnType<typeof operacionesDe>[number];
interface Fuente {
  konId: string;
  mountPath: string;
  descripcion: string;
  operaciones: Op[];
}

// ── 1. Installed kons ────────────────────────────────────────────────────────
const fuentes = new Map<string, Fuente>();
for (const k of konsInstalados()) {
  if (!k.ruta || !k.manifiesto) continue;
  const entrada = ["index.ts", join("dist", "index.js"), "index.js"]
    .map((f) => join(k.ruta!, f))
    .find((f) => existsSync(f));
  if (!entrada) continue;
  const mod = (await import(pathToFileURL(entrada).href)) as Record<string, unknown>;
  const def = (mod.kon ?? mod.default) as
    | { id?: string; mountPath?: string; description?: string; name?: string; operaciones?: unknown }
    | undefined;
  if (!def?.operaciones) continue;
  const operaciones = operacionesDe(def as never);
  if (operaciones.length === 0) continue;
  const id = k.manifiesto.id;
  const mountPath = (
    k.manifiesto.mount?.path ??
    def.mountPath ??
    `/api/${id.replace(/^kon-/, "")}`
  ).replace(/\/+$/, "");
  fuentes.set(id, {
    konId: id,
    mountPath,
    descripcion: String(def.description ?? k.manifiesto.description ?? def.name ?? id),
    operaciones,
  });
}

// ── 2. Core operations (route modules that register themselves) ─────────────
const dirRutas = join(RAIZ_API, "src/routes");
for (const f of readdirSync(dirRutas).sort()) {
  if (!f.endsWith(".ts")) continue;
  const texto = readFileSync(join(dirRutas, f), "utf8");
  if (!texto.includes("registrarOperacionesDelNucleo(")) continue;
  await import(pathToFileURL(join(dirRutas, f)).href);
}
for (const n of operacionesDelNucleo()) {
  if (fuentes.has(n.konId)) continue;
  fuentes.set(n.konId, {
    konId: n.konId,
    mountPath: n.mountPath.replace(/\/+$/, ""),
    descripcion: n.descripcion,
    operaciones: n.operaciones as Op[],
  });
}

// ── 3. The document ─────────────────────────────────────────────────────────
type Json = Record<string, unknown>;
const paths: Record<string, Record<string, Json>> = {};
const tags: { name: string; description: string }[] = [];
const ORDEN_METODOS = ["get", "put", "post", "delete", "patch"];

for (const f of [...fuentes.values()].sort((a, b) => a.konId.localeCompare(b.konId))) {
  tags.push({ name: f.konId, description: f.descripcion });
  for (const op of f.operaciones) {
    const g = operacionOpenApi(f.konId, f.mountPath, op as never);
    const item = (paths[g.camino] ??= {});
    if (!item[g.metodo]) item[g.metodo] = g.operacion;
  }
}

const pathsOrdenados: typeof paths = {};
for (const camino of Object.keys(paths).sort()) {
  const item = paths[camino]!;
  pathsOrdenados[camino] = {};
  for (const m of ORDEN_METODOS) if (item[m]) pathsOrdenados[camino]![m] = item[m]!;
}

const doc = {
  openapi: "3.1.0",
  info: {
    title: "Kitsuden API — kon SDK operations",
    version: VERSION_DE_KITSUDEN,
    description:
      "Every operation declared with defineOperacion by the installed kons and the core. " +
      "Generated by apps/api/scripts/sdk-openapi.ts; input of the typed clients (pnpm sdk:generate).",
    license: { name: "MIT", identifier: "MIT" },
  },
  servers: [{ url: "http://localhost:3000/api", description: "Local development" }],
  tags,
  paths: pathsOrdenados,
  components: componentesComunes(),
};

const texto = `${JSON.stringify(doc, null, 2)}\n`;
const total = Object.values(pathsOrdenados).reduce((n, p) => n + Object.keys(p).length, 0);

// ── 4. Write or check ───────────────────────────────────────────────────────
if (comprobar) {
  if (!existsSync(destino)) {
    log(`[sdk-openapi] ${destino} does not exist: run pnpm sdk:openapi`);
    process.exit(1);
  }
  const previo = JSON.parse(readFileSync(destino, "utf8")) as typeof doc;
  const konDe = (o: Json) => (o["x-kitsuden-operation"] as { kon?: string } | undefined)?.kon ?? "";
  const presentes = new Set(fuentes.keys());
  const porClave = (d: typeof doc, soloPresentes: boolean) => {
    const m = new Map<string, string>();
    for (const [camino, item] of Object.entries(d.paths))
      for (const [metodo, o] of Object.entries(item)) {
        if (soloPresentes && !presentes.has(konDe(o as Json))) continue;
        m.set(`${metodo.toUpperCase()} ${camino}`, JSON.stringify(o));
      }
    return m;
  };
  const ahora = porClave(doc, false);
  const antes = porClave(previo, true);
  const cambios: string[] = [];
  for (const [k, v] of ahora) if (antes.get(k) !== v) cambios.push(antes.has(k) ? `changed ${k}` : `new ${k}`);
  for (const k of antes.keys()) if (!ahora.has(k)) cambios.push(`removed ${k}`);
  const ausentes = [
    ...new Set(
      Object.values(previo.paths)
        .flatMap((i) => Object.values(i))
        .map((o) => konDe(o as Json))
        .filter((k) => !presentes.has(k))
    ),
  ].sort();
  if (ausentes.length) log(`[sdk-openapi] not installed here, not checked: ${ausentes.join(", ")}`);
  if (JSON.stringify(previo.components) !== JSON.stringify(doc.components)) cambios.push("changed components");
  if (cambios.length) {
    log(`[sdk-openapi] the snapshot is STALE (${cambios.length}):\n  ${cambios.slice(0, 40).join("\n  ")}`);
    log("Run `pnpm sdk:openapi && pnpm sdk:generate` and commit the result.");
    process.exit(1);
  }
  log(`[sdk-openapi] snapshot up to date (${ahora.size} operations checked from ${presentes.size} kons)`);
  process.exit(0);
}

mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, texto);
log(`[sdk-openapi] ${total} operations from ${fuentes.size} kons → ${destino}`);
process.exit(0);
