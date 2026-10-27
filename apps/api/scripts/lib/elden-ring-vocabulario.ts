/**
 * Elden Ring: vocabulario propio (español y portugués de Brasil)
 * ============================================================================
 *
 * Las categorías de arma, las partes de armadura, las afinidades y los tipos
 * de hechizo son rótulos del SITIO sobre datos de una fuente inglesa: los
 * traducimos nosotros. No salen de una fuente oficial; el juego tiene sus
 * propios nombres y quien los tenga de una fuente permitida puede sustituirlos
 * aquí (es el único sitio). Los nombres de los OBJETOS no se tocan.
 */

export interface Idiomas {
  es: string;
  pt: string;
}

export const CATEGORIAS_ARMA: Record<string, Idiomas> = {
  Dagger: { es: "Daga", pt: "Adaga" },
  "Straight Sword": { es: "Espada recta", pt: "Espada reta" },
  Greatsword: { es: "Espadón", pt: "Espadão" },
  "Colossal Sword": { es: "Espada colosal", pt: "Espada colossal" },
  "Thrusting Sword": { es: "Espada de estocada", pt: "Espada de estocada" },
  "Heavy Thrusting Sword": { es: "Espada pesada de estocada", pt: "Espada pesada de estocada" },
  "Curved Sword": { es: "Espada curva", pt: "Espada curva" },
  "Curved Greatsword": { es: "Espadón curvo", pt: "Espadão curvo" },
  Katana: { es: "Katana", pt: "Katana" },
  Twinblade: { es: "Hoja doble", pt: "Lâmina dupla" },
  Hammer: { es: "Martillo", pt: "Martelo" },
  Warhammer: { es: "Martillo grande", pt: "Martelo grande" },
  Flail: { es: "Mangual", pt: "Mangual" },
  Axe: { es: "Hacha", pt: "Machado" },
  Greataxe: { es: "Hacha grande", pt: "Machado grande" },
  Spear: { es: "Lanza", pt: "Lança" },
  "Great Spear": { es: "Lanza grande", pt: "Lança grande" },
  Halberd: { es: "Alabarda", pt: "Alabarda" },
  Reaper: { es: "Guadaña", pt: "Foice" },
  Whip: { es: "Látigo", pt: "Chicote" },
  Fist: { es: "Puño", pt: "Soco-inglês" },
  Claw: { es: "Garra", pt: "Garra" },
  "Colossal Weapon": { es: "Arma colosal", pt: "Arma colossal" },
  "Light Bow": { es: "Arco ligero", pt: "Arco leve" },
  Bow: { es: "Arco", pt: "Arco" },
  Greatbow: { es: "Arco grande", pt: "Arco grande" },
  Crossbow: { es: "Ballesta", pt: "Besta" },
  Ballista: { es: "Balista", pt: "Balista" },
  "Glintstone Staff": { es: "Báculo de piedra luminosa", pt: "Cajado de pedra luminosa" },
  "Sacred Seal": { es: "Sello sagrado", pt: "Selo sagrado" },
  Torch: { es: "Antorcha", pt: "Tocha" },
  "Small Shield": { es: "Escudo pequeño", pt: "Escudo pequeno" },
  "Medium Shield": { es: "Escudo mediano", pt: "Escudo médio" },
  Greatshield: { es: "Escudo grande", pt: "Escudo grande" },
};

/** «Gauntlet» y «Gauntlets» ya vienen unificados a «Gauntlets» antes de llegar aquí */
export const ESTADOS_ARMADURA: Record<string, Idiomas> = {
  Helm: { es: "Casco", pt: "Elmo" },
  "Chest Armor": { es: "Peto", pt: "Peitoral" },
  Gauntlets: { es: "Guanteletes", pt: "Manoplas" },
  "Leg Armor": { es: "Grebas", pt: "Grevas" },
};

export const AFINIDADES: Record<string, Idiomas> = {
  Standard: { es: "Estándar", pt: "Padrão" },
  Heavy: { es: "Pesada", pt: "Pesada" },
  Keen: { es: "Afilada", pt: "Afiada" },
  Quality: { es: "Calidad", pt: "Qualidade" },
  Fire: { es: "Fuego", pt: "Fogo" },
  Flame: { es: "Llama", pt: "Chama" },
  Lightning: { es: "Rayo", pt: "Raio" },
  Sacred: { es: "Sagrada", pt: "Sagrada" },
  Magic: { es: "Magia", pt: "Magia" },
  Cold: { es: "Frío", pt: "Frio" },
  Poison: { es: "Veneno", pt: "Veneno" },
  Blood: { es: "Sangre", pt: "Sangue" },
  Occult: { es: "Oculta", pt: "Oculta" },
  None: { es: "Ninguna", pt: "Nenhuma" },
};

export const TIPOS_HECHIZO: Record<string, Idiomas> = {
  Sorcery: { es: "Hechizo", pt: "Feitiçaria" },
  Incantation: { es: "Encantamiento", pt: "Encantamento" },
};
