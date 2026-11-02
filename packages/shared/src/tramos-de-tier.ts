/**
 * Los tramos de una tier list CALCULADA
 * ============================================================================
 *
 * Una tier list que sale de una cifra —la cuota de un arquetipo, una estadística
 * base— no la coloca nadie a mano: se ordena y se corta por percentiles. El
 * corte vive aquí porque lo usan dos sitios que no se ven entre ellos:
 *
 *   · el CARGADOR, que escribe la tier list y su nota;
 *   · la WEB, que pinta la letra junto a un arquetipo en la portada del juego.
 *
 * Mientras estuvo solo en el cargador, la web no tenía de dónde sacarla y la
 * única salida era copiar los números. Dos copias de un corte de percentiles
 * divergen en cuanto alguien toca una, y la letra de la portada dejaría de
 * coincidir con la de la tier list sin que nada fallara.
 *
 * La NOTA va con los tramos a propósito: una letra sin decir qué significa se
 * lee como una valoración, y esto no valora nada — dice cuánto se juega.
 */

export interface TramoDeTier {
  id: string;
  label: string;
  color: string;
  /** Percentil hasta el que llega, de 0 a 1. */
  hasta: number;
}

export const TIERS: TramoDeTier[] = [
  { id: "s", label: "S", color: "#ff7f7f", hasta: 0.1 },
  { id: "a", label: "A", color: "#ffbf7f", hasta: 0.3 },
  { id: "b", label: "B", color: "#ffff7f", hasta: 0.6 },
  { id: "c", label: "C", color: "#bfff7f", hasta: 0.85 },
  { id: "d", label: "D", color: "#7fbfff", hasta: 1 },
];

export const TRAMOS =
  "S = 10 % superior · A = siguiente 20 % · B = siguiente 30 % · C = siguiente 25 % · D = 15 % inferior";

/**
 * El tramo de quien va en la posición `indice` de `total`.
 *
 * `indice` es 0 para el primero. Un empate se resuelve fuera: quien llama pasa
 * la posición del PRIMERO con ese valor, para que dos cifras iguales caigan en
 * la misma letra.
 */
export function tramoPorPosicion(indice: number, total: number): TramoDeTier {
  if (total <= 0) return TIERS[TIERS.length - 1];
  const posicion = (indice + 1) / total;
  return TIERS.find((t) => posicion <= t.hasta) ?? TIERS[TIERS.length - 1];
}
