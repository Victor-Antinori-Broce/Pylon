#!/usr/bin/env bun
/**
 * Evaluación: ¿un agente construye en el nicho con las herramientas MCP de Kitsuden?
 * ============================================================================
 *
 * Desde la raíz del repositorio:
 *
 *   bun apps/api/evals/agentes-mcp/ejecutar.ts --agent oraculo    # sin coste: el techo, ~100 %
 *   bun apps/api/evals/agentes-mcp/ejecutar.ts --agent nulo       # sin coste: el suelo, ~0 %
 *   bun apps/api/evals/agentes-mcp/ejecutar.ts --agent claude --reps 3   # llama a la API: cuesta
 *
 * Con bun y no con vitest: el setup de la suite unitaria cambia `global.fetch`
 * por un mock, y el SDK de Anthropic lo usa para llamar a la API.
 *
 * Por caso se puntúa `completado` (el estado final es el pedido; es la métrica
 * titular) y `limpio` (completado sin ninguna llamada fallida por el camino).
 * Además se registran llamadas, errores de herramienta, turnos, tiempo y tokens.
 *
 * Adaptado del `runner-scaffold.mjs` del skill de evaluaciones de la API de
 * Claude, del que conserva las propiedades: filas escritas según terminan y
 * reanudación por (caso, repetición); los fallos de infraestructura aparte, en
 * `errors.jsonl`, sin ocupar el hueco de un resultado; reintentos con espera
 * aleatoria y contados; techo de tiempo por caso; comprobación del modelo que
 * respondió, y la puerta de integridad del arnés.
 *
 * La puerta solo aplica a `--agent claude`, que es la ejecución que cuesta y la
 * que puede correr desatendida. Aprobar el arnés (`--approve-harness`) le toca
 * a quien lo ha revisado.
 *
 * `oraculo` y `nulo` escriben en `<flow>/_auditoria/<agente>/`, fuera de los
 * directorios de variantes, para que el informe no los mezcle con Claude.
 */

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type Anthropic from "@anthropic-ai/sdk";

import type { Ejecucion, Esfuerzo } from "./agente-claude";
import type { Calificacion, Caso } from "./casos";
import type { Entorno } from "./entorno";

// Antes de cargar nada de la API: hay módulos que leen estas variables al
// importarse. Por eso el resto se importa dentro de `main`.
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://eval:eval@localhost:5432/eval";

type Agente = "claude" | "oraculo" | "nulo";

const ESFUERZOS: readonly Esfuerzo[] = ["low", "medium", "high", "xhigh", "max"];
const SEPARADOR = String.fromCharCode(0);

interface Opciones {
  flow: string;
  variant: string;
  agent: Agente;
  model: string;
  effort: Esfuerzo;
  reps: number;
  concurrency: number;
  timeoutS: number;
  cases: string[] | null;
  approveHarness: boolean;
}

interface Estado {
  harness_paths?: unknown;
  harness_sha?: string;
  [clave: string]: unknown;
}

interface FilaDeResultado {
  prompt_id: string;
  rep: number;
  status?: string;
  grade: { completado: number; limpio: number };
  meta?: { fallos?: string[] };
}

type ErrorConDatos = Error & {
  failure_class?: string;
  usage?: unknown;
  model?: string | null;
  retries?: number;
};

function uso(): void {
  console.error(
    "uso: bun apps/api/evals/agentes-mcp/ejecutar.ts [--agent claude|oraculo|nulo] [--variant baseline|vN] [--model ID] [--effort low|medium|high|xhigh|max] [--reps N] [--concurrency N] [--timeout-s N (0 = sin techo)] [--cases id,id] [--flow DIR] [--approve-harness]"
  );
}

