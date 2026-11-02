/**
 * Quitar comentarios de un fuente TypeScript, sin comerse el código
 * ============================================================================
 *
 * Varias sondas buscan patrones en el código (`CREATE TABLE`, `kitsuden.config`)
 * y tienen que ignorar las MENCIONES en comentarios: esos ficheros documentan
 * justo el patrón que se persigue, así que sin esto se denunciarían a sí mismos.
 *
 * ── POR QUÉ NO VALE EL REGEX OBVIO ─────────────────────────────────────────
 *
 * La versión ingenua —`fuente.replace(/\/\*[\s\S]*?\*\//g, "")`— borra código.
 * En `apps/api/src/index.ts` hay dieciséis `/*` y solo cinco `*​/`: los demás
 * son rutas comodín dentro de cadenas, como `"/api/v1/*"`. El regex empareja
 * uno de esos con un `*​/` que está miles de líneas más abajo y se lleva por
 * delante todo lo que hay en medio — medí 23 KB de 38 KB.
 *
 * El síntoma es el peor posible en una sonda: no falla, simplemente deja de
 * mirar la mayor parte del fichero y pasa en verde.
 *
 * ── LA REGLA ───────────────────────────────────────────────────────────────
 *
 * Un bloque de comentario solo cuenta si su `/*` abre línea (nada más que
 * espacios delante). Un `/*` dentro de una cadena siempre tiene algo antes
 * —comilla, paréntesis, `=`— así que la distinción es fiable y no necesita un
 * parser.
 *
 * Los saltos de línea se conservan sustituyendo por espacios: si se borraran,
 * los números de línea que informa la sonda serían los del texto recortado y no
 * los del fichero, y mandarían a leer el sitio equivocado.
 */

export function sinComentarios(fuente: string): string {
  return (
    fuente
      // Bloques que abren línea: `/** …` o `/* …`, hasta su cierre.
      .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, (m) => m.replace(/[^\n]/g, " "))
      .split("\n")
      .map((l) => (l.trimStart().startsWith("//") ? "" : l))
      .join("\n")
  );
}
