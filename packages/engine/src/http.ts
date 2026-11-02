/**
 * Contrato HTTP para kons
 * ============================================================================
 *
 * Un kon no puede importar de `apps/api` — es la regla de aislamiento de
 * plugins. Pero sus rutas necesitan saber qué hay en el contexto de Hono, o
 * acaban haciendo `(c as any).get("user")` en cada manejador, que es apagar el
 * comprobador justo donde se decide quién eres.
 *
 * Esto declara la forma MÍNIMA que el host garantiza. Es el mismo patrón que
 * `SubscriptionLike` en kon-members: integración por FORMA, no por import. El
 * host puede poner más cosas en el contexto; un kon solo puede contar con esto.
 */

import type { Context } from "hono";

import { AppError } from "./errors";

/**
 * El usuario tal como lo ve un kon.
 *
 * Deliberadamente pobre: `id` y poco más. Un kon que necesite el perfil
 * completo debe pedirlo a su repositorio, no darlo por hecho en el contexto —
 * lo que hay ahí depende de qué middleware corrió antes.
 */
export interface KonUser {
  id: string;
  email?: string;
  role?: string;
  name?: string | null;
}

/** Lo que el host garantiza en el contexto de cada petición. */
export type KonVariables = {
  /** `null` cuando la petición es anónima. Siempre hay que comprobarlo. */
  user: KonUser | null;
  requestId?: string;
  traceId?: string;
  /** Transacción con contexto RLS, si la ruta pasa por `withTransactionalRLS`. */
  tx?: unknown;
};

/** Entorno de Hono para un router de kon. */
export type KonEnv = { Variables: KonVariables };

/**
 * Contexto tipado de una ruta de kon.
 *
 * ```ts
 * const router = new Hono<KonEnv>();
 * router.get("/mio", (c) => {
 *   const user = c.get("user");   // tipado, sin castear
 *   ...
 * });
 * ```
 */
export type KonRouteContext = Context<KonEnv>;

/**
 * Devuelve el usuario, o corta la petición con 401.
 *
 * Existe porque "esta ruta exige autenticación" vivía SOLO en el orden de los
 * middleware, y el comprobador no puede verlo. El resultado era
 * `(c as any).get("user").id`: el `any` ocultaba que `user` puede ser null, y
 * nadie lo comprobaba. Si un día alguien monta la ruta sin el middleware, el
 * fallo no es un 401 — es un `TypeError` con traza de servidor.
 *
 * Con esto la invariante es explícita, tipada y falla como debe.
 */
export function requireUser(c: KonRouteContext): KonUser {
  const user = c.get("user");
  if (!user) throw AppError.unauthenticated();
  return user;
}
