/**
 * Kitsuden — proceso hijo del sandbox (intérprete QuickJS en WASM)
 * ============================================================================
 *
 * Lo lanza `worker-sandbox.ts` con el entorno VACÍO y, si hay Node >= 22, con
 * `--permission` (solo puede leer este fichero y los paquetes de QuickJS; ni
 * escribir, ni lanzar procesos, ni hilos, ni addons). Habla con el padre por
 * stdin/stdout, una línea JSON por mensaje.
 *
 * El código del usuario NO corre en este proceso de JavaScript: corre dentro
 * de QuickJS, un intérprete compilado a WebAssembly. Ahí dentro no existe
 * `process`, ni `require`, ni `import` de módulos, ni `fetch`, ni sistema de
 * ficheros: solo el lenguaje y lo que este fichero inyecta (consola, el evento,
 * las variables declaradas y dos funciones que PIDEN cosas al padre). Es
 * aislamiento por construcción, no por tapar nombres.
 *
 * Mensajes:
 *   padre → hijo  {t:"inicio", codigo, evento, env, limites, capacidades}
 *                 {t:"respuesta", id, ok, valor | error}
 *   hijo → padre  {t:"llamada", id, op, args}
 *                 {t:"fin", resultado, logs, error, memoria}
 *
 * Este fichero es .mjs a propósito: lo ejecuta Node o Bun tal cual, sin
 * compilar, y desde el bundle de `dist/` sigue existiendo en `src/`.
 */

// Los dos módulos de QuickJS llegan como URL file:// en argv (los resuelve el
// padre): con `--permission` este proceso solo puede leer esas carpetas, así
// que no puede buscar paquetes por node_modules como haría un import normal.
const [urlNucleo, urlVariante] = process.argv.slice(2);

const escribir = (mensaje) => process.stdout.write(JSON.stringify(mensaje) + "\n");

// ── Lectura de líneas de stdin ─────────────────────────────────────────────
let pendiente = "";
const esperandoInicio = [];
const respuestas = new Map();
let inicio = null;

process.stdin.setEncoding("utf8");
process.stdin.on("data", (trozo) => {
  pendiente += trozo;
  let i;
  while ((i = pendiente.indexOf("\n")) >= 0) {
    const linea = pendiente.slice(0, i);
    pendiente = pendiente.slice(i + 1);
    if (!linea.trim()) continue;
    let m;
    try {
      m = JSON.parse(linea);
    } catch {
      continue;
    }
    if (m.t === "inicio" && !inicio) {
      inicio = m;
      for (const f of esperandoInicio.splice(0)) f(m);
    } else if (m.t === "respuesta") {
      const r = respuestas.get(m.id);
      if (r) {
        respuestas.delete(m.id);
        r(m);
      }
    }
  }
});
// Si el padre se va, este proceso no tiene nada que hacer.
process.stdin.on("end", () => process.exit(0));

const mensajeInicial = () =>
  inicio ? Promise.resolve(inicio) : new Promise((r) => esperandoInicio.push(r));

