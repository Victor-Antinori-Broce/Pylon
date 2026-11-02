/**
 * OAuth para MCP — lo que usa el PANEL (operaciones del SDK del núcleo)
 * ============================================================================
 *
 *   GET    /api/oauth/consent/:id   lo que enseña la pantalla de consentimiento
 *   POST   /api/oauth/consent/:id   aprobar (agente + scopes) o denegar
 *   GET    /api/oauth/grants        clientes conectados (admin: todos; editor: los suyos)
 *   DELETE /api/oauth/grants/:id    revocar una conexión
 *
 * Solo HUMANOS admin o editor, con el rol de AHORA (no el de la cookie). Un
 * agente —clave estática u OAuth, traiga `admin` o no— nunca consiente ni
 * gestiona conexiones. Fuera de MCP con motivo. Los endpoints del protocolo
 * (metadatos, registro, token…) están en routes/oauth.ts.
 * Guía: docs/agents/oauth.md.
 */

import { defineOperacion, routerDeOperaciones, type OperacionCualquiera } from "@kitsuden/engine";
import type { Context, MiddlewareHandler } from "hono";
import { z } from "zod";

import {
  ErrorOAuth,
  concesionVisible,
  decidirConsentimiento,
  humanoFresco,
  listarConexiones,
  revocarConcesion,
  vistaDeConsentimiento,
  type Humano,
} from "../lib/oauth/servicio";
import { registrarOperacionesDelNucleo } from "../lib/operaciones-del-nucleo";
import { optionalAuth, requireAuth } from "../middleware/auth";

export const RUTA_DE_OAUTH = "/api/oauth";

const get = (c: Context, k: string) => (c.get as (k: string) => unknown)(k);

/** Humano admin/editor con el rol fresco; lo deja en `oauthHumano`. */
const humanoDelEquipo: MiddlewareHandler = async (c, next) => {
  const user = get(c, "user") as { id?: string; role?: string } | null | undefined;
  if (!user?.id) return c.json({ error: "Authentication required", code: "KITSUDEN_E_UNAUTHENTICATED" }, 401);
  if (get(c, "agent") || user.role === "agent" || user.id.startsWith("machine-")) {
    return c.json({ error: "Only a human can consent or manage OAuth connections", code: "KITSUDEN_E_FORBIDDEN" }, 403);
  }
  const h = await humanoFresco(user.id);
  if (!h || (h.role !== "admin" && h.role !== "editor")) {
    return c.json({ error: "Requires an admin or editor account", code: "KITSUDEN_E_FORBIDDEN" }, 403);
  }
  (c.set as (k: string, v: unknown) => void)("oauthHumano", h);
  c.header("Cache-Control", "no-store");
  await next();
};

const humano = (c: Context) => get(c, "oauthHumano") as Humano;

const SIN_MCP = {
  excluir:
    "OAuth consent and connection management are human decisions in the admin panel; no agent may grant itself access or revoke connections.",
};
const delEquipo = {
  acceso: "sesion" as const,
  permiso: { roles: ["admin", "editor"] },
  antes: [humanoDelEquipo],
  mcp: SIN_MCP,
  etiquetas: ["oauth"],
};

const Objeto = z.record(z.string(), z.unknown());
const ParamId = z.object({ id: z.guid() });
const Decision = z
  .object({
    decision: z.enum(["approve", "deny"]),
    agentId: z.string().max(200).optional(),
    newAgent: z.object({ name: z.string().max(100), description: z.string().max(500).optional() }).strict().optional(),
    scopes: z.array(z.string().max(200)).max(200).optional(),
  })
  .strict();
const FiltroDeConexiones = z
  .object({
    agentId: z.string().max(200).optional(),
    includeRevoked: z.enum(["true", "false"]).optional(),
  })
  .strict();

const NO_ESTA = { error: "Authorization request not found or expired", code: "KITSUDEN_E_NOT_FOUND" };

