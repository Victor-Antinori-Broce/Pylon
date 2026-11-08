#!/usr/bin/env node
/**
 * Pruebas unitarias de la API, UN proceso por fichero
 * ============================================================================
 *
 *   node scripts/test-aislado.mjs [directorio…]      (por defecto src/tests-unit)
 *
 * `mock.module` de bun vale para el PROCESO entero, no para el fichero (ver
 * scripts/check-test-isolation.mjs en la raíz). En `src/tests-unit` casi cada
 * fichero sustituye `../db`, `drizzle-orm`, `../lib/auth`… con la forma que a
 * él le conviene, así que en un solo `bun test` el resultado depende del ORDEN
 * en que bun recorra los ficheros. En Windows salía verde; en el Linux de CI,
 * con otro orden, 12 fallos que no lo eran (cada fichero pasa solo). `--isolate`
 * de bun no sirve aquí: rompe el estado que algunos ficheros comparten a
 * propósito.
 *
 * Así que cada fichero corre en su propio `bun test`, con hasta N a la vez
 * (`TEST_AISLADO_PARALELO`, por defecto 4), y la salida dice qué fichero falla.
 * Sale con 1 si alguno falla. Las pruebas de integración (`src/tests`) siguen
 * en un solo proceso: comparten base y no sustituyen módulos.
 */
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = process.cwd();
const DIRECTORIOS = process.argv.slice(2).length ? process.argv.slice(2) : ["src/tests-unit"];
const PARALELO = Math.max(1, Number(process.env.TEST_AISLADO_PARALELO) || 4);

function ficheros(dir) {
  const out = [];
  for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const ruta = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...ficheros(ruta));
    else if (e.name.endsWith(".test.ts")) out.push(ruta);
  }
  return out.sort();
}

/** bun escribe el resumen en stderr: se leen los dos flujos */
function correr(fichero) {
  return new Promise((resolve) => {
    // .env.test, never apps/api/.env: that one is production on the owner's machine.
    const argsDelHijo = ["--env-file=../../.env.test", "test", fichero];
    const hijo = spawn("bun", argsDelHijo, {
      cwd: RAIZ,
      env: process.env,
      shell: process.platform === "win32",
    });
    let salida = "";
    hijo.stdout.on("data", (d) => (salida += d));
    hijo.stderr.on("data", (d) => (salida += d));
    hijo.on("close", (codigo) => {
      const n = (re) => Number(salida.match(re)?.[1] ?? 0);
      resolve({ fichero, codigo, pass: n(/^\s*(\d+) pass/m), fail: n(/^\s*(\d+) fail/m), salida });
    });
  });
}

const lista = DIRECTORIOS.flatMap(ficheros);
const resultados = [];
let siguiente = 0;
await Promise.all(
  Array.from({ length: Math.min(PARALELO, lista.length) }, async () => {
    while (siguiente < lista.length) {
      const r = await correr(lista[siguiente++]);
      resultados.push(r);
      const marca = r.codigo === 0 ? "ok " : "FAIL";
      console.log(
        `${marca} ${relative(RAIZ, join(RAIZ, r.fichero))}  (${r.pass} pass, ${r.fail} fail)`
      );
      if (r.codigo !== 0) console.log(r.salida.split("\n").slice(-40).join("\n"));
    }
  })
);

const malos = resultados.filter((r) => r.codigo !== 0);
const total = resultados.reduce((a, r) => ({ pass: a.pass + r.pass, fail: a.fail + r.fail }), {
  pass: 0,
  fail: 0,
});
console.log(
  `\n${lista.length} ficheros, ${total.pass} pass, ${total.fail} fail, ${malos.length} ficheros con fallos`
);
process.exit(malos.length ? 1 : 0);
