/**
 * KITSUDEN System Map — Mapa determinista del repo y la aplicación
 * ============================================================================
 *
 * Función del sistema (SIN IA) que mapea:
 *   - REPO: rutas (endpoints Hono), tablas (Drizzle pgTable), kons, servicios,
 *     libs y migraciones — por escaneo de archivos, 100% determinista.
 *   - APP:  tablas vivas y relaciones (FK) — por introspección de PostgreSQL,
 *     inyectada por el host (el engine no se acopla a la DB).
 *
 * Produce un grafo de arquitectura { nodes, edges } + resumen. Misma entrada →
 * misma salida. Pensado para servirse como JSON (y por tanto TOON on-demand).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type SystemNodeType = "route-module" | "table" | "kon" | "service" | "lib" | "migration-set";

export interface SystemMapNode {
  id: string;
  type: SystemNodeType;
  label: string;
  group: string;
  meta?: Record<string, unknown>;
}

export interface SystemMapEdge {
  from: string;
  to: string;
  relation: string;
}

export interface SystemMapDatabase {
  tables: string[];
  relations: { from: string; to: string; via: string }[];
}

export interface SystemMap {
  generatedAt: string;
  repo: {
    routes: { file: string; endpoints: string[] }[];
    tables: { file: string; names: string[] }[];
    kons: string[];
    services: string[];
    libs: string[];
    migrations: number;
  };
  database?: SystemMapDatabase;
  graph: { nodes: SystemMapNode[]; edges: SystemMapEdge[] };
  summary: {
    totalEndpoints: number;
    totalRepoTables: number;
    totalDbTables: number;
    totalKons: number;
    totalServices: number;
    totalLibs: number;
    totalRelations: number;
  };
}

// ── Helpers de escaneo (deterministas) ───────────────────────────────────────

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".test.ts"))
    .map((e) => e.name)
    .sort();
}

function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}

const ENDPOINT_RE = /\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
const PGTABLE_RE = /pgTable\(\s*["'`]([a-z0-9_]+)["'`]/g;

function extractEndpoints(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(ENDPOINT_RE)) {
    out.push(`${m[1].toUpperCase()} ${m[2]}`);
  }
  return out;
}

function extractTables(source: string): string[] {
  const out = new Set<string>();
  for (const m of source.matchAll(PGTABLE_RE)) out.add(m[1]);
  return Array.from(out).sort();
}

function safeRead(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function countMigrations(root: string): number {
  const dirs = [join(root, "apps/api/src/db/migrations"), join(root, "apps/api/drizzle")];
  let count = 0;
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    count += readdirSync(dir).filter((f) => f.endsWith(".sql")).length;
  }
  return count;
}

// ── Constructor principal ─────────────────────────────────────────────────────

export interface SystemMapOptions {
  projectRoot?: string;
  /** Introspección viva de la DB, inyectada por el host (opcional). */
  database?: SystemMapDatabase;
}

export function buildSystemMap(options: SystemMapOptions = {}): SystemMap {
  const root = options.projectRoot ?? process.cwd();
  const rel = (p: string) => relative(root, p).replace(/\\/g, "/");

  // ── REPO: rutas ──
  const routesDir = join(root, "apps/api/src/routes");
  const routes = listFiles(routesDir)
    .map((file) => ({
      file: rel(join(routesDir, file)),
      endpoints: extractEndpoints(safeRead(join(routesDir, file))),
    }))
    .filter((r) => r.endpoints.length > 0);

  // ── REPO: tablas (schema core + kons) ──
  const schemaFiles = [
    join(root, "apps/api/src/db/schema-core.ts"),
    join(root, "apps/api/src/db/schema.ts"),
  ].filter(existsSync);
  const tables = schemaFiles
    .map((f) => ({ file: rel(f), names: extractTables(safeRead(f)) }))
    .filter((t) => t.names.length > 0);

  // ── REPO: kons, servicios, libs ──
  const kons = listDirs(join(root, "packages/kons"));
  const services = listFiles(join(root, "apps/api/src/services")).map((f) =>
    f.replace(/\.ts$/, "")
  );
  const libs = listFiles(join(root, "apps/api/src/lib")).map((f) => f.replace(/\.ts$/, ""));
  const migrations = countMigrations(root);

  // ── GRAFO: nodos ──
  const nodes: SystemMapNode[] = [];
  const edges: SystemMapEdge[] = [];

  for (const r of routes) {
    const id = `route:${r.file}`;
    nodes.push({
      id,
      type: "route-module",
      label: r.file.split("/").pop() ?? r.file,
      group: "api",
      meta: { endpoints: r.endpoints.length },
    });
  }

  const repoTableNames = new Set<string>();
  for (const t of tables) {
    for (const name of t.names) {
      repoTableNames.add(name);
      nodes.push({ id: `table:${name}`, type: "table", label: name, group: "database" });
    }
  }

  for (const kon of kons) {
    const id = `kon:${kon}`;
    nodes.push({ id, type: "kon", label: kon, group: "kons" });
    // Kon → tablas que define (scan de su schema).
    const konDir = join(root, "packages/kons", kon);
    if (existsSync(konDir)) {
      const schemaFile = readdirSync(konDir).find((f) => f.endsWith(".schema.ts"));
      if (schemaFile) {
        for (const name of extractTables(safeRead(join(konDir, schemaFile)))) {
          edges.push({ from: id, to: `table:${name}`, relation: "defines" });
          if (!repoTableNames.has(name)) {
            repoTableNames.add(name);
            nodes.push({ id: `table:${name}`, type: "table", label: name, group: "database" });
          }
        }
      }
    }
  }

  nodes.push({
    id: "migrations",
    type: "migration-set",
    label: `${migrations} migraciones`,
    group: "database",
    meta: { count: migrations },
  });

  // ── APP: relaciones FK vivas (si el host las inyectó) ──
  if (options.database) {
    for (const t of options.database.tables) {
      if (!repoTableNames.has(t)) {
        nodes.push({
          id: `table:${t}`,
          type: "table",
          label: t,
          group: "database",
          meta: { liveOnly: true },
        });
      }
    }
    for (const r of options.database.relations) {
      edges.push({ from: `table:${r.from}`, to: `table:${r.to}`, relation: `fk:${r.via}` });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    repo: { routes, tables, kons, services, libs, migrations },
    database: options.database,
    graph: { nodes, edges },
    summary: {
      totalEndpoints: routes.reduce((n, r) => n + r.endpoints.length, 0),
      totalRepoTables: repoTableNames.size,
      totalDbTables: options.database?.tables.length ?? 0,
      totalKons: kons.length,
      totalServices: services.length,
      totalLibs: libs.length,
      totalRelations: edges.filter((e) => e.relation.startsWith("fk:")).length,
    },
  };
}
