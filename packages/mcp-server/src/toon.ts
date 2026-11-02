/**
 * Kitsuden — TOON (Token-Oriented Object Notation), códec canónico
 * ============================================================================
 *
 * Implementación propia, sin dependencias, de https://toonformat.dev/ . La
 * SALIDA del encoder es la misma, byte a byte, que la de la implementación de
 * referencia `@toon-format/toon@4.4.0` para cualquier valor JSON, y el decoder
 * lee todo lo que esa versión escribe. Lo vigila
 * `src/tests-unit/toon-tabular.test.ts`, que compara las dos en las dos
 * direcciones (también con datos aleatorios).
 *
 * Este fichero es la copia CANÓNICA. Hay dos copias idénticas, byte a byte,
 * para los paquetes que no pueden depender de la API: `packages/sdk/src/toon.ts`
 * (el SDK no tiene dependencias) y `packages/mcp-server/src/toon.ts`. Lo
 * vigila `src/tests-unit/toon-espejos.test.ts`: se edita aquí y se copia.
 *
 *   users[2]{id,name,role}:        ← tabla: las claves UNA vez, filas CSV
 *     1,Alice,admin
 *     2,Bob,user
 *   docs[2]{id,_meta{datasetId,createdAt},name}:   ← columna-objeto plegada
 *     1,d1,2026-01-01,a                               en la cabecera
 *     2,d1,2026-01-02,b
 *   tags[3]: admin,ops,dev         ← array de escalares en línea
 *   items[2]:                      ← forma de lista (objetos no uniformes)
 *     - id: 1
 *       extra: true
 *     - id: 2
 *   perfil:                        ← objeto vacío: la clave sin nada detrás
 *   vacio: []                      ← array vacío
 *
 * Raíz: un array se escribe sin clave (`[2]{id}:`), un objeto vacío es el
 * documento vacío, y un escalar es su literal. Indentación de 2 espacios.
 *
 * Semántica de entrada = la de `JSON.stringify`: se llama a `toJSON` (Date →
 * ISO), las propiedades `undefined`/función/símbolo desaparecen, en un array
 * pasan a `null`, NaN/±Infinity pasan a `null` y -0 a 0. Así
 * `decodeToon(encodeToon(x))` es lo mismo que `JSON.parse(JSON.stringify(x))`,
 * que es lo que necesita el modo `auto` (lib/formatos.ts) para comprobar que
 * una respuesta en TOON no pierde nada frente a la misma en JSON.
 *
 * Historia (2026-10-25, medición G1 en docs/agents/benchmarks.md): el códec
 * anterior no sabía leer la forma de lista (devolvía `[]` sin error en 15 de
 * 24 endpoints reales), escribía `{}` donde TOON espera la clave sola, y
 * metía los arrays raíz bajo una clave inventada `data`.
 */

// ── Literales y patrones (los de la referencia) ─────────────────────────────

