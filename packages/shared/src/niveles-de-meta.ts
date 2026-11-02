/**
 * El nivel de un arquetipo del meta: una letra, o por qué no la tiene
 * ============================================================================
 *
 * Una tabla de meta tiene que decir algo más que el porcentaje, porque «4,1 %»
 * no se compara solo: hace falta saber si eso es de los de arriba o de la cola.
 * Eso es la letra.
 *
 * ── POR QUE NO TODOS LLEVAN LETRA ──────────────────────────────────────────
 *
 * Porque no de todos se sabe lo mismo. Un arquetipo con tres mazos contados
 * puede salir 1.º o 40.º según qué torneo se mire, y ponerle una «F» sería
 * afirmar algo que la muestra no sostiene. Los que no llegan al mínimo se
 * quedan con una ETIQUETA que dice en qué situación están:
 *
 *   · **Emergente**   — apareció en este ciclo; todavía no hay con qué comparar.
 *   · **Prometedor**  — poca muestra, pero está subiendo.
 *   · **Sin clasificar** — poca muestra y sin señal.
 *
 * Es la diferencia entre «es malo» y «no lo sé», y mezclarlas es el error que
 * convierte una tabla de datos en una opinión disfrazada.
 *
 * ── LA LETRA ES CUOTA, NO CALIDAD ──────────────────────────────────────────
 *
 * Sale del percentil de la CUOTA —cuánto se juega—, que es lo que las fuentes
 * publican. No es winrate: nadie de quien leemos publica quién gana, así que
 * una columna de victorias aquí estaría inventada. La leyenda lo dice.
 */

export interface NivelDeMeta {
  id: string;
  label: string;
  color: string;
  /** Su tramo en la tier list (1, 2 o 3), o `null` si no sale en ella. */
  tier: 1 | 2 | 3 | null;
  /** `true` para A–F; `false` para las etiquetas. */
  esLetra: boolean;
  /** Qué significa, para la leyenda. */
  descripcion: string;
}

/**
 * Las seis letras, por percentil de cuota.
 *
 * Las TRES PRIMERAS son la tier list: A = Tier 1, B = Tier 2, C = Tier 3. Los
 * cortes están donde están para que el Tier 1 sea un puñado de mazos —lo que
 * de verdad domina— y no media tabla.
 */
export const LETRAS: Array<NivelDeMeta & { hasta: number }> = [
  {
    id: "a",
    label: "A",
    color: "#ff7f7f",
    tier: 1,
    esLetra: true,
    hasta: 0.1,
    descripcion: "El 10 % más jugado. Es lo que te vas a encontrar.",
  },
  {
    id: "b",
    label: "B",
    color: "#ffbf7f",
    tier: 2,
    esLetra: true,
    hasta: 0.25,
    descripcion: "Siguiente 15 %. Se ven a menudo.",
  },
  {
    id: "c",
    label: "C",
    color: "#ffff7f",
    tier: 3,
    esLetra: true,
    hasta: 0.45,
    descripcion: "Siguiente 20 %. Presentes, sin dominar.",
  },
  {
    id: "d",
    label: "D",
    color: "#bfff7f",
    tier: null,
    esLetra: true,
    hasta: 0.65,
    descripcion: "Siguiente 20 %. Poco vistos.",
  },
  {
    id: "e",
    label: "E",
    color: "#7fdfbf",
    tier: null,
    esLetra: true,
    hasta: 0.85,
    descripcion: "Siguiente 20 %. Marginales.",
  },
  {
    id: "f",
    label: "F",
    color: "#7fbfff",
    tier: null,
    esLetra: true,
    hasta: 1,
    descripcion: "15 % inferior. Casi no se juegan.",
  },
];

export const ETIQUETAS: Record<"prometedor" | "emergente" | "sin-clasificar", NivelDeMeta> = {
  emergente: {
    id: "emergente",
    label: "Emergente",
    color: "#c39bff",
    tier: null,
    esLetra: false,
    descripcion: "Apareció en este ciclo: no hay ventana anterior con la que compararlo.",
  },
  prometedor: {
    id: "prometedor",
    label: "Prometedor",
    color: "#9bd2ff",
    tier: null,
    esLetra: false,
    descripcion: "Poca muestra todavía, pero su cuota ha subido desde la ventana anterior.",
  },
  "sin-clasificar": {
    id: "sin-clasificar",
    label: "Sin clasificar",
    color: "#8a8a99",
    tier: null,
    esLetra: false,
    descripcion: "No se han contado mazos suficientes para darle una letra con sentido.",
  },
};

