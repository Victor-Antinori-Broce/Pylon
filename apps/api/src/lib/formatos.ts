/**
 * Kitsuden — formatos de respuesta para agentes (JSON / TOON / TRON / auto)
 * ============================================================================
 *
 * Una misma respuesta puede salir en tres formatos sin perder nada:
 *
 *   json  JSON compacto (sin espacios). Lo que lee cualquiera.
 *   toon  TOON (lib/toon-tabular.ts). Gana en listas planas y uniformes.
 *   tron  TRON (`@tron-format/tron`, versión fijada). JSON con «clases»:
 *         `class A: id,name` y luego filas `A(1,"x")`. Gana en objetos
 *         repetidos aunque estén anidados.
 *
 * y `auto` elige, POR RESPUESTA, el más corto de los que de verdad vuelven a
 * dar los mismos datos. Medición en docs/agents/benchmarks.md (24 endpoints
 * reales de una copia de producción, tokenizadores o200k / cl100k / el
 * antiguo de Anthropic).
 *
 * Reglas:
 *   1. Nada sale sin comprobar la ida y vuelta: se decodifica lo codificado y
 *      se compara con los datos. Si no coincide, ese formato se descarta y se
 *      prueba el siguiente; JSON compacto es siempre el último recurso (es la
 *      fuente). TRON 0.1.3 tiene fallos conocidos que esto atrapa: escribe sin
 *      comillas propiedades llamadas `null`/`true`/`false`/`class` (el
 *      resultado no se puede leer) y pierde la clave `__proto__`.
 *   2. La estimación de coste es la LONGITUD del texto (O(1)). En la medición
 *      eligió el mismo formato que o200k en 23 de 24 endpoints (12 tokens
 *      perdidos en total) y fue la más barata; contar trozos tipo
 *      pre-tokenizador acertó menos (19/24) y tardó 18–43 ms en 220 KB.
 *   3. Un formato que no es JSON solo se elige si ahorra al menos
 *      `MARGEN_MINIMO` frente a JSON: por debajo, la diferencia está dentro
 *      del error de la estimación y JSON es lo que menos sorprende.
 *   4. Coste: por debajo de `UMBRAL_MINIMO` caracteres de JSON no se intenta
 *      nada (el ahorro posible son unos pocos tokens). Por encima de
 *      `UMBRAL_GRANDE` se recuerda el ganador por FORMA de respuesta (clave del
 *      llamador + firma de la estructura) y las siguientes respuestas con esa
 *      forma solo se codifican en el ganador; cada `REMEDIR_CADA` usos se
 *      vuelve a medir todo, por si los datos cambiaron.
 *
 * TRON reordena claves cuando dos objetos tienen las mismas claves en distinto
 * orden (usa el orden del primero). Los valores son los mismos, y un objeto
 * JSON no tiene orden (RFC 8259), así que la comparación de TRON no mira el
 * orden de las claves; la de TOON sí (TOON lo conserva siempre).
 */

import { parse as parseTron, stringify as stringifyTron } from "@tron-format/tron";

import { anotarSalida } from "./medida-de-formato";
import { decodeToon, encodeToon } from "./toon-tabular";

export type Formato = "json" | "toon" | "tron";
export type FormatoPedido = Formato | "auto";

export const FORMATOS: readonly Formato[] = ["json", "toon", "tron"];

export const MIME: Record<FormatoPedido, string> = {
  json: "application/json",
  toon: "application/vnd.toon",
  tron: "application/vnd.tron",
  auto: "application/vnd.kitsuden.auto",
};

/** Cabecera (REST) y clave de `_meta` (MCP) que dicen en qué formato va el cuerpo. */
export const CABECERA_FORMATO = "X-Kitsuden-Format";
export const META_FORMATO = "kitsuden/format";

export const UMBRAL_MINIMO = 256;
export const UMBRAL_GRANDE = 16_384;
export const MARGEN_MINIMO = 0.02;
export const REMEDIR_CADA = 50;
const TAMANO_CACHE = 256;

