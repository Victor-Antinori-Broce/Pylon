#!/usr/bin/env node
/**
 * Inventario antes de publicar (kitsuden2.md, B2)
 * ============================================================================
 *
 *   node scripts/inventario-publicacion.mjs                 # informe por pantalla
 *   node scripts/inventario-publicacion.mjs --salida=FICHERO.md
 *
 * NO BORRA NADA. Clasifica y avisa:
 *
 *   1. Cada entrada de la RAÍZ del repo: producto / interno / basura, y si el
 *      .gitignore público la deja entrar o no.
 *   2. Cada fichero que entraría en el repo público (`git ls-files` + los no
 *      ignorados): carpetas internas (docs/notes, docs/archive…) que no
 *      deberían ir.
 *   3. Credenciales y riesgos legales en (a) lo que entraría en el público y
 *      (b) los ficheros sueltos de la raíz aunque estén ignorados (la nota
 *      «Publicar como CMS» encontró ahí la contraseña de producción).
 *
 * De una credencial se informa el FICHERO, la LÍNEA y el TIPO. Nunca el valor:
 * este informe se puede pegar en un ticket sin filtrar nada (memoria
 * «secretos-en-salidas-de-comandos»).
 *
 * Después del inventario, el paso es un repo NUEVO sin historial con solo lo
 * marcado «producto» (la recomendación de 2026-10-18): el historial actual
 * lleva commits con el correo corporativo y un token de agente.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { PRODUCTO } from "./raiz-del-producto.mjs";

const RAIZ = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const salidaArg = process.argv.find((a) => a.startsWith("--salida="));

// ── 1. Clasificación de la raíz ────────────────────────────────────────────

// La lista de lo que es producto vive en raiz-del-producto.mjs (la comparte la exportación).

/** Del propietario: notas, planes, webs propias. Van al repo PRIVADO, no a la basura. */
const INTERNO = [
  /^(BRAIN|GRIMOIRE-VIGGO|PRIVADO|STABILIZATION_PLAN)\.md$/,
  /^kitsuden\d*\.md$/, /^designrules\.md$/, /^roadmapbeta\.md$/, /^revision-visual-inti\.md$/,
  /^docker-compose\.(sitios|override)\.yml$/, /^start-.*\.(mjs|bat|ps1)$/, /^start\.bat$/,
  /^\.claude$/, /^\.kitsuden$/, /^\.aig$/, /^\.cl\.json$/, /^gamedata$/, /^scraped_.*$/,
];

/** Restos de trabajo: scratch, volcados, logs, salidas de herramientas. */
const BASURA = [
  /^scratch(-.*)?(\.\w+)?$/, /^check[-_].*\.(mjs|cjs)$/, /^check-db\d*\.mjs$/,
  /^(count_weapons|insert_weapon|check_batch|check_wikis|test_db)\.cjs$/,
  /^test-(hono-route|kon-mount)\.mjs$/, /^(fix_a11y|parse_wikis)\.py$/,
  /^parsed_.*\.txt$/, /^.*_text\.txt$/, /^tmp-logs.*$/, /^logs$/, /^x$/, /^temp\.html$/,
  /^[a-z0-9]+\.html$/, /^(weapons_list|pending_batch|tests|api)\.json$/,
  /^(mcp-agent|update-scopes)\.sql$/, /^__pycache__$/, /^coverage$/,
  /^playwright-report$/, /^test-results$/, /^node_modules$/, /^\.env(\.test)?$/,
];

