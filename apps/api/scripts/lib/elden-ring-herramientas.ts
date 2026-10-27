/**
 * Elden Ring: base de datos y creador de equipo
 * ============================================================================
 *
 * Las cifras (armas, escudos, armaduras, talismanes, clases, cenizas de guerra,
 * hechizos y munición) las introdujo a mano el propietario en `gamedata/games/
 * elden-ring/data/*.json`. Este módulo las pasa a tablas de la base de datos,
 * a un creador de equipo y a una ficha de wiki por arma, y es PURO: lee lo que
 * le dan y no toca nada.
 *
 * ── LO QUE SE PUBLICA Y LO QUE NO ──────────────────────────────────────────
 *
 * Se publican nombres, categorías, pesos, ataques, guardias, escalados,
 * requisitos, negaciones y resistencias, costes de FP y ranuras, y la
 * **descripción** de cada objeto (por decisión del propietario, 2026-10-19; es
 * el texto que escribió FromSoftware, en inglés y traducido por nosotros). No
 * se publican las **imágenes** (apuntaban a `/media/weapons/…`, que no existe)
 * ni los efectos largos de cenizas y hechizos, que son prosa de procedencia
 * desconocida. Un talismán sí lleva su efecto, que es una frase corta y
 * mecánica («Aumenta la carga de equipo un 15 %»).
 *
 * ── IDIOMAS ────────────────────────────────────────────────────────────────
 *
 * La fuente es inglesa y el juego tiene nombres oficiales en español y en
 * portugués que NO tenemos de una fuente permitida: los NOMBRES se quedan en
 * inglés (decisión del propietario para juegos sin fuente en otro idioma). Lo
 * que sí se traduce es lo nuestro: categorías, afinidades y los efectos
 * cortos. Van AL LADO del original con sufijo (`categoria_es`, `categoria_pt`,
 * `efecto_es`…), que es lo que lee `filaEnIdioma`.
 *
 * ── LA FUENTE TRAE ERRATAS ─────────────────────────────────────────────────
 *
 * Al volcarla a mano se colaron cosas como `StrEldenike` por `Strike`, `Mag63`
 * con la cifra pegada al nombre, `Pose` por `Poise` o una cifra de requisito
 * sin nombre. `normalizar*` las arregla cuando la corrección es inequívoca
 * (por posición o por nombre) y, cuando no lo es, deja el hueco VACÍO y lo
 * anota en `revision`: un hueco es información, una cifra inventada no.
 */

import { AFINIDADES, CATEGORIAS_ARMA, ESTADOS_ARMADURA, TIPOS_HECHIZO, type Idiomas } from "./elden-ring-vocabulario";
import { compileBuilder } from "../../../../packages/kons/kon-character-builder/character-builder.engine";
import type { CampoDeDataset, DatasetPlanificado, PaginaPlanificada, PlanDeCarga } from "./plan-de-carga";

// ── Lo que trae la fuente ────────────────────────────────────────────────────

type Pareja = { name?: unknown; amount?: unknown; scaling?: unknown };

interface ArmaCruda {
  id: string;
  description?: string;
  name: string;
  category?: string;
  weight?: unknown;
  attack?: Pareja[];
  defence?: Pareja[];
  scalesWith?: Pareja[];
  requiredAttributes?: Pareja[];
}
interface ArmaduraCruda {
  id: string;
  description?: string;
  name: string;
  category?: string;
  weight?: unknown;
  dmgNegation?: Pareja[];
  resistance?: Pareja[];
}
interface TalismanCrudo { id: string; name: string; effect?: string; description?: string }
interface ClaseCruda { id: string; name: string; stats?: Record<string, unknown>; description?: string }
interface CenizaCruda { id: string; name: string; affinity?: string; skill?: string; description?: string }
interface HechizoCrudo { id: string; name: string; type?: string; cost?: unknown; slots?: unknown; requires?: Pareja[]; description?: string }
interface MunicionCruda { id: string; name: string; type?: string; attackPower?: Pareja[]; passive?: string; description?: string }

export interface DatosDeHerramientasEr {
  armas: ArmaCruda[];
  escudos: ArmaCruda[];
  armaduras: ArmaduraCruda[];
  talismanes: TalismanCrudo[];
  clases: ClaseCruda[];
  cenizas: CenizaCruda[];
  hechizos: HechizoCrudo[];
  encantamientos: HechizoCrudo[];
  municion: MunicionCruda[];
  /** Efectos cortos traducidos: texto inglés exacto → es/pt */
  efectos: Record<string, Idiomas>;
  /** La descripción del juego, en inglés, con su traducción: texto inglés exacto → es/pt */
  descripciones: Record<string, Idiomas>;
  /**
   * Fichas de armas que NO están en las tablas (las del DLC, de las que solo hay
   * la página) ya reducidas a tablas y traducidas: `{ slug, title, content }`.
   */
  fichasAparte: Array<{ slug: string; title: string; content: string }>;
}

// ── Limpieza de la fuente ────────────────────────────────────────────────────

const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const solo = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");

