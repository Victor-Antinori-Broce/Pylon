/**
 * Kitsuden — Sandbox del código de usuario (acciones `code` y funciones)
 * ============================================================================
 *
 * ── HISTORIA ───────────────────────────────────────────────────────────────
 *
 *   · Hasta 2026-10-25: un `Worker` del mismo proceso con `process`/`require`
 *     tapados por variables locales. `globalThis.process.env` tenía todos los
 *     secretos y `import("node:child_process")` ejecutaba comandos.
 *   · 2026-10-25: proceso hijo de Bun con el entorno vacío. Mejor, pero el
 *     código seguía siendo JavaScript del host: leía ficheros (`apps/api/.env`
 *     incluido), abría conexiones a cualquier sitio, lanzaba procesos y, en
 *     Linux, podía leer `/proc/<pid de la API>/environ`.
 *
 * ── LO QUE HAY AHORA (2026-10-26) ──────────────────────────────────────────
 *
 * Dos capas, cada una suficiente por sí sola para lo que promete:
 *
 *   1. LENGUAJE: el código corre dentro de QuickJS compilado a WebAssembly
 *      (`quickjs-emscripten`). Ahí no existe `process`, `require`, `import`,
 *      `fetch`, `Bun`, ni ficheros, ni red: no es que estén tapados, es que el
 *      intérprete no los tiene. Lo único que el código puede hacer fuera de
 *      calcular es PEDIR al padre, por texto, dos cosas:
 *        · `fetch(url)`        solo a hosts de la lista blanca;
 *        · `kitsuden.api.*`    la API de Kitsuden, como la identidad que el
 *                              motor de acciones le asigne (ver
 *                              `lib/sandbox/identidad.ts`): mismos permisos,
 *                              mismo RLS, mismas cuotas y aprobaciones que esa
 *                              identidad por la red. Sin identidad, no hay API.
 *   2. PROCESO: el intérprete vive en un proceso hijo con el entorno VACÍO
 *      (los secretos de la API no existen ahí), con `node --permission` si hay
 *      Node >= 22 (solo lectura de los paquetes de QuickJS; sin escribir, sin
 *      procesos, sin hilos, sin addons) y matado por tiempo. Un bucle, un
 *      `OOM` o un fallo del intérprete no tocan la API.
 *
 * Límites: memoria del intérprete (`memoryLimitMb`), pila, tiempo (dentro de
 * QuickJS por interrupción, y fuera con `kill`), número de llamadas al host,
 * tamaño de logs, de resultado y de cada respuesta.
 *
 * Sigue APAGADO por defecto en producción (`ENABLE_CODE_ACTIONS=true` para
 * encenderlo): decisión del propietario, ver docs/agents/sandbox.md.
 */

import { spawn, spawnSync } from "node:child_process";
import { lookup } from "node:dns/promises";
import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { isIP } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { messageOf } from "@kitsuden/engine";

import { enProduccion } from "./entorno";
import { direccionNoPublica } from "./oauth/cimd";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Respuesta que la API interna devuelve al código (todo texto). */
export interface RespuestaDeSandbox {
  status: number;
  statusText?: string;
  headers: Record<string, string>;
  body: string;
  url?: string;
}

/**
 * La API de Kitsuden que se le inyecta al código. La pone el motor de
 * acciones con la identidad de quien ejecuta; aquí solo se valida la forma.
 */
export type ApiDeSandbox = (
  metodo: string,
  camino: string,
  cuerpo: unknown
) => Promise<RespuestaDeSandbox>;

export interface SandboxInput {
  /** User's JS code (as a string) */
  code: string;
  /** Data payload passed to the function as `event` */
  payload: Record<string, unknown>;
  /** Variables available as `env` (no hay `process.env`) */
  envVars: Record<string, string>;
  /** Max execution time in ms */
  timeoutMs: number;
  /** Max memory of the interpreter in MB */
  memoryLimitMb: number;
  /** Hosts a los que `fetch` puede llamar, además de KITSUDEN_SANDBOX_FETCH_ALLOW. */
  fetchAllow?: string[];
  /** API de Kitsuden con la identidad de quien ejecuta (sin ella, no hay API). */
  api?: ApiDeSandbox | null;
  /** Máximo de llamadas al host (fetch + api) por ejecución. */
  maxCalls?: number;
  /**
   * Fase I: la PRUEBA de un borrador (lib/promocion.ts). Corre aunque
   * `ENABLE_CODE_ACTIONS` esté apagado porque nada sale de aquí: `fetch` lo
   * responde esta función (nunca la red) y `api` es la simulada que pasa
   * quien llama. Ver docs/agents/promotion.md.
   */
  prueba?: { fetch: (peticion: PeticionDeFetchSimulada) => Promise<RespuestaDeSandbox> };
}

