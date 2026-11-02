/**
 * El Dockerfile tiene que copiar TODOS los manifiestos del workspace
 * ============================================================================
 *
 * La etapa de dependencias copia solo los `package.json` antes de instalar, para
 * que cambiar código no invalide la instalación. La idea es correcta; la
 * implementación era una lista escrita a mano de 14 rutas, y el workspace tiene
 * 53 proyectos.
 *
 * Lo que faltaba no daba error. Simplemente sus dependencias no se instalaban, y
 * el build moría mucho después con un `Could not resolve "openai"` que parecía
 * otro problema — `openai` lo declara `packages/core/vector-search`, un paquete
 * propio cuyo manifiesto nadie copiaba.
 *
 * Peor todavía: `COPY packages/kons/*​/package.json ./packages/kons/` **aplasta**
 * los 30 ficheros sobre el mismo destino, porque Docker no preserva la ruta con
 * globs. Solo sobrevivía el último. Ningún kon tenía sus dependencias.
 *
 * ── LA REGLA QUE SE VIGILA ─────────────────────────────────────────────────
 *
 * Los manifiestos se copian con `COPY --parents` y globs que siguen a
 * `pnpm-workspace.yaml`, no con una lista. Una lista siempre se queda vieja: la
 * anterior lo hizo, y nadie lo notó hasta que el build falló por otra cosa.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const DOCKERFILE = join(RAIZ, "docker", "Dockerfile.prod");

/** Líneas COPY activas (sin comentarios). */
function copias(fuente: string): string[] {
  return fuente
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("#"))
    .filter((l) => /^\s*COPY\b/.test(l));
}

describe("el Dockerfile copia los manifiestos por glob, no a mano", () => {
  const fuente = readFileSync(DOCKERFILE, "utf-8");
  const lineas = copias(fuente);

  it("hay COPYs que inspeccionar", () => {
    expect(lineas.length).toBeGreaterThan(5);
  });

  it("usa COPY --parents para los package.json del workspace", () => {
    const conParents = lineas.filter((l) => l.includes("--parents") && l.includes("package.json"));
    expect(
      conParents.length,
      `docker/Dockerfile.prod ya no copia los package.json con 'COPY --parents'. ` +
        `Sin --parents, Docker no preserva la ruta de origen y un glob como ` +
        `'packages/kons/*/package.json' aplasta los 30 ficheros sobre el mismo ` +
        `destino: solo sobrevive el último y ningún kon instala sus dependencias.`
    ).toBeGreaterThan(0);
  });

  it("no vuelve a haber una lista de package.json escrita a mano", () => {
    /**
     * Se permite copiar el `package.json` de la raíz —hace falta y no es parte
     * del workspace—, pero no rutas concretas de paquetes.
     */
    const aMano = lineas.filter((l) => {
      if (l.includes("--parents")) return false;
      if (!l.includes("package.json")) return false;
      // `COPY package.json pnpm-lock.yaml ... ./` es el de la raíz: legítimo.
      return /COPY\s+(apps|packages)\//.test(l);
    });

    expect(
      aMano,
      `docker/Dockerfile.prod vuelve a enumerar package.json de paquetes uno a ` +
        `uno:\n\n${aMano.join("\n")}\n\n` +
        `Esa lista se queda vieja en silencio: llegó a copiar 14 manifiestos de ` +
        `53, y los paquetes ausentes no fallaban al copiar sino mucho después, ` +
        `con un 'Could not resolve' en mitad del build. Usa 'COPY --parents' con ` +
        `globs que sigan a pnpm-workspace.yaml.`
    ).toEqual([]);
  });

  it("los globs cubren la profundidad que declara pnpm-workspace.yaml", () => {
    /**
     * `pnpm-workspace.yaml` declara paquetes a uno y a dos niveles
     * (`packages/*` y `packages/core/*`, `packages/kons/*`, …). Si el glob solo
     * cubriera un nivel, los de dos volverían a quedarse fuera — que es
     * exactamente cómo se perdió `packages/core/vector-search`.
     */
    const linea = lineas.find((l) => l.includes("--parents") && l.includes("package.json")) ?? "";

    expect(
      linea.includes("packages/*/*/package.json"),
      `El glob de manifiestos no cubre los paquetes de dos niveles ` +
        `(packages/core/*, packages/kons/*, packages/starters/*). Así se perdió ` +
        `'packages/core/vector-search', y con él la dependencia 'openai'.\n` +
        `Línea actual: ${linea.trim()}`
    ).toBe(true);
  });
});
