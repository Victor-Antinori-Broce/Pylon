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
 * La primera defensa era una expresión regular sobre el texto del patrón, y
 * no veía a través de paréntesis anidados (`^((a+))+$`) ni los patrones
 * polinómicos sin grupos (`^a*a*a*a*a*b$`) (auditoría F4). JS no trae un
 * motor lineal (re2) sin dependencia nativa, así que aquí el patrón se
 * ANALIZA de verdad (escapes, clases, grupos anidados) y:
 *
 *   · el patrón tiene un tope de longitud;
 *   · se rechazan las retrorreferencias;
 *   · se rechaza todo grupo que se repite (`+`, `*`, `{n,}`, `{n,m}` con m > 1)
 *     y lleva dentro algo de largo variable: otro cuantificador no fijo o una
 *     alternativa (`(a+)+`, `((a+))+`, `(a|aa)*`, `(\w*)*`, `(a?){20}`);
 *   · se mide el GRADO del retroceso polinómico: cuántos cuantificadores se
 *     pueden repartir los mismos caracteres en cadena (`a*a*`, `.*x.*`, el
 *     `.*?` implícito de un patrón sin `^`). Grado n cuesta ~largo^n pasos al
 *     fallar; con el tope de valor se admite hasta grado 2;
 *   · el valor que se prueba tiene un tope de longitud (`probarPatron`, y los
 *     validadores de zod lo aplican con `.max(LONGITUD_MAXIMA_A_PROBAR)`).
 *
 * El análisis es conservador: ante la duda, rechaza. Un patrón rechazado se
 * trata como «sin patrón»: nunca tumba la petición.
 */

export const LONGITUD_MAXIMA_DE_PATRON = 256;
/**
 * Con grado 2 el peor caso son ~largo² pasos: 4096² ≈ 1,7·10⁷, decenas de
 * milisegundos. Con 10 000 eran 10⁸.
 */
export const LONGITUD_MAXIMA_A_PROBAR = 4_096;
/** A partir de este grado de retroceso polinómico el patrón se rechaza. */
const GRADO_MAXIMO = 2;

/** El patrón compilado, o `null` si es inválido o arriesgado. */
export function patronSeguro(patron: unknown, flags?: string): RegExp | null {
  if (typeof patron !== "string" || patron === "" || patron.length > LONGITUD_MAXIMA_DE_PATRON) return null;
  let re: RegExp;
  try {
    re = new RegExp(patron, flags);
  } catch {
    return null;
  }
  return patronArriesgado(patron, re.flags) ? null : re;
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

/** ¿Puede este patrón (ya compilado sin error) retroceder sin control? */
export function patronArriesgado(patron: string, flags = ""): boolean {
  let arbol: Nodo[][];
  try {
    arbol = new Lector(patron, flags).leer();
  } catch {
    // Lo que el lector no entiende no se puede juzgar: fuera.
    return true;
  }
  if (arbol.some((alt) => alt.some(tieneRepeticionPeligrosa))) return true;
  return gradoDeRetroceso(arbol, flags) > GRADO_MAXIMO;
}

// ── Conjuntos de caracteres (rangos de puntos de código) ─────────────────────

type Rango = [number, number];
/** Ordenados y sin solapes. */
type Conjunto = Rango[];

const MAXIMO = 0x10ffff;
const TODO: Conjunto = [[0, MAXIMO]];
const DIGITOS: Conjunto = [[0x30, 0x39]];
const PALABRA: Conjunto = [
  [0x30, 0x39],
  [0x41, 0x5a],
  [0x5f, 0x5f],
  [0x61, 0x7a],
];
const ESPACIOS: Conjunto = [
  [0x09, 0x0d],
  [0x20, 0x20],
  [0xa0, 0xa0],
  [0x1680, 0x1680],
  [0x2000, 0x200a],
  [0x2028, 0x2029],
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
  [0xfeff, 0xfeff],
];
const FINES_DE_LINEA: Conjunto = [
  [0x0a, 0x0a],
  [0x0d, 0x0d],
  [0x2028, 0x2029],
];

function normalizar(rangos: Rango[]): Conjunto {
  const orden = rangos.filter(([a, b]) => a <= b).sort((x, y) => x[0] - y[0]);
  const salida: Conjunto = [];
  for (const [a, b] of orden) {
    const ultimo = salida[salida.length - 1];
    if (ultimo && a <= ultimo[1] + 1) ultimo[1] = Math.max(ultimo[1], b);
    else salida.push([a, b]);
  }
  return salida;
}

function complemento(c: Conjunto): Conjunto {
  const salida: Rango[] = [];
  let desde = 0;
  for (const [a, b] of c) {
    if (a > desde) salida.push([desde, a - 1]);
    desde = b + 1;
  }
  if (desde <= MAXIMO) salida.push([desde, MAXIMO]);
  return salida;
}

function union(a: Conjunto, b: Conjunto): Conjunto {
  return normalizar([...a, ...b].map(([x, y]) => [x, y] as Rango));
}

function seCruzan(a: Conjunto, b: Conjunto): boolean {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const [a0, a1] = a[i]!;
    const [b0, b1] = b[j]!;
    if (a0 <= b1 && b0 <= a1) return true;
    if (a1 < b1) i++;
    else j++;
  }
  return false;
}