/** Lo que el código pidió a `fetch` dentro de una prueba (ya validado). */
export interface PeticionDeFetchSimulada {
  url: string;
  method: string;
  body?: string;
}

export interface SandboxResult {
  success: boolean;
  /** Return value from the user's function (if any) */
  result: unknown;
  /** Captured console.log/warn/error output */
  logs: string;
  /** Error message (if failed) */
  error: string | null;
  /** Execution duration in ms */
  durationMs: number;
  /** Memory used by the interpreter */
  memoryUsedBytes: number;
  /** How the execution ended */
  exitReason: "success" | "error" | "timeout" | "killed";
}

/** ¿Se pueden ejecutar acciones de código? (ver la cabecera) */
export function accionesDeCodigoHabilitadas(): boolean {
  const valor = process.env.ENABLE_CODE_ACTIONS;
  if (valor === "true") return true;
  if (valor === "false") return false;
  return !enProduccion();
}

// ═══════════════════════════════════════════════════════════════
// Límites
// ═══════════════════════════════════════════════════════════════

const LIMITES = {
  /** Lo más que puede pedir una acción, aunque su configuración diga más. */
  tiempoMaximoMs: 60_000,
  memoriaMaximaMb: 256,
  llamadasPorDefecto: 50,
  llamadasMaximas: 500,
  /** Salida del hijo (stdout), respuesta de fetch/api, logs, resultado. */
  salidaMaxima: 4_000_000,
  respuestaMaxima: 1_000_000,
  logsMaximos: 50_000,
  resultadoMaximo: 1_000_000,
  fetchTimeoutMs: 10_000,
} as const;

/** Caminos de la API que el código NO puede llamar (recursión y sesiones). */
const CAMINOS_VETADOS = [/^\/api\/actions(\/|$|\?)/, /^\/api\/functions(\/|$|\?)/, /^\/api\/auth(\/|$|\?)/];

// ═══════════════════════════════════════════════════════════════
// El proceso hijo
// ═══════════════════════════════════════════════════════════════

const AQUI = dirname(fileURLToPath(import.meta.url));

/**
 * Dónde está `hijo.mjs`. Desde el fuente, junto a este fichero; desde el
 * bundle de `dist/` (imagen de producción), en `src/` (que la imagen copia),
 * relativo al cwd de la API.
 */
function rutaDelHijo(): string {
  const candidatos = [
    process.env.KITSUDEN_SANDBOX_HIJO,
    join(AQUI, "sandbox", "hijo.mjs"),
    join(AQUI, "..", "src", "lib", "sandbox", "hijo.mjs"),
    join(process.cwd(), "src", "lib", "sandbox", "hijo.mjs"),
    join(process.cwd(), "apps", "api", "src", "lib", "sandbox", "hijo.mjs"),
  ].filter((c): c is string => !!c);
  const ruta = candidatos.find((c) => existsSync(c));
  if (!ruta) throw new Error("Sandbox child script (hijo.mjs) not found");
  return realpathSync(ruta);
}

/** Raíz de un paquete (la carpeta con su package.json) a partir de un fichero suyo. */
function raizDePaquete(fichero: string): string {
  let d = dirname(fichero);
  while (!existsSync(join(d, "package.json")) && dirname(d) !== d) d = dirname(d);
  return d;
}

interface Arranque {
  ejecutable: string;
  args: string[];
  /** true si el proceso corre con el modelo de permisos de Node. */
  permisos: boolean;
}

let arranqueEnCache: Arranque | null = null;