const INDENTACION = 2;
const DELIMITADOR = ",";
const DELIMITADORES = [",", "\t", "|"] as const;
/** Número que un decoder lee como número (sin ceros a la izquierda). */
const LITERAL_NUMERICO = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i;
/** Texto que PARECE número (con ceros a la izquierda o signo +): va entre comillas. */
const PARECE_NUMERO = /^[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i;
const CLAVE_SIN_COMILLAS = /^[A-Z_][\w.]*$/i;
const LONGITUD_DE_ARRAY = /^(?:0|[1-9]\d*)$/;
// Caracteres de control: van escapados (\uXXXX) y obligan a entrecomillar. Es a propósito.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F]/;
// eslint-disable-next-line no-control-regex
const CONTROL_GLOBAL = /[\u0000-\u001F]/g;

export class ToonDecodeError extends SyntaxError {
  line?: number;
  constructor(mensaje: string, linea?: number) {
    super(linea !== undefined ? `Line ${linea}: ${mensaje}` : mensaje);
    this.name = "ToonDecodeError";
    this.line = linea;
  }
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type ObjetoJson = { [k: string]: Json };

function esObjeto(v: unknown): v is ObjetoJson {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function esEscalar(v: unknown): v is null | boolean | number | string {
  return v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}
function esObjetoVacio(v: ObjetoJson): boolean {
  for (const _ in v) return false;
  return true;
}
const tiene = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Asigna sin pasar por el setter heredado de `__proto__`. */
function asignar(destino: ObjetoJson, clave: string, valor: Json): void {
  if (clave === "__proto__") {
    Object.defineProperty(destino, clave, { value: valor, enumerable: true, writable: true, configurable: true });
    return;
  }
  destino[clave] = valor;
}

// ── Normalización con la semántica de JSON.stringify ────────────────────────

/**
 * Devuelve el valor tal y como lo vería `JSON.parse(JSON.stringify(v))`.
 * Copia solo lo que cambia: un valor que ya es JSON puro se devuelve tal cual
 * (el caso del middleware, que parte de un cuerpo ya parseado).
 */
function normalizar(v: unknown, enArray: boolean): Json | undefined {
  if (v === null) return null;
  if (typeof v === "object" || typeof v === "bigint") {
    const conToJson = v as { toJSON?: () => unknown };
    if (typeof conToJson.toJSON === "function") return normalizar(conToJson.toJSON(), enArray);
  }
  switch (typeof v) {
    case "string":
    case "boolean":
      return v;
    case "number":
      if (!Number.isFinite(v)) return null;
      return Object.is(v, -0) ? 0 : v;
    case "bigint":
      // Igual que JSON.stringify: un BigInt sin toJSON no se puede serializar.
      throw new TypeError("Do not know how to serialize a BigInt");
    case "undefined":
    case "function":
    case "symbol":
      return enArray ? null : undefined;
  }
  if (Array.isArray(v)) {
    let copia: Json[] | null = null;
    for (let i = 0; i < v.length; i++) {
      const n = normalizar(v[i], true) as Json;
      if (copia) copia.push(n);
      else if (n !== v[i]) {
        copia = v.slice(0, i) as Json[];
        copia.push(n);
      }
    }
    return copia ?? (v as Json[]);
  }
  const obj = v as Record<string, unknown>;
  let copia: ObjetoJson | null = null;
  const claves = Object.keys(obj);
  for (let i = 0; i < claves.length; i++) {
    const k = claves[i]!;
    const n = normalizar(obj[k], false);
    if (copia) {
      if (n !== undefined) asignar(copia, k, n);
    } else if (n !== obj[k]) {
      copia = {};
      for (let j = 0; j < i; j++) asignar(copia, claves[j]!, obj[claves[j]!] as Json);
      if (n !== undefined) asignar(copia, k, n);
    }
  }
  return copia ?? (obj as ObjetoJson);
}

// ── Escalares ───────────────────────────────────────────────────────────────

function escapar(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(CONTROL_GLOBAL, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function vaSinComillas(s: string): boolean {
  if (!s) return false;
  if (/^[ \t]|[ \t]$/.test(s)) return false;
  if (s === "true" || s === "false" || s === "null") return false;
  if (PARECE_NUMERO.test(s)) return false;
  if (s.includes(":") || s.includes('"') || s.includes("\\")) return false;
  if (/[[\]{}]/.test(s)) return false;
  if (CONTROL.test(s)) return false;
  if (s.includes(DELIMITADOR)) return false;
  if (s.startsWith("-") || s.startsWith("#")) return false;
  return true;
}

function escalar(v: null | boolean | number | string): string {
  if (v === null) return "null";
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  return vaSinComillas(v) ? v : `"${escapar(v)}"`;
}

function clave(k: string): string {
  return CLAVE_SIN_COMILLAS.test(k) ? k : `"${escapar(k)}"`;
}

// ── Detección de tablas ─────────────────────────────────────────────────────

/** Columna de una tabla: hoja, o un objeto uniforme plegado en la cabecera. */
interface Campo {
  nombre: string;
  hijos?: Campo[];
}

/** Las filas son tabla si tienen las mismas claves y cada columna es hoja u objeto-tabla. */
function camposDeTabla(filas: ObjetoJson[]): Campo[] | undefined {
  if (filas.length === 0) return undefined;
  const primeras = Object.keys(filas[0]!);
  if (primeras.length === 0) return undefined;
  for (const fila of filas) {
    if (Object.keys(fila).length !== primeras.length) return undefined;
    for (const k of primeras) if (!tiene(fila, k)) return undefined;
  }
  const campos: Campo[] = [];
  for (const k of primeras) {
    const columna = filas.map((f) => f[k]);
    if (columna.every(esEscalar)) {
      campos.push({ nombre: k });
      continue;
    }
    if (!columna.every((v) => esObjeto(v) && !esObjetoVacio(v))) return undefined;
    const hijos = camposDeTabla(columna as ObjetoJson[]);
    if (!hijos) return undefined;
    campos.push({ nombre: k, hijos });
  }
  return campos;
}

/** Objeto cuyos valores (2 o más) son objetos uniformes: tabla con clave por fila. */
function camposDeTablaConClave(v: ObjetoJson): Campo[] | undefined {
  const valores = Object.values(v);
  if (valores.length < 2) return undefined;
  if (!valores.every((x) => esObjeto(x) && !esObjetoVacio(x))) return undefined;
  return camposDeTabla(valores as ObjetoJson[]);
}

function hojas(fila: ObjetoJson, campos: Campo[], out: Json[]): Json[] {
  for (const c of campos) {
    const v = fila[c.nombre] as Json;
    if (c.hijos) hojas(v as ObjetoJson, c.hijos, out);
    else out.push(v);
  }
  return out;
}

function segmentoDeCampos(campos: Campo[]): string {
  return campos.map((c) => clave(c.nombre) + (c.hijos ? `{${segmentoDeCampos(c.hijos)}}` : "")).join(DELIMITADOR);
}

function cabecera(longitud: number, k?: string, campos?: Campo[], conClave = false): string {
  let h = k !== undefined ? clave(k) : "";
  h += `[${longitud}${conClave ? ":" : ""}]`;
  if (campos) h += `{${segmentoDeCampos(campos)}}`;
  return h + ":";
}

function filaCsv(valores: Json[]): string {
  return valores.map((v) => escalar(v as null | boolean | number | string)).join(DELIMITADOR);
}

// ── Encoder ─────────────────────────────────────────────────────────────────

class Salida {
  readonly lineas: string[] = [];
  linea(nivel: number, texto: string): void {
    this.lineas.push(" ".repeat(INDENTACION * nivel) + texto);
  }
  item(nivel: number, texto: string): void {
    this.linea(nivel, "- " + texto);
  }
}

function lineaEnLinea(valores: Json[], k?: string): string {
  const h = cabecera(valores.length, k);
  return valores.length === 0 ? h : `${h} ${filaCsv(valores)}`;
}

function codificarObjeto(o: ObjetoJson, nivel: number, s: Salida): void {
  for (const k of Object.keys(o)) codificarPar(k, o[k] as Json, nivel, s);
}

function codificarPar(k: string, v: Json, nivel: number, s: Salida): void {
  if (esEscalar(v)) {
    s.linea(nivel, `${clave(k)}: ${escalar(v)}`);
  } else if (Array.isArray(v)) {
    codificarArray(k, v, nivel, s);
  } else {
    const conClave = camposDeTablaConClave(v);
    if (conClave) {
      codificarTablaConClave(k, v, conClave, nivel, s);
      return;
    }
    s.linea(nivel, `${clave(k)}:`);
    if (!esObjetoVacio(v)) codificarObjeto(v, nivel + 1, s);
  }
}

function codificarTablaConClave(
  k: string | undefined,
  v: ObjetoJson,
  campos: Campo[],
  nivel: number,
  s: Salida
): void {
  const entradas = Object.keys(v);
  s.linea(nivel, cabecera(entradas.length, k, campos, true));
  filasConClave(v, entradas, campos, nivel + 1, s);
}

function filasConClave(v: ObjetoJson, entradas: string[], campos: Campo[], nivel: number, s: Salida): void {
  for (const e of entradas) s.linea(nivel, `${clave(e)}: ${filaCsv(hojas(v[e] as ObjetoJson, campos, []))}`);
}

function filasDeTabla(filas: ObjetoJson[], campos: Campo[], nivel: number, s: Salida): void {
  for (const f of filas) s.linea(nivel, filaCsv(hojas(f, campos, [])));
}

function codificarArray(k: string | undefined, v: Json[], nivel: number, s: Salida): void {
  if (v.length === 0) {
    s.linea(nivel, k !== undefined ? `${clave(k)}: []` : "[]");
    return;
  }
  if (v.every(esEscalar)) {
    s.linea(nivel, lineaEnLinea(v, k));
    return;
  }
  if (v.every((a) => Array.isArray(a) && a.every(esEscalar))) {
    s.linea(nivel, cabecera(v.length, k));
    for (const a of v) s.item(nivel + 1, lineaEnLinea(a as Json[]));
    return;
  }
  if (v.every(esObjeto)) {
    const campos = camposDeTabla(v as ObjetoJson[]);
    if (campos) {
      s.linea(nivel, cabecera(v.length, k, campos));
      filasDeTabla(v as ObjetoJson[], campos, nivel + 1, s);
      return;
    }
  }
  s.linea(nivel, cabecera(v.length, k));
  for (const x of v) codificarItem(x, nivel + 1, s);
}

function codificarItem(v: Json, nivel: number, s: Salida): void {
  if (esEscalar(v)) {
    s.item(nivel, escalar(v));
  } else if (Array.isArray(v)) {
    if (v.every(esEscalar)) s.item(nivel, lineaEnLinea(v));
    else {
      s.item(nivel, cabecera(v.length));
      for (const x of v) codificarItem(x, nivel + 1, s);
    }
  } else {
    codificarObjetoComoItem(v, nivel, s);
  }
}

function codificarObjetoComoItem(o: ObjetoJson, nivel: number, s: Salida): void {
  const claves = Object.keys(o);
  if (claves.length === 0) {
    s.linea(nivel, "-");
    return;
  }
  const k0 = claves[0]!;
  const v0 = o[k0] as Json;
  const resto = (): void => {
    for (let i = 1; i < claves.length; i++) codificarPar(claves[i]!, o[claves[i]!] as Json, nivel + 1, s);
  };

  if (Array.isArray(v0) && v0.length > 0 && v0.every(esObjeto)) {
    const campos = camposDeTabla(v0 as ObjetoJson[]);
    if (campos) {
      s.item(nivel, cabecera(v0.length, k0, campos));
      filasDeTabla(v0 as ObjetoJson[], campos, nivel + 2, s);
      resto();
      return;
    }
  }
  if (esObjeto(v0)) {
    const conClave = camposDeTablaConClave(v0);
    if (conClave) {
      const entradas = Object.keys(v0);
      s.item(nivel, cabecera(entradas.length, k0, conClave, true));
      filasConClave(v0, entradas, conClave, nivel + 2, s);
      resto();
      return;
    }
  }
  const ck = clave(k0);
  if (esEscalar(v0)) {
    s.item(nivel, `${ck}: ${escalar(v0)}`);
  } else if (Array.isArray(v0)) {
    if (v0.length === 0) s.item(nivel, `${ck}: []`);
    else if (v0.every(esEscalar)) s.item(nivel, `${ck}${lineaEnLinea(v0)}`);
    else {
      s.item(nivel, `${ck}${cabecera(v0.length)}`);
      for (const x of v0) codificarItem(x, nivel + 2, s);
    }
  } else {
    s.item(nivel, `${ck}:`);
    if (!esObjetoVacio(v0)) codificarObjeto(v0, nivel + 2, s);
  }
  resto();
}

/**
 * Codifica un valor a TOON. Misma salida que `encode()` de
 * `@toon-format/toon@4.4.0` (sin salto de línea final). `undefined` en la raíz
 * da `null`, como el cuerpo JSON de una respuesta vacía.
 */
export function encodeToon(input: unknown): string {
  const v = normalizar(input, true) ?? null;
  if (esEscalar(v)) {
    // Un texto que empieza por BOM se entrecomilla siempre (si no, desaparecería).
    return typeof v === "string" && v.startsWith("\uFEFF") ? `"${escapar(v)}"` : escalar(v);
  }
  const s = new Salida();
  if (Array.isArray(v)) codificarArray(undefined, v, 0, s);
  else {
    const conClave = camposDeTablaConClave(v);
    if (conClave) codificarTablaConClave(undefined, v, conClave, 0, s);
    else codificarObjeto(v, 0, s);
  }
  return s.lineas.join("\n");
}

// ── Decoder ─────────────────────────────────────────────────────────────────

interface Linea {
  nivel: number;
  texto: string;
  num: number;
}

class Lector {
  private i = 0;
  constructor(private readonly lineas: Linea[]) {}
  mirar(): Linea | undefined {
    return this.lineas[this.i];
  }
  leer(): Linea | undefined {
    return this.lineas[this.i++];
  }
}

function escanear(texto: string): Linea[] {
  const crudas = texto.split("\n");
  const out: Linea[] = [];
  for (let n = 0; n < crudas.length; n++) {
    let raw = crudas[n]!;
    if (n === 0 && raw.startsWith("\uFEFF")) raw = raw.slice(1);
    if (raw.endsWith("\r")) raw = raw.slice(0, -1);
    let sangria = 0;
    let conTab = false;
    while (sangria < raw.length && (raw[sangria] === " " || raw[sangria] === "\t")) {
      if (raw[sangria] === "\t") conTab = true;
      sangria++;
    }
    let fin = raw.length;
    while (fin > sangria && raw[fin - 1] === " ") fin--;
    if (fin === sangria) continue; // línea en blanco
    if (!conTab && raw[sangria] === "#") continue; // comentario
    if (conTab) throw new ToonDecodeError("Tabs are not allowed in indentation", n + 1);
    const contenido = sangria === 0 && fin === raw.length ? raw : raw.slice(sangria, fin);
    out.push({ nivel: Math.floor(sangria / INDENTACION), texto: contenido, num: n + 1 });
  }
  return out;
}

function recortar(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && s[a] === " ") a++;
  while (b > a && s[b - 1] === " ") b--;
  return a === 0 && b === s.length ? s : s.slice(a, b);
}

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"' };

function desescapar(s: string): string {
  if (!s.includes("\\")) return s;
  return s.replace(/\\(u[0-9a-fA-F]{4}|.?)/g, (_, sec: string) => {
    if (sec.length === 5) return String.fromCharCode(parseInt(sec.slice(1), 16));
    const c = ESCAPES[sec];
    if (c === undefined) throw new SyntaxError(`Invalid escape sequence: \\${sec}`);
    return c;
  });
}

function cierreDeComillas(s: string, desde: number): number {
  for (let i = desde + 1; i < s.length; i++) {
    if (s[i] === "\\") {
      i++;
      continue;
    }
    if (s[i] === '"') return i;
  }
  return -1;
}

/** Posición de `ch` fuera de comillas, o -1. */
function fueraDeComillas(s: string, ch: string, desde = 0): number {
  // Atajo: si `ch` aparece antes de la primera comilla, está fuera de comillas.
  const comilla = s.indexOf('"', desde);
  const directo = s.indexOf(ch, desde);
  if (comilla === -1 || (directo !== -1 && directo < comilla)) return directo;
  let dentro = false;
  for (let i = desde; i < s.length; i++) {
    const c = s[i];
    if (dentro && c === "\\") {
      i++;
      continue;
    }
    if (c === '"') dentro = !dentro;
    else if (!dentro && c === ch) return i;
  }
  return -1;
}

function textoLiteral(token: string): string {
  const t = recortar(token);
  if (!t.startsWith('"')) return t;
  const fin = cierreDeComillas(t, 0);
  if (fin === -1) throw new SyntaxError("Unterminated string: missing closing quote");
  if (fin !== t.length - 1) throw new SyntaxError("Unexpected characters after closing quote");
  return desescapar(t.slice(1, fin));
}

function primitivo(token: string): Json {
  const t = recortar(token);
  if (!t) return "";
  if (t.startsWith('"')) return textoLiteral(t);
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  if (LITERAL_NUMERICO.test(t)) {
    const n = Number.parseFloat(t);
    if (Number.isFinite(n)) return Object.is(n, -0) ? 0 : n;
  }
  return t;
}

function separar(entrada: string, delim: string): string[] {
  if (!entrada.includes('"')) return entrada === "" ? [] : entrada.split(delim).map(recortar);
  const valores: string[] = [];
  let inicio = 0;
  let dentro = false;
  for (let i = 0; i < entrada.length; i++) {
    const c = entrada[i];
    if (dentro && c === "\\" && i + 1 < entrada.length) {
      i++;
      continue;
    }
    if (c === '"') dentro = !dentro;
    else if (!dentro && c === delim) {
      valores.push(recortar(entrada.slice(inicio, i)));
      inicio = i + 1;
    }
  }
  if (inicio < entrada.length || valores.length > 0) valores.push(recortar(entrada.slice(inicio)));
  return valores;
}

function llaveQueCierra(s: string, desde: number): number {
  let dentro = false;
  let prof = 0;
  for (let i = desde; i < s.length; i++) {
    const c = s[i];
    if (dentro && c === "\\") {
      i++;
      continue;
    }
    if (c === '"') dentro = !dentro;
    else if (!dentro && c === "{") prof++;
    else if (!dentro && c === "}") {
      prof--;
      if (prof === 0) return i;
    }
  }
  return -1;
}

function leerCampos(segmento: string, delim: string): Campo[] {
  const partes: string[] = [];
  let actual = "";
  let dentro = false;
  let prof = 0;
  for (let i = 0; i < segmento.length; i++) {
    const c = segmento[i]!;
    if (dentro && c === "\\" && i + 1 < segmento.length) {
      actual += c + segmento[i + 1];
      i++;
      continue;
    }
    if (c === '"') dentro = !dentro;
    else if (!dentro && c === "{") prof++;
    else if (!dentro && c === "}") prof--;
    else if (!dentro && prof === 0 && c === delim) {
      partes.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }
  partes.push(actual);
  return partes.map((p) => {
    const t = recortar(p);
    if (!t) throw new SyntaxError("Empty field name in field list");
    const abre = fueraDeComillas(t, "{");
    if (abre === -1) return { nombre: textoLiteral(t) };
    const cierra = llaveQueCierra(t, abre);
    if (cierra !== t.length - 1) throw new SyntaxError("Unexpected content after nested field group");
    return { nombre: textoLiteral(t.slice(0, abre)), hijos: leerCampos(t.slice(abre + 1, cierra), delim) };
  });
}

function contarHojas(cs: Campo[]): number {
  let n = 0;
  for (const c of cs) n += c.hijos ? contarHojas(c.hijos) : 1;
  return n;
}

interface Cabecera {
  clave?: string;
  longitud: number;
  delim: string;
  campos?: Campo[];
  conClave: boolean;
  enLinea?: string;
}

/** Lee una cabecera de array (`clave[N]{campos}: ...`) o devuelve undefined si la línea no lo es. */
function leerCabecera(texto: string): Cabecera | undefined {
  let abre: number;
  if (texto.startsWith('"')) {
    const fin = cierreDeComillas(texto, 0);
    if (fin === -1 || texto[fin + 1] !== "[") return undefined;
    abre = fin + 1;
  } else abre = fueraDeComillas(texto, "[");
  if (abre === -1) return undefined;
  const dosPuntos = fueraDeComillas(texto, ":");
  if (dosPuntos === -1 || dosPuntos < abre) return undefined;
  const cierra = fueraDeComillas(texto, "]", abre);
  if (cierra === -1) throw new SyntaxError("Unterminated bracket segment");

  let finLlaves = cierra + 1;
  const llave = fueraDeComillas(texto, "{", cierra);
  if (llave !== -1 && llave < fueraDeComillas(texto, ":", cierra)) {
    if (llave !== cierra + 1) throw new SyntaxError("Unexpected content between bracket segment and field list");
    const fin = llaveQueCierra(texto, llave);
    if (fin !== -1) finLlaves = fin + 1;
  }
  const colon = fueraDeComillas(texto, ":", Math.max(cierra, finLlaves));
  if (colon === -1) throw new SyntaxError("Missing colon after array header");
  if (colon !== Math.max(cierra + 1, finLlaves)) {
    throw new SyntaxError("Unexpected content between bracket segment and colon");
  }

  let k: string | undefined;
  if (abre > 0) {
    const cruda = texto.slice(0, abre);
    if (/[ \t]$/.test(cruda)) throw new SyntaxError("Unexpected whitespace between key and bracket segment");
    k = cruda.startsWith('"') ? textoLiteral(cruda) : cruda;
  }

  let seg = texto.slice(abre + 1, cierra);
  let delim: string = DELIMITADOR;
  if (seg.endsWith("\t")) {
    delim = "\t";
    seg = seg.slice(0, -1);
  } else if (seg.endsWith("|")) {
    delim = "|";
    seg = seg.slice(0, -1);
  }
  let conClave = false;
  if (seg.endsWith(":")) {
    conClave = true;
    seg = seg.slice(0, -1);
  }
  if (!LONGITUD_DE_ARRAY.test(seg)) throw new SyntaxError(`Invalid array length: "${seg}"`);

  let cs: Campo[] | undefined;
  if (llave !== -1 && llave < colon) {
    const fin = llaveQueCierra(texto, llave);
    if (fin !== -1 && fin < colon) {
      const contenido = texto.slice(llave + 1, fin);
      for (const otro of DELIMITADORES) {
        if (otro !== delim && fueraDeComillas(contenido, otro) !== -1) {
          throw new SyntaxError("Header delimiter mismatch");
        }
      }
      cs = leerCampos(contenido, delim);
    }
  }
  const despues = recortar(texto.slice(colon + 1));
  if (conClave && !cs) throw new SyntaxError("Keyed header requires a field list");
  if (cs && despues) throw new SyntaxError("Unexpected content after fields-bearing header colon");
  return { clave: k, longitud: Number.parseInt(seg, 10), delim, campos: cs, conClave, enLinea: despues || undefined };
}

function leerClave(texto: string): { clave: string; fin: number } {
  if (texto.startsWith('"')) {
    const cierra = cierreDeComillas(texto, 0);
    if (cierra === -1) throw new SyntaxError("Unterminated quoted key");
    let p = cierra + 1;
    while (texto[p] === " ") p++;
    if (texto[p] !== ":") throw new SyntaxError("Missing colon after key");
    return { clave: desescapar(texto.slice(1, cierra)), fin: p + 1 };
  }
  const colon = fueraDeComillas(texto, ":");
  if (colon === -1) throw new SyntaxError("Missing colon after key");
  return { clave: recortar(texto.slice(0, colon)), fin: colon + 1 };
}

const esCabeceraSinClave = (t: string) => recortar(t).startsWith("[") && fueraDeComillas(t, ":") !== -1;
const esParClaveValor = (t: string) => fueraDeComillas(t, ":") !== -1;

/** En una tabla, ¿la línea es una fila (y no un `clave: valor` que sigue)? */
function esFila(texto: string, delim: string): boolean {
  const colon = fueraDeComillas(texto, ":");
  if (colon === -1) return true;
  const d = fueraDeComillas(texto, delim);
  return d !== -1 && d < colon;
}

function objetoDeCampos(cs: Campo[], valores: Json[]): ObjetoJson {
  let i = 0;
  const construir = (nodos: Campo[]): ObjetoJson => {
    const o: ObjetoJson = {};
    for (const n of nodos) asignar(o, n.nombre, n.hijos ? construir(n.hijos) : (valores[i++] as Json));
    return o;
  };
  return construir(cs);
}

class Decodificador {
  constructor(private readonly r: Lector) {}

  private error(m: string, l?: Linea): ToonDecodeError {
    return new ToonDecodeError(m, l?.num);
  }

  private conLinea<T>(l: Linea, fn: () => T): T {
    try {
      return fn();
    } catch (e) {
      if (e instanceof ToonDecodeError) throw e;
      throw this.error((e as Error).message, l);
    }
  }

  documento(): Json {
    const primera = this.r.mirar();
    if (!primera) return {};
    if (primera.nivel !== 0) throw this.error("Over-indented line", primera);
    if (primera.texto === "[]") {
      this.r.leer();
      this.consumido();
      return [];
    }
    if (esCabeceraSinClave(primera.texto)) {
      const h = this.conLinea(primera, () => leerCabecera(primera.texto));
      if (h) {
        this.r.leer();
        const v = this.desdeCabecera(h, 0, primera);
        this.consumido();
        return v;
      }
    }
    this.r.leer();
    if (!this.r.mirar() && !esParClaveValor(primera.texto)) {
      return this.conLinea(primera, () => primitivo(primera.texto));
    }
    if (!esParClaveValor(primera.texto)) {
      throw this.error("Top-level document must start with a key-value or array-header line", primera);
    }
    const o: ObjetoJson = {};
    this.par(primera, 0, o);
    for (let l = this.r.mirar(); l; l = this.r.mirar()) {
      if (l.nivel !== 0) throw this.error("Over-indented line", l);
      this.r.leer();
      this.par(l, 0, o);
    }
    return o;
  }

  private consumido(): void {
    const l = this.r.mirar();
    if (l) throw this.error("Unexpected content after the document root", l);
  }

  private par(l: Linea, base: number, o: ObjetoJson): void {
    const h = this.conLinea(l, () => leerCabecera(l.texto));
    if (h) {
      if (h.clave === undefined) throw this.error("Keyless array header is only valid at the root or as a list item", l);
      if (tiene(o, h.clave)) throw this.error(`Duplicate sibling key "${h.clave}"`, l);
      asignar(o, h.clave, this.desdeCabecera(h, base, l));
      return;
    }
    const { clave: k, fin } = this.conLinea(l, () => leerClave(l.texto));
    if (tiene(o, k)) throw this.error(`Duplicate sibling key "${k}"`, l);
    const resto = recortar(l.texto.slice(fin));
    if (!resto) {
      const sig = this.r.mirar();
      asignar(o, k, sig && sig.nivel > base ? this.campos(base + 1) : {});
      return;
    }
    asignar(o, k, resto === "[]" ? [] : this.conLinea(l, () => primitivo(resto)));
  }

  private campos(base: number): ObjetoJson {
    const o: ObjetoJson = {};
    let nivel: number | undefined;
    for (let l = this.r.mirar(); l && l.nivel >= base; l = this.r.mirar()) {
      nivel ??= l.nivel;
      if (l.nivel !== nivel) throw this.error(`Over-indented line: expected depth ${nivel}`, l);
      this.r.leer();
      this.par(l, nivel, o);
    }
    return o;
  }

  private nivelDelContenido(base: number): number {
    const l = this.r.mirar();
    return !l || l.nivel <= base + 1 ? base + 1 : l.nivel;
  }

  private desdeCabecera(h: Cabecera, base: number, l: Linea): Json {
    if (h.conClave) return this.tablaConClave(h, base, l);
    if (h.enLinea !== undefined) {
      const valores = this.conLinea(l, () => separar(h.enLinea!, h.delim).map(primitivo));
      if (valores.length !== h.longitud) throw this.error(`Expected ${h.longitud} inline values, got ${valores.length}`, l);
      return valores;
    }
    if (h.campos && h.campos.length > 0) return this.tabla(h, base, l);
    return this.lista(h, base, l);
  }

  private tabla(h: Cabecera, base: number, cab: Linea): Json[] {
    const nivel = this.nivelDelContenido(base);
    const hojasPorFila = contarHojas(h.campos!);
    const filas: Json[] = [];
    while (filas.length < h.longitud) {
      const l = this.r.mirar();
      if (!l || l.nivel <= base) break;
      if (l.nivel !== nivel) throw this.error(`Over-indented line: expected depth ${nivel}`, l);
      if (!esFila(l.texto, h.delim)) break;
      this.r.leer();
      const valores = this.conLinea(l, () => separar(l.texto, h.delim).map(primitivo));
      if (valores.length !== hojasPorFila) throw this.error(`Expected ${hojasPorFila} row values, got ${valores.length}`, l);
      filas.push(objetoDeCampos(h.campos!, valores));
    }
    if (filas.length !== h.longitud) throw this.error(`Expected ${h.longitud} tabular rows, got ${filas.length}`, cab);
    return filas;
  }

  private tablaConClave(h: Cabecera, base: number, cab: Linea): ObjetoJson {
    const nivel = this.nivelDelContenido(base);
    const hojasPorFila = contarHojas(h.campos!);
    const o: ObjetoJson = {};
    let n = 0;
    for (let l = this.r.mirar(); l && l.nivel > base; l = this.r.mirar()) {
      if (l.nivel !== nivel) throw this.error(`Over-indented line: expected depth ${nivel}`, l);
      this.r.leer();
      const { clave: k, fin } = this.conLinea(l, () => leerClave(l.texto));
      if (tiene(o, k)) throw this.error(`Duplicate key "${k}"`, l);
      const celdas = recortar(l.texto.slice(fin));
      const valores = celdas === "" ? [] : this.conLinea(l, () => separar(celdas, h.delim).map(primitivo));
      if (valores.length !== hojasPorFila) throw this.error(`Expected ${hojasPorFila} entry cells, got ${valores.length}`, l);
      asignar(o, k, objetoDeCampos(h.campos!, valores));
      n++;
    }
    if (n !== h.longitud) throw this.error(`Expected ${h.longitud} keyed entries, got ${n}`, cab);
    return o;
  }

  private lista(h: Cabecera, base: number, cab: Linea): Json[] {
    const nivel = this.nivelDelContenido(base);
    const items: Json[] = [];
    while (items.length < h.longitud) {
      const l = this.r.mirar();
      if (!l || l.nivel <= base) break;
      if (l.nivel !== nivel) throw this.error(`Over-indented line: expected depth ${nivel}`, l);
      if (!(l.texto.startsWith("- ") || l.texto === "-")) break;
      items.push(this.item(nivel));
    }
    if (items.length !== h.longitud) throw this.error(`Expected ${h.longitud} list items, got ${items.length}`, cab);
    const sig = this.r.mirar();
    if (sig && sig.nivel === nivel && (sig.texto.startsWith("- ") || sig.texto === "-")) {
      throw this.error(`Expected ${h.longitud} list items, but found more`, sig);
    }
    return items;
  }

  private item(base: number): Json {
    const l = this.r.leer()!;
    if (l.texto === "-") return {};
    const tras = l.texto.slice(2).replace(/^ +/, "");
    if (!recortar(tras)) return {};
    if (recortar(tras) === "[]") return [];
    const li: Linea = { ...l, texto: tras };
    if (esCabeceraSinClave(tras)) {
      const h = this.conLinea(li, () => leerCabecera(tras));
      if (h) {
        if (h.conClave || h.campos) throw this.error("Keyless header with a field list is only valid at the root", li);
        return this.desdeCabecera(h, base, li);
      }
    }
    const h = this.conLinea(li, () => leerCabecera(tras));
    if (h && h.clave !== undefined && h.campos !== undefined) {
      const o: ObjetoJson = {};
      asignar(o, h.clave, this.desdeCabecera(h, base + 1, li));
      this.hermanos(base + 1, o);
      return o;
    }
    if (esParClaveValor(tras)) {
      const o: ObjetoJson = {};
      this.par(li, base + 1, o);
      this.hermanos(base + 1, o);
      return o;
    }
    return this.conLinea(li, () => primitivo(tras));
  }

  private hermanos(nivel: number, o: ObjetoJson): void {
    for (let l = this.r.mirar(); l && l.nivel >= nivel; l = this.r.mirar()) {
      if (l.nivel !== nivel) throw this.error(`Over-indented line: expected depth ${nivel}`, l);
      this.r.leer();
      this.par(l, nivel, o);
    }
  }
}

/**
 * Decodifica TOON. Lee todo lo que escribe `encodeToon` y lo que escribe la
 * implementación de referencia (tablas con columnas plegadas, tablas con
 * clave, forma de lista a cualquier profundidad, delimitadores `,` `\t` `|`).
 * El documento vacío es `{}`. Ante TOON mal formado lanza `ToonDecodeError`:
 * nunca devuelve datos a medias.
 */
export function decodeToon(text: string): unknown {
  return new Decodificador(new Lector(escanear(text))).documento();
}