/** Una cifra con el número pegado al nombre: `Mag63` con cantidad nula → 63 */
function cantidad(p: Pareja): number | null {
  const n = numero(p.amount);
  if (n !== null) return n;
  const pegado = /(\d+(?:\.\d+)?)\s*$/.exec(String(p.name ?? ""));
  return pegado ? Number(pegado[1]) : null;
}

/** Clave canónica de una cifra de ataque, guarda o negación, o `null` si no es ninguna */
function claveDeDanio(nombre: unknown): "phy" | "mag" | "fire" | "ligt" | "holy" | "crit" | "boost" | "strike" | "slash" | "pierce" | null {
  // Restos de HTML pegados delante del nombre: `e-color="">Mag` → `Mag`
  const n = solo(String(nombre ?? "").replace(/^.*>/, ""));
  if (/^(phy|physical)/.test(n)) return "phy";
  if (/^mag/.test(n)) return "mag";
  if (/^fire/.test(n)) return "fire";
  if (/^(lig|light)/.test(n)) return "ligt";
  if (/^holy/.test(n)) return "holy";
  if (/^crit/.test(n)) return "crit";
  if (/^boost/.test(n)) return "boost";
  if (/^str(ike)?$/.test(n) || n === "strelden" || /^strelden/.test(n)) return "strike";
  if (/^slash/.test(n)) return "slash";
  if (/^pierce/.test(n)) return "pierce";
  return null;
}

type Danio = Partial<Record<"phy" | "mag" | "fire" | "ligt" | "holy" | "crit" | "boost", number | null>>;

/** Ataque o guarda: se lee por nombre; lo que no se reconoce (alcance, escalado de hechizos) se ignora */
export function normalizarDanio(lista: Pareja[] | undefined, claves: Array<keyof Danio>): { valores: Danio; dudas: string[] } {
  const valores: Danio = {};
  for (const p of lista ?? []) {
    const k = claveDeDanio(p.name);
    if (!k || !(claves as string[]).includes(k)) continue;
    const c = cantidad(p);
    if (valores[k as keyof Danio] == null && c !== null) valores[k as keyof Danio] = c;
  }
  const dudas = claves.filter((k) => valores[k] === undefined).map(String);
  return { valores, dudas };
}

const ORDEN_NEGACION = ["phy", "strike", "slash", "pierce", "mag", "fire", "ligt", "holy"] as const;
type ClaveNegacion = (typeof ORDEN_NEGACION)[number];

/**
 * Negaciones de una armadura: son SIEMPRE ocho y siempre en el mismo orden del
 * juego, así que si hay ocho se leen por posición (arregla `StrEldenike`, `6.1`,
 * `VS`…); si no, por nombre.
 */
export function normalizarNegaciones(lista: Pareja[] | undefined): Record<ClaveNegacion, number | null> {
  const salida = Object.fromEntries(ORDEN_NEGACION.map((k) => [k, null])) as Record<ClaveNegacion, number | null>;
  const l = lista ?? [];
  if (l.length === 8) {
    ORDEN_NEGACION.forEach((k, i) => (salida[k] = numero(l[i].amount)));
    return salida;
  }
  for (const p of l) {
    const k = claveDeDanio(p.name);
    if (k && (ORDEN_NEGACION as readonly string[]).includes(k) && salida[k as ClaveNegacion] === null) salida[k as ClaveNegacion] = cantidad(p);
  }
  return salida;
}

const ORDEN_RESISTENCIA = ["immunity", "robustness", "focus", "vitality", "poise"] as const;
type ClaveResistencia = (typeof ORDEN_RESISTENCIA)[number];

/** Resistencias: `Pose` es `Poise`, `Death` es `Vitality` y `Vitality26` es `Vitality` con el 26 pegado */
export function normalizarResistencias(lista: Pareja[] | undefined): Record<ClaveResistencia, number | null> {
  const salida = Object.fromEntries(ORDEN_RESISTENCIA.map((k) => [k, null])) as Record<ClaveResistencia, number | null>;
  for (const p of lista ?? []) {
    const n = solo(p.name);
    const k: ClaveResistencia | null = /^immun/.test(n)
      ? "immunity"
      : /^robust/.test(n)
        ? "robustness"
        : /^focus/.test(n)
          ? "focus"
          : /^(vitality|death)/.test(n)
            ? "vitality"
            : /^(poise|pose)/.test(n)
              ? "poise"
              : null;
    if (!k || salida[k] !== null) continue;
    const c = numero(p.amount) ?? cantidad(p);
    // `Vitality26` con cantidad 0: el 26 es la cifra real
    const pegado = /(\d+)\s*$/.exec(String(p.name ?? ""));
    salida[k] = c === 0 && pegado ? Number(pegado[1]) : c;
  }
  return salida;
}

const ATRIBUTOS = ["str", "dex", "int", "fai", "arc"] as const;
type Atributo = (typeof ATRIBUTOS)[number];