function parsear(argv: string[]): Opciones {
  const o: Opciones = {
    flow: ".claude/hillclimb/agentes-mcp",
    variant: "baseline",
    agent: "claude",
    model: "claude-opus-5",
    effort: "high",
    reps: 1,
    concurrency: 3,
    timeoutS: 900,
    cases: null,
    approveHarness: false,
  };
  // Un flag al final sin valor consumiría `undefined`; con --model eso
  // desactivaría en silencio la comprobación del modelo que responde.
  const valor = (i: number): string => {
    const v = argv[i];
    if (v === undefined) {
      console.error(`falta el valor de ${argv[i - 1]}`);
      uso();
      process.exit(2);
    }
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--flow") o.flow = valor(++i);
    else if (k === "--variant") o.variant = valor(++i);
    else if (k === "--agent") o.agent = valor(++i) as Agente;
    else if (k === "--model") o.model = valor(++i);
    else if (k === "--effort") o.effort = valor(++i) as Esfuerzo;
    else if (k === "--reps") o.reps = Number(valor(++i));
    else if (k === "--concurrency") o.concurrency = Number(valor(++i));
    else if (k === "--timeout-s") o.timeoutS = Number(valor(++i));
    else if (k === "--cases") {
      o.cases = valor(++i)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (k === "--approve-harness") o.approveHarness = true;
    else if (k === "-h" || k === "--help") {
      uso();
      process.exit(0);
    } else {
      console.error(`argumento desconocido: ${k}`);
      uso();
      process.exit(2);
    }
  }

  const problemas = [
    !["claude", "oraculo", "nulo"].includes(o.agent) && "--agent debe ser claude, oraculo o nulo",
    // El informe solo lee directorios `baseline` o `v<N>`: con otro nombre la
    // pasada se gasta en un sitio que nadie mira.
    !/^(baseline|v[1-9][0-9]*)$/.test(o.variant) && "--variant debe ser 'baseline' o 'v<N>'",
    !ESFUERZOS.includes(o.effort) && `--effort debe ser uno de: ${ESFUERZOS.join(", ")}`,
    !(Number.isInteger(o.reps) && o.reps >= 1) && "--reps debe ser un entero mayor que 0",
    !(Number.isInteger(o.concurrency) && o.concurrency >= 1) &&
      "--concurrency debe ser un entero mayor que 0",
    // setTimeout recorta lo que pase de 2^31-1 ms a 1 ms: el techo saltaría al instante.
    !(Number.isFinite(o.timeoutS) && o.timeoutS >= 0 && o.timeoutS * 1000 <= 2147483647) &&
      "--timeout-s fuera de rango",
  ].filter((p): p is string => typeof p === "string");
  if (problemas.length) {
    for (const p of problemas) console.error(p);
    uso();
    process.exit(2);
  }
  return o;
}

/**
 * Puerta de integridad del arnés: sha256 sobre este fichero y los de
 * `_state.json.harness_paths`. Si no coincide con el aprobado, no se ejecuta
 * hasta que alguien lo revise y pase `--approve-harness`. Es la única escritura
 * permitida sobre `_state.json`.
 */
function comprobarArnes(rutaEstado: string, estado: Estado, aprobar: boolean): void {
  const propio = fileURLToPath(import.meta.url);
  const listadas = Array.isArray(estado.harness_paths) ? estado.harness_paths.map(String) : [];
  const rutas = [...new Set([propio, ...listadas.map((p) => resolve(p))])].sort();
  const hash = createHash("sha256");
  const incluidas: string[] = [];

  for (const ruta of rutas) {
    let contenido: Buffer;
    try {
      contenido = readFileSync(ruta);
    } catch (error) {
      if (ruta === propio) throw error;
      console.error(`aviso: '${relative(process.cwd(), ruta)}' no se puede leer; se omite`);
      continue;
    }
    const nombre = relative(process.cwd(), ruta).split(sep).join("/");
    hash.update(nombre).update(SEPARADOR).update(contenido).update(SEPARADOR);
    incluidas.push(nombre);
  }

  const sha = hash.digest("hex");
  if (estado.harness_sha === sha) return;
  if (aprobar) {
    estado.harness_sha = sha;
    writeFileSync(rutaEstado, JSON.stringify(estado, null, 2) + "\n");
    console.error(`arnés aprobado: sha256 ${sha.slice(0, 12)} sobre ${incluidas.length} ficheros`);
    return;
  }
  if (estado.harness_sha == null) {
    console.error(`no hay un arnés aprobado en ${rutaEstado} (calculado ${sha.slice(0, 12)}).`);
  } else {
    console.error(
      `el arnés cambió desde la última aprobación: ${estado.harness_sha.slice(0, 12)} → ${sha.slice(0, 12)}.`
    );
  }
  console.error(`Ficheros: ${incluidas.join(", ")}`);
  console.error("Revísalo y ejecuta una vez con --approve-harness.");
  process.exit(2);
}

/**
 * Techo de tiempo sobre el caso entero. Lo que corre dentro puede seguir un
 * poco —el agente comprueba el límite antes de cada llamada al modelo—, pero
 * el hueco se libera y el intento se registra como `timeout`, no como un cero.
 */
function conTecho<T>(promesa: Promise<T>, segundos: number, etiqueta: string): Promise<T> {
  if (!(segundos > 0)) return promesa;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const techo = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(
      () =>
        rechazar(
          Object.assign(new Error(`${etiqueta}: superó el techo de ${segundos}s`), {
            failure_class: "timeout",
          })
        ),
      segundos * 1000
    );
  });
  return Promise.race([promesa, techo]).finally(() => clearTimeout(temporizador));
}

