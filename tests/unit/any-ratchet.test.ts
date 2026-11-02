/**
 * Trinquete de `any`
 * ============================================================================
 *
 * El proyecto tiene `strict: true` y, a la vez, más de mil `any` explícitos.
 * Eso no es una contradicción retórica: cada `any` apaga el comprobador en ese
 * punto Y en todo lo que se derive de él, así que el strict mode acaba
 * garantizando bastante menos de lo que promete.
 *
 * Eliminarlos todos de golpe no es realista ni prudente. Lo que sí lo es:
 * IMPEDIR QUE CREZCAN. Este test fija un techo por área. Sube el contador y el
 * test falla; bájalo y actualiza el techo. Solo puede ir hacia abajo.
 *
 * Si tu cambio necesita un `any` de verdad, ponle un
 * `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- <razón>`
 * y no cuenta: lo que se persigue es el `any` silencioso, no el justificado.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");

/**
 * Techo por área. Estos números son deuda medida, no objetivos: bájalos cuando
 * limpies. Nunca los subas para que pase un commit.
 */
const CEILINGS: Record<string, number> = {
  // 237 → 208. Casi todo de `mcp-tools.ts` (45 → 17): la búsqueda de tabla por
  // nombre estaba cinco veces con su `(mergedSchema as any)`, y los argumentos
  // de las 15 herramientas se leían con `args as any` — que no era un descuido
  // de tipos sino la ausencia de validación en la frontera por donde entra lo
  // que escribe un LLM. Ahora se validan con zod antes del despacho.
  // 208 → 196: `module-loader.ts` construía el KonContext como `any` con un
  // `as KonContext` al salir, y el registro de content-publishing entero era
  // `any` teniendo su contrato ya escrito en `@kitsuden/shared`.
  // Bajada final de la ronda: `eqEnum` sustituyó 25 comparaciones
  // `eq(columna, valor as any)` repartidas por 15 archivos. No era estilo — con
  // un valor fuera del enum, Postgres hace fallar la consulta (500), no
  // devolver cero filas.
  "apps/api/src": 187,
  // 164 → 152 al sustituir el `(table as any).columna` de batch/batch-api por
  // el constructor de condiciones tipado.
  // 152 → 143: en `actions.ts`, la telemetría dejó de colgarse del objeto
  // `kon` con casts y el `kon: null as any` pasó a ser un `| null` de verdad.
  "packages/engine/src": 141,
  // 183 → 179 al quitar los casts que hacían falta para encadenar `.where()`
  // detrás de `.orderBy()` en esports y el `catch (e: any)` de kon-conta.
  // 179 → 170: `kon-dms` usaba `any[]` para las condiciones de Drizzle (lo
  // que escondía que `or()` puede devolver `undefined`) y casteaba a enum los
  // filtros que llegan por query string sin comprobarlos.
  "packages/kons": 157,
  "packages/core": 96,
};

/** Cuenta `any` explícitos, ignorando los justificados con eslint-disable. */
function countAny(dir: string): number {
  let total = 0;

  function walk(current: string): void {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (["node_modules", "dist", ".git", "build"].includes(entry.name)) continue;
      const path = join(current, entry.name);

      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) continue;
      if (entry.name.endsWith(".test.ts")) continue;

      const lines = readFileSync(path, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;

        // Las líneas de COMENTARIO no cuentan.
        //
        // Un comentario que explica por qué se quitó un `any` —citándolo, como
        // "antes esto era `(c as any).get(...)`"— no es un `any`. Contarlo
        // penaliza documentar y empuja a escribir peor para que pase el test,
        // que es el rabo meneando al perro.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;

        if (!/:\s*any\b|<any>|\bas any\b/.test(line)) continue;

        // Un `any` con justificación explícita no cuenta: el objetivo es el
        // silencioso, no el que alguien decidió y documentó.
        const prev = lines[i - 1] ?? "";
        const prev2 = lines[i - 2] ?? "";
        if (/no-explicit-any/.test(prev) || /no-explicit-any/.test(prev2)) continue;
        if (/eslint-disable.*no-explicit-any/.test(line)) continue;

        total++;
      }
    }
  }

  walk(join(ROOT, dir));
  return total;
}

describe("trinquete de any", () => {
  for (const [area, ceiling] of Object.entries(CEILINGS)) {
    it(`${area} no supera ${ceiling} any sin justificar`, () => {
      const actual = countAny(area);

      // El mensaje importa: quien rompa esto debe saber qué hacer.
      expect(
        actual,
        actual > ceiling
          ? `${area} subió a ${actual} (techo ${ceiling}). Tipa lo que añadiste, ` +
              `o justifícalo con un eslint-disable-next-line que explique por qué.`
          : `${area} bajó a ${actual}: baja el techo en tests/unit/any-ratchet.test.ts`
      ).toBeLessThanOrEqual(ceiling);
    });
  }
});

/**
 * Bun-ismos fuera de los scripts.
 *
 * `import.meta.dir` es de Bun y vale `undefined` bajo Node. Ya rompió el
 * paquete publicado una vez. Los scripts de build SÍ pueden usarlo —se
 * invocan con `bun run`—, pero el código de runtime no: tiene que correr en
 * los dos.
 */
describe("portabilidad Node/Bun", () => {
  it("import.meta.dir no aparece en código de runtime", () => {
    const offenders: string[] = [];

    function walk(current: string): void {
      let entries;
      try {
        entries = readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (["node_modules", "dist", ".git", "build", "scripts"].includes(entry.name)) continue;
        const path = join(current, entry.name);

        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;

        const source = readFileSync(path, "utf8");
        for (const line of source.split("\n")) {
          // Solo uso real, no menciones en comentarios explicando que se evita.
          const trimmed = line.trim();
          if (trimmed.startsWith("*") || trimmed.startsWith("//")) continue;
          if (line.includes("import.meta.dir")) {
            offenders.push(path.replace(ROOT, "").replace(/\\/g, "/"));
            break;
          }
        }
      }
    }

    walk(join(ROOT, "apps"));
    walk(join(ROOT, "packages"));

    expect(
      offenders,
      `import.meta.dir es de Bun y es undefined bajo Node. Usa process.cwd() ` +
        `o fileURLToPath(import.meta.url). Archivos: ${offenders.join(", ")}`
    ).toEqual([]);
    // Recorre apps/ y packages/ enteros: 1,5 s en aislado, pero pasó de 20 s en
    // la suite completa con la máquina cargada (falso rojo por tiempo).
  }, 90_000);
});
