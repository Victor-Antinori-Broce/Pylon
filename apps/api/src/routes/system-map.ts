/**
 * System Map — Ruta (función del sistema, sin IA)
 * ============================================================================
 *
 * GET /api/map
 *   Mapa determinista del repo (rutas, tablas, kons, servicios, libs) + la
 *   aplicación viva (tablas y relaciones FK por introspección de PostgreSQL).
 *
 * Como toda ruta bajo /api/*, respeta la negociación TOON:
 *   GET /api/map?format=toon   →  respuesta en TOON
 *   Accept: application/vnd.toon
 */

import { buildSystemMap } from "@kitsuden/engine";
import { Hono } from "hono";

import { protectRoute } from "../middleware/auth-guard";
import { getAllTables, introspectTable } from "../services/schema-introspector";

const app = new Hono();

/** Construye las relaciones FK vivas desde la introspección de PostgreSQL. */
async function liveDatabase(): Promise<
  { tables: string[]; relations: { from: string; to: string; via: string }[] } | undefined
> {
  try {
    const tables = await getAllTables("public");
    const relations: { from: string; to: string; via: string }[] = [];
    for (const table of tables) {
      const info = await introspectTable(table, "public");
      if (!info) continue;
      for (const fk of info.foreignKeys) {
        relations.push({ from: table, to: fk.foreignTable, via: fk.column });
      }
    }
    return { tables, relations };
  } catch {
    // Sin DB disponible → mapa solo de repo (degradación limpia).
    return undefined;
  }
}

app.get("/", protectRoute, async (c) => {
  const includeDb = c.req.query("db") !== "false";
  const database = includeDb ? await liveDatabase() : undefined;
  const map = buildSystemMap({ projectRoot: process.cwd(), database });
  return c.json(map);
});

export const systemMapRoutes = app;