function leerJsonl<T>(ruta: string): T[] {
  if (!existsSync(ruta)) return [];
  const filas: T[] = [];
  for (const linea of readFileSync(ruta, "utf8").split("\n")) {
    if (!linea.trim()) continue;
    try {
      filas.push(JSON.parse(linea) as T);
    } catch {
      // Una línea rota por un corte a medias no invalida las demás.
    }
  }
  return filas;
}

function ejecucionLocal(prompt: string, usoVacio: () => Ejecucion["usage"]): Ejecucion {
  return {
    transcript: [{ role: "user", content: prompt }],
    model: null,
    usage: usoVacio(),
    stop_reason: "local",
    tool_calls: 0,
    tool_errors: 0,
    turnos: 0,
    reintentos: 0,
    respaldo: false,
  };
}

/**
 * El modelo que respondió tiene que ser el pedido. Se acepta la resolución
 * documentada de alias a instantánea (`foo` servido como `foo-20260101`); un
 * respaldo tras un rechazo o cualquier otro modelo invalida el intento.
 */
function comprobarModelo(ejec: Ejecucion, pedido: string): void {
  const fallo = (mensaje: string) =>
    Object.assign(new Error(mensaje), {
      failure_class: "serving_substitution",
      usage: ejec.usage,
      model: ejec.model,
      retries: ejec.reintentos,
    });
  if (ejec.respaldo) throw fallo(`respondió el modelo de respaldo (${ejec.model}) tras un rechazo`);
  if (!ejec.model || ejec.model === pedido) return;
  const base = pedido.replace(/-latest$|-0$/, "");
  const resto = ejec.model.startsWith(base) ? ejec.model.slice(base.length) : null;
  if (resto !== null && /^[-@]([0-9]{8}|[0-9]{4}-[0-9]{2}-[0-9]{2})$/.test(resto)) return;
  throw fallo(`respondió ${ejec.model}; se pidió ${pedido}`);
}

async function correr(
  caso: Caso,
  o: Opciones,
  crearEntorno: () => Promise<Entorno>,
  claude: typeof import("./agente-claude") | null,
  cliente: Anthropic | null,
  usoVacio: () => Ejecucion["usage"],
  limite: number
): Promise<{ ejec: Ejecucion; cal: Calificacion; latency_s: number }> {
  const conClase = (error: unknown, clase: string) =>
    Object.assign(error instanceof Error ? error : new Error(String(error)), {
      failure_class: clase,
    });

  const entorno = await crearEntorno();
  try {
    if (caso.preparar) {
      try {
        await caso.preparar(entorno);
      } catch (error) {
        throw conClase(error, "preparacion");
      }
    }

    const inicio = Date.now();
    let ejec: Ejecucion;
    if (claude && cliente) {
      ejec = await claude.ejecutarConClaude(caso.prompt, entorno, {
        cliente,
        modelo: o.model,
        esfuerzo: o.effort,
        limite,
      });
      comprobarModelo(ejec, o.model);
    } else {
      if (o.agent === "oraculo") {
        try {
          await caso.oraculo(entorno);
        } catch (error) {
          throw conClase(error, "oraculo");
        }
      }
      ejec = ejecucionLocal(caso.prompt, usoVacio);
    }
    const latency_s = (Date.now() - inicio) / 1000;

    let cal: Calificacion;
    try {
      cal = await caso.calificar(entorno);
    } catch (error) {
      throw Object.assign(conClase(error, "calificador"), {
        usage: ejec.usage,
        model: ejec.model,
      });
    }
    return { ejec, cal, latency_s };
  } finally {
    await entorno.cerrar();
  }
}