// ── Códecs ──────────────────────────────────────────────────────────────────

interface Codec {
  codificar(datos: unknown): string;
  decodificar(texto: string): unknown;
  /** ¿La comparación de ida y vuelta exige el mismo orden de claves? */
  ordenExacto: boolean;
}

const CODECS: Record<Exclude<Formato, "json">, Codec> = {
  toon: { codificar: encodeToon, decodificar: decodeToon, ordenExacto: true },
  tron: {
    codificar: (d) => stringifyTron(d),
    decodificar: (t) => parseTron(t),
    ordenExacto: false,
  },
};

/** Igualdad de valores JSON sin mirar el orden de las claves. */
export function mismoValor(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!mismoValor(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!mismoValor((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

/**
 * ¿`texto` (en `formato`) vuelve a dar los datos cuyo JSON compacto es `json`?
 * Nunca lanza: un decoder que revienta es un «no».
 */
export function idaYVuelta(formato: Formato, texto: string, json: string, datos?: () => unknown): boolean {
  if (formato === "json") return true;
  const codec = CODECS[formato];
  let vuelta: unknown;
  try {
    vuelta = codec.decodificar(texto);
  } catch {
    return false;
  }
  if (JSON.stringify(vuelta) === json) return true;
  if (codec.ordenExacto) return false;
  return mismoValor(vuelta, datos ? datos() : JSON.parse(json));
}

/** Codifica en `formato` sin comprobar nada. Para JSON, compacto. */
export function codificar(formato: Formato, datos: unknown): string {
  return formato === "json" ? (JSON.stringify(datos) ?? "null") : CODECS[formato].codificar(datos);
}

// ── Caché por forma ─────────────────────────────────────────────────────────

interface Recuerdo {
  formato: Formato;
  usos: number;
}
const cache = new Map<string, Recuerdo>();

/** Vacía la caché por forma (tests). */
export function olvidarFormas(): void {
  cache.clear();
}

/**
 * Firma barata de la ESTRUCTURA: tipos y claves hasta profundidad 3, mirando
 * solo los primeros 3 elementos de cada array y su longitud en órdenes de
 * magnitud. Dos listados del mismo endpoint con páginas distintas dan la misma.
 */
export function firmaDeForma(v: unknown, prof = 0): string {
  if (v === null) return "n";
  if (Array.isArray(v)) {
    const largo = v.length === 0 ? 0 : Math.ceil(Math.log10(v.length + 1));
    if (prof >= 3) return `a${largo}`;
    return `a${largo}[${v.slice(0, 3).map((x) => firmaDeForma(x, prof + 1)).join(",")}]`;
  }
  if (typeof v === "object") {
    const claves = Object.keys(v as object);
    if (prof >= 3) return `o${claves.length}`;
    return `{${claves.map((k) => `${k}:${firmaDeForma((v as Record<string, unknown>)[k], prof + 1)}`).join(",")}}`;
  }
  return (typeof v)[0]!;
}

function recordar(clave: string, formato: Formato): void {
  if (cache.size >= TAMANO_CACHE && !cache.has(clave)) {
    const masVieja = cache.keys().next().value;
    if (masVieja !== undefined) cache.delete(masVieja);
  }
  cache.delete(clave);
  cache.set(clave, { formato, usos: 0 });
}

// ── Elección ────────────────────────────────────────────────────────────────

export interface Salida {
  formato: Formato;
  texto: string;
  /** Por qué ese formato (para logs, cabeceras de depuración y tests). */
  motivo: "pedido" | "pequeña" | "medida" | "recordada" | "sin-ahorro" | "no-reversible";
}

export interface OpcionesDeSalida {
  /** El JSON compacto de `datos`, si el llamador ya lo tiene (evita serializar dos veces). */
  json?: string;
  /** Formatos entre los que puede elegir `auto` (por defecto, los tres). */
  candidatos?: readonly Formato[];
  /** Qué produce la respuesta (ruta o herramienta): se combina con la firma para la caché. */
  clave?: string;
}

/**
 * Codifica `datos` en el formato pedido. Con `auto`, elige; con un formato
 * concreto, lo usa si la ida y vuelta sale bien y si no responde en JSON
 * (y lo dice en `formato`). Nunca devuelve algo que pierda datos. Anota el
 * tamaño en la medida abierta, si la hay (lib/medida-de-formato.ts: el ahorro
 * por agente que enseña el panel).
 */
export function codificarRespuesta(datos: unknown, pedido: FormatoPedido, op: OpcionesDeSalida = {}): Salida {
  const json = op.json ?? JSON.stringify(datos) ?? "null";
  const salida = elegirSalida(datos, json, pedido, op);
  anotarSalida(json, salida.texto, salida.formato);
  return salida;
}

function elegirSalida(datos: unknown, json: string, pedido: FormatoPedido, op: OpcionesDeSalida): Salida {
  let parseado: unknown;
  const canonico = () => (parseado ??= JSON.parse(json));

  if (pedido === "json") return { formato: "json", texto: json, motivo: "pedido" };
  if (pedido !== "auto") {
    const texto = codificarSeguro(pedido, pedido === "tron" ? canonico() : datos);
    if (texto !== null && idaYVuelta(pedido, texto, json, canonico)) return { formato: pedido, texto, motivo: "pedido" };
    return { formato: "json", texto: json, motivo: "no-reversible" };
  }

  if (json.length < UMBRAL_MINIMO) return { formato: "json", texto: json, motivo: "pequeña" };
  const candidatos = (op.candidatos ?? FORMATOS).filter((f) => f !== "json");
  if (candidatos.length === 0) return { formato: "json", texto: json, motivo: "pedido" };

  const grande = json.length >= UMBRAL_GRANDE;
  const claveCache = grande ? `${op.clave ?? ""}|${candidatos.join(",")}|${firmaDeForma(datos)}` : "";
  const recuerdo = grande ? cache.get(claveCache) : undefined;
  if (recuerdo && ++recuerdo.usos % REMEDIR_CADA !== 0) {
    if (recuerdo.formato === "json") return { formato: "json", texto: json, motivo: "recordada" };
    const texto = codificarSeguro(recuerdo.formato, recuerdo.formato === "tron" ? canonico() : datos);
    if (texto !== null && ahorra(texto, json) && idaYVuelta(recuerdo.formato, texto, json, canonico)) {
      return { formato: recuerdo.formato, texto, motivo: "recordada" };
    }
    // La forma era la misma pero estos datos no salen bien: se mide todo.
  }

  const medidos: { formato: Formato; texto: string }[] = [];
  for (const f of candidatos) {
    // TRON no sigue la semántica de JSON.stringify (un Date sale como {}): se le da el valor ya en JSON
    const texto = codificarSeguro(f, f === "tron" ? canonico() : datos);
    if (texto !== null && ahorra(texto, json)) medidos.push({ formato: f, texto });
  }
  medidos.sort((a, b) => a.texto.length - b.texto.length);
  for (const m of medidos) {
    if (idaYVuelta(m.formato, m.texto, json, canonico)) {
      if (grande) recordar(claveCache, m.formato);
      return { formato: m.formato, texto: m.texto, motivo: "medida" };
    }
  }
  if (grande) recordar(claveCache, "json");
  return { formato: "json", texto: json, motivo: medidos.length ? "no-reversible" : "sin-ahorro" };
}

function ahorra(texto: string, json: string): boolean {
  return texto.length <= json.length * (1 - MARGEN_MINIMO);
}

function codificarSeguro(formato: Formato, datos: unknown): string | null {
  try {
    return codificar(formato, datos);
  } catch {
    return null;
  }
}

/**
 * Un resultado MCP que trae datos como texto JSON (las acciones del engine):
 * lo pasa a `auto` y anota el formato en `_meta`. Un error, un texto que no es
 * JSON o un resultado con varios bloques se devuelven tal cual.
 */
export function resultadoEnAuto<T extends { isError?: boolean; content?: unknown[] }>(resultado: T, clave: string): T {
  if (!resultado || resultado.isError || resultado.content?.length !== 1) return resultado;
  const bloque = resultado.content[0] as { type?: string; text?: unknown };
  if (bloque?.type !== "text" || typeof bloque.text !== "string" || !/^[[{]/.test(bloque.text)) return resultado;
  let datos: unknown;
  try {
    datos = JSON.parse(bloque.text);
  } catch {
    return resultado;
  }
  const salida = codificarRespuesta(datos, "auto", { clave });
  const meta = (resultado as { _meta?: Record<string, unknown> })._meta;
  return { ...resultado, content: [{ type: "text", text: salida.texto }], _meta: { ...meta, [META_FORMATO]: salida.formato } };
}

// ── Negociación (REST) ──────────────────────────────────────────────────────

/** Parte por `sep` sin cortar dentro de un valor entre comillas (`formats="json,toon"`). */
function partirFueraDeComillas(texto: string, sep: string): string[] {
  const partes: string[] = [];
  let actual = "";
  let dentro = false;
  for (const ch of texto) {
    if (ch === '"') dentro = !dentro;
    if (ch === sep && !dentro) {
      partes.push(actual);
      actual = "";
    } else actual += ch;
  }
  partes.push(actual);
  return partes;
}

/**
 * Qué formato pide una petición REST, o `null` para dejar la respuesta como
 * está (JSON).
 *
 *   Accept: application/vnd.kitsuden.auto   → auto (también ?format=auto)
 *   Accept: application/vnd.toon            → toon (también ?format=toon)
 *   Accept: application/vnd.tron            → tron (también ?format=tron)
 *
 * Un `Accept` que nombra `application/json` y ninguno de los anteriores gana
 * siempre, aunque la URL lleve `?format=`: el panel, Inti y las webs piden
 * JSON así y no deben recibir otra cosa. Con varios tipos propios en el
 * `Accept`, gana el de mayor `q` (y, a igualdad, el primero).
 * `application/vnd.kitsuden.auto; formats="json,toon"` limita los candidatos.
 */
export function formatoPedido(
  accept: string | undefined,
  formatoEnUrl: string | undefined
): { pedido: FormatoPedido; candidatos?: Formato[] } | null {
  const tipos = partirFueraDeComillas(accept ?? "", ",")
    .map((parte, posicion) => {
      const [tipo = "", ...params] = partirFueraDeComillas(parte, ";").map((s) => s.trim());
      let q = 1;
      let formats: string | undefined;
      for (const p of params) {
        const [k, v = ""] = p.split("=").map((s) => s.trim());
        if (k === "q") q = Number(v) || 0;
        if (k === "formats") formats = v.replace(/^"|"$/g, "");
      }
      return { tipo: tipo.toLowerCase(), q, posicion, formats };
    })
    .filter((t) => t.tipo && t.q > 0);

  const propios = tipos
    .map((t) => ({ ...t, formato: (Object.keys(MIME) as FormatoPedido[]).find((f) => f !== "json" && MIME[f] === t.tipo) }))
    .filter((t): t is typeof t & { formato: FormatoPedido } => t.formato !== undefined)
    .sort((a, b) => b.q - a.q || a.posicion - b.posicion);

  if (propios.length > 0) {
    const elegido = propios[0]!;
    if (elegido.formato === "auto" && elegido.formats) {
      const candidatos = elegido.formats
        .split(/[\s,]+/)
        .filter((f): f is Formato => (FORMATOS as readonly string[]).includes(f));
      return { pedido: "auto", candidatos };
    }
    return { pedido: elegido.formato };
  }
  if (tipos.some((t) => t.tipo === MIME.json)) return null;

  const enUrl = (formatoEnUrl ?? "").toLowerCase();
  if (enUrl === "auto" || enUrl === "toon" || enUrl === "tron") return { pedido: enUrl };
  return null;
}
