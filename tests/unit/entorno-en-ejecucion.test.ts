/**
 * `NODE_ENV` se lee AL EJECUTAR, nunca al compilar.
 *
 * La imagen de producción corre un bundle de `bun build`, que sustituye la
 * expresión literal `process.env.NODE_ENV` por el valor del momento de
 * compilar ("development" en el Dockerfile). Así, en el contenedor de
 * producción, `if (process.env.NODE_ENV === "production")` era `if (false)`:
 * el visor de GraphQL sin sesión, el depurador de SQL abierto, los 500 de los
 * kons diferidos con el mensaje crudo y los orígenes de desarrollo en
 * better-auth. Ver `apps/api/src/lib/entorno.ts`.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = resolve(__dirname, "../..");

/** Directorios cuyo código acaba dentro del bundle de la API o lo cargan los kons. */
const VIGILADOS = ["apps/api/src", "packages/engine/src", "packages/core", "packages/kons"];

function ficheros(dir: string, salida: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === "node_modules" || nombre === "dist" || nombre.startsWith(".")) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      if (/^(tests?|tests-unit|__tests__)$/.test(nombre)) continue;
      ficheros(ruta, salida);
    } else if (/\.(ts|mts)$/.test(nombre) && !/\.(test|spec)\.|\.d\.ts$/.test(nombre)) {
      salida.push(ruta);
    }
  }
  return salida;
}

describe("NODE_ENV en ejecución", () => {
  it("nadie escribe `process.env.NODE_ENV` literal en el código de la API ni de los kons", () => {
    const culpables: string[] = [];
    for (const dir of VIGILADOS) {
      for (const f of ficheros(join(RAIZ, dir))) {
        readFileSync(f, "utf8")
          .split("\n")
          .forEach((linea, i) => {
            const codigo = linea.trim();
            if (codigo.startsWith("*") || codigo.startsWith("//") || codigo.startsWith("/*"))
              return;
            if (/process\.env\.NODE_ENV\b/.test(codigo)) {
              culpables.push(`${f.slice(RAIZ.length + 1)}:${i + 1}`);
            }
          });
      }
    }
    expect(culpables, "usa enProduccion()/nodeEnvCrudo() de apps/api/src/lib/entorno.ts").toEqual(
      []
    );
  });

  it("empaquetado con `bun build` sin NODE_ENV, sigue viendo el de ejecución", () => {
    const version = spawnSync("bun", ["--version"], {
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    if (version.status !== 0) {
      console.warn("bun no está disponible: se omite la comprobación del bundle");
      return;
    }

    const tmp = mkdtempSync(join(tmpdir(), "entorno-"));
    try {
      const entrada = join(tmp, "entrada.ts");
      const modulo = join(RAIZ, "apps/api/src/lib/entorno.ts").replace(/\\/g, "/");
      writeFileSync(
        entrada,
        `import { enProduccion, entornoActual } from ${JSON.stringify(modulo)};\n` +
          `console.log(JSON.stringify({ prod: enProduccion(), entorno: entornoActual() }));\n`
      );

      const env = { ...process.env };
      delete env.NODE_ENV; // como en la etapa de compilación del Dockerfile
      const build = spawnSync(
        "bun",
        ["build", entrada, "--outdir", join(tmp, "out"), "--target", "bun"],
        {
          encoding: "utf8",
          env,
          shell: process.platform === "win32",
        }
      );
      expect(build.status, build.stderr).toBe(0);

      const salida = join(tmp, "out", "entrada.js");
      const run = spawnSync("bun", [salida], {
        encoding: "utf8",
        env: { ...env, NODE_ENV: "production" },
        shell: process.platform === "win32",
      });
      expect(run.status, run.stderr).toBe(0);
      expect(JSON.parse(run.stdout.trim())).toEqual({ prod: true, entorno: "production" });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
