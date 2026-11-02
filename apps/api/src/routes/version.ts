/**
 * GET /api/version — qué Kitsuden corre y qué contratos habla
 * ============================================================================
 *
 * Pública y sin sesión, a propósito: la consultan clientes que todavía no se
 * han autenticado (el adaptador de Inti la pide perezosamente antes de su
 * primera escritura) y no revela nada que no se deduzca de la propia API.
 * Sin detalles de despliegue (commit, entorno, host): solo producto, versión
 * semver y la versión MAYOR de cada contrato público.
 *
 *   { "producto": "kitsuden", "version": "0.9.0-beta",
 *     "contratos": { "page-builder": 1, "games": 1, "games-editorial": 1, ... } }
 *
 * Solo se anuncian los contratos cuyo kon está montado (ver KON_DE_CONTRATO).
 * Los números salen de `CONTRATOS` (packages/shared/src/contratos.ts), que es
 * donde se documenta cuándo se suben. Política completa y matriz de
 * compatibilidad: docs/instalacion/versiones.md.
 *
 * Montaje (index.ts, junto a /api/health, antes de cualquier ruta con auth):
 *
 *   import { versionRoutes } from "./routes/version";
 *   app.route("/api/version", versionRoutes);
 */

import {
  CONTRATOS,
  SDKS,
  VERSION_DE_KITSUDEN,
  type NombreDeContrato,
  type RespuestaDeVersion,
} from "@kitsuden/shared";
import { Hono } from "hono";

/**
 * El kon que SIRVE cada contrato. Los que no están aquí son del núcleo
 * (siempre montados).
 *
 * Antes se anunciaban todos siempre: con kon-games apagado, `/api/version`
 * decía `games: 1` y `/api/games` respondía 404, así que un cliente
 * (el adaptador de Inti) creía poder escribir y fallaba después, más lejos y
 * con un error que no hablaba del kon. Un contrato sin su kon no se anuncia.
 */
export const KON_DE_CONTRATO: Partial<Record<NombreDeContrato, string>> = {
  "page-builder": "kon-blocks",
  games: "kon-games",
  "games-editorial": "kon-games",
};

type Disponibilidad = (konId: string) => boolean | Promise<boolean>;

/**
 * Quién dice si un kon está montado. Lo fija `index.ts` tras cargar los kons
 * (`konDisponible` de lib/kons-diferidos). Sin fijar —un router de versión
 * montado suelto, como en los tests de contrato— se anuncian todos.
 */
let disponibilidad: Disponibilidad = () => true;

export function fijarDisponibilidadDeKons(fn: Disponibilidad): void {
  disponibilidad = fn;
}

/** El cuerpo, separado para poder probarlo sin montar la app */
export async function respuestaDeVersion(
  estaDisponible: Disponibilidad = disponibilidad
): Promise<RespuestaDeVersion> {
  const contratos: Record<string, number> = {};
  for (const [nombre, version] of Object.entries(CONTRATOS) as [NombreDeContrato, number][]) {
    const kon = KON_DE_CONTRATO[nombre];
    if (kon && !(await estaDisponible(kon))) continue;
    contratos[nombre] = version;
  }
  return { producto: "kitsuden", version: VERSION_DE_KITSUDEN, contratos, sdk: { ...SDKS } };
}

export const versionRoutes = new Hono();

versionRoutes.get("/", async (c) => {
  // Cambia al desplegar o al activar/desactivar un kon: poco tiempo de caché
  c.header("Cache-Control", "public, max-age=60");
  return c.json(await respuestaDeVersion());
});
