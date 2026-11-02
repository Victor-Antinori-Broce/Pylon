/**
 * Escaneo de seguridad del código de un borrador (fase I) — local y determinista
 * ============================================================================
 *
 * Sin red, sin modelos de lenguaje, sin dependencias: un lector de tokens de
 * JavaScript lo justo para no confundir comentarios y textos con código, y
 * unas reglas fijas. Lo mismo entra, lo mismo sale (los tests lo fijan).
 *
 * Lo que mira:
 *
 *   high    `eval`, `Function`, `import()`, `constructor` / `__proto__`
 *           (las vías clásicas para salir de un intérprete), globales que no
 *           son del sandbox (`process`, `require`, `globalThis`, `Bun`…) y las
 *           funciones internas del prólogo (`__pedir`, `__api`…), secretos
 *           escritos en el código, y un código de más de 64 KiB.
 *   medium  ofuscación (`atob`, `fromCharCode`, muchas secuencias `\x`),
 *           líneas larguísimas (código minificado que nadie revisa), un
 *           `fetch` a un host que no se declaró, y `kitsuden` usado de una
 *           forma que no deja ver a qué camino de la API llama (alias,
 *           `kitsuden["api"]`…): entonces la llamada queda «sin clasificar».
 *           Also: `env` used as a whole, a percent-escape in a literal API
 *           path, a member name built at run time, and a `/` this lexer cannot
 *           settle. It is a lexer, not a parser: when in doubt it reports.
 *   low     bucles sin salida aparente (el sandbox los corta por tiempo).
 *
 * `aprobado` = ningún hallazgo `high` ni `medium`.
 *
 * Además saca lo que el resto de la fase I necesita para decidir: las
 * llamadas a `kitsuden.api.*` con su método y camino literal (o `null` si es
 * dinámico), los hosts literales de `fetch` y las variables de `env` que lee.
 *
 * Un mensaje NUNCA repite el secreto encontrado: dice la línea y el tipo.
 */

export type SeveridadDeHallazgo = "high" | "medium" | "low";

export interface HallazgoDeEscaneo {
  rule: string;
  severity: SeveridadDeHallazgo;
  line: number;
  message: string;
}

export interface LlamadaDeApi {
  method: string;
  /** Camino literal (`/api/...`) o `null` si se calcula en ejecución. */
  path: string | null;
  line: number;
}

export interface InformeDeEscaneo {
  version: 1;
  passed: boolean;
  bytes: number;
  findings: HallazgoDeEscaneo[];
  apiCalls: LlamadaDeApi[];
  fetchHosts: string[];
  /** `true` si hay un `fetch` cuya URL no es literal (lo frena la lista blanca en ejecución). */
  dynamicFetch: boolean;
  envVars: string[];
}

export const MAX_BYTES_ESCANEABLES = 64 * 1024;
const MAX_LINEA = 1000;

// ── Tokens ──────────────────────────────────────────────────────────────────

type Token =
  | { t: "id"; v: string; l: number }
  | { t: "p"; v: string; l: number }
  | { t: "s"; v: string; raw: string; plantilla: boolean; interpolada: boolean; l: number }
  | { t: "n"; l: number }
  | { t: "re"; l: number };

interface Lectura {
  tokens: Token[];
  sinTerminar: boolean;
  /** Lines where a `/` could be read as a regex or as a division (see below). */
  barrasDudosas: number[];
}

const PUNTUACION_LARGA = ["===", "!==", "**=", "...", "?.", "??", "=>", "==", "!=", "<=", ">=", "&&", "||", "++", "--", "+=", "-=", "*=", "/="];

/** Keywords after which a `/` always starts a regex. */
const ANTES_DE_REGEX = ["return", "typeof", "case", "do", "else", "in", "new", "delete", "void", "throw", "await"];
/** Words that are keywords or plain identifiers depending on context: a `/` after them is a doubt. */
const ANTES_DE_REGEX_DUDOSO = ["of", "yield"];
const CABECERAS_DE_CONTROL = ["if", "while", "for", "with"];
/** A line terminator for a `//` comment, as the interpreter sees it. */
const FIN_DE_LINEA = /[\n\r\u2028\u2029]/;