// ── Prólogo que corre DENTRO de QuickJS ────────────────────────────────────
//
// Construye `kitsuden`, `fetch` y `console` sobre las tres funciones del host
// (`__pedir`, `__log`) y los JSON de entrada. Todo lo que cruza la frontera es
// TEXTO: ningún objeto del host llega al código del usuario.
const PROLOGO = `
"use strict";
const __crearRespuesta = (r) => {
  const cuerpo = typeof r.body === "string" ? r.body : "";
  return Object.freeze({
    status: r.status, ok: r.status >= 200 && r.status < 300, statusText: r.statusText || "",
    headers: Object.freeze(Object.assign({}, r.headers || {})),
    url: r.url || "",
    async text() { return cuerpo; },
    async json() { return JSON.parse(cuerpo); },
  });
};
const __llamar = async (op, args) => {
  const r = JSON.parse(await __pedir(op, JSON.stringify(args)));
  if (!r.ok) throw new Error(r.error || "host call failed");
  return r.valor;
};
const __texto = (a) => {
  if (typeof a === "string") return a;
  try { return JSON.stringify(a); } catch (e) { return String(a); }
};
const console = Object.freeze({
  log: (...a) => __log("LOG", a.map(__texto).join(" ")),
  info: (...a) => __log("LOG", a.map(__texto).join(" ")),
  debug: (...a) => __log("LOG", a.map(__texto).join(" ")),
  warn: (...a) => __log("WARN", a.map(__texto).join(" ")),
  error: (...a) => __log("ERROR", a.map(__texto).join(" ")),
});
globalThis.console = console;
const event = JSON.parse(__evento);
const env = Object.freeze(JSON.parse(__env));
const fetch = async (url, opciones) => {
  const o = opciones || {};
  return __crearRespuesta(await __llamar("fetch", {
    url: String(url), method: o.method, headers: o.headers,
    body: o.body === undefined || o.body === null ? undefined : String(o.body),
  }));
};
const __api = async (metodo, camino, cuerpo) =>
  __crearRespuesta(await __llamar("api", { method: metodo, path: String(camino), body: cuerpo }));
const kitsuden = Object.freeze({
  fetch, env, event,
  log: (m) => console.log(m),
  api: Object.freeze({
    request: (metodo, camino, cuerpo) => __api(String(metodo).toUpperCase(), camino, cuerpo),
    get: (camino) => __api("GET", camino),
    post: (camino, cuerpo) => __api("POST", camino, cuerpo),
    put: (camino, cuerpo) => __api("PUT", camino, cuerpo),
    patch: (camino, cuerpo) => __api("PATCH", camino, cuerpo),
    delete: (camino) => __api("DELETE", camino),
  }),
});
globalThis.__ejecutar = async () => {
  const r = await (async (event, env, console, kitsuden, fetch) => {
    /*__CODIGO__*/
  })(event, env, console, kitsuden, fetch);
  return r === undefined ? "null" : JSON.stringify(r);
};
`;

function fallar(error, logs = "", memoria = 0) {
  escribir({ t: "fin", resultado: null, logs, error, memoria });
}