function resumir(ruta: string, ids: Set<string>, etiqueta: string): void {
  const filas = leerJsonl<FilaDeResultado>(ruta).filter((f) => ids.has(f.prompt_id));
  const puntuadas = filas.filter((f) => f.status !== "truncated");
  const n = puntuadas.length;
  if (!n) {
    console.error(`[${etiqueta}] sin filas puntuadas`);
    return;
  }
  const completados = puntuadas.filter((f) => f.grade.completado === 1).length;
  const limpios = puntuadas.filter((f) => f.grade.limpio === 1).length;
  const p = completados / n;
  // IC 95 % aproximado (Wald): con pocas filas es orientativo, y así se dice.
  const margen = 1.96 * Math.sqrt((p * (1 - p)) / n);
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  console.error(
    `[${etiqueta}] completado: ${completados}/${n} (${pct(p)} ± ${pct(margen)}, IC 95 % aprox.) · sin errores: ${limpios}/${n}` +
      (filas.length > n ? ` · ${filas.length - n} truncadas sin puntuar` : "")
  );
  for (const f of puntuadas.filter((x) => x.grade.completado !== 1)) {
    console.error(`  ✗ ${f.prompt_id} rep${f.rep}: ${(f.meta?.fallos ?? []).join(" · ")}`);
  }
}