function leerTokens(codigo: string): Lectura {
  const tokens: Token[] = [];
  let i = 0;
  let linea = 1;
  let sinTerminar = false;
  const barrasDudosas: number[] = [];
  const n = codigo.length;
  /** For each open `(`: does it open the header of if/while/for/with? */
  const parentesis: boolean[] = [];
  let ultimoCierreEsControl = false;
  /**
   * Open braces. `plantilla` is the `${` of a template literal: its `}` resumes
   * the string instead of being a token of the code.
   */
  const llaves: ("bloque" | "objeto" | "plantilla")[] = [];
  let ultimaLlaveEsBloque = false;
  const ultimoSignificativo = () => tokens[tokens.length - 1];

  /** Is the `{` about to be read a block (rather than an object literal or a class body)? */
  const llaveDeBloque = () => {
    const u = ultimoSignificativo();
    if (!u) return true;
    if (u.t === "id") return ["else", "do", "try", "finally"].includes(u.v);
    return u.t === "p" && [")", ";", "{", "}", "=>", "${"].includes(u.v);
  };
  /** Is the `(` about to be read the header of if/while/for/with? */
  const parentesisDeControl = () => {
    const u = ultimoSignificativo();
    const a = tokens[tokens.length - 2];
    if (u?.t !== "id") return false;
    if (a?.t === "p" && (a.v === "." || a.v === "?.")) return false;
    return CABECERAS_DE_CONTROL.includes(u.v) || (u.v === "await" && a?.t === "id" && a.v === "for");
  };
  const puedeEmpezarRegex = () => {
    const u = ultimoSignificativo();
    if (!u) return true;
    if (u.t === "id") return ANTES_DE_REGEX.includes(u.v) || ANTES_DE_REGEX_DUDOSO.includes(u.v);
    if (u.t === "n" || u.t === "s" || u.t === "re") return false;
    if (u.v === ")") return ultimoCierreEsControl;
    if (u.v === "}") return ultimaLlaveEsBloque;
    return u.v !== "]";
  };
  /**
   * A slash the lexer cannot settle without a real parser: after `}` (a block
   * or an object?) and after `of`/`yield` (a keyword or a name?). A wrong guess
   * would swallow code as if it were a regex or a string, so it is reported and
   * the draft goes to a human.
   */
  const barraDudosa = () => {
    const u = ultimoSignificativo();
    return u?.t === "id" ? ANTES_DE_REGEX_DUDOSO.includes(u.v) : u?.t === "p" && u.v === "}";
  };

  /**
   * Reads a piece of a template literal, from `i` up to its closing backtick or
   * its next `${`. What is inside `${...}` is CODE, so it goes through the main
   * loop like everything else.
   */
  const leerTrozoDePlantilla = (inicio: number, lineaInicial: number) => {
    let valor = "";
    let cerrado = false;
    let interpolada = false;
    while (i < n) {
      const d = codigo[i]!;
      if (d === "\\") {
        const sig = codigo[i + 1] ?? "";
        valor += sig === "n" ? "\n" : sig === "t" ? "\t" : sig;
        if (sig === "\n") linea++;
        i += 2;
        continue;
      }
      if (d === "\n") linea++;
      if (d === "$" && codigo[i + 1] === "{") {
        interpolada = true;
        i += 2;
        break;
      }
      if (d === "`") {
        cerrado = true;
        i++;
        break;
      }
      valor += d;
      i++;
    }
    const continuacion = codigo[inicio] !== "`";
    tokens.push({
      t: "s",
      v: valor,
      raw: codigo.slice(inicio, i),
      plantilla: true,
      interpolada: interpolada || continuacion,
      l: lineaInicial,
    });
    if (interpolada) {
      tokens.push({ t: "p", v: "${", l: linea });
      llaves.push("plantilla");
    } else if (!cerrado) {
      sinTerminar = true;
    }
  };

  while (i < n) {
    const c = codigo[i]!;
    if (c === "\n") {
      linea++;
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r" || c === "\f" || c === "\v" || c === "\u00a0" || c === "\ufeff" || c === "\u2028" || c === "\u2029") {
      i++;
      continue;
    }
    // Comentarios
    if (c === "/" && codigo[i + 1] === "/") {
      while (i < n && !FIN_DE_LINEA.test(codigo[i]!)) i++;
      continue;
    }
    if (c === "/" && codigo[i + 1] === "*") {
      const fin = codigo.indexOf("*/", i + 2);
      const hasta = fin < 0 ? n : fin + 2;
      if (fin < 0) sinTerminar = true;
      for (let k = i; k < hasta; k++) if (codigo[k] === "\n") linea++;
      i = hasta;
      continue;
    }
    // Plantillas: el código de `${...}` se lee como código, no como texto
    if (c === "`") {
      const inicio = i;
      const lineaInicial = linea;
      i++;
      leerTrozoDePlantilla(inicio, lineaInicial);
      continue;
    }
    if (c === "}" && llaves[llaves.length - 1] === "plantilla") {
      llaves.pop();
      tokens.push({ t: "p", v: "}$", l: linea });
      const inicio = i;
      const lineaInicial = linea;
      i++;
      leerTrozoDePlantilla(inicio, lineaInicial);
      continue;
    }
    // Textos
    if (c === "'" || c === '"') {
      const inicio = i;
      const lineaInicial = linea;
      let valor = "";
      i++;
      let cerrado = false;
      while (i < n) {
        const d = codigo[i]!;
        if (d === "\\") {
          const sig = codigo[i + 1] ?? "";
          valor += sig === "n" ? "\n" : sig === "t" ? "\t" : sig;
          if (sig === "\n") linea++;
          i += 2;
          continue;
        }
        if (d === "\n") {
          linea++;
          break;
        }
        if (d === c) {
          cerrado = true;
          i++;
          break;
        }
        valor += d;
        i++;
      }
      if (!cerrado) sinTerminar = true;
      tokens.push({ t: "s", v: valor, raw: codigo.slice(inicio, i), plantilla: false, interpolada: false, l: lineaInicial });
      continue;
    }
    // Números
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(codigo[i + 1] ?? ""))) {
      while (i < n && /[0-9a-fA-FxXoObBn_.eE]/.test(codigo[i]!)) i++;
      tokens.push({ t: "n", l: linea });
      continue;
    }
    // Identificadores (incluidos los escapados \u0065val: se leen como texto crudo)
    if (/[A-Za-z_$\u0080-\uffff\\]/.test(c)) {
      const inicio = i;
      while (i < n && /[A-Za-z0-9_$\u0080-\uffff\\]/.test(codigo[i]!)) {
        if (codigo[i] === "\\" && codigo[i + 1] === "u") i += 2;
        else i++;
      }
      let v = codigo.slice(inicio, i);
      if (v.includes("\\u")) {
        // `\u0065val` es `eval` para el intérprete: se decodifica para mirarlo.
        v = v.replace(/\\u\{?([0-9a-fA-F]{1,6})\}?/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)));
      }
      tokens.push({ t: "id", v, l: linea });
      continue;
    }
    // Expresión regular literal
    if (c === "/" && barraDudosa()) barrasDudosas.push(linea);
    if (c === "/" && puedeEmpezarRegex()) {
      i++;
      let enClase = false;
      while (i < n && codigo[i] !== "\n") {
        const d = codigo[i]!;
        if (d === "\\") {
          i += 2;
          continue;
        }
        if (d === "[") enClase = true;
        else if (d === "]") enClase = false;
        else if (d === "/" && !enClase) break;
        i++;
      }
      i++;
      while (i < n && /[a-z]/i.test(codigo[i]!)) i++;
      tokens.push({ t: "re", l: linea });
      continue;
    }
    const larga = PUNTUACION_LARGA.find((p) => codigo.startsWith(p, i));
    if (larga) {
      tokens.push({ t: "p", v: larga, l: linea });
      i += larga.length;
      continue;
    }
    if (c === "(") parentesis.push(parentesisDeControl());
    if (c === ")") ultimoCierreEsControl = parentesis.pop() === true;
    if (c === "{") llaves.push(llaveDeBloque() ? "bloque" : "objeto");
    if (c === "}") ultimaLlaveEsBloque = llaves.pop() === "bloque";
    tokens.push({ t: "p", v: c, l: linea });
    i++;
  }
  if (llaves.includes("plantilla")) sinTerminar = true;
  return { tokens, sinTerminar, barrasDudosas };
}