/** ¿Hay un Node >= 22 con `--permission`? Se mira una vez. */
function nodeConPermisos(): string | null {
  const elegido = process.env.KITSUDEN_SANDBOX_RUNTIME;
  if (elegido === "bun") return null;
  const binario = elegido && elegido !== "node" ? elegido : "node";
  try {
    const r = spawnSync(binario, ["--version"], { encoding: "utf8", timeout: 5000, windowsHide: true });
    const mayor = Number(/^v(\d+)/.exec(String(r.stdout).trim())?.[1] ?? 0);
    return mayor >= 22 ? binario : null;
  } catch {
    return null;
  }
}

/**
 * Cómo lanzar el hijo: el ejecutable, sus argumentos (con las URLs de los
 * módulos de QuickJS) y, con Node, la lista de lo único que puede leer.
 */
export function arranqueDelSandbox(): Arranque {
  if (arranqueEnCache) return arranqueEnCache;
  const hijo = rutaDelHijo();
  const req = createRequire(hijo);
  const desde = (r: NodeRequire, p: string) => realpathSync(r.resolve(p));
  // `require.resolve` desde la carpeta del hijo: el mismo node_modules que la API.
  const nucleo = desde(req, "quickjs-emscripten-core");
  const variante = desde(req, "@jitl/quickjs-singlefile-mjs-release-sync");
  const raizNucleo = raizDePaquete(nucleo);
  const ffi = raizDePaquete(desde(createRequire(nucleo), "@jitl/quickjs-ffi-types"));
  // El núcleo importa `@jitl/quickjs-ffi-types` por nombre: hace falta poder
  // leer el node_modules donde vive (con pnpm, el del propio paquete).
  const lecturas = [hijo, dirname(raizNucleo), raizNucleo, ffi, raizDePaquete(variante)];
  const modulos = [pathToFileURL(nucleo).href, pathToFileURL(variante).href];

  const node = nodeConPermisos();
  arranqueEnCache = node
    ? {
        ejecutable: node,
        args: [
          "--permission",
          ...[...new Set(lecturas)].map((r) => `--allow-fs-read=${r}`),
          "--max-old-space-size=128",
          hijo,
          ...modulos,
        ],
        permisos: true,
      }
    : { ejecutable: process.execPath, args: ["--smol", hijo, ...modulos], permisos: false };
  return arranqueEnCache;
}

/** Solo para pruebas: olvidar el arranque elegido. */
export function _olvidarArranque(): void {
  arranqueEnCache = null;
}

/**
 * El entorno del hijo: NADA de la API. En Windows el runtime necesita
 * `SystemRoot` para arrancar (no es un secreto: es `C:\Windows`).
 */
function entornoDelHijo(): Record<string, string> {
  const env: Record<string, string> = {};
  if (process.platform === "win32" && process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
  return env;
}

// ═══════════════════════════════════════════════════════════════
// Las llamadas del código al host
// ═══════════════════════════════════════════════════════════════

/** Hosts permitidos: los de la acción y los del servidor (`a.com`, `*.a.com`). */
export function hostsPermitidos(deLaAccion: string[] = []): string[] {
  const delServidor = (process.env.KITSUDEN_SANDBOX_FETCH_ALLOW ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...deLaAccion, ...delServidor].map((h) => h.trim().toLowerCase()).filter(Boolean))];
}

export function hostPermitido(hostname: string, lista: string[]): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  return lista.some((p) => (p.startsWith("*.") ? h.endsWith(p.slice(1)) && h.length > p.length - 1 : h === p));
}

class ErrorDeLlamada extends Error {}

async function leerAcotado(res: Response, maximo: number): Promise<string> {
  const lector = res.body?.getReader();
  if (!lector) return "";
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximo) {
      await lector.cancel().catch(() => {});
      throw new ErrorDeLlamada(`Response too large (max ${maximo} bytes)`);
    }
    trozos.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(trozos));
}

function cabecerasSeguras(h: unknown): Record<string, string> {
  const salida: Record<string, string> = {};
  if (!h || typeof h !== "object") return salida;
  for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
    if (typeof v === "string" && /^[A-Za-z0-9-]{1,64}$/.test(k) && v.length < 8192 && !/[\r\n]/.test(v)) {
      salida[k] = v;
    }
  }
  return salida;
}

