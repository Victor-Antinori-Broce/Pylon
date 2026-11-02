/**
 * ¿Puede ESTE agente pasar por una ruta que solo pide «estar autenticado»?
 * ============================================================================
 *
 * Auditoría 2026-10-25: `requireAuth`/`protectRoute` aceptaban a cualquier
 * agente como usuario con sesión, aunque su clave solo trajera
 * `datasets:x:read`; con eso comentaba, se inscribía en torneos o guardaba
 * builds. Ahora un agente pasa si:
 *
 *   · la ruta es una operación del SDK (decide su `permiso`, o
 *     `usuario:actuar` si no declara ninguno: engine/src/operaciones.ts);
 *   · la puerta por prefijo ya le abrió por scope (`agenteAbiertoPorPuerta`,
 *     p. ej. `esports:*` en /api/esports);
 *   · trae `usuario:actuar` o `admin`;
 *   · o trae algún scope de la FAMILIA de la ruta: del kon que la sirve
 *     (`<kon>:…`, `kon:<kon>:…`), y para las rutas de datasets (también la
 *     API lite `/api/data-sets`) cualquier `datasets:…` — la ruta comprueba
 *     después el dataset concreto.
 *
 * Las operaciones del SDK no pasan por esta regla: son contratos declarados y
 * deciden con su `permiso` (marca `operacionSdk`).
 *
 * Cómo convive con las fases E y F (decidido 2026-10-25; pruebas en
 * tests/unit/agente-como-usuario-caminos.test.ts):
 *
 *   · Scopes finos por dataset (E): `datasets:<slug>:<acción>` abre la familia
 *     `datasets` (también la API lite); el dataset concreto lo mira la ruta.
 *   · Firmante humano (F, `sponsor_user_id`): FIRMA lo que crea el agente
 *     (autoría y auditoría), NO le presta la cuenta del humano. Un agente con
 *     firmante y sin scope útil sigue sin actuar como usuario aquí. Lo que el
 *     agente firma pasa por las operaciones del SDK, que deciden su `permiso`.
 *   · Aprobación humana (F): la propuesta aprobada se ejecuta con la identidad
 *     del agente releída de la base (lib/aprobaciones.ts), así que pasa por
 *     ESTA regla otra vez. Aprobar es una puerta más, no una concesión: si el
 *     agente no podía hacerlo solo, la ejecución queda `failed` con 403.
 *   · Las herramientas MCP deciden en su propio punto de control
 *     (mcp:read/mcp:write + la política de cada dataset), no aquí.
 *
 * Ninguno de esos caminos marca la petición como «actuar como usuario»: así el
 * agujero que cierra la auditoría sigue cerrado para todo lo demás.
 */
import { agenteActuaComoUsuario, nombreCortoDeKon } from "@kitsuden/shared";
import type { Context } from "hono";

import { konDeCamino } from "../lib/rutas-de-kons";

export function agentePuedeActuarComoUsuario(c: Context): boolean {
  const get = c.get as (clave: string) => unknown;
  const agente = get("agent") as { scopes?: string[] } | undefined;
  if (!agente) return true;
  if (get("operacionSdk") || get("agenteAbiertoPorPuerta")) return true;
  const scopes = (agente.scopes ?? []).filter((s) => !s.startsWith("!"));
  if (agenteActuaComoUsuario(scopes)) return true;
  const familia = familiaDeRuta(c.req.path);
  return (
    familia !== null &&
    scopes.some((s) => s.startsWith(`${familia}:`) || s.startsWith(`kon:${familia}:`))
  );
}

/** `blog` para /api/blog/…, `datasets` para /api/datasets y /api/data-sets. */
function familiaDeRuta(camino: string): string | null {
  if (camino === "/api/data-sets" || camino.startsWith("/api/data-sets/")) return "datasets";
  const kon = konDeCamino(camino);
  return kon === null ? null : nombreCortoDeKon(kon);
}

export const MENSAJE_AGENTE_SIN_CUENTA =
  "This agent key cannot act as a user account here (grant it 'usuario:actuar' or the kon scope).";