// ── Reglas ──────────────────────────────────────────────────────────────────

/** Globales que el sandbox NO da (o que solo sirven para salir de él). */
const GLOBALES_PROHIBIDOS = new Set([
  "process",
  "require",
  "globalThis",
  "Bun",
  "Deno",
  "WebAssembly",
  "SharedArrayBuffer",
  "Atomics",
  "Worker",
  "XMLHttpRequest",
  "WebSocket",
  "importScripts",
]);

/** Lo interno del prólogo de `hijo.mjs`: tocarlo es intentar hablar con el host a mano. */
const INTERNOS_DEL_SANDBOX = /^__(pedir|log|llamar|api|ejecutar|evento|env|crearRespuesta|texto)$/;

const OFUSCACION = new Set(["atob", "fromCharCode", "fromCodePoint", "unescape"]);

const METODOS_DE_API: Record<string, string> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
};

/** Secretos con forma reconocible. El mensaje dice el tipo, nunca el valor. */
const SECRETOS: { tipo: string; re: RegExp }[] = [
  { tipo: "Kitsuden key", re: /(kitsuden_agent_|kitsuden_sk_|grm_agent_)[A-Za-z0-9_-]{8,}/ },
  { tipo: "private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { tipo: "AWS access key", re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { tipo: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { tipo: "Slack token", re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
  { tipo: "Stripe key", re: /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}/ },
  { tipo: "API key (sk-)", re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/ },
  { tipo: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { tipo: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { tipo: "connection string with password", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]{3,}@/i },
];

/** `password = "…"`, `apiKey: '…'` (en el código, no en un texto). */
const ASIGNACION_DE_SECRETO = /^(password|passwd|pwd|secret|client_?secret|token|access_?token|api_?key|apikey|private_?key)$/i;

function hostDeUrl(texto: string): string | null {
  const m = /^https?:\/\/([^/?#:@]+)(?::\d+)?(?:[/?#]|$)/i.exec(texto);
  return m ? m[1]!.toLowerCase() : null;
}

function hostPermitido(host: string, lista: readonly string[]): boolean {
  return lista.some((p) => {
    const q = p.toLowerCase();
    return q.startsWith("*.") ? host.endsWith(q.slice(1)) && host.length > q.length - 1 : host === q;
  });
}

function caminoLiteral(tok: Token | undefined): { camino: string | null; literal: boolean } {
  if (!tok || tok.t !== "s") return { camino: null, literal: false };
  if (tok.interpolada) {
    // `/api/datasets/${x}/entries`: la parte fija antes de la primera interpolación.
    return { camino: null, literal: false };
  }
  return { camino: tok.v, literal: true };
}

/**
 * The path the router will see. Hono decodes percent-escapes, so
 * `/api/%61dmin/x` reaches `/api/admin/x`: classifying the raw text misses it.
 * `null` (unclassifiable) if it cannot be decoded. The query string stays as is.
 */
function caminoDecodificado(camino: string): string | null {
  const corte = camino.indexOf("?");
  const ruta = corte < 0 ? camino : camino.slice(0, corte);
  try {
    return decodeURIComponent(ruta) + (corte < 0 ? "" : camino.slice(corte));
  } catch {
    return null;
  }
}

/** Methods every object inherits: `env.valueOf()` hands out the whole object. */
const HEREDADOS_DE_OBJECT = new Set([
  "valueOf",
  "toString",
  "toLocaleString",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
]);

export interface OpcionesDeEscaneo {
  /** Hosts declarados (`fetchAllow` del borrador). */
  fetchAllow?: readonly string[];
}

/** El escaneo (ver la cabecera). Puro y determinista. */
export function escanearCodigo(codigo: string, opciones: OpcionesDeEscaneo = {}): InformeDeEscaneo {
  const hallazgos: HallazgoDeEscaneo[] = [];
  const add = (rule: string, severity: SeveridadDeHallazgo, line: number, message: string) => {
    // Un hallazgo por regla y línea basta para que un humano mire.
    if (!hallazgos.some((h) => h.rule === rule && h.line === line)) hallazgos.push({ rule, severity, line, message });
  };
  const bytes = new TextEncoder().encode(codigo).byteLength;
  const llamadas: LlamadaDeApi[] = [];
  const hosts = new Set<string>();
  const variables = new Set<string>();
  let fetchDinamico = false;
  const declarados = (opciones.fetchAllow ?? []).map((h) => h.toLowerCase());

  if (bytes > MAX_BYTES_ESCANEABLES) {
    add("oversize", "high", 1, `Code is ${bytes} bytes; drafts above ${MAX_BYTES_ESCANEABLES} bytes are not reviewable`);
  }
  codigo.split("\n").forEach((texto, idx) => {
    if (texto.length > MAX_LINEA) {
      add("long_line", "medium", idx + 1, `Line is ${texto.length} characters long (minified or generated code cannot be reviewed)`);
    }
  });
  for (const { tipo, re } of SECRETOS) {
    const m = re.exec(codigo);
    if (m) {
      const linea = codigo.slice(0, m.index).split("\n").length;
      add("secret_literal", "high", linea, `Looks like a ${tipo} written in the code (use the action's environment variables or the vault)`);
    }
  }

  const { tokens, sinTerminar, barrasDudosas } = leerTokens(codigo);
  if (sinTerminar) add("unparsable", "medium", 1, "Unterminated string or comment: the code cannot be reviewed reliably");
  for (const linea of barrasDudosas) {
    add("ambiguous_slash", "medium", linea, "A '/' after '}', 'of' or 'yield' can be a regex or a division: the code after it cannot be reviewed reliably");
  }

  /** A literal API path: flags percent-escapes and records what the router will see. */
  const caminoDeLlamada = (camino: string | null, linea: number): string | null => {
    if (camino === null) return null;
    if (camino.split("?")[0]!.includes("%")) {
      add("encoded_api_path", "medium", linea, "Percent-escape in a literal API path: write the path as the route declares it");
    }
    return caminoDecodificado(camino);
  };

  /** Open braces: inside a class body, `this` is the instance and not the global object. */
  const llaves: boolean[] = [];
  let claseAbierta = false;

  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k]!;
    const prev = tokens[k - 1];
    const sig = tokens[k + 1];
    const esMiembro = prev?.t === "p" && (prev.v === "." || prev.v === "?.");

    if (tok.t === "p") {
      if (tok.v === "{" || tok.v === "${") {
        llaves.push(tok.v === "{" && claseAbierta);
        if (tok.v === "{") claseAbierta = false;
      } else if (tok.v === "}" || tok.v === "}$") {
        llaves.pop();
      }
      continue;
    }
    if (tok.t === "id" && tok.v === "class" && !esMiembro) claseAbierta = true;

    if (tok.t === "s") {
      // `obj["con" + "structor"]`, `obj[`con${x}`]`: the name of the member is
      // built at run time, so the rules on literal names cannot see it.
      if (prev?.t === "p" && prev.v === "[" && (tok.interpolada || (sig?.t === "p" && sig.v === "+"))) {
        add("computed_member", "medium", tok.l, "Member name built at run time: what it reaches cannot be reviewed statically");
      }
      if (tok.v === "constructor" || tok.v === "__proto__" || tok.v === "prototype") {
        add("constructor_escape", "high", tok.l, `String '${tok.v}' used to reach object internals`);
      }
      const escapes = (tok.raw.match(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F{])/g) ?? []).length;
      if (escapes >= 8) add("obfuscation", "medium", tok.l, `String with ${escapes} escape sequences (obfuscated text)`);
      if (/^(GLOBALTHIS|PROCESS)$/i.test(tok.v) || INTERNOS_DEL_SANDBOX.test(tok.v)) {
        add("forbidden_global", "high", tok.l, `String naming a host global ('${tok.v}')`);
      }
      continue;
    }
    if (tok.t !== "id") continue;
    const v = tok.v;

    if (v === "eval" && !esMiembro) {
      add("dynamic_eval", "high", tok.l, "eval() runs code built at runtime");
      continue;
    }
    if (v === "Function" && !esMiembro && (sig?.t === "p" && sig.v === "(" || prev?.t === "id" && prev.v === "new")) {
      add("dynamic_eval", "high", tok.l, "Function() builds code at runtime");
      continue;
    }
    if (v === "import" && !esMiembro) {
      add("dynamic_import", "high", tok.l, "import is not available in the sandbox (dynamic import / import.meta)");
      continue;
    }
    // `class A { constructor() {} }` declara, no escapa.
    const declaraMetodo = !esMiembro && sig?.t === "p" && sig.v === "(" && prev?.t === "p" && ["{", "}", ";"].includes(prev.v);
    if (v === "constructor" && declaraMetodo) continue;
    if (v === "constructor" || v === "__proto__" || v === "__defineGetter__" || v === "__lookupGetter__") {
      add("constructor_escape", "high", tok.l, `'${v}' reaches object internals (classic sandbox escape)`);
      continue;
    }
    // Outside a class, `this` is the global object: `this["__pe" + "dir"]` reaches
    // the prologue without naming it.
    if (v === "this" && !esMiembro && !llaves.includes(true)) {
      add("forbidden_global", "high", tok.l, "'this' outside a class is the global object of the sandbox");
      continue;
    }
    if (!esMiembro && GLOBALES_PROHIBIDOS.has(v)) {
      add("forbidden_global", "high", tok.l, `'${v}' is a host global outside kitsuden.api.* (it does not exist in the sandbox)`);
      continue;
    }
    if (INTERNOS_DEL_SANDBOX.test(v)) {
      add("forbidden_global", "high", tok.l, `'${v}' is internal to the sandbox prologue`);
      continue;
    }
    if (OFUSCACION.has(v)) {
      add("obfuscation", "medium", tok.l, `'${v}' is typical of obfuscated code`);
      continue;
    }
    if ((v === "Reflect" || v === "Proxy") && !esMiembro) {
      add("reflection", "medium", tok.l, `'${v}' makes the code hard to review statically`);
      continue;
    }
    if ((v === "setTimeout" || v === "setInterval") && !esMiembro) {
      const arg = tokens[k + 2];
      if (sig?.t === "p" && sig.v === "(" && arg?.t === "s") {
        add("dynamic_eval", "high", tok.l, `${v}() with a string argument evaluates code`);
      }
      continue;
    }
    if (v === "while" && sig?.t === "p" && sig.v === "(" && tokens[k + 2]?.t === "id" && (tokens[k + 2] as { v: string }).v === "true") {
      add("unbounded_loop", "low", tok.l, "while(true): relies on the sandbox time limit");
      continue;
    }

    // `env.X`, `kitsuden.env.X`
    const deKitsuden = tokens[k - 2]?.t === "id" && (tokens[k - 2] as { v: string }).v === "kitsuden";
    if (v === "env" && (!esMiembro || deKitsuden)) {
      const claveDeObjeto = !deKitsuden && sig?.t === "p" && sig.v === ":" && prev?.t === "p" && (prev.v === "{" || prev.v === ",");
      if (sig?.t === "p" && (sig.v === "." || sig.v === "?.") && tokens[k + 2]?.t === "id") {
        const nombre = (tokens[k + 2] as { v: string }).v;
        variables.add(HEREDADOS_DE_OBJECT.has(nombre) ? "*" : nombre);
      } else if (sig?.t === "p" && sig.v === "[") {
        const clave = tokens[k + 2];
        if (clave?.t === "s" && !clave.interpolada) variables.add(clave.v);
        else variables.add("*");
      } else if (!claveDeObjeto) {
        // `JSON.stringify(env)`, `const { X } = env`, `const e = env`: reads every
        // variable at once, under names this scan cannot list.
        variables.add("*");
        add("env_bulk_read", "medium", tok.l, "env used as a whole: read each variable as env.NAME so that a reviewer can see which ones");
      }
    }

    // `fetch(...)` / `kitsuden.fetch(...)`
    if (v === "fetch" && (!esMiembro || deKitsuden)) {
      if (sig?.t === "p" && sig.v === "(") {
        const arg = tokens[k + 2];
        const host = arg?.t === "s" ? hostDeUrl(arg.v.split("${")[0] ?? "") : null;
        if (host) {
          hosts.add(host);
          if (!hostPermitido(host, declarados)) {
            add("undeclared_host", "medium", tok.l, `fetch to '${host}', which is not declared in fetchAllow (it would be refused at runtime)`);
          }
        } else {
          fetchDinamico = true;
        }
      }
      continue;
    }

    // `kitsuden.…`
    if (v === "kitsuden" && !esMiembro) {
      const p1 = tokens[k + 1];
      const m1 = tokens[k + 2];
      if (!(p1?.t === "p" && (p1.v === "." || p1.v === "?.")) || m1?.t !== "id") {
        add("api_alias", "medium", tok.l, "kitsuden used without a direct member access: calls through it cannot be classified");
        llamadas.push({ method: "*", path: null, line: tok.l });
        continue;
      }
      if (["fetch", "env", "event", "log"].includes(m1.v)) continue;
      if (m1.v !== "api") {
        add("api_alias", "medium", tok.l, `kitsuden.${m1.v} is not part of the sandbox API`);
        continue;
      }
      const p2 = tokens[k + 3];
      const metodo = tokens[k + 4];
      const paren = tokens[k + 5];
      if (!(p2?.t === "p" && (p2.v === "." || p2.v === "?.")) || metodo?.t !== "id" || !(paren?.t === "p" && paren.v === "(")) {
        add("api_alias", "medium", tok.l, "kitsuden.api used indirectly (alias or computed member): its calls cannot be classified");
        llamadas.push({ method: "*", path: null, line: tok.l });
        continue;
      }
      if (metodo.v === "request") {
        const m = tokens[k + 6];
        const coma = tokens[k + 7];
        const camino = caminoLiteral(tokens[k + 8]);
        const literalM = m?.t === "s" && !m.interpolada ? m.v.toUpperCase() : "*";
        const okComa = coma?.t === "p" && coma.v === ",";
        llamadas.push({ method: literalM, path: okComa ? caminoDeLlamada(camino.camino, tok.l) : null, line: tok.l });
        continue;
      }
      const http = METODOS_DE_API[metodo.v];
      if (!http) {
        add("api_alias", "medium", tok.l, `kitsuden.api.${metodo.v} is not a sandbox API method`);
        continue;
      }
      llamadas.push({ method: http, path: caminoDeLlamada(caminoLiteral(tokens[k + 6]).camino, tok.l), line: tok.l });
      continue;
    }

    // `password = "…"` / `{ apiKey: "…" }`
    if (ASIGNACION_DE_SECRETO.test(v) && sig?.t === "p" && (sig.v === "=" || sig.v === ":")) {
      const valor = tokens[k + 2];
      if (valor?.t === "s" && !valor.interpolada && valor.v.length >= 8) {
        add("secret_literal", "high", tok.l, `'${v}' is assigned a literal value (secrets belong in environment variables or the vault)`);
      }
    }
  }

  // Un bucle `for (;;)`.
  for (let k = 0; k + 4 < tokens.length; k++) {
    const a = tokens[k]!;
    if (a.t === "id" && a.v === "for") {
      const seq = tokens.slice(k + 1, k + 5).map((x) => (x.t === "p" ? x.v : "?")).join("");
      if (seq === "(;;)") add("unbounded_loop", "low", a.l, "for(;;): relies on the sandbox time limit");
    }
  }

  hallazgos.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
  return {
    version: 1,
    passed: !hallazgos.some((h) => h.severity === "high" || h.severity === "medium"),
    bytes,
    findings: hallazgos,
    apiCalls: llamadas,
    fetchHosts: [...hosts].sort(),
    dynamicFetch: fetchDinamico,
    envVars: [...variables].sort(),
  };
}
