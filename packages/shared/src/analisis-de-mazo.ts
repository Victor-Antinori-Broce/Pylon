/**
 * El vocabulario del análisis de un mazo. UNO, para los dos lados.
 * ============================================================================
 *
 * Qué barras tiene el perfil de un mazo, qué mide el «techo de habilidad», qué
 * papeles puede jugar una carta. Lo necesitan a la vez:
 *
 *   · el cargador (`apps/api/scripts/lib/tcg-analisis.ts`), que construye con
 *     esto el ESQUEMA del dataset editorial que rellena el panel;
 *   · la web (`src/lib/analisis.ts`), que con esto sabe qué campos leer y con
 *     qué nombre pintarlos.
 *
 * Si vivieran por duplicado, añadir una barra en un lado la dejaría sin
 * etiqueta en el otro —o peor: guardada y nunca pintada—, que es justo el
 * fallo que hace que un campo del panel parezca que no se guarda. Misma razón
 * por la que `renderizarBloques` vive aquí.
 *
 * ── LO QUE ESTO NO ES ──────────────────────────────────────────────────────
 *
 * No son datos: son las CASILLAS. Lo que va dentro lo escribe el equipo y es
 * una opinión suya. Las cifras de un mazo —cuota, listas, cartas más
 * incluidas— salen de la fuente y viven en otro sitio.
 */

export interface MedidaDeAnalisis {
  key: string;
  label: string;
  /** Qué quiere decir, para el pie de la barra */
  nota?: string;
}

/** Las siete barras del perfil, en el orden en que se leen. */
export const BARRAS_DE_MAZO: MedidaDeAnalisis[] = [
  { key: "attack", label: "Ataque" },
  { key: "control", label: "Control" },
  { key: "consistency", label: "Consistencia" },
  { key: "board_breaking", label: "Romper tableros" },
  { key: "versatility", label: "Versatilidad" },
  { key: "resilience", label: "Resistencia" },
  { key: "recovery", label: "Recuperación" },
];

/** Cuánto depende el mazo de quien lo pilota. */
export const MEDIDAS_DE_HABILIDAD: MedidaDeAnalisis[] = [
  {
    key: "decision_density",
    label: "Densidad de decisiones",
    nota: "Decisiones con peso por partida",
  },
  {
    key: "timing_sensitivity",
    label: "Sensibilidad al momento",
    nota: "Secuencia y ventanas de respuesta",
  },
  {
    key: "matchup_variance",
    label: "Variación por rival",
    nota: "Cuánto cambia el plan según el emparejamiento",
  },
  { key: "error_punishment", label: "Castigo del error", nota: "Lo caro que sale equivocarse" },
  { key: "autopilot_factor", label: "Piloto automático", nota: "Cuánto hace el mazo solo" },
];

/** Lo que se valora de una carta dentro de su mazo. */
export const MEDIDAS_DE_CARTA: MedidaDeAnalisis[] = [
  { key: "versatility", label: "Versatilidad" },
  { key: "power_level", label: "Potencia" },
  { key: "consistency_impact", label: "Peso en la consistencia" },
  { key: "meta_relevance", label: "Relevancia en el meta" },
  { key: "replaceability", label: "Reemplazabilidad" },
];

/** Los arquetipos de mazo que se repiten en cualquier juego de cartas. */
export const TIPOS_DE_MAZO = [
  "Aggro",
  "Mid-Range",
  "Control",
  "Combo",
  "Combo-Control",
  "Toolbox",
  "OTK / FTK",
  "Stun / Prison",
  "Quema",
];

export const CALIFICACIONES = ["Excelente", "Bueno", "Normal", "Flojo", "Malo"];

export const CURVAS_DE_APRENDIZAJE = ["Suave", "Moderada", "Exigente", "Muy exigente"];

/** Los papeles que puede tener una carta dentro del mazo. */
export const PAPELES_DE_CARTA = [
  "Golpeador principal",
  "Carta clave",
  "Defensor",
  "Iniciador de jugada",
  "Mejor carta",
  "Tecnología",
];

/** Las fases en las que se mide el aguante de un mazo. */
export const FASES_DE_AGUANTE = [
  "Partida temprana",
  "Media partida",
  "Partida larga",
  "Reciclado al cementerio (a mano)",
  "Reciclado al cementerio (a mazo/extra)",
  "Invocación desde el cementerio",
  "Remontada",
];

/**
 * Los factores con los que se compone la nota, con su peso.
 *
 * Vienen propuestos porque son los que se usan en el género, pero el peso lo
 * decide quien firma el análisis: la nota final es suya, no de este fichero.
 */
export const FACTORES_DE_NOTA = [
  "Consistencia",
  "Techo de potencia",
  "Intercambio de premios",
  "Reparto de emparejamientos",
  "Resistencia",
  "Velocidad",
  "Disrupción",
  "Eficiencia de recursos",
  "Flexibilidad",
  "Techo de habilidad",
];

/**
 * La nota compuesta a partir de los factores y sus pesos.
 *
 * Se calcula y no se escribe a mano porque una media ponderada escrita a mano
 * se desincroniza en cuanto se toca un peso, y entonces la nota deja de querer
 * decir lo que dice la tabla que tiene debajo. Devuelve `null` cuando no hay
 * factores con peso: una nota sin con qué calcularla no se inventa.
 */
export function notaPonderada(
  factores: Array<{ weight?: unknown; score?: unknown }>
): number | null {
  let peso = 0;
  let suma = 0;
  for (const f of factores) {
    const w = Number(f?.weight);
    const s = Number(f?.score);
    if (!Number.isFinite(w) || !Number.isFinite(s) || w <= 0) continue;
    peso += w;
    suma += w * s;
  }
  return peso > 0 ? Number((suma / peso).toFixed(2)) : null;
}
