/**
 * Patrones de validación escritos por un editor, sin ReDoS
 * ============================================================================
 *
 * Un campo de dataset puede declarar `validation.pattern` / `validationRegex`,
 * y se compilaba con `new RegExp(...)` tal cual para probar cada valor que
 * entra (alta de entradas, importación CSV). Un patrón catastrófico como
 * `^(a+)+$` contra `"aaaa…!"` deja el hilo de eventos de la API colgado: con
 * Bun eso es toda la API (auditoría 2026-10-25).
 *
 * JS no trae un motor lineal (re2) sin dependencia nativa, así que aquí:
 *   · el patrón tiene un tope de longitud;
 *   · se rechazan las formas que causan retroceso exponencial: un grupo con
 *     cuantificador o alternativa dentro que a su vez lleva cuantificador
 *     (`(a+)+`, `(a|aa)*`, `(\w*)*`), y las retrorreferencias;
 *   · el valor que se prueba tiene un tope de longitud (`probarPatron`).
 * Un patrón rechazado se trata como «sin patrón»: nunca tumba la petición.
 */

export const LONGITUD_MAXIMA_DE_PATRON = 256;
export const LONGITUD_MAXIMA_A_PROBAR = 10_000;

/** Grupo con cuantificador (o `|`) dentro, cuantificado a su vez: `(…+…)+`, `(…|…)*`. */
const CUANTIFICADOR_ANIDADO =
  /\((?:[^()\\]|\\.)*(?:[+*]|\{\d+,?\d*\}|\|)(?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,?\d*\})/;
/** `\1`…`\9` y `\k<nombre>`. */
const RETRORREFERENCIA = /\\[1-9]|\\k(?=<)/;

/** El patrón compilado, o `null` si es inválido o arriesgado. */
export function patronSeguro(patron: unknown, flags?: string): RegExp | null {
  if (typeof patron !== "string" || patron === "" || patron.length > LONGITUD_MAXIMA_DE_PATRON) return null;
  if (CUANTIFICADOR_ANIDADO.test(patron) || RETRORREFERENCIA.test(patron)) return null;
  try {
    return new RegExp(patron, flags);
  } catch {
    return null;
  }
}

/**
 * ¿Cumple `valor` el patrón? `true` si el patrón no es usable (se ignora) y
 * `false` si el valor es más largo de lo que se prueba.
 */
export function probarPatron(patron: unknown, valor: string): boolean {
  const re = patronSeguro(patron);
  if (!re) return true;
  if (valor.length > LONGITUD_MAXIMA_A_PROBAR) return false;
  return re.test(valor);
}
