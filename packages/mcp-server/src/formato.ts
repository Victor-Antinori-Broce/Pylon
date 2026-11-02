/**
 * Texto de un resultado MCP: JSON compacto o TOON, el más corto que no pierda
 * nada. Es la parte de `auto` de la API (apps/api/src/lib/formatos.ts) que este
 * paquete puede hacer sin depender de ella: sin TRON (sería una dependencia
 * más) y sin caché por forma (aquí los resultados son pequeños).
 *
 * Las herramientas que leen de la API piden `Accept: application/vnd.kitsuden.auto`
 * y pasan el cuerpo tal cual; esto es para los datos que el servidor ya tiene
 * como objeto.
 */

import { decodeToon, encodeToon } from "./toon";

export type FormatoDeTexto = "json" | "toon" | "tron";

/** Por debajo de esto no merece la pena intentar otro formato que JSON. */
const UMBRAL_MINIMO = 256;
/** TOON solo se elige si ahorra al menos esto frente a JSON compacto. */
const MARGEN_MINIMO = 0.02;

export function textoDeResultado(datos: unknown): { texto: string; formato: FormatoDeTexto } {
  const json = JSON.stringify(datos) ?? "null";
  if (json.length < UMBRAL_MINIMO) return { texto: json, formato: "json" };
  try {
    const toon = encodeToon(datos);
    if (toon.length <= json.length * (1 - MARGEN_MINIMO) && JSON.stringify(decodeToon(toon)) === json) {
      return { texto: toon, formato: "toon" };
    }
  } catch {
    // Sin TOON: JSON, que es la fuente
  }
  return { texto: json, formato: "json" };
}

/** Clave de `_meta` en que va el formato del texto (la misma que usa la API). */
export const META_FORMATO = "kitsuden/format";