/**
 * The allow-list checks a NAME, and a name can resolve to anything: an allowed
 * host pointing at 169.254.169.254 or at a service of the Docker network would
 * hand its response to the code. `KITSUDEN_SANDBOX_ALLOW_INTERNAL_FETCH=true` is
 * the opt-in for actions that really call an internal service.
 */
export async function exigirHostPublico(hostname: string): Promise<void> {
  if (process.env.KITSUDEN_SANDBOX_ALLOW_INTERNAL_FETCH === "true") return;
  const host = hostname.replace(/^\[|\]$/g, "");
  let direcciones: { address: string }[];
  try {
    direcciones = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new ErrorDeLlamada(`Host could not be resolved: ${hostname}`);
  }
  if (!direcciones.length || direcciones.some((d) => direccionNoPublica(d.address))) {
    throw new ErrorDeLlamada(`Host resolves to a non-public address: ${hostname}`);
  }
}

async function llamarFetch(args: Record<string, unknown>, lista: string[]): Promise<RespuestaDeSandbox> {
  let url: URL;
  try {
    url = new URL(String(args.url ?? ""));
  } catch {
    throw new ErrorDeLlamada("Invalid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ErrorDeLlamada(`Protocol not allowed: ${url.protocol}`);
  }
  if (url.username || url.password) throw new ErrorDeLlamada("Credentials in URL are not allowed");
  if (!hostPermitido(url.hostname, lista)) {
    throw new ErrorDeLlamada(
      `Host not allowed: ${url.hostname} (allowed: ${lista.length ? lista.join(", ") : "none"})`
    );
  }
  const metodo = String(args.method ?? "GET").toUpperCase();
  if (!/^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(metodo)) {
    throw new ErrorDeLlamada(`Method not allowed: ${metodo}`);
  }
  await exigirHostPublico(url.hostname);
  const res = await fetch(url, {
    method: metodo,
    headers: cabecerasSeguras(args.headers),
    body: typeof args.body === "string" && metodo !== "GET" && metodo !== "HEAD" ? args.body : undefined,
    // Una redirección a otro host saltaría la lista blanca: se devuelve tal cual.
    redirect: "manual",
    signal: AbortSignal.timeout(LIMITES.fetchTimeoutMs),
  });
  return {
    status: res.status,
    statusText: res.statusText,
    headers: Object.fromEntries(res.headers.entries()),
    body: await leerAcotado(res, LIMITES.respuestaMaxima),
    url: url.href,
  };
}

/** Valida un camino de la API para el código: relativo, bajo `/api/`, sin trucos. */
export function caminoDeApiValido(camino: string): string | null {
  if (typeof camino !== "string" || camino.length > 2048) return "Invalid path";
  if (!camino.startsWith("/api/")) return "Path must start with /api/";
  if (/[\s\\#]/.test(camino) || camino.includes("..") || camino.includes("//")) return "Invalid path";
  if (CAMINOS_VETADOS.some((r) => r.test(camino))) return `Path not available from the sandbox: ${camino}`;
  // The checks above read the raw text; the router sees it after `new Request`
  // normalizes it (`%2e%2e`) and Hono decodes it (`%61ctions`). Same checks on that.
  const crudo = camino.split("?")[0]!;
  let normalizado: string;
  let decodificado: string;
  try {
    normalizado = new URL(crudo, "http://sandbox.invalid").pathname;
    decodificado = decodeURIComponent(normalizado);
  } catch {
    return "Invalid path";
  }
  // `.` and `..` segments written with escapes: `new Request` would remove them.
  if (decodificado !== decodeURIComponent(crudo)) return "Invalid path";
  if (/[\s\\#]/.test(decodificado) || decodificado.includes("..") || decodificado.includes("//")) return "Invalid path";
  if (CAMINOS_VETADOS.some((r) => r.test(decodificado))) return `Path not available from the sandbox: ${camino}`;
  return null;
}

async function llamarApi(args: Record<string, unknown>, api: ApiDeSandbox | null | undefined) {
  if (!api) {
    throw new ErrorDeLlamada(
      "This code has no Kitsuden API identity (declare `scopes` on the action; see docs/agents/sandbox.md)"
    );
  }
  const metodo = String(args.method ?? "GET").toUpperCase();
  if (!/^(GET|POST|PUT|PATCH|DELETE)$/.test(metodo)) throw new ErrorDeLlamada(`Method not allowed: ${metodo}`);
  const camino = String(args.path ?? "");
  const motivo = caminoDeApiValido(camino);
  if (motivo) throw new ErrorDeLlamada(motivo);
  const r = await api(metodo, camino, args.body);
  if (r.body.length > LIMITES.respuestaMaxima) throw new ErrorDeLlamada("Response too large");
  return r;
}

// ═══════════════════════════════════════════════════════════════
// Sandbox Executor
// ═══════════════════════════════════════════════════════════════

function fallo(
  error: string,
  exitReason: SandboxResult["exitReason"],
  durationMs: number,
  logs = ""
): SandboxResult {
  return { success: false, result: null, logs, error, durationMs, memoryUsedBytes: 0, exitReason };
}

/** `fetch` en una prueba: las mismas comprobaciones de forma, y responde la simulación. */
async function llamarFetchSimulado(
  args: Record<string, unknown>,
  prueba: NonNullable<SandboxInput["prueba"]>,
  lista: string[]
): Promise<RespuestaDeSandbox> {
  let url: URL;
  try {
    url = new URL(String(args.url ?? ""));
  } catch {
    throw new ErrorDeLlamada("Invalid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ErrorDeLlamada(`Protocol not allowed: ${url.protocol}`);
  }
  // La misma lista blanca que en producción: la prueba no debe pasar algo que luego se rechaza.
  if (!hostPermitido(url.hostname, lista)) {
    throw new ErrorDeLlamada(
      `Host not allowed: ${url.hostname} (allowed: ${lista.length ? lista.join(", ") : "none"})`
    );
  }
  const metodo = String(args.method ?? "GET").toUpperCase();
  const r = await prueba.fetch({
    url: url.href,
    method: metodo,
    body: typeof args.body === "string" ? args.body : undefined,
  });
  if (r.body.length > LIMITES.respuestaMaxima) throw new ErrorDeLlamada("Response too large");
  return r;
}

/**
 * Ejecuta el código en el intérprete aislado (ver la cabecera).
 */
export async function executeSandbox(input: SandboxInput): Promise<SandboxResult> {
  // Una prueba (fase I) no habla con la red ni con la API real: corre siempre.
  if (!input.prueba && !accionesDeCodigoHabilitadas()) {
    return fallo(
      "Code actions are disabled on this server (set ENABLE_CODE_ACTIONS=true to enable them).",
      "killed",
      0
    );
  }

  const tiempoMs = Math.min(Math.max(Number(input.timeoutMs) || 5000, 50), LIMITES.tiempoMaximoMs);
  const memoriaMb = Math.min(Math.max(Number(input.memoryLimitMb) || 64, 8), LIMITES.memoriaMaximaMb);
  const maxLlamadas = Math.min(
    Math.max(Number(input.maxCalls) || LIMITES.llamadasPorDefecto, 0),
    LIMITES.llamadasMaximas
  );
  const lista = hostsPermitidos(input.fetchAllow);

  const inicio = performance.now();
  const duracion = () => Math.round(performance.now() - inicio);

  let arranque: Arranque;
  try {
    arranque = arranqueDelSandbox();
  } catch (err) {
    return fallo(`Sandbox unavailable: ${messageOf(err)}`, "killed", 0);
  }

  return await new Promise<SandboxResult>((terminar) => {
    let acabado = false;
    let leido = 0;
    let llamadas = 0;
    let stderr = "";
    let pendiente = "";

    const hijo = spawn(arranque.ejecutable, arranque.args, {
      // Una carpeta cualquiera: el hijo no escribe en disco.
      cwd: dirname(arranque.args[arranque.args.length - 3] ?? process.cwd()),
      env: entornoDelHijo(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const cerrar = (r: SandboxResult) => {
      if (acabado) return;
      acabado = true;
      clearTimeout(reloj);
      try {
        hijo.kill("SIGKILL");
      } catch {
        /* ya terminó */
      }
      terminar(r);
    };

    // Tiempo de pared: el arranque del proceso + el código + las llamadas.
    // El margen cubre el arranque de Node/Bun y la carga del WASM.
    const reloj = setTimeout(
      () => cerrar(fallo(`Function timed out after ${tiempoMs}ms`, "timeout", duracion())),
      tiempoMs + 3000
    );

    const enviar = (m: unknown) => {
      if (!acabado && hijo.stdin.writable) hijo.stdin.write(JSON.stringify(m) + "\n");
    };

    const atender = async (m: { id: number; op: string; args: Record<string, unknown> | null }) => {
      llamadas++;
      if (llamadas > maxLlamadas) {
        enviar({ t: "respuesta", id: m.id, ok: false, error: `Too many host calls (max ${maxLlamadas})` });
        return;
      }
      try {
        const args = m.args && typeof m.args === "object" ? m.args : {};
        const valor =
          m.op === "fetch"
            ? input.prueba
              ? await llamarFetchSimulado(args, input.prueba, lista)
              : await llamarFetch(args, lista)
            : m.op === "api"
              ? await llamarApi(args, input.api)
              : (() => {
                  throw new ErrorDeLlamada(`Unknown host call: ${m.op}`);
                })();
        enviar({ t: "respuesta", id: m.id, ok: true, valor });
      } catch (err) {
        enviar({ t: "respuesta", id: m.id, ok: false, error: messageOf(err) });
      }
    };

    hijo.stdout.setEncoding("utf8");
    hijo.stdout.on("data", (trozo: string) => {
      leido += trozo.length;
      if (leido > LIMITES.salidaMaxima) {
        cerrar(fallo("Sandbox output too large", "killed", duracion()));
        return;
      }
      pendiente += trozo;
      let i: number;
      while ((i = pendiente.indexOf("\n")) >= 0) {
        const linea = pendiente.slice(0, i);
        pendiente = pendiente.slice(i + 1);
        let m: Record<string, unknown>;
        try {
          m = JSON.parse(linea);
        } catch {
          continue;
        }
        if (m.t === "llamada") {
          void atender(m as never);
        } else if (m.t === "fin") {
          const error = typeof m.error === "string" && m.error ? m.error : null;
          const interrumpido = !!error && /interrupted/i.test(error);
          cerrar({
            success: !error,
            result: error ? null : (m.resultado ?? null),
            logs: typeof m.logs === "string" ? m.logs : "",
            error: interrumpido ? `Function timed out after ${tiempoMs}ms (${error})` : error,
            durationMs: duracion(),
            memoryUsedBytes: Number(m.memoria) || 0,
            exitReason: error ? (interrumpido ? "timeout" : "error") : "success",
          });
        }
      }
    });
    hijo.stderr.setEncoding("utf8");
    hijo.stderr.on("data", (t: string) => {
      if (stderr.length < 4000) stderr += t;
    });
    hijo.on("error", (err) => cerrar(fallo(`Failed to run function: ${messageOf(err)}`, "killed", duracion())));
    hijo.on("close", () =>
      cerrar(
        fallo(
          `Function process ended without a result${stderr ? `: ${stderr.slice(0, 2000)}` : ""}`,
          "killed",
          duracion()
        )
      )
    );
    hijo.stdin.on("error", () => {});

    enviar({
      t: "inicio",
      codigo: input.code,
      evento: input.payload ?? {},
      env: input.envVars ?? {},
      limites: {
        memoriaMb,
        tiempoMs,
        logsBytes: LIMITES.logsMaximos,
        resultadoBytes: LIMITES.resultadoMaximo,
      },
    });
  });
}

/** Para el informe de arranque y las pruebas: qué aislamiento de proceso hay. */
export function describirSandbox(): { runtime: string; permisos: boolean } {
  const a = arranqueDelSandbox();
  return { runtime: a.ejecutable === process.execPath ? "bun" : a.ejecutable, permisos: a.permisos };
}

/** Exportado para pruebas: los mismos límites que usa executeSandbox. */
export const _limites = LIMITES;