export const operacionesDeOAuth: OperacionCualquiera[] = [
  defineOperacion({
    ...delEquipo,
    id: "ver-consentimiento",
    metodo: "GET",
    ruta: "/consent/:id",
    resumen: "OAuth consent request",
    descripcion:
      "What the consent screen shows for a pending MCP client authorization: the client, where the answer is sent (with a localhost warning), the requested scopes and the agents this human may delegate, with the scopes they may grant.",
    entrada: { params: ParamId },
    salida: { esquema: Objeto },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: async (e, { c }) => {
      const vista = await vistaDeConsentimiento((e.params as { id: string }).id, humano(c));
      return vista ? c.json(vista) : c.json(NO_ESTA, 404);
    },
  }),
  defineOperacion({
    ...delEquipo,
    id: "decidir-consentimiento",
    metodo: "POST",
    ruta: "/consent/:id",
    resumen: "Allow or deny an MCP client",
    descripcion:
      "Allow: the client acts as the chosen agent (or a new one, admins only) with the chosen scopes, which must be a subset of what the agent and this human already have; this human becomes the agent's signer. Deny: the client gets access_denied. Answers with the URL to send the browser to.",
    entrada: { params: ParamId, cuerpo: Decision },
    salida: { esquema: z.object({ redirectTo: z.string() }) },
    errores: ["KITSUDEN_E_NOT_FOUND", "KITSUDEN_E_FORBIDDEN", "KITSUDEN_E_VALIDATION"],
    manejar: async (e, { c }) => {
      try {
        const r = await decidirConsentimiento((e.params as { id: string }).id, humano(c), e.cuerpo as z.infer<typeof Decision>);
        return r ? c.json(r) : c.json(NO_ESTA, 404);
      } catch (err) {
        if (err instanceof ErrorOAuth) return c.json({ error: err.descripcion, code: err.error }, err.estado as 400);
        throw err;
      }
    },
  }),
  defineOperacion({
    ...delEquipo,
    id: "listar-conexiones",
    metodo: "GET",
    ruta: "/grants",
    resumen: "Connected MCP clients",
    descripcion:
      "OAuth connections: client, agent, who allowed it, scopes, created and last used. Admins see all; editors the ones they allowed.",
    entrada: { query: FiltroDeConexiones },
    salida: { esquema: z.object({ grants: z.array(Objeto) }) },
    manejar: async (e, { c }) => {
      const q = e.query as z.infer<typeof FiltroDeConexiones>;
      return c.json({
        grants: await listarConexiones(humano(c), { agentId: q.agentId, incluirRevocadas: q.includeRevoked === "true" }),
      });
    },
  }),
  defineOperacion({
    ...delEquipo,
    id: "revocar-conexion",
    metodo: "DELETE",
    ruta: "/grants/:id",
    resumen: "Revoke an OAuth connection",
    descripcion:
      "Revokes the connection, its tokens and its agent key row: the client stops on its next request. Someone else's connection answers 404 to an editor.",
    entrada: { params: ParamId },
    salida: { esquema: z.object({ revoked: z.boolean() }) },
    errores: ["KITSUDEN_E_NOT_FOUND"],
    manejar: async (e, { c }) => {
      const id = (e.params as { id: string }).id;
      const h = humano(c);
      if (!(await concesionVisible(h, id))) return c.json({ error: "Connection not found", code: "KITSUDEN_E_NOT_FOUND" }, 404);
      await revocarConcesion(id, h.id);
      return c.json({ revoked: true });
    },
  }),
];

export const konDeOAuth = {
  id: "kon-oauth",
  name: "OAuth for MCP (panel)",
  version: "1.0.0",
  mountPath: RUTA_DE_OAUTH,
  operaciones: operacionesDeOAuth,
};

registrarOperacionesDelNucleo({
  konId: "kon-oauth",
  mountPath: RUTA_DE_OAUTH,
  descripcion: "Consent and connected-client management for OAuth MCP clients (human admins and editors only).",
  operaciones: operacionesDeOAuth,
});

const contexto = { auth: { requireAuth, optionalAuth } } as never;
export const oauthPanelRoutes = routerDeOperaciones("kon-oauth", operacionesDeOAuth, contexto);
