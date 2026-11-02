/**
 * Engine Graphify — Rutas (arquitectura KITSUDEN §3)
 *
 * Endpoints relacionales automáticos montados en /api/graph.
 * Corren bajo withTransactionalRLS (montado en index.ts), por lo que
 * PostgreSQL aplica las políticas RLS en cada query via c.get("tx").
 *
 * CHAINED SYNTAX (Hono RPC): las rutas se registran encadenadas para que
 * `typeof graphifyRoutes` acumule los tipos de cada endpoint. El cliente
 * obtiene autocompletado end-to-end sin codegen:
 *
 *   import { hc } from "hono/client";
 *   import type { GraphifyAppType } from "@kitsuden/api"; // o ruta relativa
 *   const graph = hc<GraphifyAppType>(`${baseUrl}/api/graph`);
 *   const res = await graph[":table"].$get({ param: { table: "games" } });
 */

import { Hono } from "hono";

import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import {
  buildGraphFor,
  listRows,
  getRow,
  getRelatedRows,
  invalidateGraphifyCache,
  GraphifyError,
} from "../services/graphify";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getExecutor(c: any) {
  // Preferir la transacción RLS del Muro de Titanio; fallback a db
  return c.get("tx") ?? db;
}

/**
 * ¿Admin? Decide qué tablas ve (ver `puedeVerTabla` en services/graphify).
 * Un agente cuenta como admin solo con el scope `admin`, igual que en las
 * puertas de `auth-guard.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function accesoDe(c: any): { esAdmin: boolean } {
  const agente = c.get("agent") as { scopes?: string[] } | undefined;
  if (agente) return { esAdmin: agente.scopes?.includes("admin") === true };
  const user = c.get("user") as { role?: string } | null | undefined;
  return { esAdmin: user?.role === "admin" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleError(c: any, err: unknown) {
  if (err instanceof GraphifyError) {
    return c.json({ success: false, error: err.message }, err.status);
  }
  console.error("[Graphify] Unexpected error:", err);
  return c.json({ success: false, error: "Graphify internal error" }, 500);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseListOptions(c: any) {
  const reserved = new Set(["limit", "offset", "orderBy", "order", "format"]);
  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(c.req.query() as Record<string, string>)) {
    if (!reserved.has(key)) filters[key] = value;
  }
  return {
    limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
    offset: c.req.query("offset") ? Number(c.req.query("offset")) : undefined,
    orderBy: c.req.query("orderBy") || undefined,
    order: c.req.query("order") === "desc" ? ("desc" as const) : ("asc" as const),
    filters,
  };
}

export const graphifyRoutes = new Hono()
  .use("/*", requireAuth)

  /**
   * GET /api/graph
   * Grafo completo: tablas expuestas + edges (relaciones FK).
   */
  .get("/", async (c) => {
    try {
      const graph = await buildGraphFor(accesoDe(c));
      return c.json({ success: true, ...graph, edgeCount: graph.edges.length });
    } catch (err) {
      return handleError(c, err);
    }
  })

  /**
   * POST /api/graph/refresh
   * Invalida el caché del grafo (útil tras activar un kon nuevo).
   */
  .post("/refresh", async (c) => {
    // Vaciar la caché obliga a reintrospectar la base: no es para cualquiera
    if (!accesoDe(c).esAdmin) return c.json({ success: false, error: "Forbidden" }, 403);
    invalidateGraphifyCache();
    return c.json({ success: true, message: "Graphify cache invalidated" });
  })

  /**
   * GET /api/graph/:table
   * Listado paginado con filtros de igualdad (?columna=valor).
   */
  .get("/:table", async (c) => {
    try {
      const result = await listRows(
        getExecutor(c),
        c.req.param("table"),
        parseListOptions(c),
        accesoDe(c)
      );
      return c.json({ success: true, table: c.req.param("table"), ...result });
    } catch (err) {
      return handleError(c, err);
    }
  })

  /**
   * GET /api/graph/:table/:id
   * Registro puntual por primary key.
   */
  .get("/:table/:id", async (c) => {
    try {
      const row = await getRow(
        getExecutor(c),
        c.req.param("table"),
        c.req.param("id"),
        accesoDe(c)
      );
      if (!row) return c.json({ success: false, error: "Record not found" }, 404);
      return c.json({ success: true, table: c.req.param("table"), row });
    } catch (err) {
      return handleError(c, err);
    }
  })

  /**
   * GET /api/graph/:table/:id/:relation
   * Filas relacionadas — JOINs resueltos automáticamente (N:1, 1:N y N:M).
   * Ejemplo KITSUDEN: /api/graph/usuarios/1/proyectos
   */
  .get("/:table/:id/:relation", async (c) => {
    try {
      const result = await getRelatedRows(
        getExecutor(c),
        c.req.param("table"),
        c.req.param("id"),
        c.req.param("relation"),
        parseListOptions(c),
        accesoDe(c)
      );
      return c.json({
        success: true,
        table: c.req.param("table"),
        relation: c.req.param("relation"),
        ...result,
      });
    } catch (err) {
      return handleError(c, err);
    }
  });

/** Hono RPC: tipo acumulado de todos los endpoints de Graphify */
export type GraphifyAppType = typeof graphifyRoutes;