function claveDeAtributo(nombre: unknown): Atributo | null {
  const n = solo(nombre);
  if (n.startsWith("str")) return "str";
  if (n.startsWith("dex")) return "dex";
  if (n.startsWith("int")) return "int";
  if (n.startsWith("fai")) return "fai";
  if (n.startsWith("arc")) return "arc";
  return null;
}

/** Requisitos: lo que no tiene nombre reconocible NO se adivina; el atributo queda vacío */
export function normalizarRequisitos(lista: Pareja[] | undefined): { valores: Record<Atributo, number | null>; sinNombre: number } {
  const valores = Object.fromEntries(ATRIBUTOS.map((k) => [k, null])) as Record<Atributo, number | null>;
  let sinNombre = 0;
  for (const p of lista ?? []) {
    const k = claveDeAtributo(p.name);
    if (!k) {
      if (numero(p.amount) !== null && String(p.name ?? "").trim() !== "-") sinNombre++;
      continue;
    }
    if (valores[k] === null) valores[k] = numero(p.amount);
  }
  return { valores, sinNombre };
}

export function normalizarEscalado(lista: Pareja[] | undefined): Record<Atributo, string | null> {
  const salida = Object.fromEntries(ATRIBUTOS.map((k) => [k, null])) as Record<Atributo, string | null>;
  for (const p of lista ?? []) {
    const k = claveDeAtributo(p.name);
    const letra = String(p.scaling ?? "").trim().toUpperCase();
    if (k && /^[A-ES]$/.test(letra) && salida[k] === null) salida[k] = letra;
  }
  return salida;
}

// ── Tablas ───────────────────────────────────────────────────────────────────

interface Columna {
  key: string;
  label: string;
  type: "text" | "number";
  /** Se lee en el creador pero no se pinta como columna suelta */
  oculta?: boolean;
}

const nombreDeColumnaTraducida = (c: string, idioma: "es" | "pt") => `${c}_${idioma}`;

const unica = <T extends { id: string; name: string }>(filas: T[]) => {
  // Dos filas con el MISMO id romperían la recarga (la identidad es el id)
  const vistos = new Set<string>();
  const dup = filas.filter((f) => (vistos.has(f.id) ? true : (vistos.add(f.id), false)));
  if (dup.length > 0) throw new Error(`Elden Ring: id repetido en ${dup.map((d) => d.name).join(", ")}`);
  return filas;
};

function dataset(o: {
  slug: string;
  nombre: string;
  descripcion: string;
  icono: string;
  columnas: Columna[];
  /** Columnas de texto que llevan su versión en español y en portugués */
  traducidas: string[];
  filas: Array<{ title: string; data: Record<string, unknown> }>;
  revisada: string;
  notas?: string[];
}): DatasetPlanificado {
  const columnas: Columna[] = [...o.columnas, { key: "descripcion", label: "Descripción", type: "text" }];
  const traducidas = [...o.traducidas, "descripcion"];
  const traducciones: CampoDeDataset[] = traducidas.flatMap((k) => {
    const base = columnas.find((c) => c.key === k)!;
    return (["es", "pt"] as const).map((i) => ({
      key: nombreDeColumnaTraducida(k, i),
      label: `${base.label} (${i.toUpperCase()})`,
      type: "text",
      hidden: true,
    }));
  });
  return {
    slug: o.slug,
    name: o.nombre,
    description: o.descripcion,
    icon: o.icono,
    clave: "fila_id",
    schema: [
      { key: "name", label: "Nombre", type: "text", isRequired: true },
      ...columnas.map((c) => ({ key: c.key, label: c.label, type: c.type, ...(c.oculta ? { hidden: true } : {}) })),
      ...traducciones,
      { key: "fila_id", label: "ID", type: "text", isRequired: true, hidden: true },
    ],
    procedencia: {
      sourceName: "Cifras de Elden Ring introducidas a mano por el equipo de Valhalla Legion",
      sourceUrl: "",
      sourceVersion: `revisadas el ${o.revisada}`,
      fetchedAt: o.revisada,
      caveats: [
        "Los nombres de los objetos están en inglés: no tenemos una fuente permitida de sus nombres en español ni en portugués.",
        ...(o.notas ?? []),
      ],
    },
    entradas: o.filas.map((f, i) => ({ title: f.title, data: f.data, sortOrder: i })),
  };
}

const unir = (c: Idiomas | undefined, k: string) => ({
  [nombreDeColumnaTraducida(k, "es")]: c?.es ?? "",
  [nombreDeColumnaTraducida(k, "pt")]: c?.pt ?? "",
});

/** Las categorías de armas y escudos se unifican en UNA tabla: el creador las usa como un solo slot de manos */
function categoriaDeArma(c: string | undefined): { base: string; i: Idiomas } {
  const base = (c ?? "").trim();
  const i = CATEGORIAS_ARMA[base];
  return { base, i: i ?? { es: base, pt: base } };
}

export interface Revision {
  fila: string;
  tabla: string;
  problema: string;
}

export interface HerramientasEr {
  datasets: DatasetPlanificado[];
  builder: PlanDeCarga["builders"][number];
  bloques: PlanDeCarga["bloques"];
  paginasDeArmas: PaginaPlanificada[];
  /** Lo que la fuente trae mal y se dejó vacío: para que alguien lo mire */
  revision: Revision[];
  /** nombre normalizado → dirección de su ficha, para enlazarla desde las listas */
  fichaDe: Map<string, string>;
}

