#!/usr/bin/env node
/**
 * Kitsuden load benchmark
 * ============================================================================
 *
 * Runs a fixed set of HTTP scenarios against a RUNNING Kitsuden API with
 * autocannon and prints p50/p95/p99 latency, requests per second, errors,
 * Postgres pool usage and API CPU for each one. Results go to a JSON file so
 * two versions can be compared with `compare.mjs`.
 *
 * Never point it at production: it writes (the idempotent-write scenarios
 * create rows) and it is a load test. See README.md.
 *
 *   node scripts/bench/bench.mjs setup                  install the pinned autocannon
 *   node scripts/bench/bench.mjs list                   list scenarios
 *   node scripts/bench/bench.mjs run [options]          run them
 *
 * Options for `run`:
 *   --only=a,b         only these scenarios (names or prefixes)
 *   --connections=50   concurrent connections (default 50)
 *   --sweep=50,100,200 run the sweep scenarios at these connection counts
 *   --duration=10      seconds measured per scenario (default 10)
 *   --warmup=3         seconds of warm-up per scenario, not measured (default 3)
 *   --out=file.json    where to write the results (default bench-<date>.json)
 *   --label=text       a label stored in the results (e.g. "before", "after")
 *
 * Environment (secrets come from the environment, never from files in the repo):
 *   BENCH_API                 API base URL (default http://127.0.0.1:3001)
 *   BENCH_SITE_KEY            the API's SITIO_API_CLAVE. With it, anonymous and
 *                             cookie requests are spread over BENCH_VISITORS
 *                             signed site visitors, as the sites' SSR does, so
 *                             the per-route limiter (300/min per client) runs on
 *                             every request without cutting the load
 *   BENCH_VISITORS            how many visitors (default 5000)
 *   BENCH_COOKIE              session cookie of a user (authenticated scenarios)
 *   BENCH_AGENT_KEY           kitsuden_agent_* key (agent and MCP scenarios). Its
 *                             agent needs a high rate_limit or it gets 429s
 *   BENCH_DATASET_ID          dataset whose entries are read
 *   BENCH_WRITE_DATASET_ID    dataset the write scenarios insert into
 *   BENCH_METRICS_TOKEN       the API's METRICS_TOKEN: samples pool and CPU
 *                             from /metrics once a second during each run
 */

import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const VERSION_AUTOCANNON = "8.0.0";
const HERRAMIENTAS = process.env.BENCH_TOOLS_DIR ?? join(AQUI, ".tools");

