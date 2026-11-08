/**
 * /api/admin/agents/:id/notify — la URL de aviso de un agente (kitsuden2.md B3)
 * ============================================================================
 *
 *   GET  /api/admin/agents/:id/notify          { url, hasSecret }
 *   PUT  /api/admin/agents/:id/notify          { url: "https://…" | null }
 *        Al poner la primera URL se crea el secreto de firma y se devuelve
 *        en `secret`: es la ÚNICA vez que se ve.
 *   POST /api/admin/agents/:id/notify/rotate   un secreto nuevo (una vez)
 *
 * Operaciones del SDK del núcleo (`kon-avisos-de-agentes`), fuera de MCP. Solo
 * administradores. La URL la pone un humano, nunca el agente: así un agente no
 * puede apuntar los avisos a una dirección interna. Ver
 * lib/avisos-de-propuestas.ts.
 */

import { defineOperacion } from "@kitsuden/shared";
import { eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";

import {
  routerDeOperaciones,
  type OperacionCualquiera,
} from "../../../../packages/engine/src/operaciones";
import { db } from "../db";
import { agentIdentities } from "../db/schema";
import {
  ajustesDeAviso,
  guardarUrlDeAviso,
  motivoDeUrlInvalida,
  rotarSecretoDeAviso,
} from "../lib/avisos-de-propuestas";
import { logger } from "../lib/logger";
import { registrarOperacionesDelNucleo } from "../lib/operaciones-del-nucleo";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { exigirAdmin, sinAgentesEnGestionDeAgentes } from "../middleware/auth-guard";

const deAdmin = {
  acceso: "sesion" as const,
  permiso: { roles: ["admin"] },
  // La URL y el secreto los pone una persona, nunca un agente (F5)
  antes: [
    sinAgentesEnGestionDeAgentes as unknown as MiddlewareHandler,
    exigirAdmin as unknown as MiddlewareHandler,
  ],
  mcp: { excluir: "Only a human administrator sets where an agent's notifications go (an agent could point them at an internal address)." },
  etiquetas: ["agents"],
};
const ParamId = z.object({ id: z.string().min(1).max(200) });
const Ajustes = z.object({ url: z.string().nullable(), hasSecret: z.boolean() });
const noEncontrado = (c: Context) => c.json({ error: "Agent not found", code: "KITSUDEN_E_NOT_FOUND" }, 404);

async function existe(id: string): Promise<boolean> {
  const [a] = await db
    .select({ id: agentIdentities.id })
    .from(agentIdentities)
    .where(eq(agentIdentities.id, id))
    .limit(1);
  return Boolean(a);
}

function quien(c: Context): string {
  return ((c.get("user" as never) as { id?: string } | null)?.id ?? "admin").slice(0, 200);
}

export const operacionesDeAvisos: OperacionCualquiera[] = [
  defineOperacion({
    ...deAdmin,
    id: "aviso-de-agente",
    metodo: "GET",
    ruta: "/:id/notify",
    resumen: "Agent notify URL (admin)",
    descripcion: "The agent's notify URL for proposal resolutions, and whether it has a signing secret (never the secret).",
    entrada: { params: ParamId },
    salida: { esquema: Ajustes },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: async ({ params }, { c }) => {
      const id = (params as { id: string }).id;
      return (await existe(id)) ? ajustesDeAviso(id) : noEncontrado(c);
    },
  }),
  defineOperacion({
    ...deAdmin,
    id: "fijar-aviso-de-agente",
    metodo: "PUT",
    ruta: "/:id/notify",
    resumen: "Set the agent notify URL (admin)",
    descripcion:
      "Sets (or removes, with null) the https URL that receives a signed webhook when one of the agent's proposals is resolved. The first time, the signing secret is returned in `secret`: it is shown only once.",
    entrada: { params: ParamId, cuerpo: z.object({ url: z.string().max(2000).nullable() }) },
    salida: { esquema: z.object({ url: z.string().nullable(), secret: z.string().optional() }) },
    errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_BAD_REQUEST"],
    manejar: async ({ params, cuerpo }, { c }) => {
      const id = (params as { id: string }).id;
      if (!(await existe(id))) return noEncontrado(c);
      const url = (cuerpo as { url: string | null }).url || null;
      if (url) {
        const motivo = motivoDeUrlInvalida(url);
        if (motivo) return c.json({ error: motivo, code: "KITSUDEN_E_BAD_REQUEST" }, 400);
      }
      const r = await guardarUrlDeAviso(id, url, quien(c));
      logger.info({ agentId: id, url: r.url ? new URL(r.url).origin : null }, "[avisos] URL de aviso cambiada");
      return r;
    },
  }),
  defineOperacion({
    ...deAdmin,
    id: "rotar-secreto-de-aviso",
    metodo: "POST",
    ruta: "/:id/notify/rotate",
    resumen: "Rotate the agent notify secret (admin)",
    descripcion: "Issues a new signing secret (the previous one stops working at once). Shown only in this response.",
    entrada: { params: ParamId },
    salida: { esquema: z.object({ secret: z.string() }) },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: async ({ params }, { c }) => {
      const id = (params as { id: string }).id;
      if (!(await existe(id))) return noEncontrado(c);
      const secret = await rotarSecretoDeAviso(id, quien(c));
      logger.info({ agentId: id }, "[avisos] secreto de aviso rotado");
      return { secret };
    },
  }),
];

export const konDeAvisos = {
  id: "kon-avisos-de-agentes",
  name: "Agent notifications",
  version: "1.0.0",
  mountPath: "/api/admin/agents",
  operaciones: operacionesDeAvisos,
};

registrarOperacionesDelNucleo({
  konId: "kon-avisos-de-agentes",
  mountPath: "/api/admin/agents",
  descripcion: "Where an agent is told that its proposals were resolved (administrators only).",
  operaciones: operacionesDeAvisos,
});

const contexto = { auth: { requireAuth, optionalAuth } } as never;
export const avisosDeAgentesRoutes = routerDeOperaciones("kon-avisos-de-agentes", operacionesDeAvisos, contexto);
