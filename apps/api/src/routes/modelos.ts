/**
 * GET /api/models — los modelos (defineModelo) de los kons montados (fase H3)
 * ============================================================================
 *
 * El panel genera su vista de cada modelo (lista, alta, edición) a partir de
 * su DESCRIPTOR: campos, tipos, política de acceso, scopes y dónde vive la
 * colección. Esta ruta junta los de todos los kons montados para que el panel
 * sepa qué hay; cada modelo, además, publica el suyo en
 * `GET <montaje>/<plural>/_model` (operación `describe-<modelo>`, que sí es
 * herramienta MCP).
 *
 * Es una operación del SDK del NÚCLEO (`kon-modelos`), no de un kon: ningún
 * `kon:*` la abre. Para el equipo (admin, editor) y agentes con `admin`.
 */

import {
  defineOperacion,
  modelosMontados,
  routerDeOperaciones,
  type OperacionCualquiera,
} from "@kitsuden/engine";
import { esquemaDescriptorDeModelo } from "@kitsuden/shared";
import { z } from "zod";

import { registrarOperacionesDelNucleo } from "../lib/operaciones-del-nucleo";
import { optionalAuth, requireAuth } from "../middleware/auth";

export const RUTA_DE_MODELOS = "/api/models";

const ModeloMontado = z.object({
  kon: z.string(),
  mountPath: z.string(),
  base: z.string(),
  descriptor: esquemaDescriptorDeModelo,
});

export const operacionesDeModelos: OperacionCualquiera[] = [
  defineOperacion({
    id: "list-models",
    metodo: "GET",
    ruta: "/",
    resumen: "List the declared models",
    descripcion:
      "Every model declared with defineModelo in a mounted kon: its descriptor (fields, access policy, scopes) and the base path of its REST collection. The admin panel builds its model views from this.",
    etiquetas: ["models"],
    salida: { esquema: z.object({ data: z.array(ModeloMontado) }) },
    acceso: "sesion",
    permiso: { roles: ["admin", "editor"] },
    mcp: {
      excluir:
        "Panel listing. An agent reads each model with its own describe-<model> tool (and only the models its scopes open).",
    },
    manejar: () => ({
      data: modelosMontados().map((m) => ({
        kon: m.konId,
        mountPath: m.mountPath,
        base: m.base,
        descriptor: m.descriptor,
      })),
    }),
  }),
];

export const konDeModelos = {
  id: "kon-modelos",
  name: "Declared models",
  version: "1.0.0",
  mountPath: RUTA_DE_MODELOS,
  operaciones: operacionesDeModelos,
};

registrarOperacionesDelNucleo({
  konId: "kon-modelos",
  mountPath: RUTA_DE_MODELOS,
  descripcion: "The models declared with defineModelo in the mounted kons (for the admin panel).",
  operaciones: operacionesDeModelos,
});

const contexto = { auth: { requireAuth, optionalAuth } } as never;
export const modelosRoutes = routerDeOperaciones("kon-modelos", operacionesDeModelos, contexto);