async function main(): Promise<void> {
  const o = parsear(process.argv.slice(2));
  const etiqueta = o.agent === "claude" ? o.variant : o.agent;
  const salida =
    o.agent === "claude" ? join(o.flow, o.variant) : join(o.flow, "_auditoria", o.agent);
  mkdirSync(join(salida, "traces"), { recursive: true });

  // _state.json es de SOLO LECTURA aquí, salvo la aprobación del arnés.
  const rutaEstado = join(o.flow, "_state.json");
  let estado: Estado = {};
  if (existsSync(rutaEstado)) {
    try {
      estado = (JSON.parse(readFileSync(rutaEstado, "utf8")) as Estado) ?? {};
    } catch (error) {
      console.error(`${rutaEstado} no es JSON válido (${(error as Error).message})`);
      process.exit(2);
    }
  }
  if (o.agent === "claude") comprobarArnes(rutaEstado, estado, o.approveHarness);

  const { CASOS } = await import("./casos");
  const { crearEntorno } = await import("./entorno");
  const agente = await import("./agente-claude");
  const claude = o.agent === "claude" ? agente : null;
  const cliente = claude
    ? new (await import("@anthropic-ai/sdk")).default({ maxRetries: 0 })
    : null;

  for (const c of CASOS) {
    if (!/^[a-z0-9-]+$/.test(c.id)) {
      console.error(`id de caso no apto para nombre de fichero: ${c.id}`);
      process.exit(2);
    }
  }
  if (new Set(CASOS.map((c) => c.id)).size !== CASOS.length) {
    console.error("hay ids de caso repetidos");
    process.exit(2);
  }
  const desconocidos = (o.cases ?? []).filter((id) => !CASOS.some((c) => c.id === id));
  if (desconocidos.length) {
    console.error(`casos desconocidos: ${desconocidos.join(", ")}`);
    process.exit(2);
  }
  const casos = o.cases ? CASOS.filter((c) => o.cases!.includes(c.id)) : CASOS;

  const rutaResultados = join(salida, "results.jsonl");
  const rutaErrores = join(salida, "errors.jsonl");
  const hechos = new Set(
    leerJsonl<FilaDeResultado>(rutaResultados).map((f) => `${f.prompt_id}#${f.rep}`)
  );
  // Un corte a medias puede dejar la última línea sin salto: la siguiente fila
  // se pegaría a ella y las dos quedarían ilegibles.
  for (const ruta of [rutaResultados, rutaErrores]) {
    if (!existsSync(ruta)) continue;
    const buf = readFileSync(ruta);
    if (buf.length && buf[buf.length - 1] !== 0x0a) appendFileSync(ruta, "\n");
  }

  const tareas = casos
    .flatMap((caso) => Array.from({ length: o.reps }, (_, rep) => ({ caso, rep })))
    .filter(({ caso, rep }) => !hechos.has(`${caso.id}#${rep}`));
  console.error(
    `[${etiqueta}] ${tareas.length} de ${casos.length * o.reps} (caso, rep) por ejecutar`
  );

  let siguiente = 0;
  let errores = 0;
  const trabajador = async () => {
    while (siguiente < tareas.length) {
      const { caso, rep } = tareas[siguiente++];
      const t0 = Date.now();
      const limite = o.timeoutS > 0 ? t0 + o.timeoutS * 1000 : Number.POSITIVE_INFINITY;
      let escrita = false;
      try {
        const { ejec, cal, latency_s } = await conTecho(
          correr(caso, o, crearEntorno, claude, cliente, agente.usoVacio, limite),
          o.timeoutS,
          `${caso.id} rep${rep}`
        );
        const fila = {
          prompt_id: caso.id,
          rep,
          prompt: caso.prompt,
          tags: caso.tags,
          meta: {
            agente: o.agent,
            ...(claude ? { esfuerzo: o.effort } : {}),
            ...(ejec.reintentos ? { retries: ejec.reintentos } : {}),
            ...(ejec.stop_reason === "max_turns" ? { limite_de_turnos: true } : {}),
            ...(cal.fallos.length ? { fallos: cal.fallos } : {}),
          },
          model: ejec.model,
          usage: ejec.usage,
          stop_reason: ejec.stop_reason,
          status: ejec.stop_reason === "max_tokens" ? "truncated" : "ok",
          latency_s,
          tool_calls: ejec.tool_calls,
          tool_errors: ejec.tool_errors,
          turnos: ejec.turnos,
          grade: {
            completado: cal.completado ? 1 : 0,
            limpio: cal.completado && ejec.tool_errors === 0 ? 1 : 0,
          },
          explanation: {
            completado: cal.completado ? "El estado final es el pedido." : cal.fallos.join(" · "),
          },
        };
        appendFileSync(rutaResultados, JSON.stringify(fila) + "\n");
        escrita = true;
        writeFileSync(
          join(salida, "traces", `${caso.id}_rep${rep}.json`),
          JSON.stringify(ejec.transcript, null, 2)
        );
        console.error(
          `  ${cal.completado ? "✓" : "✗"} ${caso.id} rep${rep}` +
            (cal.completado ? "" : `: ${cal.fallos.join(" · ")}`)
        );
      } catch (error) {
        const e = error as ErrorConDatos;
        if (escrita) {
          // El intento ya está puntuado: otra fila en errores contaría dos veces su gasto.
          console.error(
            `  ${caso.id} rep${rep} puntuado, pero no se pudo escribir la traza: ${e.message}`
          );
          continue;
        }
        errores++;
        appendFileSync(
          rutaErrores,
          JSON.stringify({
            prompt_id: caso.id,
            rep,
            failure_class: e.failure_class ?? "error",
            error: String(e?.message ?? e),
            retries: e.retries ?? 0,
            model: e.model ?? null,
            usage: e.usage ?? null,
            latency_s: (Date.now() - t0) / 1000,
          }) + "\n"
        );
        console.error(`  ! ${caso.id} rep${rep} [${e.failure_class ?? "error"}]: ${e.message}`);
      }
    }
  };

  await Promise.all(Array.from({ length: o.concurrency }, trabajador));
  resumir(rutaResultados, new Set(casos.map((c) => c.id)), etiqueta);
  if (errores) console.error(`[${etiqueta}] ${errores} intentos sin puntuar → ${rutaErrores}`);
  process.exit(errores ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
