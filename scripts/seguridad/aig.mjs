#!/usr/bin/env node
/**
 * Red-teaming del MCP de Kitsuden con AI-Infra-Guard (Tencent Zhuque Lab)
 * ============================================================================
 *
 * Herramienta: https://github.com/Tencent/AI-Infra-Guard (Apache-2.0). Créditos
 * y coste: docs/agents/red-teaming.md. Solo se usan sus CLIs de PyPI con
 * versión FIJADA; su interfaz web NUNCA se despliega (no tiene autenticación).
 *
 *   node scripts/seguridad/aig.mjs                      código del MCP + skill
 *   node scripts/seguridad/aig.mjs --objetivo=kons      + ../kitsuden-kons/kons
 *   node scripts/seguridad/aig.mjs --objetivo=servidor  escaneo DINÁMICO de un
 *        MCP en marcha de PRUEBAS (KITSUDEN_AIG_URL + KITSUDEN_AIG_TOKEN)
 *   node scripts/seguridad/aig.mjs --solo-preescaneo    solo el pre-escaneo por
 *        expresiones regulares de AIG: sin LLM, sin clave, nada sale de la máquina
 *
 * Objetivos (`--objetivo=a,b`): codigo, skill, kons, servidor, todo.
 * Salida: SARIF 2.1.0 en `.aig/` (gitignored) y un resumen por pantalla.
 *
 * Variables:
 *   LLM_API_KEY      obligatoria salvo con --solo-preescaneo
 *   AIG_BASE_URL     endpoint OpenAI-compatible (por defecto el de AIG: OpenRouter)
 *   AIG_MODEL        modelo para TODAS las fases (por defecto el de AIG,
 *                    deepseek/deepseek-v3.2-exp). AIG usa por su cuenta otros
 *                    dos modelos más caros para «thinking» y «coding»
 *                    (gemini-2.5-pro, claude-sonnet-4.5) y su `-u` NO los
 *                    redirige: este script fija los cuatro al mismo endpoint y
 *                    modelo para que el coste y el destino del código sean uno.
 *   KITSUDEN_KONS_DIR  dónde están los kons (por defecto ../kitsuden-kons/kons)
 *   KITSUDEN_AIG_URL   MCP de PRUEBAS para `servidor` (p. ej. http://127.0.0.1:3941/api/mcp)
 *   KITSUDEN_AIG_TOKEN clave `kitsuden_agent_*` de ESE stack de pruebas
 *
 * Lo que sale de la máquina: con clave, el código de los objetivos (o las
 * respuestas del servidor de pruebas) va al endpoint del LLM. No lo corras
 * sobre código que no puede salir, ni contra producción: el objetivo
 * `servidor` se niega a cualquier host que no sea local y al puerto 3000 (el
 * de la API de producción del propietario).
 */

import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Versiones fijadas (ver docs/agents/red-teaming.md antes de subirlas)
export const AIG_MCP_SCAN = "aig-mcp-scan==0.2.0";
export const AIG_SKILL_SCAN = "aig-skill-scan==0.2.2";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SALIDA = join(RAIZ, ".aig");

/** Los ficheros del servidor MCP (lo que se audita como «código»). */
export const CODIGO_DEL_MCP = [
  "apps/api/src/routes/mcp.ts",
  "apps/api/src/services/mcp-tools.ts",
  "apps/api/src/lib/operaciones-mcp.ts",
  "apps/api/src/lib/operaciones-openapi.ts",
  "apps/api/src/lib/aprobaciones-mcp.ts",
  "apps/api/src/lib/problemas-mcp.ts",
  "apps/api/src/lib/procedencia.ts",
  "apps/api/src/lib/ajustes-mcp.ts",
  "apps/api/src/lib/formatos.ts",
  "packages/mcp-server/src",
  "packages/mcp-server/package.json",
  "packages/mcp-server/README.md",
];