/** Todos los niveles, en el orden en que se leen y se filtran. */
export const NIVELES: NivelDeMeta[] = [
  ...LETRAS.map(({ hasta: _hasta, ...n }) => n),
  ETIQUETAS.prometedor,
  ETIQUETAS.emergente,
  ETIQUETAS["sin-clasificar"],
];

/**
 * Cuántos mazos hacen falta para merecer una letra.
 *
 * El 1 % de lo contado, con un suelo de cinco. El porcentaje hace que el
 * criterio no dependa del tamaño del volcado —no es lo mismo un mínimo de
 * cinco sobre 450 mazos que sobre 40.000— y el suelo evita que en una muestra
 * pequeña baste con uno.
 */
export const minimoParaLetra = (muestra: number): number => Math.max(5, Math.round(muestra * 0.01));

export interface ArquetipoGraduable {
  id: string;
  cuota: number;
  mazos: number;
  /** Puntos que subió o bajó; `null` si no hay ventana anterior. */
  diferencia: number | null;
}

/**
 * Cuántos arquetipos caben en cada letra.
 *
 * Los cortes son los percentiles, **pero cada letra se lleva al menos uno
 * mientras queden arquetipos**. Sin ese suelo, el percentil se rompe en campos
 * pequeños: con dos arquetipos, el más jugado cae en el 50 % y sale con una D
 * siendo el que manda. El porcentaje deja de tener sentido cuando no hay sobre
 * qué repartirlo, y el orden sí lo tiene.
 *
 * Con 35 arquetipos reparte 4 · 5 · 7 · 7 · 7 · 5, que es la forma que tiene
 * una tier list de verdad: un Tier 1 corto.
 */
function cuposDeLetras(total: number): number[] {
  const cupos: number[] = [];
  let usados = 0;

  for (const letra of LETRAS) {
    const quedan = total - usados;
    if (quedan <= 0) {
      cupos.push(0);
      continue;
    }
    const porPercentil = Math.round(letra.hasta * total) - usados;
    const cupo = Math.min(quedan, Math.max(1, porPercentil));
    cupos.push(cupo);
    usados += cupo;
  }

  return cupos;
}

/** En qué letra cae el que va en la posición `indice` (0 = el primero). */
function letraDe(indice: number, cupos: number[]): number {
  let hasta = 0;
  for (let i = 0; i < cupos.length; i++) {
    hasta += cupos[i];
    if (indice < hasta) return i;
  }
  return LETRAS.length - 1;
}

export const NOTA_DE_NIVELES =
  "La letra sale del percentil de la CUOTA —qué porcentaje de los mazos vistos son de ese arquetipo—," +
  " no de cuántas partidas gana: nuestras fuentes publican qué se juega, no quién gana." +
  " A = Tier 1 (10 % más jugado) · B = Tier 2 (siguiente 15 %) · C = Tier 3 (siguiente 20 %) ·" +
  " D, E y F son el resto, y cada letra se lleva al menos un arquetipo mientras queden." +
  " Los que no llegan al mínimo de mazos contados llevan etiqueta en vez de letra.";

/**
 * El nivel de cada arquetipo, por su id.
 *
 * `muestra` es el total de mazos contados en la ventana; de ahí sale el mínimo.
 * El percentil se calcula SOLO entre los que llegan al mínimo: si entraran
 * también los de tres mazos, una «A» dejaría de significar «de los más
 * jugados» y pasaría a significar «de los que tenemos datos, el mejor».
 *
 * Dos cuotas iguales comparten letra, como en la tier list.
 */
export function nivelesDeMeta(
  arquetipos: ArquetipoGraduable[],
  muestra: number
): Map<string, NivelDeMeta> {
  const minimo = minimoParaLetra(muestra);
  const conLetra = arquetipos
    .filter((a) => a.mazos >= minimo)
    .sort((x, y) => y.cuota - x.cuota || x.id.localeCompare(y.id));
  const cuotas = conLetra.map((a) => a.cuota);
  const cupos = cuposDeLetras(conLetra.length);

  const mapa = new Map<string, NivelDeMeta>();

  conLetra.forEach((a, i) => {
    // Un empate hereda la letra del PRIMERO con esa cuota: misma cifra, misma
    // letra, aunque el corte del cupo caiga justo en medio de los empatados.
    const { hasta: _hasta, ...nivel } = LETRAS[letraDe(cuotas.indexOf(cuotas[i]), cupos)];
    mapa.set(a.id, nivel);
  });

  for (const a of arquetipos) {
    if (mapa.has(a.id)) continue;
    if (a.diferencia === null) mapa.set(a.id, ETIQUETAS.emergente);
    else if (a.diferencia > 0) mapa.set(a.id, ETIQUETAS.prometedor);
    else mapa.set(a.id, ETIQUETAS["sin-clasificar"]);
  }

  return mapa;
}
