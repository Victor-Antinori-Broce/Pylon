/**
 * Kitsuden — Superficie Hono RPC (arquitectura KITSUDEN §7)
 *
 * Composición ENCADENADA de los routers que exponen tipos profundos al
 * cliente. A diferencia de `app.route()` suelto (que no acumula tipos),
 * esta cadena preserva la inferencia end-to-end de Hono RPC.
 *
 * PATRÓN DE MIGRACIÓN INCREMENTAL:
 * Cada router legacy que se convierta a chained syntax (definido como una
 * sola expresión `new Hono().get(...).post(...)` + zValidator) se agrega
 * aquí con un `.route(...)` más. El resto del API sigue funcionando igual;
 * esto solo mejora el DX del cliente.
 *
 * Uso en el cliente (sin codegen):
 * ```typescript
 * import { hc } from "hono/client";
 * import type { KitsudenRpcType } from "@kitsuden/api"; // o ruta relativa al monorepo
 *
 * const rpc = hc<KitsudenRpcType>("http://localhost:3001");
 * const res = await rpc.api.graph[":table"].$get({
 *   param: { table: "games" },
 *   query: { limit: "10" },
 * });
 * const data = await res.json(); // ← tipado por endpoint 🎉
 * ```
 */

import { Hono } from "hono";

import { agentsV1Routes } from "./routes/agents-v1";
import { datasetsQueryRoutes } from "./routes/datasets-query";
import { graphifyRoutes } from "./routes/graphify";
import { itemsRoutes } from "./routes/items";
import { secretsRoutes } from "./routes/secrets";
import { vaultRoutes } from "./routes/vault";

/**
 * Superficie RPC montable: index.ts hace `app.route("/", rpcSurface)` y los
 * middlewares de path (RLS transaccional, rate limiting, admin guard) se
 * aplican igual porque se registran sobre las mismas rutas /api/*.
 */
export const rpcSurface = new Hono()
  .route("/api/graph", graphifyRoutes)
  .route("/api/admin/secrets", secretsRoutes)
  .route("/api/admin/vault", vaultRoutes)
  .route("/api/items", itemsRoutes)
  .route("/api/datasets", datasetsQueryRoutes)
  .route("/api/v1", agentsV1Routes);

/**
 * Tipo RPC profundo — crece con cada router migrado a chained syntax.
 * Migrados: graphify, secrets, vault, items, datasets-query, agents-v1.
 * Candidatos siguientes: crud, functions, data-explorer.
 */
export type KitsudenRpcType = typeof rpcSurface;
