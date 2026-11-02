/**
 * El anfitrión de la RLS por petición, para los bancos de prueba de los kons.
 * ============================================================================
 *
 * Desde 2026-10-23 los kons no abren su transacción RLS: la abre el
 * anfitrión (module-loader monta `withTransactionalRLS()` delante de cada
 * router) y `ctx.db.instance` resuelve a ella dentro de la petición. Probar el
 * router de un kon a pelo, sin eso, sería probarlo SIN contexto —como el
 * sistema— y toda prueba de aislamiento daría verde por el motivo equivocado.
 *
 * Esto monta EXACTAMENTE las mismas piezas del engine que usa el anfitrión
 * (`transaccionRls`, `dbDeLaPeticion`, `comoSistema`, `segundoPlano`) sobre la
 * base de prueba (PGlite con un rol sin superusuario), con el mismo orden que
 * `src/index.ts`: primero quién pregunta, luego la transacción, luego el kon.
 */

import { Hono, type MiddlewareHandler } from "hono";

import {
  comoSistema,
  dbDeLaPeticion,
  segundoPlano,
  transaccionRls,
  type ConexionTransaccional,
} from "../../../packages/engine/src/rls-peticion";

export function anfitrionRls<T extends object>(db: T, auth: { optionalAuth: MiddlewareHandler }) {
  const instance = dbDeLaPeticion(db);
  return {
    /** Lo que va en `createTestKonContext({ db })`. */
    db: {
      instance,
      execute: async (consulta: unknown) =>
        (instance as unknown as ConexionTransaccional).execute(consulta),
      tableExists: async () => true,
      comoSistema,
      segundoPlano,
    },
    /** El router del kon, detrás de la sesión y de la transacción RLS. */
    montar(router: Hono): Hono {
      const app = new Hono();
      app.use("*", auth.optionalAuth);
      app.use("*", transaccionRls(db as unknown as ConexionTransaccional));
      app.route("/", router);
      return app;
    },
  };
}