async function main() {
  const m = await mensajeInicial();
  const limites = m.limites || {};
  const memoriaMaxima = Math.max(4, Number(limites.memoriaMb) || 64) * 1024 * 1024;
  const pila = Math.max(64 * 1024, Number(limites.pilaBytes) || 512 * 1024);
  const tiempo = Math.max(10, Number(limites.tiempoMs) || 5000);
  const logsMaximos = Math.max(1000, Number(limites.logsBytes) || 50_000);
  const resultadoMaximo = Math.max(1000, Number(limites.resultadoBytes) || 1_000_000);

  const { newQuickJSWASMModuleFromVariant, newVariant } = await import(urlNucleo);
  const base = (await import(urlVariante)).default;
  // Tope DURO de memoria: el WASM entero no puede crecer más allá de esto.
  // `setMemoryLimit` solo no basta: medido el 2026-10-26, `new Array(1e5).fill()`
  // en bucle llevó el proceso a 1,6 GB antes del «out of memory» (la memoria
  // por defecto del módulo llega a 2 GB). Con `maximum`, el malloc del
  // intérprete falla al llegar al tope y el código recibe su InternalError.
  const paginas = Math.ceil((memoriaMaxima + 32 * 1024 * 1024) / 65536);
  const variante = newVariant(base, {
    wasmMemory: new WebAssembly.Memory({ initial: Math.min(256, paginas), maximum: paginas }),
  });
  const QuickJS = await newQuickJSWASMModuleFromVariant(variante);
  const rt = QuickJS.newRuntime();
  rt.setMemoryLimit(memoriaMaxima);
  rt.setMaxStackSize(pila);
  // CPU: QuickJS llama a este manejador cada cierto número de instrucciones.
  // Un bucle infinito se corta aquí; si además se cuelga el host, el padre
  // mata el proceso por tiempo.
  const limite = Date.now() + tiempo;
  rt.setInterruptHandler(() => Date.now() > limite);
  const ctx = rt.newContext();

  const logs = [];
  let tamLogs = 0;
  const log = ctx.newFunction("__log", (nivel, texto) => {
    const linea = `[${ctx.getString(nivel)}] ${ctx.getString(texto)}`;
    if (tamLogs + linea.length <= logsMaximos) {
      logs.push(linea);
      tamLogs += linea.length;
    }
  });
  ctx.setProp(ctx.global, "__log", log);
  log.dispose();

  let siguiente = 0;
  const pedir = ctx.newFunction("__pedir", (op, args) => {
    const id = ++siguiente;
    const operacion = ctx.getString(op);
    const argumentos = ctx.getString(args);
    const diferida = ctx.newPromise();
    respuestas.set(id, (r) => {
      if (!ctx.alive) return;
      const s = ctx.newString(JSON.stringify(r.ok ? { ok: true, valor: r.valor } : { ok: false, error: r.error }));
      diferida.resolve(s);
      s.dispose();
      diferida.dispose();
      rt.executePendingJobs();
    });
    let parsed = null;
    try {
      parsed = JSON.parse(argumentos);
    } catch {
      parsed = null;
    }
    escribir({ t: "llamada", id, op: operacion, args: parsed });
    return diferida.handle;
  });
  ctx.setProp(ctx.global, "__pedir", pedir);
  pedir.dispose();

  for (const [nombre, valor] of [
    ["__evento", JSON.stringify(m.evento ?? {})],
    ["__env", JSON.stringify(m.env ?? {})],
  ]) {
    const h = ctx.newString(valor);
    ctx.setProp(ctx.global, nombre, h);
    h.dispose();
  }

  const memoria = () => {
    try {
      const h = rt.computeMemoryUsage();
      const d = ctx.dump(h);
      h.dispose();
      return Number(d?.memory_used_size) || 0;
    } catch {
      return 0;
    }
  };
  const mensajeDe = (h) => {
    const e = ctx.dump(h);
    h.dispose();
    if (e && typeof e === "object") return String(e.message ?? e.name ?? JSON.stringify(e));
    return String(e);
  };

  const fuente = PROLOGO.replace("/*__CODIGO__*/", () => String(m.codigo ?? ""));
  const preparado = ctx.evalCode(fuente, "accion.js");
  if (preparado.error) {
    return fallar(mensajeDe(preparado.error), logs.join("\n"), memoria());
  }
  preparado.value.dispose();

  const llamada = ctx.evalCode("__ejecutar()", "inicio.js");
  if (llamada.error) {
    return fallar(mensajeDe(llamada.error), logs.join("\n"), memoria());
  }
  const promesa = ctx.resolvePromise(llamada.value);
  llamada.value.dispose();
  rt.executePendingJobs();

  const final = await promesa;
  if (final.error) {
    return fallar(mensajeDe(final.error), logs.join("\n"), memoria());
  }
  const texto = ctx.getString(final.value);
  final.value.dispose();
  if (texto.length > resultadoMaximo) {
    return fallar(`Result too large (${texto.length} bytes, max ${resultadoMaximo})`, logs.join("\n"), memoria());
  }
  escribir({ t: "fin", resultado: JSON.parse(texto), logs: logs.join("\n"), error: null, memoria: memoria() });
}

main()
  .catch((err) => fallar(err?.message || String(err)))
  .finally(() => {
    // Sin `dispose`: el proceso termina ya, y un handle vivo no debe convertir
    // un resultado bueno en una aserción de QuickJS.
    // La escritura vacía se completa DESPUÉS de las anteriores: salir antes
    // cortaría la línea de resultado en una tubería lenta (Windows).
    process.stdout.write("", () => process.exit(0));
  });
