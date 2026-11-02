/**
 * Intérprete de expresiones de campos calculados
 * ============================================================================
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 *
 * `evaluateExpression` hacía `new Function("return " + expresión)()` después de
 * sustituir cada `{campo}` por su valor como TEXTO. Eran dos vías de ejecutar
 * código en el servidor (con `process.env`, `Bun.spawn`…):
 *
 *   · La fórmula la guardaba cualquiera que pudiera crear un campo calculado,
 *     y `GET /api/datasets/:id/entries?includeCalculated=true` la ejecutaba.
 *   · Aunque la fórmula fuera inocente, el VALOR de un campo de texto se metía
 *     entre comillas escapando solo `"`: un valor terminado en `\` cerraba la
 *     cadena y lo que venía detrás se ejecutaba.
 *
 * Aquí no se genera código. Se trocea y se interpreta: números, cadenas,
 * `true/false/null`, `{campo}`, `+ - * / % **`, comparaciones, `&& || !`,
 * `? :`, paréntesis y una lista blanca de funciones (`min`, `max`, `round`,
 * `floor`, `ceil`, `abs`, `sqrt`, `pow`, también escritas `Math.x`). No hay
 * identificadores libres, ni acceso a propiedades, ni corchetes: no se puede
 * alcanzar ningún objeto. Los valores de los campos entran como VALORES.
 *
 * Los operadores de JS solo se aplican a primitivos (número, cadena, booleano,
 * null), que no tienen `valueOf`/`toString` propios que invocar.
 *
 * Topes de longitud, piezas y anidamiento: una fórmula enorme o muy anidada no
 * se come la CPU ni revienta la pila.
 */

export const LIMITES_DE_EXPRESION = { longitud: 2000, piezas: 1000, profundidad: 64 } as const;

export type Primitivo = number | string | boolean | null;

type Pieza =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "campo"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string };

const FUNCIONES_PERMITIDAS: Record<string, (...a: number[]) => number> = {
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  round: (a) => Math.round(a),
  floor: (a) => Math.floor(a),
  ceil: (a) => Math.ceil(a),
  abs: (a) => Math.abs(a),
  sqrt: (a) => Math.sqrt(a),
  pow: (a, b) => Math.pow(a, b),
};

/** Los de más caracteres primero: `===` antes que `==`, `**` antes que `*`. */
const OPERADORES = [
  "===",
  "!==",
  "**",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "+",
  "-",
  "*",
  "/",
  "%",
  "<",
  ">",
  "!",
  "?",
  ":",
  "(",
  ")",
  ",",
];