const env = process.env;
const API = (env.BENCH_API ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const SITIO = env.BENCH_SITE_KEY ?? "";
const VISITANTES = Number(env.BENCH_VISITORS ?? 5000);
const COOKIE = env.BENCH_COOKIE ?? "";
const AGENTE = env.BENCH_AGENT_KEY ?? "";
const DATASET = env.BENCH_DATASET_ID ?? "";
const DATASET_ESCRITURA = env.BENCH_WRITE_DATASET_ID ?? "";
const TOKEN_METRICAS = env.BENCH_METRICS_TOKEN ?? "";

// ── Argumentos ──────────────────────────────────────────────────────────────

const [orden = "run", ...resto] = process.argv.slice(2);
const opciones = Object.fromEntries(
  resto.filter((a) => a.startsWith("--")).map((a) => {
    const [k, ...v] = a.slice(2).split("=");
    return [k, v.length ? v.join("=") : "true"];
  })
);

// ── Escenarios ──────────────────────────────────────────────────────────────

let siguienteVisitante = 0;
/** Cabeceras de un visitante firmado del sitio (si hay clave): un cubo por visitante. */
function visitante() {
  if (!SITIO) return {};
  siguienteVisitante = (siguienteVisitante + 1) % VISITANTES;
  return { "x-kitsuden-sitio": SITIO, "x-kitsuden-cliente": `bench-${siguienteVisitante}` };
}

/** Un agente también pasa por el limitador por ruta (300/min por cliente): con la clave del sitio, por visitante. */
const deAgente = () => ({ ...visitante(), authorization: `Bearer ${AGENTE}` });
const run = Date.now().toString(36);
let contador = 0;

/**
 * Cada escenario: `necesita` (qué variables), `peticion()` (método, camino,
 * cabeceras, cuerpo; se llama en CADA petición), `sweep` (si entra en el
 * barrido de conexiones) y `preparar` opcional (antes de medir).
 */
const ESCENARIOS = [
  { nombre: "anon-games", grupo: "anonymous", peticion: () => ({ path: "/api/games?limit=20", headers: visitante() }) },
  { nombre: "anon-blog", grupo: "anonymous", sweep: true, peticion: () => ({ path: "/api/blog?limit=20", headers: visitante() }) },
  { nombre: "anon-datasets", grupo: "anonymous", peticion: () => ({ path: "/api/data-sets", headers: visitante() }) },
  {
    nombre: "anon-entries",
    grupo: "anonymous",
    necesita: ["BENCH_DATASET_ID"],
    sweep: true,
    peticion: () => ({ path: `/api/data-sets/${DATASET}/entries?limit=50`, headers: visitante() }),
  },
  { nombre: "anon-page-builder", grupo: "anonymous", peticion: () => ({ path: "/api/page-builder/block-types", headers: visitante() }) },
  {
    nombre: "anon-games-format-auto",
    grupo: "format=auto",
    peticion: () => ({ path: "/api/games?limit=20&format=auto", headers: { ...visitante(), accept: "application/vnd.kitsuden.auto" } }),
  },
  {
    nombre: "auth-entries",
    grupo: "authenticated",
    necesita: ["BENCH_COOKIE", "BENCH_DATASET_ID"],
    peticion: () => ({ path: `/api/data-sets/${DATASET}/entries?limit=50`, headers: { ...visitante(), cookie: COOKIE } }),
  },
  {
    nombre: "auth-blog",
    grupo: "authenticated",
    necesita: ["BENCH_COOKIE"],
    peticion: () => ({ path: "/api/blog?limit=20", headers: { ...visitante(), cookie: COOKIE } }),
  },
  {
    nombre: "agent-entries",
    grupo: "agent REST",
    necesita: ["BENCH_AGENT_KEY", "BENCH_DATASET_ID"],
    sweep: true,
    peticion: () => ({ path: `/api/data-sets/${DATASET}/entries?limit=20`, headers: deAgente() }),
  },
  {
    nombre: "agent-settings",
    grupo: "agent REST",
    necesita: ["BENCH_AGENT_KEY"],
    peticion: () => ({ path: "/api/settings", headers: deAgente() }),
  },
  {
    nombre: "agent-entries-format-auto",
    grupo: "format=auto",
    necesita: ["BENCH_AGENT_KEY", "BENCH_DATASET_ID"],
    peticion: () => ({
      path: `/api/data-sets/${DATASET}/entries?limit=50`,
      headers: { ...deAgente(), accept: "application/vnd.kitsuden.auto" },
    }),
  },
  {
    nombre: "agent-write-idempotent",
    grupo: "idempotent writes",
    necesita: ["BENCH_AGENT_KEY", "BENCH_WRITE_DATASET_ID"],
    peticion: () => {
      const n = ++contador;
      return {
        method: "POST",
        path: `/api/datasets/${DATASET_ESCRITURA}/entries`,
        headers: { ...deAgente(), "content-type": "application/json", "idempotency-key": `bench-${run}-${n}` },
        body: JSON.stringify({ title: `bench ${run} ${n}`, data: { n, nota: "bench" } }),
      };
    },
  },
  {
    nombre: "agent-write-replay",
    grupo: "idempotent writes",
    necesita: ["BENCH_AGENT_KEY", "BENCH_WRITE_DATASET_ID"],
    preparar: async (e) => {
      e.fija = {
        method: "POST",
        path: `/api/datasets/${DATASET_ESCRITURA}/entries`,
        headers: { ...deAgente(), "content-type": "application/json", "idempotency-key": `bench-replay-${run}` },
        body: JSON.stringify({ title: `bench replay ${run}`, data: { n: 0, nota: "replay" } }),
      };
      const r = await fetch(API + e.fija.path, { method: "POST", headers: e.fija.headers, body: e.fija.body });
      if (r.status >= 300) throw new Error(`the first write answered ${r.status}`);
    },
    // Misma clave y cuerpo; el visitante cambia (solo cuenta para el limitador por ruta)
    peticion: (e) => ({ ...e.fija, headers: { ...e.fija.headers, ...visitante() } }),
  },
  ...["tools/list", "hardcoded", "sdk"].map((tipo) => ({
    nombre: tipo === "tools/list" ? "mcp-tools-list" : `mcp-call-${tipo}`,
    grupo: "MCP",
    necesita: tipo === "tools/list" ? ["BENCH_AGENT_KEY"] : ["BENCH_AGENT_KEY", "BENCH_DATASET_ID"],
    sweep: tipo === "sdk",
    preparar: abrirSesionMcp,
    cerrar: (e) => e.sesion?.cerrar(),
    peticion: (e) => ({
      method: "POST",
      path: e.sesion.camino,
      headers: { ...deAgente(), "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++contador,
        method: tipo === "tools/list" ? "tools/list" : "tools/call",
        params:
          tipo === "tools/list"
            ? {}
            : tipo === "hardcoded"
              ? { name: "kitsuden_query_dataset", arguments: { datasetId: DATASET, limit: 20 } }
              : { name: "datasets__listar-entradas", arguments: { id: DATASET, limit: 20 } },
      }),
    }),
  })),
];