/** Con `i`: cada letra ASCII vale también en la otra caja. */
function conCaja(c: Conjunto): Conjunto {
  const extra: Rango[] = [];
  for (const [a, b] of c) {
    const may: Rango = [Math.max(a, 0x41), Math.min(b, 0x5a)];
    const min: Rango = [Math.max(a, 0x61), Math.min(b, 0x7a)];
    if (may[0] <= may[1]) extra.push([may[0] + 32, may[1] + 32]);
    if (min[0] <= min[1]) extra.push([min[0] - 32, min[1] - 32]);
  }
  // Fuera de ASCII no se intenta: se trata como «cualquier letra» si hay alguna.
  if (c.some(([, b]) => b > 0x7f)) extra.push([0x80, MAXIMO]);
  return extra.length ? union(c, extra) : c;
}

// ── Árbol del patrón ────────────────────────────────────────────────────────

type Nodo =
  | { tipo: "caracter"; conjunto: Conjunto }
  | { tipo: "inicio" }
  | { tipo: "fin" }
  /** `\b`, `\B` y las miradas (`(?=…)`, `(?<!…)`): no consumen. */
  | { tipo: "asercion"; contenido?: Nodo[][] }
  | { tipo: "grupo"; alternativas: Nodo[][] }
  | { tipo: "retro" }
  | { tipo: "repeticion"; nodo: Nodo; min: number; max: number };

/**
 * Lector de la sintaxis de RegExp de JS (con el anexo B, el modo sin `u`).
 * El patrón ya compiló con `new RegExp`, así que no valida: solo reconoce.
 */
class Lector {
  private i = 0;
  private readonly s: string;
  private readonly unicode: boolean;
  private readonly sets: boolean;
  private readonly caja: boolean;
  private readonly todoPunto: boolean;

  constructor(s: string, flags: string) {
    this.s = s;
    this.unicode = flags.includes("u") || flags.includes("v");
    this.sets = flags.includes("v");
    this.caja = flags.includes("i");
    this.todoPunto = flags.includes("s");
  }

  leer(): Nodo[][] {
    const alternativas = this.alternativas();
    if (this.i < this.s.length) throw new Error("paréntesis sin abrir");
    return alternativas;
  }

  private alternativas(): Nodo[][] {
    const salida: Nodo[][] = [this.secuencia()];
    while (this.s[this.i] === "|") {
      this.i++;
      salida.push(this.secuencia());
    }
    return salida;
  }

  private secuencia(): Nodo[] {
    const nodos: Nodo[] = [];
    while (this.i < this.s.length && this.s[this.i] !== "|" && this.s[this.i] !== ")") {
      const atomo = this.atomo();
      const cuantificador = this.cuantificador();
      nodos.push(cuantificador ? { tipo: "repeticion", nodo: atomo, ...cuantificador } : atomo);
    }
    return nodos;
  }

  private caracter(conjunto: Conjunto): Nodo {
    return { tipo: "caracter", conjunto: this.caja ? conCaja(conjunto) : conjunto };
  }

  private atomo(): Nodo {
    const c = this.s[this.i]!;
    switch (c) {
      case "^":
        this.i++;
        return { tipo: "inicio" };
      case "$":
        this.i++;
        return { tipo: "fin" };
      case ".":
        this.i++;
        return this.caracter(this.todoPunto ? TODO : complemento(FINES_DE_LINEA));
      case "(":
        return this.grupo();
      case "[":
        return this.caracter(this.clase());
      case "\\":
        return this.escape();
      default: {
        const cp = this.s.codePointAt(this.i)!;
        this.i += cp > 0xffff ? 2 : 1;
        return this.caracter([[cp, cp]]);
      }
    }
  }