function trocear(fuente: string): Pieza[] {
  const piezas: Pieza[] = [];
  let i = 0;
  while (i < fuente.length) {
    const ch = fuente[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const m = /^(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(fuente.slice(i, i + 64));
      if (!m) throw new Error(`Número inválido en la posición ${i}`);
      piezas.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
    } else if (ch === "{") {
      const m = /^\{([a-zA-Z_][a-zA-Z0-9_]*)\}/.exec(fuente.slice(i, i + 200));
      if (!m) throw new Error(`Referencia a campo inválida en la posición ${i}`);
      piezas.push({ t: "campo", v: m[1] });
      i += m[0].length;
    } else if (ch === '"' || ch === "'") {
      let j = i + 1;
      let texto = "";
      while (j < fuente.length && fuente[j] !== ch) {
        if (fuente[j] === "\\" && j + 1 < fuente.length) j++;
        texto += fuente[j];
        j++;
      }
      if (j >= fuente.length) throw new Error("Cadena sin cerrar");
      piezas.push({ t: "str", v: texto });
      i = j + 1;
    } else if (/[a-zA-Z_]/.test(ch)) {
      const m = /^[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?/.exec(
        fuente.slice(i, i + 200)
      )!;
      piezas.push({ t: "id", v: m[0] });
      i += m[0].length;
    } else {
      const op = OPERADORES.find((o) => fuente.startsWith(o, i));
      if (!op) throw new Error(`Carácter no permitido "${ch}"`);
      piezas.push({ t: "op", v: op });
      i += op.length;
    }
    if (piezas.length > LIMITES_DE_EXPRESION.piezas) throw new Error("Expresión demasiado larga");
  }
  return piezas;
}

function valorDeCampo(fila: Record<string, unknown>, nombre: string): Primitivo {
  // `hasOwn`: un `{constructor}` o `{__proto__}` no puede alcanzar el prototipo.
  if (!Object.prototype.hasOwnProperty.call(fila, nombre)) return 0;
  const v = fila[nombre];
  if (v === null || v === undefined) return 0;
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.getTime();
  // Objetos y listas no son operandos. Antes acababan como "[object Object]"
  // y la expresión fallaba; NaN da el mismo resultado sin pasar por texto.
  return Number.NaN;
}

/** Evalúa la expresión contra una fila. Lanza si no es válida. */
export function evaluarExpresionSegura(
  expresion: string,
  fila: Record<string, unknown>
): Primitivo {
  if (typeof expresion !== "string") throw new Error("Expresión no válida");
  if (expresion.length > LIMITES_DE_EXPRESION.longitud) {
    throw new Error(`La expresión supera los ${LIMITES_DE_EXPRESION.longitud} caracteres`);
  }

  const piezas = trocear(expresion);
  if (piezas.length === 0) throw new Error("Expresión vacía");
  let pos = 0;
  let profundidad = 0;

  const mira = (): Pieza | undefined => piezas[pos];
  const esOp = (v: string): boolean => {
    const p = piezas[pos];
    return p !== undefined && p.t === "op" && p.v === v;
  };
  const toma = (v: string): void => {
    if (!esOp(v)) throw new Error(`Se esperaba "${v}"`);
    pos++;
  };
  const entra = (): void => {
    if (++profundidad > LIMITES_DE_EXPRESION.profundidad) {
      throw new Error("Expresión demasiado anidada");
    }
  };
  const sale = (): void => {
    profundidad--;
  };
  const num = (v: Primitivo): number => Number(v);

  function ternaria(): Primitivo {
    entra();
    const cond = o();
    let r = cond;
    if (esOp("?")) {
      pos++;
      const a = ternaria();
      toma(":");
      const b = ternaria();
      r = cond ? a : b;
    }
    sale();
    return r;
  }

  function o(): Primitivo {
    let a = y();
    while (esOp("||")) {
      pos++;
      const b = y();
      a = a || b;
    }
    return a;
  }

  function y(): Primitivo {
    let a = igualdad();
    while (esOp("&&")) {
      pos++;
      const b = igualdad();
      a = a && b;
    }
    return a;
  }

  function igualdad(): Primitivo {
    let a = comparacion();
    for (;;) {
      const p = mira();
      if (!p || p.t !== "op" || !["==", "!=", "===", "!=="].includes(p.v)) return a;
      pos++;
      const b = comparacion();
      // Igualdad laxa a propósito para `==`/`!=`: es lo que escribía quien
      // hacía fórmulas con la versión anterior. Solo entre primitivos.
      // eslint-disable-next-line eqeqeq
      a = p.v === "==" ? a == b : p.v === "!=" ? a != b : p.v === "===" ? a === b : a !== b;
    }
  }

  function comparacion(): Primitivo {
    let a = suma();
    for (;;) {
      const p = mira();
      if (!p || p.t !== "op" || !["<", ">", "<=", ">="].includes(p.v)) return a;
      pos++;
      const b = suma();
      const x = a as number;
      const z = b as number;
      a = p.v === "<" ? x < z : p.v === ">" ? x > z : p.v === "<=" ? x <= z : x >= z;
    }
  }

  function suma(): Primitivo {
    let a = producto();
    for (;;) {
      const p = mira();
      if (!p || p.t !== "op" || (p.v !== "+" && p.v !== "-")) return a;
      pos++;
      const b = producto();
      // `+` concatena si hay una cadena, como en JS: `{nombre} + " (" + {nivel} + ")"`.
      a = p.v === "+" ? (a as number) + (b as number) : num(a) - num(b);
    }
  }

  function producto(): Primitivo {
    let a = unario();
    for (;;) {
      const p = mira();
      if (!p || p.t !== "op" || !["*", "/", "%"].includes(p.v)) return a;
      pos++;
      const b = unario();
      a = p.v === "*" ? num(a) * num(b) : p.v === "/" ? num(a) / num(b) : num(a) % num(b);
    }
  }

  function unario(): Primitivo {
    if (esOp("-") || esOp("+") || esOp("!")) {
      const op = (mira() as { v: string }).v;
      pos++;
      entra();
      const v = unario();
      sale();
      return op === "-" ? -num(v) : op === "+" ? num(v) : !v;
    }
    return potencia();
  }

  function potencia(): Primitivo {
    const base = primario();
    if (esOp("**")) {
      pos++;
      entra();
      const exp = unario();
      sale();
      return Math.pow(num(base), num(exp));
    }
    return base;
  }

  function primario(): Primitivo {
    const p = mira();
    if (!p) throw new Error("Expresión incompleta");
    pos++;
    if (p.t === "num" || p.t === "str") return p.v;
    if (p.t === "campo") return valorDeCampo(fila, p.v);
    if (p.t === "op" && p.v === "(") {
      const v = ternaria();
      toma(")");
      return v;
    }
    if (p.t === "id") {
      if (p.v === "true") return true;
      if (p.v === "false") return false;
      if (p.v === "null") return null;
      // `Math.round` o `round`; cualquier otro identificador (o `algo.otro`)
      // no existe para esta gramática.
      const nombre = p.v.startsWith("Math.") ? p.v.slice(5) : p.v;
      const fn = Object.prototype.hasOwnProperty.call(FUNCIONES_PERMITIDAS, nombre)
        ? FUNCIONES_PERMITIDAS[nombre]
        : undefined;
      if (!fn || nombre.includes(".")) throw new Error(`Identificador no permitido "${p.v}"`);
      toma("(");
      const args: number[] = [];
      if (!esOp(")")) {
        for (;;) {
          args.push(num(ternaria()));
          if (args.length > 50) throw new Error("Demasiados argumentos");
          if (!esOp(",")) break;
          pos++;
        }
      }
      toma(")");
      return fn(...args);
    }
    throw new Error(`Pieza inesperada "${String(p.v)}"`);
  }

  const resultado = ternaria();
  if (pos !== piezas.length) throw new Error("Sobra texto al final de la expresión");
  return resultado;
}
