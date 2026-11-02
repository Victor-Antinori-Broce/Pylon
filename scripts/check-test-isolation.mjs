/**
 * Detector de contaminación entre tests
 * ============================================================================
 *
 * EL PROBLEMA
 *
 * `mock.module` de bun se aplica al PROCESO entero, no al archivo. Como
 * `bun test` corre todos los archivos en un solo proceso, un stub declarado en
 * `a.test.ts` sigue vivo cuando corre `b.test.ts`.
 *
 * Y falla en silencio, que es lo peor: ya ha pasado dos veces aquí —un test
 * que stubbeaba `checkReadAccess` a `() => true` dejaba pasar comprobaciones
 * de permisos en OTROS archivos, y otro que stubbeaba `sql` sin `.raw`
 * rompía el constructor de RLS en todo el proceso. En ambos casos la suite
 * seguía en verde.
 *
 * CÓMO SE DETECTA
 *
 * Se corre cada archivo en su PROPIO proceso y se compara con la tanda
 * conjunta. Si un archivo pasa aislado pero falla en lote (o al revés), hay
 * contaminación cruzada. Es la única forma fiable: el síntoma es la
 * diferencia, no un patrón que se pueda grepear.
 *
 * Uso:  node scripts/check-test-isolation.mjs [directorio]
 */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const TEST_DIR = process.argv[2] ?? "apps/api/src/tests-unit";

function findTests(dir) {
  const out = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...findTests(rel));
    else if (entry.name.endsWith(".test.ts")) out.push(rel);
  }
  return out;
}

/**
 * Ejecuta bun test y devuelve {pass, fail} leídos del resumen.
 *
 * DOS TRAMPAS, las dos me mordieron al escribir esto:
 *
 * 1. `bun test` escribe el resumen en STDERR, no en stdout — ahí solo va el
 *    banner de versión. Por eso se usa spawnSync, que devuelve los dos flujos
 *    tanto si el proceso sale con 0 como si no.
 *
 * 2. Si el parseo falla, hay que REVENTAR, no devolver 0. La primera versión
 *    devolvía {pass:0, fail:0} y luego comparaba 0 contra 0 y anunciaba
 *    "✅ sin desvío". Un detector que siempre dice que todo está bien es peor
 *    que no tener detector: da una garantía falsa.
 */
function run(args, cwd) {
  const result = spawnSync("bun", ["test", ...args], {
    cwd,
    encoding: "utf8",
    timeout: 300_000,
    shell: process.platform === "win32",
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

  if (!/\d+\s+pass/.test(output)) {
    throw new Error(
      `No se pudo leer el resumen de "bun test ${args.join(" ")}".\n` +
        `Salida:\n${output.slice(0, 800)}`
    );
  }

  return {
    pass: Number(output.match(/(\d+)\s+pass/)?.[1] ?? 0),
    fail: Number(output.match(/(\d+)\s+fail/)?.[1] ?? 0),
  };
}

const files = findTests(TEST_DIR);
const apiDir = join(ROOT, "apps/api");

console.log(`Comprobando aislamiento de ${files.length} archivos…\n`);

const batch = run([TEST_DIR.replace("apps/api/", "")], apiDir);
console.log(`En lote:  ${batch.pass} pass / ${batch.fail} fail\n`);

let isolatedPass = 0;
let isolatedFail = 0;
const suspects = [];

for (const file of files) {
  const relToApi = relative(join(ROOT, "apps/api"), join(ROOT, file)).split("\\").join("/");
  const result = run([relToApi], apiDir);
  isolatedPass += result.pass;
  isolatedFail += result.fail;

  if (result.fail > 0) suspects.push({ file, ...result, reason: "falla aislado" });
  process.stdout.write(".");
}

console.log(`\n\nAislados: ${isolatedPass} pass / ${isolatedFail} fail`);

// La señal: si la suma de las ejecuciones aisladas no cuadra con la conjunta,
// algún archivo depende del estado que dejó otro.
const drift = isolatedPass - batch.pass;

if (drift !== 0) {
  console.log(`\n⚠️  DESVÍO de ${drift} tests entre lote y aislado.`);
  console.log("   Algún archivo depende del estado global que deja otro.");
} else {
  console.log("\n✅ Sin desvío: ningún test depende del orden de ejecución.");
}

if (suspects.length > 0) {
  console.log("\nArchivos que fallan por sí solos:");
  for (const s of suspects) console.log(`   ${s.file} — ${s.fail} fail`);
}

process.exit(drift !== 0 || suspects.length > 0 ? 1 : 0);