function argumentos(argv) {
  const a = { objetivos: ["codigo", "skill"], soloPreescaneo: false };
  for (const x of argv) {
    if (x === "--solo-preescaneo" || x === "--prescan-only") a.soloPreescaneo = true;
    else if (x.startsWith("--objetivo=")) a.objetivos = x.slice(11).split(",").filter(Boolean);
    else if (x === "-h" || x === "--help") a.ayuda = true;
    else throw new Error(`Argumento desconocido: ${x}`);
  }
  if (a.objetivos.includes("todo")) a.objetivos = ["codigo", "skill", "kons", "servidor"];
  for (const o of a.objetivos) {
    if (!["codigo", "skill", "kons", "servidor"].includes(o)) throw new Error(`Objetivo desconocido: ${o}`);
  }
  return a;
}

/** Solo un MCP local y que no sea el puerto de la API de producción. */
export function urlDePruebasValida(texto) {
  let u;
  try {
    u = new URL(texto);
  } catch {
    return "no es una URL";
  }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)) return "solo un stack LOCAL de pruebas";
  const puerto = u.port || (u.protocol === "https:" ? "443" : "80");
  if (puerto === "3000") return "el puerto 3000 es la API de producción del propietario";
  return null;
}

function correr(cmd, args, env) {
  return new Promise((resolver) => {
    const hijo = spawn(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
    hijo.on("close", (codigo) => resolver(codigo ?? 1));
    hijo.on("error", () => resolver(127));
  });
}

/** Entorno para AIG: un endpoint y un modelo para todas sus fases. */
function entornoDeAig() {
  const env = { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" };
  const base = process.env.AIG_BASE_URL;
  const modelo = process.env.AIG_MODEL;
  for (const fase of ["DEFAULT", "THINKING", "CODING", "FAST"]) {
    if (base) env[`${fase}_BASE_URL`] = base;
    if (modelo) env[`${fase}_MODEL`] = modelo;
  }
  // Sin AIG_MODEL, las fases especializadas usan el modelo principal de AIG
  if (!modelo) for (const fase of ["THINKING", "CODING", "FAST"]) env[`${fase}_MODEL`] = "deepseek/deepseek-v3.2-exp";
  return env;
}

function copiaDelCodigo() {
  const dir = mkdtempSync(join(tmpdir(), "kitsuden-aig-"));
  for (const rel of CODIGO_DEL_MCP) {
    const desde = join(RAIZ, rel);
    if (existsSync(desde)) cpSync(desde, join(dir, rel), { recursive: true });
  }
  return dir;
}

function resumirSarif(fichero) {
  if (!existsSync(fichero)) return `  (sin ${fichero})`;
  try {
    const sarif = JSON.parse(readFileSync(fichero, "utf8"));
    const resultados = (sarif.runs ?? []).flatMap((r) => r.results ?? []);
    const porNivel = {};
    for (const r of resultados) porNivel[r.level ?? "none"] = (porNivel[r.level ?? "none"] ?? 0) + 1;
    return `  ${resultados.length} hallazgos ${JSON.stringify(porNivel)} → ${fichero}`;
  } catch (e) {
    return `  SARIF ilegible (${e.message}) → ${fichero}`;
  }
}

/** Pre-escaneo sin LLM: el módulo de expresiones regulares de AIG. */
const PREESCANEO = `
import sys, importlib
sys.stdout.reconfigure(encoding="utf-8")
pre = importlib.import_module(sys.argv[1])
for ruta in sys.argv[2:]:
    print("=" * 70)
    print("TARGET", ruta)
    print(pre.pre_scan(ruta) or "(no hits)")
`;

async function main() {
  const a = argumentos(process.argv.slice(2));
  if (a.ayuda) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
    return 0;
  }
  if (!a.soloPreescaneo && !process.env.LLM_API_KEY) {
    console.error("Falta LLM_API_KEY. Sin clave solo vale --solo-preescaneo (ver docs/agents/red-teaming.md).");
    return 2;
  }
  mkdirSync(SALIDA, { recursive: true });
  const env = entornoDeAig();
  const kons = process.env.KITSUDEN_KONS_DIR || resolve(RAIZ, "..", "kitsuden-kons", "kons");
  const codigo = a.objetivos.includes("codigo") ? copiaDelCodigo() : null;
  const resumen = [];
  let peor = 0;

  try {
    if (a.soloPreescaneo) {
      // El guion en su propia carpeta (no junto a lo escaneado) y Python en modo -I
      const dirGuion = mkdtempSync(join(tmpdir(), "kitsuden-aig-pre-"));
      const guion = join(dirGuion, "preescaneo.py");
      writeFileSync(guion, PREESCANEO);
      try {
        const mcp = [codigo, a.objetivos.includes("kons") && existsSync(kons) ? kons : null].filter(Boolean);
        if (mcp.length) {
          const c = await correr("uv", ["run", "--no-project", "--with", AIG_MCP_SCAN, "python", "-I", guion, "mcp_scan.utils.pre_scan", ...mcp], env);
          peor = Math.max(peor, c);
        }
        if (a.objetivos.includes("skill")) {
          const c = await correr("uv", ["run", "--no-project", "--with", AIG_SKILL_SCAN, "python", "-I", guion, "skill_scan.utils.pre_scan", join(RAIZ, "skills", "kitsuden")], env);
          peor = Math.max(peor, c);
        }
      } finally {
        rmSync(dirGuion, { recursive: true, force: true });
      }
      return peor;
    }

    const comun = ["--language", "en"];
    if (codigo) {
      const out = join(SALIDA, "mcp-codigo.sarif.json");
      peor = Math.max(peor, await correr("uvx", ["--from", AIG_MCP_SCAN, "aig-mcp-scan", "--repo", codigo, ...comun, "-o", out], env));
      resumen.push(`codigo del MCP:\n${resumirSarif(out)}`);
    }
    if (a.objetivos.includes("kons")) {
      if (!existsSync(kons)) resumen.push(`kons: no existe ${kons} (KITSUDEN_KONS_DIR)`);
      else {
        const out = join(SALIDA, "mcp-kons.sarif.json");
        peor = Math.max(peor, await correr("uvx", ["--from", AIG_MCP_SCAN, "aig-mcp-scan", "--repo", kons, ...comun, "-o", out], env));
        resumen.push(`kitsuden-kons:\n${resumirSarif(out)}`);
      }
    }
    if (a.objetivos.includes("servidor")) {
      const url = process.env.KITSUDEN_AIG_URL ?? "";
      const malo = urlDePruebasValida(url);
      if (malo) resumen.push(`servidor: NO se escanea ${url || "(sin KITSUDEN_AIG_URL)"}: ${malo}`);
      else if (!process.env.KITSUDEN_AIG_TOKEN) resumen.push("servidor: falta KITSUDEN_AIG_TOKEN (clave de agente del stack de pruebas)");
      else {
        const out = join(SALIDA, "mcp-servidor.sarif.json");
        const cabecera = `Authorization:Bearer ${process.env.KITSUDEN_AIG_TOKEN}`;
        peor = Math.max(peor, await correr("uvx", ["--from", AIG_MCP_SCAN, "aig-mcp-scan", "--server_url", url, "--header", cabecera, ...comun, "-o", out], env));
        resumen.push(`servidor MCP de pruebas (${url}):\n${resumirSarif(out)}`);
      }
    }
    if (a.objetivos.includes("skill")) {
      const out = join(SALIDA, "skill-kitsuden.sarif.json");
      peor = Math.max(peor, await correr("uvx", ["--from", AIG_SKILL_SCAN, "aig-skill-scan", "--repo", join(RAIZ, "skills", "kitsuden"), ...comun, "-o", out], env));
      resumen.push(`skill kitsuden:\n${resumirSarif(out)}`);
    }
  } finally {
    if (codigo) rmSync(codigo, { recursive: true, force: true });
  }
  console.log(`\n── AI-Infra-Guard (Tencent Zhuque Lab) ──\n${resumen.join("\n")}`);
  return peor;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (c) => process.exit(c),
    (e) => {
      console.error(e.message);
      process.exit(2);
    }
  );
}