/** Páginas sueltas de contenido (armas de Elden Ring…): snake_case.md. */
const PAGINA_DE_CONTENIDO = /^[a-z0-9][a-z0-9_'-]*\.md$/;

function categoria(nombre) {
  if (PRODUCTO.has(nombre)) return "producto";
  if (INTERNO.some((r) => r.test(nombre))) return "interno";
  if (BASURA.some((r) => r.test(nombre))) return "basura";
  if (PAGINA_DE_CONTENIDO.test(nombre)) return "contenido-del-sitio";
  if (/^[A-Z][A-Z0-9_-]+\.md$/.test(nombre)) return "interno";
  return "revisar";
}

function ignorado(ruta) {
  try {
    execFileSync("git", ["check-ignore", "-q", ruta], { cwd: RAIZ, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const entradas = readdirSync(RAIZ)
  .filter((n) => n !== ".git")
  .map((nombre) => ({
    nombre,
    dir: statSync(join(RAIZ, nombre)).isDirectory(),
    categoria: categoria(nombre),
    // Una carpeta «no ignorada» puede tener dentro lo ignorado; vale como pista.
    // La exportación solo copia de la raíz lo que es producto.
    publico: PRODUCTO.has(nombre) && !ignorado(nombre),
  }));

// ── 2. Lo que entraría en el repo público ─────────────────────────────────

const enPublico = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: RAIZ, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }
)
  .split("\0")
  .filter(Boolean)
  .filter((f) => PRODUCTO.has(f.split("/")[0]));

const CARPETAS_INTERNAS = [
  /^docs\/(internal|notes|archive|progress)\//,
  /^docs\/[A-Z_0-9]+\.md$/, // REFACTOR_COMPLETE.md, TEST_REPORT.md, FASE3_…
  /^gamedata\//, // contenido de juegos de terceros: nunca en el público
  /^apps\/api\/src\/tests\/(TEST_RESULTS|DYNAMIC_GRIMOIRES_TEST_GUIDE)\.md$/,
];
const internosEnPublico = enPublico.filter((f) => CARPETAS_INTERNAS.some((r) => r.test(f)));

// ── 3. Credenciales y riesgos legales ──────────────────────────────────────

const PLACEHOLDER =
  /^(<[^>]*>|\*+|x+|\.\.\.|…|\$\{?\w+\}?|password|pass|secret|changeme|change_me.*|.*change_me.*|your[_-].*|example|test|kitsuden|postgres|user|admin)$/i;

const DETECTORES = [
  {
    tipo: "url-postgres-con-contraseña",
    re: /postgres(?:ql)?:\/\/[^:\s/@'"`]+:([^@\s'"`]+)@/g,
    valor: (m) => m[1],
  },
  // Un token real: base62 largo y con dígitos (no `kitsuden_agent_trace_steps`).
  {
    tipo: "token-de-agente-kitsuden",
    re: /kitsuden_(?:agent|sk)_([A-Za-z0-9]{24,})/g,
    valor: (m) => (/\d/.test(m[1]) && /[A-Za-z]/.test(m[1]) ? "real" : "x"),
  },
  { tipo: "clave-anthropic", re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { tipo: "clave-openai", re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/g },
  { tipo: "clave-stripe", re: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{20,}/g },
  { tipo: "clave-aws", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { tipo: "token-github", re: /\bghp_[A-Za-z0-9]{36}\b|github_pat_[A-Za-z0-9_]{40,}/g },
  { tipo: "token-slack", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { tipo: "clave-privada", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  {
    tipo: "secreto-asignado",
    re: /\b[A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API_KEY)\s*[=:]\s*["']?([^\s"'`<>$,;)]{12,})/g,
    valor: (m) => m[1],
  },
  { tipo: "correo-corporativo-empleador", re: /@fpacifico\.com\b/gi },
  { tipo: "codigo-con-nombre-del-empleador", re: /mapeoRolesPacifico|Pac[ií]fico\s+Seguros/g },
];

/** Un hallazgo aquí es casi siempre un dato de prueba: gravedad baja. */
const ES_PRUEBA =
  /(^|\/)(tests?|__tests__|fixtures?|evals?|tests-unit|templates)\/|\.(test|spec)\.[mc]?[jt]sx?$|^\.github\/workflows\/|^docker-compose\.(test|dev)\.yml$|README\.md$/;

/** Tipos que, fuera de pruebas, son ALTA aunque el patrón sea genérico. */
const TIPOS_ALTA = new Set([
  "valor-real-de-un-.env", "clave-anthropic", "clave-openai", "clave-stripe", "clave-aws",
  "token-github", "token-slack", "clave-privada", "token-de-agente-kitsuden",
  "correo-corporativo-empleador", "codigo-con-nombre-del-empleador",
]);

// ── Los valores REALES de los .env, comparados en memoria ─────────────────
// Se leen `.env` y `apps/api/.env` (en la copia del propietario llevan las
// credenciales de producción) SOLO para buscar esos valores literales en el
// resto de ficheros. El informe da el NOMBRE de la clave, nunca el valor.
function valoresDeEnv() {
  const valores = [];
  for (const rel of [".env", "apps/api/.env", ".env.production", "apps/api/.env.production"]) {
    let texto;
    try {
      texto = readFileSync(join(RAIZ, rel), "utf8");
    } catch {
      continue;
    }
    for (const linea of texto.split(/\r?\n/)) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*["']?(.*?)["']?\s*$/);
      if (!m || !/(PASSWORD|SECRET|TOKEN|KEY|_URL)$/.test(m[1])) continue;
      let v = m[2];
      const url = v.match(/^[a-z]+:\/\/[^:@/\s]+:([^@\s]+)@/i);
      if (url) v = url[1];
      else if (m[1].endsWith("_URL")) continue;
      if (v.length >= 8 && !PLACEHOLDER.test(v) && !/^(true|false|\d+)$/.test(v)) {
        valores.push({ clave: m[1], valor: v });
      }
    }
  }
  return valores;
}
const SECRETOS_REALES = valoresDeEnv();

const EXT_TEXTO = /\.(m?[jt]sx?|cjs|json|ya?ml|toml|md|txt|sql|sh|ps1|bat|env|svelte|astro|html|css|py|example|conf|ini)$|^\.env/i;
const MAX_BYTES = 2 * 1024 * 1024;

function escanear(rel) {
  const hallazgos = [];
  let texto;
  try {
    const abs = join(RAIZ, rel);
    const st = statSync(abs);
    if (!st.isFile() || st.size > MAX_BYTES) return hallazgos;
    if (!EXT_TEXTO.test(rel.split("/").pop() ?? "")) return hallazgos;
    texto = readFileSync(abs, "utf8");
  } catch {
    return hallazgos;
  }
  const lineas = texto.split(/\r?\n/);
  const prueba = ES_PRUEBA.test(rel);
  const anotar = (num, tipo, detalle) =>
    hallazgos.push({
      fichero: rel,
      linea: num,
      tipo,
      detalle,
      gravedad:
        tipo === "valor-real-de-un-.env" || (TIPOS_ALTA.has(tipo) && !prueba) ? "ALTA" : "BAJA",
    });
  lineas.forEach((linea, i) => {
    for (const sec of SECRETOS_REALES) {
      if (linea.includes(sec.valor)) anotar(i + 1, "valor-real-de-un-.env", sec.clave);
    }
    for (const d of DETECTORES) {
      d.re.lastIndex = 0;
      for (const m of linea.matchAll(d.re)) {
        const v = d.valor ? d.valor(m) : m[0];
        if (d.valor && (PLACEHOLDER.test(v) || v === "x")) continue;
        if (d.tipo === "secreto-asignado" && /process\.env|import\.meta|\$\{|\(\)|=>|\bnew\b/.test(linea)) continue;
        anotar(i + 1, d.tipo);
      }
    }
  });
  return hallazgos;
}

const sueltosDeLaRaiz = entradas.filter((e) => !e.dir).map((e) => e.nombre);
// Ni este script (sus patrones casan consigo mismos) ni los .env de donde salen los valores.
const NO_ESCANEAR = new Set(["scripts/inventario-publicacion.mjs", ".env", "apps/api/.env"]);
const aEscanear = [...new Set([...enPublico, ...sueltosDeLaRaiz])].filter(
  (f) => !NO_ESCANEAR.has(f)
);
const hallazgos = aEscanear.flatMap(escanear);
const enPublicoSet = new Set(enPublico);

// ── Informe ────────────────────────────────────────────────────────────────

const porCategoria = {};
for (const e of entradas) (porCategoria[e.categoria] ??= []).push(e);

const out = [];
const p = (s = "") => out.push(s);
p(`# Inventario antes de publicar`);
p();
p(`Generado por \`scripts/inventario-publicacion.mjs\` el ${new Date().toISOString().slice(0, 10)}. No borra nada.`);
p(`De cada credencial se da fichero, línea y tipo; **nunca el valor**.`);
p();
p(`## 1. Raíz del repo (${entradas.length} entradas)`);
p();
p(`| Categoría | Entradas | De ellas, el .gitignore público las deja entrar |`);
p(`| --- | --- | --- |`);
for (const [cat, es] of Object.entries(porCategoria).sort()) {
  p(`| ${cat} | ${es.length} | ${es.filter((e) => e.publico).length} |`);
}
p();
const sospechosas = entradas.filter(
  (e) => e.publico && ["basura", "interno", "contenido-del-sitio", "revisar"].includes(e.categoria)
);
p(`### Entradas de la raíz que NO son producto y entrarían en el público (${sospechosas.length})`);
p();
for (const e of sospechosas) p(`- \`${e.nombre}${e.dir ? "/" : ""}\` — ${e.categoria}`);
if (sospechosas.length === 0) p(`Ninguna.`);
p();
p(`### Para revisar a mano (sin regla)`);
p();
const revisar = entradas.filter((e) => e.categoria === "revisar");
for (const e of revisar) p(`- \`${e.nombre}${e.dir ? "/" : ""}\`${e.publico ? " (entra en el público)" : ""}`);
if (revisar.length === 0) p(`Ninguna.`);
p();
p(
  `## 2. Documentación interna y contenido de terceros que entraría en el público (${internosEnPublico.length} ficheros)`
);
p();
const carpetas = {};
for (const f of internosEnPublico) {
  const c = f.split("/").slice(0, 2).join("/");
  carpetas[c] = (carpetas[c] ?? 0) + 1;
}
for (const [c, n] of Object.entries(carpetas)) p(`- \`${c}\` — ${n}`);
p();
const altas = hallazgos.filter((h) => h.gravedad === "ALTA");
p(`## 3. Credenciales y riesgos legales (${altas.length} ALTA, ${hallazgos.length - altas.length} BAJA)`);
p();
p(`ALTA = un valor real de un .env, una clave con formato de proveedor o un rastro del empleador, fuera de pruebas. BAJA = patrón genérico o dato de prueba (tests, CI, compose de desarrollo, plantillas, README): revisar; normalmente no es nada.`);
p(`Valores reales de .env comparados: ${SECRETOS_REALES.length} (de ${new Set(SECRETOS_REALES.map((x) => x.clave)).size} claves).`);
p();
p(`| Tipo | ALTA | BAJA | En lo que entraría en el público |`);
p(`| --- | --- | --- | --- |`);
for (const t of [...new Set(hallazgos.map((h) => h.tipo))]) {
  const de = hallazgos.filter((h) => h.tipo === t);
  const alta = de.filter((h) => h.gravedad === "ALTA").length;
  const pub = de.filter((h) => enPublicoSet.has(h.fichero)).length;
  p(`| ${t} | ${alta} | ${de.length - alta} | ${pub} |`);
}
p();
const renglon = (h) => `- \`${h.fichero}:${h.linea}\` — ${h.tipo}${h.detalle ? ` (${h.detalle})` : ""}`;
// Un valor real de .env que sale en 3+ ficheros del producto no es una fuga:
// es que el despliegue usa un VALOR POR DEFECTO del código (minioadmin, el
// nombre de un rol…). Eso es una credencial débil, y se dice una vez.
const ficherosPorClave = {};
for (const h of altas) {
  if (h.tipo !== "valor-real-de-un-.env" || !enPublicoSet.has(h.fichero)) continue;
  (ficherosPorClave[h.detalle] ??= new Set()).add(h.fichero);
}
const debiles = new Set(
  Object.entries(ficherosPorClave)
    .filter(([, fs]) => fs.size >= 3)
    .map(([clave]) => clave)
);
p(`### Credenciales del despliegue que coinciden con un valor por defecto del código`);
p();
for (const clave of debiles) {
  p(`- \`${clave}\`: su valor real aparece en ${ficherosPorClave[clave].size} ficheros del producto. Es un valor por defecto o adivinable: **cámbialo** en el despliegue.`);
}
if (debiles.size === 0) p(`Ninguna.`);
p();
p(`### ALTA en lo que entraría en el repo público`);
p();
const altasPub = altas.filter(
  (h) => enPublicoSet.has(h.fichero) && !(h.tipo === "valor-real-de-un-.env" && debiles.has(h.detalle))
);
for (const h of altasPub) p(renglon(h));
if (altasPub.length === 0) p(`Ninguno.`);
p();
p(`### ALTA en ficheros ignorados (no entran en el público, pero están en disco)`);
p();
const porFichero = {};
for (const h of altas.filter((x) => !enPublicoSet.has(x.fichero))) {
  (porFichero[h.fichero] ??= new Set()).add(h.detalle ? `${h.tipo} (${h.detalle})` : h.tipo);
}
for (const [f, ts] of Object.entries(porFichero)) p(`- \`${f}\` — ${[...ts].join(", ")}`);
if (Object.keys(porFichero).length === 0) p(`Ninguno.`);
p();
p(`### BAJA en lo que entraría en el público`);
p();
const bajasPub = hallazgos.filter((h) => h.gravedad === "BAJA" && enPublicoSet.has(h.fichero));
for (const h of bajasPub) p(renglon(h));
if (bajasPub.length === 0) p(`Ninguno.`);
p();
p(`## Siguiente paso`);
p();
p(`1. Rotar lo que salga en la sección 3 (borrarlo no basta si llegó a un commit o a un remoto).`);
p(`2. Sacar del público lo de la sección 2 y lo «interno» de la raíz (al repo privado de \`scripts/sitios-git.sh\`).`);
p(`3. Repo nuevo SIN historial con solo lo «producto»: el historial actual lleva el correo corporativo y un token de agente.`);

const informe = out.join("\n") + "\n";
if (salidaArg) {
  const destino = salidaArg.slice("--salida=".length);
  writeFileSync(destino, informe);
  console.log(`Informe escrito en ${relative(process.cwd(), destino) || destino}`);
} else {
  process.stdout.write(informe);
}