  private grupo(): Nodo {
    this.i++; // (
    let mirada = false;
    if (this.s[this.i] === "?") {
      const resto = this.s.slice(this.i + 1);
      if (resto.startsWith(":")) this.i += 2;
      else if (resto.startsWith("=") || resto.startsWith("!")) {
        this.i += 2;
        mirada = true;
      } else if (resto.startsWith("<=") || resto.startsWith("<!")) {
        this.i += 3;
        mirada = true;
      } else if (resto.startsWith("<")) {
        const cierre = this.s.indexOf(">", this.i);
        if (cierre < 0) throw new Error("nombre de grupo sin cerrar");
        this.i = cierre + 1;
      } else {
        // Modificadores (`(?i:…)`, `(?-i:…)`).
        const m = /^[a-zA-Z-]*:/.exec(resto);
        if (!m) throw new Error("grupo desconocido");
        this.i += 1 + m[0].length;
      }
    }
    const alternativas = this.alternativas();
    if (this.s[this.i] !== ")") throw new Error("paréntesis sin cerrar");
    this.i++;
    return mirada ? { tipo: "asercion", contenido: alternativas } : { tipo: "grupo", alternativas };
  }

  private cuantificador(): { min: number; max: number } | null {
    const c = this.s[this.i];
    let q: { min: number; max: number } | null = null;
    if (c === "*") q = { min: 0, max: Infinity };
    else if (c === "+") q = { min: 1, max: Infinity };
    else if (c === "?") q = { min: 0, max: 1 };
    if (q) this.i++;
    else if (c === "{") {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(this.s.slice(this.i));
      if (!m) return null; // `{` literal (anexo B): lo lee el siguiente átomo
      this.i += m[0].length;
      const min = Number(m[1]);
      q = { min, max: m[2] === undefined ? min : m[3] === "" ? Infinity : Number(m[3]) };
    }
    if (q && this.s[this.i] === "?") this.i++; // perezoso: el mismo retroceso
    return q;
  }

  /** Escape fuera de una clase. */
  private escape(): Nodo {
    const c = this.s[this.i + 1];
    if (c === undefined) throw new Error("escape al final");
    if (c === "b" || c === "B") {
      this.i += 2;
      return { tipo: "asercion" };
    }
    if (/[1-9]/.test(c)) {
      this.i += 2;
      return { tipo: "retro" };
    }
    if (c === "k" && this.s[this.i + 2] === "<") {
      this.i += 2;
      return { tipo: "retro" };
    }
    return this.caracter(this.escapeDeCaracter());
  }

  /** `\d`, `\w`, `\x41`, `\n`… (dentro o fuera de una clase). Deja `i` tras el escape. */
  private escapeDeCaracter(enClase = false): Conjunto {
    const c = this.s[this.i + 1]!;
    this.i += 2;
    const uno = (cp: number): Conjunto => [[cp, cp]];
    switch (c) {
      case "d":
        return DIGITOS;
      case "D":
        return complemento(DIGITOS);
      case "w":
        return PALABRA;
      case "W":
        return complemento(PALABRA);
      case "s":
        return ESPACIOS;
      case "S":
        return complemento(ESPACIOS);
      case "t":
        return uno(9);
      case "n":
        return uno(10);
      case "v":
        return uno(11);
      case "f":
        return uno(12);
      case "r":
        return uno(13);
      case "0":
        return uno(0);
      case "b":
        return enClase ? uno(8) : uno(0x62);
      case "c": {
        const l = this.s[this.i];
        if (l && /[a-z]/i.test(l)) {
          this.i++;
          return uno(l.charCodeAt(0) % 32);
        }
        return uno(0x5c);
      }
      case "x": {
        const m = /^[0-9a-f]{2}/i.exec(this.s.slice(this.i));
        if (!m) return uno(0x78);
        this.i += 2;
        return uno(parseInt(m[0], 16));
      }
      case "u": {
        const llaves = /^\{([0-9a-f]+)\}/i.exec(this.s.slice(this.i));
        if (llaves && this.unicode) {
          this.i += llaves[0].length;
          return uno(Math.min(parseInt(llaves[1]!, 16), MAXIMO));
        }
        const m = /^[0-9a-f]{4}/i.exec(this.s.slice(this.i));
        if (!m) return uno(0x75);
        this.i += 4;
        return uno(parseInt(m[0], 16));
      }
      case "p":
      case "P": {
        if (!this.unicode) return uno(c.charCodeAt(0));
        const cierre = this.s.indexOf("}", this.i);
        if (this.s[this.i] !== "{" || cierre < 0) throw new Error("propiedad unicode mal formada");
        this.i = cierre + 1;
        return TODO; // sin tablas de Unicode: «puede ser cualquiera»
      }
      default: {
        if (/[1-9]/.test(c)) return uno(c.charCodeAt(0)); // en clase, el anexo B lo trata como octal o literal
        const cp = this.s.codePointAt(this.i - 1)!;
        if (cp > 0xffff) this.i++;
        return uno(cp);
      }
    }
  }

