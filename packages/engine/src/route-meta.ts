/**
 * Metadatos de ruta — lo que una ruta sabe decir de sí misma
 * ============================================================================
 *
 * ── EL PROBLEMA ────────────────────────────────────────────────────────────
 *
 * El OpenAPI de Kitsuden solo publicaba lo que cada kon declaraba A MANO en
 * `openApi.paths`. Ningún kon lo declaró. Medido contra la instalación en
 * marcha, `GET /api/docs/openapi.json` documentaba 15 operaciones: el CRUD
 * genérico de `/items` y dos datasets de prueba. Ni una ruta de torneos, tier
 * lists ni emisión — mientras 62 rutas de kons validaban su cuerpo con zod.
 *
 * Así que el esquema existía y no lo leía nadie, y un vibecoder que generaba
 * el SDK recibía un cliente sin nada del dominio. Su agente acababa escribiendo
 * filas a mano en `/items/esports_matches`, saltándose justo las reglas que son
 * el valor del producto.
 *
 * ── LA SOLUCION ────────────────────────────────────────────────────────────
 *
 * Declarar a mano es la opción que ya falló, así que la ruta se DESCRIBE SOLA:
 * cada middleware que sabe algo de la ruta lo deja escrito en su propia
 * función —`validateRequest` su esquema, `requireAuth` que exige sesión, la
 * guarda de sección qué sección exige— y la API recorre las rutas montadas de
 * cada kon para construir el contrato.
 *
 * Una ruta nueva sale en el OpenAPI sin que nadie se acuerde de nada. Que es la
 * única forma de que un contrato no se quede atrás.
 */

import type { MiddlewareHandler } from "hono";

/**
 * Clave compartida por `Symbol.for`, no por `Symbol()`: si dos copias del
 * engine acaban cargadas —un kon con su propio `node_modules`— tienen que
 * reconocer los metadatos de la otra.
 */
export const ROUTE_META = Symbol.for("kitsuden.route.meta");

export interface RouteValidationMeta {
  target: "json" | "query" | "param" | "form";
  /** Esquema zod. Tipado como `unknown` para no atar este módulo a zod. */
  schema: unknown;
}

export interface RouteMeta {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  /** `required`: sin credencial responde 401. `optional`: la usa si llega. */
  auth?: "required" | "optional";
  /** Sección de un kon que tiene que estar encendida (ver kon-broadcast). */
  section?: string;
  validation?: RouteValidationMeta[];
  /**
   * La ruta la generó el SDK de kons a partir de esta declaración: el OpenAPI
   * y el MCP salen de ella (esquemas de salida, scope, errores…), no de lo que
   * se pueda deducir de los middlewares. Tipada como `unknown` para no atar
   * este módulo a `@kitsuden/shared`.
   */
  operacion?: { konId: string; declaracion: unknown };
}

type ConMeta = { [ROUTE_META]?: RouteMeta };

/**
 * Hono ENVUELVE el handler al montar un sub-router que tiene su propio
 * `onError`, y guarda el original en esta propiedad. Sin seguirla, los
 * metadatos de esos routers serían invisibles y sus rutas saldrían sin esquema.
 */
const COMPOSED_HANDLER = "__COMPOSED_HANDLER";

/** Adjunta metadatos a una función (middleware o handler) y la devuelve. */
export function withRouteMeta<T extends object>(fn: T, meta: RouteMeta): T {
  const previo = (fn as ConMeta)[ROUTE_META];
  const combinado: RouteMeta = {
    ...previo,
    ...meta,
    validation: [...(previo?.validation ?? []), ...(meta.validation ?? [])],
  };
  Object.defineProperty(fn, ROUTE_META, {
    value: combinado,
    configurable: true,
    enumerable: false,
    writable: true,
  });
  return fn;
}

/**
 * Middleware que no hace nada salvo describir la ruta.
 *
 *     app.post("/tournament/:id/report", describeRoute({ summary: "…" }), …)
 *
 * Para lo que ningún otro middleware sabe: el resumen humano y un
 * `operationId` legible, que es lo que acaba siendo el nombre del método en
 * el SDK generado.
 */
export function describeRoute(meta: Omit<RouteMeta, "validation">): MiddlewareHandler {
  const mw: MiddlewareHandler = async (_c, next) => {
    await next();
  };
  return withRouteMeta(mw, meta);
}

/** Lee los metadatos de una función, atravesando los envoltorios de Hono. */
export function readRouteMeta(fn: unknown): RouteMeta | undefined {
  let actual = fn as (ConMeta & Record<string, unknown>) | undefined;
  for (let i = 0; i < 5 && actual; i++) {
    const meta = actual[ROUTE_META];
    if (meta) return meta;
    actual = actual[COMPOSED_HANDLER] as typeof actual;
  }
  return undefined;
}
