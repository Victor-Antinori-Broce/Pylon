/**
 * /api/admin/requests — la «caja de cristal» desde el panel (kitsuden2.md C7)
 * ============================================================================
 *
 *   GET /api/admin/requests?hours=24&limit=200&blocked=1&errors=1&actor=<id>
 *       Las peticiones registradas, de la más reciente a la más antigua.
 *   GET /api/admin/requests/summary?hours=24
 *       Por kon y operación: peticiones, errores 5xx, bloqueos, p95, media de
 *       tiempo en la base y filas escritas.
 *
 * Operaciones del SDK del núcleo (`kon-trazas`), fuera de MCP. Solo
 * administradores. Las trazas no llevan cuerpos ni parámetros; la ruta va
 * normalizada (lib/trazas.ts). (`/api/admin/traces` ya era de las trazas de los
 * AGENTES: observability.ts.)
 */

import { defineOperacion } from "@kitsuden/shared";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";

import {
  routerDeOperaciones,
  type OperacionCualquiera,
} from "../../../../packages/engine/src/operaciones";
import { registrarOperacionesDelNucleo } from "../lib/operaciones-del-nucleo";
import { listarTrazas, resumenDeTrazas, trazasEncendidas } from "../lib/trazas";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { exigirAdmin } from "../middleware/auth-guard";

const deAdmin = {
  acceso: "sesion" as const,
  permiso: { roles: ["admin"] },
  antes: [exigirAdmin as unknown as MiddlewareHandler],
  mcp: { excluir: "Operations panel for administrators: request traces are read by a human." },
  etiquetas: ["traces"],
};
const Horas = z.coerce.number().int().min(1).max(24 * 31).default(24);
const desde = (horas: number) => new Date(Date.now() - horas * 3600_000);

export const operacionesDeTrazas: OperacionCualquiera[] = [
  defineOperacion({
    ...deAdmin,
    id: "listar-peticiones",
    metodo: "GET",
    ruta: "/",
    resumen: "Request traces (admin)",
    descripcion:
      "Recorded requests, newest first: actor, kon, operation, duration, database time, rows written and blocked writes (owner filter or RLS). Writes, errors and blocks are always recorded; reads are sampled.",
    entrada: {
      query: z.object({
        hours: Horas,
        limit: z.coerce.number().int().min(1).max(1000).default(200),
        blocked: z.enum(["0", "1"]).optional(),
        errors: z.enum(["0", "1"]).optional(),
        actor: z.string().max(200).optional(),
      }),
    },
    salida: { esquema: z.object({ enabled: z.boolean(), requests: z.array(z.record(z.string(), z.unknown())) }) },
    manejar: async ({ query }) => {
      const q = query as { hours: number; limit: number; blocked?: string; errors?: string; actor?: string };
      if (!trazasEncendidas()) return { enabled: false, requests: [] };
      const requests = await listarTrazas({
        desde: desde(q.hours),
        limite: q.limit,
        soloBloqueos: q.blocked === "1",
        soloErrores: q.errors === "1",
        actor: q.actor || null,
      });
      return { enabled: true, requests };
    },
  }),
  defineOperacion({
    ...deAdmin,
    id: "resumen-de-peticiones",
    metodo: "GET",
    ruta: "/summary",
    resumen: "Request traces by operation (admin)",
    descripcion: "Per kon, operation and route: requests, 5xx errors, blocked writes, p95 duration, mean database time and rows written.",
    entrada: { query: z.object({ hours: Horas }) },
    salida: { esquema: z.object({ enabled: z.boolean(), operations: z.array(z.record(z.string(), z.unknown())) }) },
    manejar: async ({ query }) => {
      if (!trazasEncendidas()) return { enabled: false, operations: [] };
      return { enabled: true, operations: await resumenDeTrazas(desde((query as { hours: number }).hours)) };
    },
  }),
];

export const konDeTrazas = {
  id: "kon-trazas",
  name: "Request traces",
  version: "1.0.0",
  mountPath: "/api/admin/requests",
  operaciones: operacionesDeTrazas,
};

registrarOperacionesDelNucleo({
  konId: "kon-trazas",
  mountPath: "/api/admin/requests",
  descripcion: "The glass box: one trace per request, in Postgres (administrators only).",
  operaciones: operacionesDeTrazas,
});

const contexto = { auth: { requireAuth, optionalAuth } } as never;
export const trazasRoutes = routerDeOperaciones("kon-trazas", operacionesDeTrazas, contexto);
