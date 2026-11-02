/**
 * El agregado de esquemas está al día
 * ============================================================================
 *
 * `apps/api/src/db/schema-kons.generated.ts` lo genera
 * `scripts/sync-kon-schema.ts`, y durante un tiempo no estuvo versionado ni
 * ignorado: existía solo en el disco de quien lo hubiera generado. Dos
 * consecuencias, las dos comprobadas:
 *
 *   - En un clon limpio el fichero no está, y `schema-all.ts` lo importa con
 *     un `export *` duro. `tsc --noEmit` de apps/api falla con TS2307 — que es
 *     exactamente lo que corre el job de typecheck del CI.
 *   - En los clones existentes derivaba en silencio. Y había derivado: le
 *     faltaban kon-broadcast, kon-broadcast-moba, kon-ecommerce y kon-members.
 *
 * Eso último no era cosmético. El runner de migraciones solo lee
 * `apps/api/drizzle/` y `src/db/migrations/`, y las migraciones propias de los
 * kons no las aplica nadie (`runKonMigrations` no tiene llamadas y además
 * busca un `init.sql` que ninguno usa). Este agregado es el ÚNICO camino por
 * el que las tablas de un kon llegan a drizzle-kit y de ahí a la base de
 * datos. Un kon que se cae de aquí es un kon cuyas tablas no se crean.
 *
 * Ahora el fichero está en git. Esta prueba es lo que impide que vuelva a
 * mentir: regenera en memoria y compara. NO escribe — un test que arreglara la
 * deriva en vez de denunciarla no serviría de nada.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GENERATED, generarAgregado } from "../../apps/api/scripts/sync-kon-schema";

const RAIZ = join(__dirname, "..", "..");

describe("schema-kons.generated.ts", () => {
  it("existe en el árbol de trabajo", () => {
    // Si esto falla en CI, el fichero no llegó al commit: `schema-all.ts` no
    // resuelve y el typecheck de apps/api cae entero.
    expect(existsSync(GENERATED)).toBe(true);
  });

  it("coincide con lo que produce el generador", async () => {
    const { contenido } = await generarAgregado();
    const enDisco = readFileSync(GENERATED, "utf8");

    expect(
      enDisco,
      "El agregado no coincide con sus fuentes. Alguien tocó el `schema` de un " +
        "kon.json (o su fichero de esquema) sin regenerar. Ejecuta:\n" +
        "  bun run apps/api/scripts/sync-kon-schema.ts"
    ).toBe(contenido);
  });

  it("incluye a todos los kons que se declaran gestionados por drizzle", async () => {
    // La comprobación de arriba se cumpliría igual si el generador dejara de
    // encontrar kons: compararía dos ficheros vacíos. Esta mira las fuentes.
    const konsDrizzle: string[] = [];
    // Solo el núcleo: los kons instalados crean sus tablas con sus migraciones.
    for (const tier of ["core"]) {
      const base = join(RAIZ, "packages", tier);
      if (!existsSync(base)) continue;
      for (const dir of subdirectorios(base)) {
        const manifiesto = join(base, dir, "kon.json");
        if (!existsSync(manifiesto)) continue;
        const m = JSON.parse(readFileSync(manifiesto, "utf8"));
        if (m.schema?.strategy === "drizzle" && m.schema?.entry) konsDrizzle.push(m.id ?? dir);
      }
    }

    const enDisco = readFileSync(GENERATED, "utf8");
    const ausentes = konsDrizzle.filter((id) => !enDisco.includes(`── ${id} ──`));

    expect(
      ausentes,
      `Declaran strategy "drizzle" pero no están en el agregado, así que sus ` +
        `tablas no llegan a drizzle-kit y NADIE las crea: ${ausentes.join(", ")}`
    ).toEqual([]);
    expect(konsDrizzle.length).toBeGreaterThanOrEqual(2);
  });

  it("reexporta schema-core antes que los kons", async () => {
    // El orden es el que resuelve las colisiones: el `export {}` explícito de
    // un kon autoritativo gana al `export *` de core solo si va después.
    const { contenido } = await generarAgregado();
    const posCore = contenido.indexOf('export * from "./schema-core"');
    const posPrimerKon = contenido.indexOf("── kon-");

    expect(posCore).toBeGreaterThan(-1);
    expect(posPrimerKon).toBeGreaterThan(posCore);
  });

  it("no emite dos veces el mismo símbolo", async () => {
    // Dos `export { x }` en el mismo módulo son un error de TypeScript. El
    // generador lo evita omitiendo el segundo; esto comprueba que lo hace.
    const { contenido } = await generarAgregado();
    const simbolos = [...contenido.matchAll(/^\s{2}([A-Za-z_$][\w$]*),$/gm)].map((m) => m[1]);
    const vistos = new Set<string>();
    const repetidos = simbolos.filter((s) => (vistos.has(s) ? true : (vistos.add(s), false)));

    expect(repetidos).toEqual([]);
  });
});

function subdirectorios(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}
