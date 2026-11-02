import { Hono } from "hono";

/**
 * Lo que el middleware global de `index.ts` deja en el contexto y un kon
 * necesita leer: quién es (sesión o agente) y el id de la petición.
 */
export const VARIABLES_DEL_HOST = [
  "user",
  "session",
  "agent",
  "requestId",
  "userRoleIds",
  "userDepartmentId",
] as const;

const CLAVE_ENV = "__variablesDelHost";

/**
 * El router del kon, envuelto para que vea la identidad que ya resolvió la API.
 *
 * `router.fetch(...)` es un ciclo de petición NUEVO: su contexto nace vacío.
 * Un kon activado en caliente no veía `agent` ni `user`, así que su
 * `requireAuth` volvía a buscar la cookie… y un agente con `Bearer` (Inti con
 * `contenido:editar`) recibía 401 en cada escritura hasta reiniciar la API
 * (lo encontró el agente de instalación, 2026-10-15). Las variables viajan en
 * el `env` de esa llamada —junto con el del servidor, que lleva la IP del
 * socket que usa el limitador— y se reponen antes de entrar al kon.
 */
export function conContextoDelHost(router: Hono): Hono {
  const envuelto = new Hono();
  envuelto.use("*", async (c, next) => {
    const vars = (c.env as Record<string, unknown> | undefined)?.[CLAVE_ENV] as
      | Record<string, unknown>
      | undefined;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        if (v !== undefined) (c.set as (k: string, v: unknown) => void)(k, v);
      }
    }
    await next();
  });
  envuelto.route("/", router);
  return envuelto;
}

/** El `env` con el que se llama al kon: el del servidor + la identidad. */
export function envParaElKon(
  envDelHost: unknown,
  get: (k: string) => unknown
): Record<string, unknown> {
  const vars: Record<string, unknown> = {};
  for (const k of VARIABLES_DEL_HOST) vars[k] = get(k);
  return { ...((envDelHost as Record<string, unknown>) ?? {}), [CLAVE_ENV]: vars };
}
