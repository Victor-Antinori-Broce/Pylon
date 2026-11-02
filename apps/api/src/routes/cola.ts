/**
 * /api/admin/queue — la cola de Postgres vista desde el panel
 * ============================================================================
 *
 *   GET    /api/admin/queue              recuento por cola y estado + los
 *                                        trabajos muertos («dead letter»)
 *   POST   /api/admin/queue/:id/retry    vuelve a encolar un trabajo muerto
 *   DELETE /api/admin/queue/:id          descarta un trabajo muerto
 *
 * Operaciones del SDK del núcleo (`kon-cola`): OpenAPI y SDK tipado, fuera de
 * MCP. Solo administradores (`/api/admin/*` pasa además por `exigirAdmin`,
 * que relee el rol de la base). Los muertos se listan SIN payload (puede
 * llevar direcciones de correo u otros datos personales).
 */

import { defineOperacion } from "@kitsuden/shared";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";

import {
  routerDeOperaciones,
  type OperacionCualquiera,
} from "../../../../packages/engine/src/operaciones";
import { registrarOperacionesDelNucleo } from "../lib/operaciones-del-nucleo";
import {
  descartarTrabajo,
  estadoDeLaCola,
  reintentarTrabajo,
  trabajosMuertos,
} from "../lib/queue";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { exigirAdmin } from "../middleware/auth-guard";

const deAdmin = {
  acceso: "sesion" as const,
  permiso: { roles: ["admin"] },
  antes: [exigirAdmin as unknown as MiddlewareHandler],
  mcp: { excluir: "Operations panel for administrators: a human inspects and retries background jobs." },
  etiquetas: ["queue"],
};
const ParamId = z.object({ id: z.guid() });
const Objeto = z.record(z.string(), z.unknown());

export const operacionesDeCola: OperacionCualquiera[] = [
  defineOperacion({
    ...deAdmin,
    id: "estado-de-la-cola",
    metodo: "GET",
    ruta: "/",
    resumen: "Queue status (admin)",
    descripcion:
      "Counts per queue and status (pending, running, done, dead), whether the worker and LISTEN are up, and the dead jobs (without payload) with their last error.",
    entrada: { query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }) },
    salida: { esquema: Objeto },
    manejar: async ({ query }) => {
      const limite = (query as { limit: number }).limit;
      const [estado, muertos] = [await estadoDeLaCola(), await trabajosMuertos(limite)];
      return { ...estado, dead: muertos };
    },
  }),
  defineOperacion({
    ...deAdmin,
    id: "reintentar-trabajo",
    metodo: "POST",
    ruta: "/:id/retry",
    resumen: "Retry a dead job (admin)",
    descripcion: "Puts a dead job back to pending with its attempts reset. 404 if there is no dead job with that id.",
    entrada: { params: ParamId },
    salida: { esquema: z.object({ success: z.literal(true) }) },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: async ({ params }, { c }) => {
      const ok = await reintentarTrabajo((params as { id: string }).id);
      return ok ? { success: true as const } : c.json({ error: "Dead job not found", code: "KITSUDEN_E_NOT_FOUND" }, 404);
    },
  }),
  defineOperacion({
    ...deAdmin,
    id: "descartar-trabajo",
    metodo: "DELETE",
    ruta: "/:id",
    resumen: "Discard a dead job (admin)",
    descripcion: "Deletes a dead job. 404 if there is no dead job with that id.",
    entrada: { params: ParamId },
    salida: { esquema: z.object({ success: z.literal(true) }) },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    sensible: false,
    manejar: async ({ params }, { c }) => {
      const ok = await descartarTrabajo((params as { id: string }).id);
      return ok ? { success: true as const } : c.json({ error: "Dead job not found", code: "KITSUDEN_E_NOT_FOUND" }, 404);
    },
  }),
];

export const konDeCola = {
  id: "kon-cola",
  name: "Background jobs",
  version: "1.0.0",
  mountPath: "/api/admin/queue",
  operaciones: operacionesDeCola,
};

registrarOperacionesDelNucleo({
  konId: "kon-cola",
  mountPath: "/api/admin/queue",
  descripcion: "The Postgres queue: status and dead jobs (administrators only).",
  operaciones: operacionesDeCola,
});

const contexto = { auth: { requireAuth, optionalAuth } } as never;
export const colaRoutes = routerDeOperaciones("kon-cola", operacionesDeCola, contexto);
