/**
 * Ninguna ruta se calcula contando niveles de directorio
 * ============================================================================
 *
 * ── EL FALLO, Y POR QUE SOLO SE VEIA EN PRODUCCION ─────────────────────────
 *
 * `migraciones-kon.ts` resolvía la raíz del monorepo así:
 *
 *     resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..")
 *
 * Cuatro niveles arriba desde `apps/api/src/lib`. En desarrollo es exacto.
 *
 * Pero la imagen ejecuta `dist/index.js`, un ÚNICO fichero empaquetado. Desde
 * `/app/apps/api/dist`, cuatro niveles arriba es `/`. Así que buscaba las
 * migraciones de cada kon en `/packages/kons/<kon>/migrations`, una ruta que no
 * existe, y el panel decía:
 *
 *     'kon-character-builder' no trae ficheros de migración, así que nada crea sus tablas
 *
 * Mentira comprobable: `0001_builder.sql` estaba en el repo Y dentro de la
 * imagen. Se miraba donde no estaba.
 *
 * ── POR QUE ES LA PEOR CLASE DE FALLO ──────────────────────────────────────
 *
 * Porque en desarrollo TODO funciona. Las pruebas pasan, el kon se activa, y el
 * problema aparece solo compilado — justo donde no hay nadie mirando la
 * consola. Y el síntoma («no trae migraciones») apunta al kon, que está bien,
 * en vez de a la resolución de rutas, que es lo roto.
 *
 * ── LA REGLA ───────────────────────────────────────────────────────────────
 *
 * Una ruta no se deduce de la profundidad del fichero: se BUSCA. Subir hasta
 * encontrar un marcador (`packages/kons`) vale desde el fuente, desde un bundle
 * a cualquier profundidad y desde un script lanzado en un subdirectorio,
 * porque no supone nada sobre la forma del árbol — comprueba.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sinComentarios } from "./helpers/comentarios";

const RAIZ = join(__dirname, "..", "..");
const MIGRACIONES = join(RAIZ, "apps", "api", "src", "lib", "migraciones-kon.ts");

describe("resolución de la raíz del monorepo", () => {
  const fuente = sinComentarios(readFileSync(MIGRACIONES, "utf-8"));

  it("no se sube un número fijo de niveles", () => {
    /**
     * Se busca `resolve(dirname(...), "..", "..", ...)` — la firma del fallo.
     * Dos `..` seguidos ya es contar; con uno solo cabe un uso legítimo
     * (`join(dir, "..")` para un hermano), así que se exige dos o más.
     */
    const contando = /resolve\([^)]*dirname\([^)]*\)[^)]*(?:"\.\."\s*,\s*){2,}/.test(fuente);

    expect(
      contando,
      "La raíz del repo no puede salir de contar `..` desde el fichero: en el " +
        "bundle de producción el código vive a otra profundidad y la ruta " +
        "apunta fuera del proyecto. Súbete hasta encontrar `packages/kons`."
    ).toBe(false);
  });

  it("se busca un marcador real en el disco", () => {
    expect(
      fuente.includes('join(dir, "packages", "kons")') ||
        /existsSync\(join\([^)]*"packages"[^)]*"kons"/.test(fuente),
      "tiene que comprobarse que la carpeta candidata contiene `packages/kons` " +
        "antes de darla por buena."
    ).toBe(true);
  });

  it("hay más de un punto de partida", () => {
    /**
     * Solo el módulo no basta: un script puede vivir fuera del árbol esperado.
     * Solo `process.cwd()` tampoco: se ejecuta desde subdirectorios. Los dos
     * juntos cubren los casos reales que se han dado en este repo.
     */
    expect(fuente).toContain("process.cwd()");
    expect(fuente).toContain("import.meta.url");
  });
});

describe("las migraciones de los kons se encuentran de verdad", () => {
  /**
   * Y esta es la comprobación que importa: no que el código tenga cierta forma,
   * sino que los ficheros aparezcan. Se ejecuta la función real.
   */
  it("todo kon que declara tablas tiene migraciones localizables", async () => {
    const { carpetaDeMigraciones, migracionesDe, limpiarCacheDeRaiz } =
      await import("../../apps/api/src/lib/migraciones-kon");

    limpiarCacheDeRaiz();

    const { readdirSync, existsSync, readFileSync: leer } = await import("node:fs");
    const KONS = join(RAIZ, "packages", "kons");

    const problemas: string[] = [];

    for (const dir of readdirSync(KONS)) {
      const manifiesto = join(KONS, dir, "kon.json");
      if (!existsSync(manifiesto)) continue;

      let kon: { id?: string; tables?: unknown[] };
      try {
        kon = JSON.parse(leer(manifiesto, "utf-8"));
      } catch {
        continue;
      }

      const tablas = kon.tables ?? [];
      if (tablas.length === 0) continue; // no guarda nada propio

      const konId = kon.id || dir;
      const carpeta = carpetaDeMigraciones(konId);
      const ficheros = carpeta ? migracionesDe(konId) : [];

      if (ficheros.length === 0) {
        problemas.push(
          `${konId} declara ${tablas.length} tabla(s) y no se le encuentra ` +
            `ninguna migración (carpeta: ${carpeta ?? "no localizada"}). ` +
            `Activarlo dejaría sus pantallas devolviendo errores.`
        );
      }
    }

    expect(problemas, problemas.join("\n")).toEqual([]);
  });
});
