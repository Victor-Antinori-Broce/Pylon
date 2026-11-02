/**
 * Deriva de esquema en packages/core
 * ============================================================================
 *
 * Comprueba que las tablas que declara `packages/core` se pueden CONSULTAR
 * contra el esquema que producen las migraciones.
 *
 * ── POR QUÉ ESTA PRUEBA Y NO UNA COMPARACIÓN DE LISTAS ─────────────────────
 *
 * Comparar la lista de columnas declaradas contra la lista de columnas creadas
 * es lo que hice primero, leyendo los `.sql` con expresiones regulares, y me
 * subcontaba las tablas con formato multilínea. Una lista mal parseada da falsos
 * positivos y falsos negativos con la misma confianza.
 *
 * Aquí se monta el esquema real —migración base más toda la cadena— y se lanza
 * la consulta. Si una columna declarada no existe, Postgres lo dice. No hay
 * interpretación.
 *
 * ── LO QUE ESTO PROTEGE ────────────────────────────────────────────────────
 *
 * Un `.select()` de Drizzle sin argumentos enumera TODAS las columnas
 * declaradas. Basta una que no exista para que la consulta entera falle — no la
 * columna, la consulta. Y falla en producción, porque en desarrollo casi nadie
 * arranca contra una base migrada desde cero.
 */

import { beforeAll, describe, expect, it } from "vitest";

import * as schemaCore from "../../apps/api/src/db/schema-core";
import { getPgMemDb } from "../../apps/api/src/tests/pg-mem-db";
import { dataEntries, dataSets } from "../../packages/core/datasets/datasets.schema";
import { media, mediaFolders } from "../../packages/core/media/media.schema";

let db: Awaited<ReturnType<typeof getPgMemDb>>;

beforeAll(async () => {
  db = await getPgMemDb();
});

/**
 * Las tablas de `packages/core` que la aplicación monta de verdad.
 *
 * `media` está aquí porque `apps/api/src/db/schema-kons.generated.ts` la
 * reexporta desde el módulo core: es la que usa la app, no la de `schema-core`.
 */
const TABLAS = [
  ["dataSets", dataSets],
  ["dataEntries", dataEntries],
  ["media", media],
  ["mediaFolders", mediaFolders],
] as const;

describe("las tablas de packages/core existen en el esquema migrado", () => {
  for (const [nombre, tabla] of TABLAS) {
    it(`${nombre}: se puede hacer SELECT de todas sus columnas`, async () => {
      /**
       * `.select()` sin argumentos enumera cada columna declarada.
       *
       * Es exactamente lo que hacen las rutas de datasets y de media, así que
       * si esto pasa, aquello funciona; y si falla, el mensaje dice QUÉ columna
       * falta, que es la mitad del trabajo de arreglarlo.
       */
      await expect(db.select().from(tabla).limit(1)).resolves.toBeDefined();
    });
  }
});

describe("las columnas que la deriva se había llevado", () => {
  /**
   * Cada una de estas se declaraba en `packages/core` y no existía en ninguna
   * migración. Se añadieron en `0035_core_schema_drift.sql`.
   *
   * La lista salió de EJECUTAR las consultas, no de comparar los `.sql` con
   * expresiones regulares: ese primer intento marcó `active` y `published` como
   * columnas ausentes cuando son valores por DEFECTO, y se dejó fuera que
   * `media_folders` no existía como tabla.
   *
   * La prueba las nombra una a una en vez de fiarse del SELECT de arriba
   * porque, si alguien vuelve a quitar una, el mensaje diga cuál.
   */
  const ESPERADAS: [string, string[]][] = [
    ["data_sets", ["updated_at"]],
    ["data_entries", ["created_by_id", "updated_by_id"]],
    ["media_folders", ["path", "parent_id"]],
  ];

  for (const [tabla, columnas] of ESPERADAS) {
    for (const columna of columnas) {
      it(`${tabla}.${columna} existe`, async () => {
        const filas = (await db.execute(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = '${tabla}' AND column_name = '${columna}'` as never
        )) as unknown as { rows?: unknown[] } | unknown[];

        const n = Array.isArray(filas) ? filas.length : (filas.rows?.length ?? 0);
        expect(n, `${tabla}.${columna} lo declara packages/core y no existe en el esquema`).toBe(1);
      });
    }
  }
});

describe("una sola declaracion por tabla", () => {
  /**
   * `apps/api/src/db/schema-core.ts` declaraba `media`, `data_sets` y
   * `data_entries` por su cuenta, ademas de `packages/core`. Y habian derivado:
   *
   *   · La migracion 0031 renombro `url→public_url`, `alt→alt_text` y
   *     `uploaded_by_id→created_by_id`. `packages/core/media` se actualizo;
   *     `schema-core` no. Su tabla `media` llevaba rota desde entonces.
   *   · `data_sets.content_config` y `data_entries.owner_id` solo los declaraba
   *     `schema-core`.
   *
   * Ahora `schema-core` reexporta. Esta prueba comprueba la IDENTIDAD de los
   * objetos, no que las columnas coincidan: dos tablas con las mismas columnas
   * hoy pueden volver a separarse manana, y comparar listas no lo detectaria
   * hasta que ya hubieran derivado otra vez.
   */
  const PAREJAS = [
    ["media", schemaCore.media, media],
    ["mediaFolders", schemaCore.mediaFolders, mediaFolders],
    ["dataSets", schemaCore.dataSets, dataSets],
    ["dataEntries", schemaCore.dataEntries, dataEntries],
  ] as const;

  for (const [nombre, deApp, deCore] of PAREJAS) {
    it(`${nombre}: schema-core y packages/core son el MISMO objeto`, () => {
      expect(deApp, `${nombre} se ha vuelto a declarar dos veces: volveran a derivar`).toBe(deCore);
    });
  }

  it("las tablas de schema-core se pueden consultar", async () => {
    // `media` a traves de schema-core fallaba con `column "url" does not exist`
    // desde la migracion 0031. Con la reexportacion no puede volver a pasar.
    for (const [nombre, deApp] of PAREJAS.map(([n, a]) => [n, a] as const)) {
      await expect(
        db
          .select()
          .from(deApp as never)
          .limit(1),
        `SELECT sobre ${nombre} desde schema-core`
      ).resolves.toBeDefined();
    }
  });
});