  /** `[…]`: deja `i` tras el `]`. */
  private clase(): Conjunto {
    this.i++; // [
    if (this.sets) {
      // Modo `v` (clases anidadas, `--`, `&&`): se salta entera y se trata
      // como «cualquier carácter», lo más conservador.
      let nivel = 1;
      while (this.i < this.s.length && nivel > 0) {
        const c = this.s[this.i]!;
        if (c === "\\") this.i += 2;
        else {
          if (c === "[") nivel++;
          else if (c === "]") nivel--;
          this.i++;
        }
      }
      if (nivel > 0) throw new Error("clase sin cerrar");
      return TODO;
    }
    const negada = this.s[this.i] === "^";
    if (negada) this.i++;
    const rangos: Rango[] = [];
    while (this.i < this.s.length && this.s[this.i] !== "]") {
      const desde = this.elementoDeClase();
      if (
        this.s[this.i] === "-" &&
        this.s[this.i + 1] !== undefined &&
        this.s[this.i + 1] !== "]" &&
        desde.length === 1 &&
        desde[0]![0] === desde[0]![1]
      ) {
        const vuelta = this.i;
        this.i++; // -
        const hasta = this.elementoDeClase();
        if (hasta.length === 1 && hasta[0]![0] === hasta[0]![1]) {
          rangos.push([desde[0]![0], hasta[0]![0]]);
        } else {
          // `[a-\d]` (anexo B): `a`, `-` y `\d` sueltos
          this.i = vuelta;
          rangos.push(...desde);
        }
      } else {
        rangos.push(...desde);
      }
    }
    if (this.s[this.i] !== "]") throw new Error("clase sin cerrar");
    this.i++;
    const conjunto = normalizar(rangos);
    return negada ? complemento(conjunto) : conjunto;
  }

  private elementoDeClase(): Conjunto {
    if (this.s[this.i] === "\\") return this.escapeDeCaracter(true);
    const cp = this.s.codePointAt(this.i)!;
    this.i += cp > 0xffff ? 2 : 1;
    return [[cp, cp]];
  }
}

// ── Regla 1: grupos repetidos con algo variable dentro ───────────────────────

/** ¿Hay dentro algo que pueda casar con largos distintos? */
function esVariable(n: Nodo): boolean {
  switch (n.tipo) {
    case "repeticion":
      return n.min !== n.max || esVariable(n.nodo);
    case "grupo":
      return n.alternativas.length > 1 || n.alternativas.some((alt) => alt.some(esVariable));
    case "asercion":
      return (n.contenido ?? []).some((alt) => alt.some(esVariable));
    default:
      return false;
  }
}

function tieneRepeticionPeligrosa(n: Nodo): boolean {
  switch (n.tipo) {
    case "retro":
      return true;
    case "repeticion":
      if (n.max > 1 && esVariable(n.nodo)) return true;
      return tieneRepeticionPeligrosa(n.nodo);
    case "grupo":
      return n.alternativas.some((alt) => alt.some(tieneRepeticionPeligrosa));
    case "asercion":
      return (n.contenido ?? []).some((alt) => alt.some(tieneRepeticionPeligrosa));
    default:
      return false;
  }
}

// ── Regla 2: grado del retroceso polinómico ──────────────────────────────────
//
// Una «cadena» es una serie de cuantificadores variables que se pueden pasar
// caracteres entre sí: `a*a*`, o `.*x.*` (el primer `.*` también come `x`).
// Al fallar, el motor prueba cada reparto: ~largo^grado pasos. Se recorre el
// patrón llevando las cadenas vivas (`ultimo`: lo que come el último
// cuantificador de la cadena) y se anota el grado en cada punto que puede
// fallar y obligar a retroceder (un carácter obligatorio, un cuantificador con
// mínimo, `$`, una aserción).
//
// Un cuantificador sin techo (`*`, `+`, `{n,}`) suma 1 al grado (un factor
// «largo»); uno con techo (`?`, `{0,3}`, un grupo opcional) suma ½: es un
// factor constante, pero una ristra de ellos (`a?a?a?…aaa`) es exponencial en
// el largo del patrón y también hay que cortarla. Unir alternativas y quedarse
// con el conjunto mayor sobreestima: el error va siempre hacia rechazar.