/** Abre una sesión MCP (SSE) y deja su camino de mensajes en `e.sesion`. */
async function abrirSesionMcp(e) {
  const control = new AbortController();
  const r = await fetch(`${API}/api/mcp`, { headers: deAgente(), signal: control.signal });
  if (!r.ok) throw new Error(`GET /api/mcp answered ${r.status}`);
  const lector = r.body.getReader();
  let texto = "";
  while (!/data: (\S+)/.test(texto)) {
    const { value, done } = await lector.read();
    if (done) throw new Error("the MCP stream closed before the endpoint event");
    texto += new TextDecoder().decode(value);
  }
  const camino = /data: (\S+)/.exec(texto)[1];
  const init = await fetch(API + camino, {
    method: "POST",
    headers: { ...deAgente(), "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "kitsuden-bench", version: "1" } } }),
  });
  if (!init.ok) throw new Error(`initialize answered ${init.status}`);
  e.sesion = { camino, cerrar: () => control.abort() };
}

// ── Herramientas ────────────────────────────────────────────────────────────

function cargarAutocannon() {
  const require = createRequire(join(HERRAMIENTAS, "package.json"));
  try {
    return require("autocannon");
  } catch {
    console.error(`autocannon not found in ${HERRAMIENTAS}. Run: node scripts/bench/bench.mjs setup`);
    process.exit(2);
  }
}

function instalar() {
  mkdirSync(HERRAMIENTAS, { recursive: true });
  if (!existsSync(join(HERRAMIENTAS, "package.json"))) {
    writeFileSync(join(HERRAMIENTAS, "package.json"), JSON.stringify({ name: "kitsuden-bench-tools", private: true }, null, 2));
  }
  execFileSync("npm", ["install", `autocannon@${VERSION_AUTOCANNON}`, "--no-fund", "--no-audit", "--save-exact"], {
    cwd: HERRAMIENTAS,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

// ── Métricas del servidor ───────────────────────────────────────────────────

async function leerMetricas() {
  if (!TOKEN_METRICAS) return null;
  try {
    const r = await fetch(`${API}/metrics`, { headers: { authorization: `Bearer ${TOKEN_METRICAS}` }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const t = await r.text();
    const valor = (re) => {
      const m = re.exec(t);
      return m ? Number(m[1]) : null;
    };
    return {
      en: performance.now(),
      cpu: valor(/^process_cpu_seconds_total ([\d.]+)/m),
      total: valor(/^kitsuden_db_pool_connections\{state="total"\} (\d+)/m),
      idle: valor(/^kitsuden_db_pool_connections\{state="idle"\} (\d+)/m),
      max: valor(/^kitsuden_db_pool_connections\{state="max"\} (\d+)/m),
      waiting: valor(/^kitsuden_db_pool_waiting (\d+)/m),
    };
  } catch {
    return null;
  }
}

function muestreador() {
  const muestras = [];
  let parar = false;
  const bucle = (async () => {
    while (!parar) {
      const m = await leerMetricas();
      if (m) muestras.push(m);
      await new Promise((r) => setTimeout(r, 1000));
    }
  })();
  return async () => {
    parar = true;
    await bucle;
    const fin = await leerMetricas();
    if (fin) muestras.push(fin);
    if (muestras.length < 2 || muestras[0].cpu === null) return null;
    const a = muestras[0];
    const b = muestras[muestras.length - 1];
    const enUso = muestras.map((m) => (m.total ?? 0) - (m.idle ?? 0));
    return {
      cpuPercent: Math.round(((b.cpu - a.cpu) / ((b.en - a.en) / 1000)) * 1000) / 10,
      poolMax: a.max,
      poolInUseMax: Math.max(...enUso),
      poolInUseAvg: Math.round((enUso.reduce((s, x) => s + x, 0) / enUso.length) * 10) / 10,
      poolWaitingMax: Math.max(...muestras.map((m) => m.waiting ?? 0)),
      samples: muestras.length,
    };
  };
}

// ── Medir ───────────────────────────────────────────────────────────────────

function percentil(ordenados, p) {
  if (ordenados.length === 0) return null;
  const i = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
  return Math.round(ordenados[Math.max(0, i)] * 10) / 10;
}

function cargar(autocannon, e, conexiones, segundos, medir) {
  return new Promise((resolve, reject) => {
    const latencias = [];
    const estados = {};
    const instancia = autocannon(
      {
        url: API,
        connections: conexiones,
        duration: segundos,
        timeout: 30,
        requests: [
          {
            setupRequest: (req) => {
              const p = e.peticion(e);
              return { ...req, method: p.method ?? "GET", path: p.path, headers: p.headers ?? {}, body: p.body };
            },
          },
        ],
      },
      (err, res) => (err ? reject(err) : resolve({ res, latencias, estados }))
    );
    if (medir) {
      instancia.on("response", (_cliente, status, _bytes, ms) => {
        latencias.push(ms);
        estados[status] = (estados[status] ?? 0) + 1;
      });
    }
  });
}

async function escenario(autocannon, e, conexiones, segundos, calentamiento) {
  for (const v of e.necesita ?? []) {
    if (!env[v]) return { nombre: e.nombre, omitido: `missing ${v}` };
  }
  try {
    if (e.preparar) await e.preparar(e);
    if (calentamiento > 0) await cargar(autocannon, e, conexiones, calentamiento, false);
    const pararMuestras = muestreador();
    const { res, latencias, estados } = await cargar(autocannon, e, conexiones, segundos, true);
    const servidor = await pararMuestras();
    latencias.sort((a, b) => a - b);
    const total = latencias.length;
    const malas = Object.entries(estados)
      .filter(([s]) => Number(s) >= 400)
      .reduce((s, [, n]) => s + n, 0);
    return {
      nombre: e.nombre,
      grupo: e.grupo,
      conexiones,
      segundos,
      peticiones: total,
      rps: Math.round((total / res.duration) * 10) / 10,
      p50: percentil(latencias, 50),
      p95: percentil(latencias, 95),
      p99: percentil(latencias, 99),
      max: total ? Math.round(latencias[total - 1] * 10) / 10 : null,
      estados,
      errores: malas + res.errors + res.timeouts,
      erroresDeRed: res.errors,
      timeouts: res.timeouts,
      bytesPorSegundo: Math.round(res.throughput.average),
      servidor,
    };
  } catch (err) {
    return { nombre: e.nombre, fallo: err.message };
  } finally {
    e.cerrar?.(e);
  }
}

function tabla(resultados) {
  const filas = [
    ["scenario", "conn", "req/s", "p50 ms", "p95 ms", "p99 ms", "errors", "CPU %", "pool in use (max/avg)", "pool waiting max"],
  ];
  for (const r of resultados) {
    if (r.omitido || r.fallo) {
      filas.push([r.nombre, "", r.omitido ?? `FAILED: ${r.fallo}`, "", "", "", "", "", "", ""]);
      continue;
    }
    const s = r.servidor;
    filas.push([
      r.nombre,
      String(r.conexiones),
      String(r.rps),
      String(r.p50),
      String(r.p95),
      String(r.p99),
      r.errores ? `${r.errores} ${JSON.stringify(Object.fromEntries(Object.entries(r.estados).filter(([k]) => Number(k) >= 400)))}` : "0",
      s ? String(s.cpuPercent) : "-",
      s ? `${s.poolInUseMax}/${s.poolInUseAvg} of ${s.poolMax}` : "-",
      s ? String(s.poolWaitingMax) : "-",
    ]);
  }
  const anchos = filas[0].map((_, i) => Math.max(...filas.map((f) => f[i].length)));
  return filas.map((f) => f.map((c, i) => c.padEnd(anchos[i])).join("  ")).join("\n");
}

async function principal() {
  if (orden === "setup") return instalar();
  if (orden === "list") {
    for (const e of ESCENARIOS) console.log(`${e.nombre.padEnd(28)} ${e.grupo}${e.sweep ? " (sweep)" : ""}`);
    return;
  }
  if (orden !== "run") {
    console.error("usage: bench.mjs setup | list | run [--only=…] [--connections=50] [--sweep=50,100,200] [--duration=10] [--warmup=3] [--out=…]");
    process.exit(2);
  }
  const autocannon = cargarAutocannon();
  const conexiones = Number(opciones.connections ?? 50);
  const segundos = Number(opciones.duration ?? 10);
  const calentamiento = Number(opciones.warmup ?? 3);
  const barrido = opciones.sweep ? opciones.sweep.split(",").map(Number).filter((n) => n > 0) : [];
  const solo = opciones.only ? opciones.only.split(",") : null;
  const elegidos = ESCENARIOS.filter((e) => !solo || solo.some((s) => e.nombre === s || e.nombre.startsWith(s)));

  const salud = await fetch(`${API}/health`).catch(() => null);
  if (!salud?.ok) {
    console.error(`${API}/health is not answering 200`);
    process.exit(1);
  }

  const resultados = [];
  for (const e of elegidos) {
    const r = await escenario(autocannon, e, conexiones, segundos, calentamiento);
    resultados.push(r);
    console.error(`  ${e.nombre} @${conexiones}: ${r.omitido ?? r.fallo ?? `${r.rps} req/s, p50 ${r.p50} ms, p99 ${r.p99} ms, ${r.errores} errors`}`);
  }
  for (const n of barrido) {
    if (n === conexiones) continue;
    for (const e of elegidos.filter((x) => x.sweep)) {
      const r = await escenario(autocannon, e, n, segundos, calentamiento);
      resultados.push(r);
      console.error(`  ${e.nombre} @${n}: ${r.omitido ?? r.fallo ?? `${r.rps} req/s, p50 ${r.p50} ms, p99 ${r.p99} ms, ${r.errores} errors`}`);
    }
  }

  const salida = opciones.out ?? `bench-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const informe = {
    label: opciones.label ?? null,
    api: API,
    when: new Date().toISOString(),
    id: randomUUID(),
    node: process.version,
    autocannon: VERSION_AUTOCANNON,
    options: { conexiones, segundos, calentamiento, barrido, visitantes: SITIO ? VISITANTES : 0 },
    resultados,
  };
  writeFileSync(salida, JSON.stringify(informe, null, 2));
  console.log(tabla(resultados));
  console.log(`\nresults: ${salida}`);
}

await principal();