export const SLUGS = {
  armas: "er-armas",
  armaduras: "er-armaduras",
  talismanes: "er-talismanes",
  clases: "er-clases",
  cenizas: "er-cenizas",
  hechizos: "er-hechizos",
  municion: "er-municion",
} as const;

export const normalizarNombre = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "");

/** `Troll Knight's Sword` → `troll_knights_sword`: el slug que ya usan las fichas existentes */
export const slugDeFicha = (nombre: string) =>
  nombre
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

export function herramientasEldenRing(d: DatosDeHerramientasEr, revisada: string): HerramientasEr {
  const revision: Revision[] = [];
  const anota = (tabla: string, fila: string, problema: string) => revision.push({ tabla, fila, problema });
  /** La descripción del juego con su español y su portugués al lado; sin traducción se avisa */
  const desc = (tabla: string, nombre: string, texto: string | undefined) => {
    const en = (texto ?? "").replace(/\r/g, "").trim();
    const tr = d.descripciones[en];
    if (en && !tr) anota(tabla, nombre, "descripción sin traducir");
    return { descripcion: en, ...unir(tr, "descripcion") };
  };

  // ── Armas y escudos ──────────────────────────────────────────────────────
  const todasLasArmas = unica([...d.armas, ...d.escudos]);
  const filasArmas = todasLasArmas.map((a) => {
    const atk = normalizarDanio(a.attack, ["phy", "mag", "fire", "ligt", "holy", "crit"]);
    const def = normalizarDanio(a.defence, ["phy", "mag", "fire", "ligt", "holy", "boost"]);
    const req = normalizarRequisitos(a.requiredAttributes);
    const esc = normalizarEscalado(a.scalesWith);
    const cat = categoriaDeArma(a.category);
    if (atk.dudas.length === 6) anota("armas", a.name, "sin cifras de ataque");
    else if (atk.dudas.length > 0) anota("armas", a.name, `ataque sin ${atk.dudas.join(", ")}`);
    if (req.sinNombre > 0) anota("armas", a.name, `${req.sinNombre} requisito(s) con la cifra pero sin nombre de atributo`);
    return {
      title: a.name,
      data: {
        name: a.name,
        categoria: cat.base,
        ...unir(cat.i, "categoria"),
        peso: numero(a.weight),
        fisico: atk.valores.phy ?? null,
        magia: atk.valores.mag ?? null,
        fuego: atk.valores.fire ?? null,
        rayo: atk.valores.ligt ?? null,
        sagrado: atk.valores.holy ?? null,
        critico: atk.valores.crit ?? null,
        guardia_fisica: def.valores.phy ?? null,
        guardia_magica: def.valores.mag ?? null,
        guardia_fuego: def.valores.fire ?? null,
        guardia_rayo: def.valores.ligt ?? null,
        guardia_sagrada: def.valores.holy ?? null,
        impulso_guardia: def.valores.boost ?? null,
        req_fuerza: req.valores.str,
        req_destreza: req.valores.dex,
        req_inteligencia: req.valores.int,
        req_fe: req.valores.fai,
        req_arcano: req.valores.arc,
        esc_fuerza: esc.str ?? "",
        esc_destreza: esc.dex ?? "",
        esc_inteligencia: esc.int ?? "",
        esc_fe: esc.fai ?? "",
        esc_arcano: esc.arc ?? "",
        ...desc("armas", a.name, a.description),
        fila_id: a.id,
      },
    };
  });
  const colsArmas: Columna[] = [
    { key: "categoria", label: "Categoría", type: "text" },
    { key: "peso", label: "Peso", type: "number" },
    { key: "fisico", label: "Ataque físico", type: "number" },
    { key: "magia", label: "Ataque mágico", type: "number" },
    { key: "fuego", label: "Ataque de fuego", type: "number" },
    { key: "rayo", label: "Ataque de rayo", type: "number" },
    { key: "sagrado", label: "Ataque sagrado", type: "number" },
    { key: "critico", label: "Crítico", type: "number" },
    { key: "guardia_fisica", label: "Guardia física", type: "number" },
    { key: "guardia_magica", label: "Guardia mágica", type: "number" },
    { key: "guardia_fuego", label: "Guardia de fuego", type: "number" },
    { key: "guardia_rayo", label: "Guardia de rayo", type: "number" },
    { key: "guardia_sagrada", label: "Guardia sagrada", type: "number" },
    { key: "impulso_guardia", label: "Impulso de guardia", type: "number" },
    { key: "req_fuerza", label: "Req. Fuerza", type: "number" },
    { key: "req_destreza", label: "Req. Destreza", type: "number" },
    { key: "req_inteligencia", label: "Req. Inteligencia", type: "number" },
    { key: "req_fe", label: "Req. Fe", type: "number" },
    { key: "req_arcano", label: "Req. Arcano", type: "number" },
    { key: "esc_fuerza", label: "Escalado Fuerza", type: "text" },
    { key: "esc_destreza", label: "Escalado Destreza", type: "text" },
    { key: "esc_inteligencia", label: "Escalado Inteligencia", type: "text" },
    { key: "esc_fe", label: "Escalado Fe", type: "text" },
    { key: "esc_arcano", label: "Escalado Arcano", type: "text" },
  ];
  const dsArmas = dataset({
    slug: SLUGS.armas,
    nombre: "Elden Ring · Armas y escudos",
    descripcion: "Las armas y los escudos, con su peso, su ataque, su guardia, sus requisitos y su escalado.",
    icono: "⚔️",
    columnas: colsArmas,
    traducidas: ["categoria"],
    filas: filasArmas,
    revisada,
    notas: ["Las cifras son las de la mejora +0 y la afinidad estándar."],
  });

  // ── Armaduras ────────────────────────────────────────────────────────────
  const filasArmaduras = unica(d.armaduras).map((a) => {
    const neg = normalizarNegaciones(a.dmgNegation);
    const res = normalizarResistencias(a.resistance);
    // «Gauntlet» y «Gauntlets» son la misma parte: una sola
    const parteBruta = (a.category ?? "").trim();
    const parte = /^gauntlet/i.test(parteBruta) ? "Gauntlets" : parteBruta;
    const idiomas = ESTADOS_ARMADURA[parte];
    if (!idiomas) anota("armaduras", a.name, `parte desconocida «${parteBruta}»`);
    if (Object.values(neg).some((v) => v === null)) anota("armaduras", a.name, "negaciones incompletas");
    if (Object.values(res).some((v) => v === null)) anota("armaduras", a.name, "resistencias incompletas");
    return {
      title: a.name,
      data: {
        name: a.name,
        parte,
        ...unir(idiomas, "parte"),
        peso: numero(a.weight),
        neg_fisica: neg.phy,
        neg_golpe: neg.strike,
        neg_corte: neg.slash,
        neg_perforacion: neg.pierce,
        neg_magia: neg.mag,
        neg_fuego: neg.fire,
        neg_rayo: neg.ligt,
        neg_sagrado: neg.holy,
        inmunidad: res.immunity,
        robustez: res.robustness,
        concentracion: res.focus,
        vitalidad: res.vitality,
        equilibrio: res.poise,
        ...desc("armaduras", a.name, a.description),
        fila_id: a.id,
      },
    };
  });
  const dsArmaduras = dataset({
    slug: SLUGS.armaduras,
    nombre: "Elden Ring · Armaduras",
    descripcion: "Las piezas de armadura, con su peso, sus negaciones de daño, sus resistencias y su equilibrio.",
    icono: "🛡️",
    columnas: [
      { key: "parte", label: "Parte", type: "text" },
      { key: "peso", label: "Peso", type: "number" },
      { key: "neg_fisica", label: "Negación física", type: "number" },
      { key: "neg_golpe", label: "Negación de golpe", type: "number" },
      { key: "neg_corte", label: "Negación de corte", type: "number" },
      { key: "neg_perforacion", label: "Negación de perforación", type: "number" },
      { key: "neg_magia", label: "Negación mágica", type: "number" },
      { key: "neg_fuego", label: "Negación de fuego", type: "number" },
      { key: "neg_rayo", label: "Negación de rayo", type: "number" },
      { key: "neg_sagrado", label: "Negación sagrada", type: "number" },
      { key: "inmunidad", label: "Inmunidad", type: "number" },
      { key: "robustez", label: "Robustez", type: "number" },
      { key: "concentracion", label: "Concentración", type: "number" },
      { key: "vitalidad", label: "Vitalidad", type: "number" },
      { key: "equilibrio", label: "Equilibrio", type: "number" },
    ],
    traducidas: ["parte"],
    filas: filasArmaduras,
    revisada,
  });

  // ── Talismanes ───────────────────────────────────────────────────────────
  const filasTalismanes = unica(d.talismanes).map((t) => {
    const efecto = (t.effect ?? "").trim();
    const tr = d.efectos[efecto];
    if (efecto && !tr) anota("talismanes", t.name, "efecto sin traducir");
    return { title: t.name, data: { name: t.name, efecto, ...unir(tr, "efecto"), ...desc("talismanes", t.name, t.description), fila_id: t.id } };
  });
  const dsTalismanes = dataset({
    slug: SLUGS.talismanes,
    nombre: "Elden Ring · Talismanes",
    descripcion: "Los talismanes y lo que hace cada uno.",
    icono: "💍",
    columnas: [{ key: "efecto", label: "Efecto", type: "text" }],
    traducidas: ["efecto"],
    filas: filasTalismanes,
    revisada,
    notas: ["Los efectos están resumidos y traducidos por el equipo."],
  });

  // ── Clases ───────────────────────────────────────────────────────────────
  const filasClases = unica(d.clases).map((c) => {
    const s = c.stats ?? {};
    const n = (k: string) => {
      const v = Number(s[k]);
      return Number.isFinite(v) ? v : null;
    };
    return {
      title: c.name,
      data: {
        name: c.name,
        nivel: n("level"),
        vigor: n("vigor"),
        mente: n("mind"),
        resistencia: n("endurance"),
        fuerza: n("strength"),
        destreza: n("dexterity"),
        inteligencia: n("intelligence"),
        fe: n("faith"),
        arcano: n("arcane"),
        ...desc("clases", c.name, c.description),
        fila_id: c.id,
      },
    };
  });
  const dsClases = dataset({
    slug: SLUGS.clases,
    nombre: "Elden Ring · Clases",
    descripcion: "Las clases iniciales y los atributos con los que empiezan.",
    icono: "🧙",
    columnas: [
      { key: "nivel", label: "Nivel", type: "number" },
      { key: "vigor", label: "Vigor", type: "number" },
      { key: "mente", label: "Mente", type: "number" },
      { key: "resistencia", label: "Resistencia", type: "number" },
      { key: "fuerza", label: "Fuerza", type: "number" },
      { key: "destreza", label: "Destreza", type: "number" },
      { key: "inteligencia", label: "Inteligencia", type: "number" },
      { key: "fe", label: "Fe", type: "number" },
      { key: "arcano", label: "Arcano", type: "number" },
    ],
    traducidas: [],
    filas: filasClases,
    revisada,
  });

  // ── Cenizas de guerra ────────────────────────────────────────────────────
  const filasCenizas = unica(d.cenizas).map((c) => {
    const base = (c.affinity ?? "").trim();
    const i = AFINIDADES[base];
    return {
      title: c.name,
      data: { name: c.name, afinidad: base, ...unir(i ?? { es: base, pt: base }, "afinidad"), habilidad: (c.skill ?? "").trim(), ...desc("cenizas", c.name, c.description), fila_id: c.id },
    };
  });
  const dsCenizas = dataset({
    slug: SLUGS.cenizas,
    nombre: "Elden Ring · Cenizas de guerra",
    descripcion: "Las cenizas de guerra, la afinidad que dan al arma y la habilidad que ofrecen.",
    icono: "🔥",
    columnas: [
      { key: "afinidad", label: "Afinidad", type: "text" },
      { key: "habilidad", label: "Habilidad", type: "text" },
    ],
    traducidas: ["afinidad"],
    filas: filasCenizas,
    revisada,
  });

  // ── Hechizos y encantamientos ────────────────────────────────────────────
  const filasHechizos = unica([...d.hechizos, ...d.encantamientos]).map((h) => {
    const req = Object.fromEntries((h.requires ?? []).map((r) => [solo(r.name), numero(r.amount)]));
    const tipo = (h.type ?? "").trim();
    return {
      title: h.name,
      data: {
        name: h.name,
        tipo,
        ...unir(TIPOS_HECHIZO[tipo] ?? { es: tipo, pt: tipo }, "tipo"),
        coste: numero(h.cost),
        ranuras: numero(h.slots),
        req_inteligencia: req.intelligence ?? null,
        req_fe: req.faith ?? null,
        req_arcano: req.arcane ?? null,
        ...desc("hechizos", h.name, h.description),
        fila_id: h.id,
      },
    };
  });
  const dsHechizos = dataset({
    slug: SLUGS.hechizos,
    nombre: "Elden Ring · Hechizos y encantamientos",
    descripcion: "Los hechizos y los encantamientos, con su coste de FP, sus ranuras de memoria y sus requisitos.",
    icono: "✨",
    columnas: [
      { key: "tipo", label: "Tipo", type: "text" },
      { key: "coste", label: "Coste (FP)", type: "number" },
      { key: "ranuras", label: "Ranuras de memoria", type: "number" },
      { key: "req_inteligencia", label: "Req. Inteligencia", type: "number" },
      { key: "req_fe", label: "Req. Fe", type: "number" },
      { key: "req_arcano", label: "Req. Arcano", type: "number" },
    ],
    traducidas: ["tipo"],
    filas: filasHechizos,
    revisada,
  });

  // ── Munición ─────────────────────────────────────────────────────────────
  const filasMunicion = unica(d.municion).map((m) => {
    const a = normalizarDanio(m.attackPower, ["phy", "mag", "fire", "ligt", "holy", "crit"]);
    const efecto = (m.passive ?? "").trim();
    const tr = d.efectos[efecto];
    if (efecto && !tr) anota("munición", m.name, "efecto sin traducir");
    return {
      title: m.name,
      data: {
        name: m.name,
        fisico: a.valores.phy ?? null,
        magia: a.valores.mag ?? null,
        fuego: a.valores.fire ?? null,
        rayo: a.valores.ligt ?? null,
        sagrado: a.valores.holy ?? null,
        critico: a.valores.crit ?? null,
        efecto,
        ...unir(tr, "efecto"),
        ...desc("munición", m.name, m.description),
        fila_id: m.id,
      },
    };
  });
  const dsMunicion = dataset({
    slug: SLUGS.municion,
    nombre: "Elden Ring · Munición",
    descripcion: "Las flechas y los virotes, con su ataque y su efecto.",
    icono: "🏹",
    columnas: [
      { key: "fisico", label: "Ataque físico", type: "number" },
      { key: "magia", label: "Ataque mágico", type: "number" },
      { key: "fuego", label: "Ataque de fuego", type: "number" },
      { key: "rayo", label: "Ataque de rayo", type: "number" },
      { key: "sagrado", label: "Ataque sagrado", type: "number" },
      { key: "critico", label: "Crítico", type: "number" },
      { key: "efecto", label: "Efecto", type: "text" },
    ],
    traducidas: ["efecto"],
    filas: filasMunicion,
    revisada,
  });

  const datasets = [dsArmas, dsArmaduras, dsTalismanes, dsClases, dsCenizas, dsHechizos, dsMunicion];

  // ── El creador de equipo ─────────────────────────────────────────────────
  const builder: HerramientasEr["builder"] = {
    slug: "elden-ring-equipo",
    name: "Creador de equipo",
    definition: {
      id: "elden-ring-equipo",
      name: "Creador de equipo",
      description:
        "Elige clase, armas, armadura, talismanes, hechizos, cenizas y munición, y mira el peso del equipo, las resistencias y las ranuras de memoria que gastas.",
      baseStats: {},
      slots: [
        {
          id: "clase",
          name: "Clase inicial",
          capacity: 1,
          options: [],
          optionsFrom: {
            datasetId: SLUGS.clases,
            idField: "fila_id",
            statFields: {
              nivel: "nivel",
              vigor: "vigor",
              mente: "mente",
              resistencia: "resistencia",
              fuerza: "fuerza",
              destreza: "destreza",
              inteligencia: "inteligencia",
              fe: "fe",
              arcano: "arcano",
            },
          },
        },
        {
          // Tres armas por mano: las armas y los escudos comparten las seis ranuras
          id: "armas",
          name: "Armas y escudos (3 por mano)",
          capacity: 6,
          options: [],
          optionsFrom: { datasetId: SLUGS.armas, idField: "fila_id", statFields: { peso: "peso" } },
        },
        {
          id: "armadura",
          name: "Armadura (cuatro piezas)",
          capacity: 4,
          options: [],
          optionsFrom: {
            // Una de cada parte: un casco, un peto… (no cuatro cascos)
            groupField: "parte",
            datasetId: SLUGS.armaduras,
            idField: "fila_id",
            statFields: {
              peso: "peso",
              inmunidad: "inmunidad",
              robustez: "robustez",
              concentracion: "concentracion",
              vitalidad: "vitalidad",
              equilibrio: "equilibrio",
            },
          },
        },
        { id: "talismanes", name: "Talismanes", capacity: 4, options: [], optionsFrom: { datasetId: SLUGS.talismanes, idField: "fila_id", statFields: {} } },
        {
          id: "hechizos",
          name: "Hechizos y encantamientos",
          capacity: 10,
          options: [],
          optionsFrom: { datasetId: SLUGS.hechizos, idField: "fila_id", statFields: { ranuras: "memoria" } },
        },
        { id: "cenizas", name: "Cenizas de guerra", capacity: 6, options: [], optionsFrom: { datasetId: SLUGS.cenizas, idField: "fila_id", statFields: {} } },
        { id: "municion", name: "Munición", capacity: 4, options: [], optionsFrom: { datasetId: SLUGS.municion, idField: "fila_id", statFields: {} } },
      ],
      subjectSlot: "clase",
      budgets: [],
      derived: [
        /**
         * Solo se suma lo que se suma de verdad. La negación de daño NO está
         * aquí: el juego la combina por multiplicación (dos piezas de un 10 %
         * dan un 19 %, no un 20 %) y este motor solo suma.
         */
        { name: "peso_del_equipo", formula: "peso" },
        { name: "ranuras_de_memoria", formula: "memoria" },
      ],
      labels: {
        nivel: "Nivel inicial",
        vigor: "Vigor",
        mente: "Mente",
        resistencia: "Resistencia",
        fuerza: "Fuerza",
        destreza: "Destreza",
        inteligencia: "Inteligencia",
        fe: "Fe",
        arcano: "Arcano",
        peso: "Peso",
        peso_del_equipo: "Peso del equipo",
        inmunidad: "Inmunidad",
        robustez: "Robustez",
        concentracion: "Concentración",
        vitalidad: "Vitalidad",
        equilibrio: "Equilibrio",
        memoria: "Ranuras de memoria",
        ranuras_de_memoria: "Ranuras de memoria usadas",
      },
      filterStats: [],
    },
  };

  compileBuilder(builder.definition);

  const bloques: HerramientasEr["bloques"] = [
    { type: "character-builder", data: { definitionSlug: builder.slug, etiqueta: "Creador de equipo" } },
    ...datasets.map((ds) => ({
      type: "smart-grid",
      data: {
        datasetSlug: ds.slug,
        columns: ds.schema.filter((c) => !c.hidden).map((c) => c.key),
        totalDeFilas: ds.entradas.length,
        initialSort: "",
        ancla: ds.slug.replace(/^er-/, ""),
        titulo: ds.name.replace(/^Elden Ring · /, ""),
        descripcion: ds.description,
      },
    })),
  ];

  // ── Una ficha de wiki por arma o escudo ──────────────────────────────────
  const fichaDe = new Map<string, string>();
  const vistos = new Map<string, number>();
  const paginasDeArmas: PaginaPlanificada[] = filasArmas.map((f) => {
    const base = slugDeFicha(f.title);
    const veces = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, veces);
    const slug = veces === 1 ? base : `${base}_${veces}`;
    fichaDe.set(normalizarNombre(f.title) + (veces === 1 ? "" : `#${veces}`), slug);
    return { slug, title: f.title, content: fichaDeArma(f.data, revisada), enlaces: [] };
  });

  // Las fichas sueltas del DLC: no pueden pisar a una generada
  const yaHay = new Set(paginasDeArmas.map((p) => p.slug));
  for (const f of d.fichasAparte) {
    if (yaHay.has(f.slug)) throw new Error(`Elden Ring: la ficha suelta «${f.slug}» pisa a una generada`);
    if (!f.content.trim().startsWith(`**${f.title}**`)) throw new Error(`Elden Ring: la ficha «${f.slug}» no empieza por su título`);
    yaHay.add(f.slug);
    fichaDe.set(normalizarNombre(f.title), f.slug);
    paginasDeArmas.push({ slug: f.slug, title: f.title, content: f.content.trim() + String.fromCharCode(10), enlaces: [] });
  }

  return { datasets, builder, bloques, paginasDeArmas, revision, fichaDe };
}