interface Cadena {
  ultimo: Conjunto;
  grado: number;
}

const PESO_SIN_TECHO = 1;
const PESO_CON_TECHO = 0.5;

function gradoDeRetroceso(arbol: Nodo[][], flags: string): number {
  const multilinea = flags.includes("m");
  let maximo = 0;
  const anotar = (estado: Cadena[]) => {
    for (const c of estado) if (c.grado > maximo) maximo = c.grado;
  };

  /** Una cadena por grado (uniendo conjuntos): el estado no crece. */
  const fundir = (estado: Cadena[]): Cadena[] => {
    const porGrado = new Map<number, Conjunto>();
    for (const c of estado) {
      const g = Math.min(c.grado, GRADO_MAXIMO + PESO_SIN_TECHO);
      const previo = porGrado.get(g);
      porGrado.set(g, previo ? union(previo, c.ultimo) : c.ultimo);
    }
    return [...porGrado.entries()].map(([grado, ultimo]) => ({ grado, ultimo }));
  };

  /** Todo lo que puede consumir un nodo (sin las miradas, que no consumen). */
  const consume = (n: Nodo): Conjunto => {
    switch (n.tipo) {
      case "caracter":
        return n.conjunto;
      case "repeticion":
        return consume(n.nodo);
      case "grupo":
        return n.alternativas.flat().reduce<Conjunto>((acc, m) => union(acc, consume(m)), []);
      default:
        return [];
    }
  };

  const alternativas = (alts: Nodo[][], estado: Cadena[]): Cadena[] =>
    fundir(alts.flatMap((alt) => secuencia(alt, estado)));

  const secuencia = (nodos: Nodo[], estado: Cadena[]): Cadena[] => {
    let actual = estado;
    for (const n of nodos) actual = fundir(nodo(n, actual));
    return actual;
  };

  /** Un cuantificador variable que come caracteres de `conjunto`. */
  const variable = (conjunto: Conjunto, min: number, peso: number, estado: Cadena[]): Cadena[] => {
    if (min >= 1) anotar(estado);
    const siguen = estado
      .filter((c) => seCruzan(c.ultimo, conjunto))
      .map((c) => ({ ultimo: conjunto, grado: c.grado + peso }));
    return [...siguen, { ultimo: conjunto, grado: peso }, ...(min === 0 ? estado : [])];
  };

  const nodo = (n: Nodo, estado: Cadena[]): Cadena[] => {
    switch (n.tipo) {
      case "caracter":
        // Obligatorio: la cadena sigue si su último cuantificador también
        // puede comer este carácter (y repartirlo con el siguiente).
        anotar(estado);
        return estado.filter((c) => seCruzan(c.ultimo, n.conjunto));
      case "inicio":
        return multilinea ? estado : [];
      case "fin":
        anotar(estado);
        return multilinea ? estado : [];
      case "asercion":
        anotar(estado);
        if (n.contenido) alternativas(n.contenido, estado);
        return estado;
      case "retro":
        anotar(estado);
        return estado;
      case "grupo":
        return alternativas(n.alternativas, estado);
      case "repeticion": {
        const { nodo: dentro, min, max } = n;
        if (max === 0) return estado;
        if (dentro.tipo === "inicio" || dentro.tipo === "fin" || dentro.tipo === "asercion") {
          return min === 0 ? estado : nodo(dentro, estado);
        }
        // Fijo (`a{3}`, `(ab){2}`): como el nodo sin cuantificar.
        if (min === max) return nodo(dentro, estado);
        const peso = max === Infinity ? PESO_SIN_TECHO : PESO_CON_TECHO;
        const comoBloque = variable(consume(dentro), min, peso, estado);
        // `(…)?` con algo variable dentro (la regla 1 garantiza que solo
        // puede ser con techo 1): además, sus cadenas internas.
        if (dentro.tipo === "grupo" && esVariable(dentro)) {
          return [...comoBloque, ...alternativas(dentro.alternativas, estado)];
        }
        return comoBloque;
      }
    }
  };

  // Sin `^`, el motor prueba desde cada posición: es un `[^]*?` delante.
  alternativas(arbol, [{ ultimo: TODO, grado: PESO_SIN_TECHO }]);
  return maximo;
}