// ── La ficha de una arma ─────────────────────────────────────────────────────

const celda = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const tabla = (cab: string[], filas: unknown[][]) =>
  [`| ${cab.join(" | ")} |`, `|${"---|".repeat(cab.length)}`, ...filas.map((f) => `| ${f.map(celda).join(" | ")} |`)].join("\n");
const hay = (...v: unknown[]) => v.some((x) => x !== null && x !== undefined && x !== "");

export function fichaDeArma(d: Record<string, unknown>, revisada: string): string {
  const esEscudo = /^(Small Shield|Medium Shield|Greatshield)$/.test(String(d.categoria));
  const cat = String(d.categoria_es || d.categoria || "");
  const partes: string[] = [
    `**${d.name}** es ${esEscudo ? "un escudo" : "un arma"} de tipo ${cat.toLowerCase()} de *Elden Ring*.`,
    ...(String(d.descripcion_es || d.descripcion || "").trim()
      ? ["## Descripción", String(d.descripcion_es || d.descripcion).trim().split(/\n+/).map((l) => `> ${l}`).join("\n>\n")]
      : []),
    "## Datos generales",
    tabla(["Dato", "Valor"], [["Tipo", cat], ["Peso", d.peso]]),
  ];
  if (hay(d.req_fuerza, d.req_destreza, d.req_inteligencia, d.req_fe, d.req_arcano)) {
    partes.push(
      "## Requisitos",
      tabla(["Atributo", "Necesario"], [
        ["Fuerza", d.req_fuerza],
        ["Destreza", d.req_destreza],
        ["Inteligencia", d.req_inteligencia],
        ["Fe", d.req_fe],
        ["Arcano", d.req_arcano],
      ])
    );
  }
  if (hay(d.fisico, d.magia, d.fuego, d.rayo, d.sagrado, d.critico)) {
    partes.push(
      "## Ataque",
      tabla(["Daño", "Valor"], [
        ["Físico", d.fisico],
        ["Mágico", d.magia],
        ["Fuego", d.fuego],
        ["Rayo", d.rayo],
        ["Sagrado", d.sagrado],
        ["Crítico", d.critico],
      ])
    );
  }
  if (hay(d.esc_fuerza, d.esc_destreza, d.esc_inteligencia, d.esc_fe, d.esc_arcano)) {
    partes.push(
      "## Escalado",
      tabla(["Atributo", "Escalado"], [
        ["Fuerza", d.esc_fuerza],
        ["Destreza", d.esc_destreza],
        ["Inteligencia", d.esc_inteligencia],
        ["Fe", d.esc_fe],
        ["Arcano", d.esc_arcano],
      ])
    );
  }
  if (hay(d.guardia_fisica, d.guardia_magica, d.guardia_fuego, d.guardia_rayo, d.guardia_sagrada, d.impulso_guardia)) {
    partes.push(
      "## Guardia",
      tabla(["Negación", "Valor"], [
        ["Física", d.guardia_fisica],
        ["Mágica", d.guardia_magica],
        ["Fuego", d.guardia_fuego],
        ["Rayo", d.guardia_rayo],
        ["Sagrada", d.guardia_sagrada],
        ["Impulso de guardia", d.impulso_guardia],
      ])
    );
  }
  partes.push("---", `*Cifras de la mejora +0 y la afinidad estándar, introducidas por el equipo de Valhalla Legion. Contrastado el ${revisada}.*`);
  return partes.join("\n\n") + "\n";
}
