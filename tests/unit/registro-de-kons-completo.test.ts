/**
 * Ningún kon puede desaparecer del registro del panel
 * ============================================================================
 *
 * `buildAdminRegistry()` recorre los kons en DOS bucles: los sueltos y los que
 * aporta un grimoire. Para no construirlos dos veces, el primero se salta los
 * que va a construir el segundo.
 *
 * ── EL HUECO ENTRE LOS DOS BUCLES ──────────────────────────────────────────
 *
 * El conjunto de exclusión se llenaba con `grimoire.kons` **y**
 * `grimoire.optionalKons`, y el segundo bucle solo recorre `grimoire.kons`. Un
 * kon listado únicamente como OPCIONAL se saltaba en el primero y no se añadía
 * en el segundo: caía en medio y no llegaba al registro.
 *
 * Eran TRECE de veintiséis —booking, members, payments, newsletter, wiki, maps,
 * cardsim, tierlist, builder, formulas, directory, ocr-training y
 * broadcast-moba— y no lo delataba ningún error. El síntoma era otro:
 * `/api/admin/registry/kon-booking` devolvía 404, el panel caía a su
 * configuración por defecto y el formulario decía
 *
 *     Could not load schema for table "kon-booking"
 *
 * el id del kon disfrazado de tabla inexistente. Sus tres pestañas declaradas
 * no aparecían.
 *
 * ── QUÉ SE COMPRUEBA AQUÍ ──────────────────────────────────────────────────
 *
 * Esto no ejecuta el registro —necesitaría la base—, así que comprueba la
 * PROPIEDAD que lo hacía fallar: que la exclusión del primer bucle no incluya
 * nada que el segundo no vaya a construir. Es la invariante, no el síntoma.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sinComentarios } from "./helpers/comentarios";

const RAIZ = join(__dirname, "..", "..");
const REGISTRO = join(RAIZ, "apps", "api", "src", "services", "admin-registry.ts");

describe("registro de kons del panel", () => {
  const fuente = sinComentarios(readFileSync(REGISTRO, "utf-8"));

  it("la exclusión del primer bucle no cubre los kons opcionales", () => {
    /**
     * `grimoireKonIds` es lo que el primer bucle se salta. Solo puede
     * alimentarse de `grimoire.kons`, que es exactamente lo que el segundo
     * recorre. Añadir ahí `optionalKons` reabre el hueco.
     */
    const bloque = fuente.match(/const grimoireKonIds = new Set<string>\(\);[\s\S]*?\n {2}\}\n/);
    expect(bloque, "no se encontró la construcción de grimoireKonIds").not.toBeNull();

    expect(
      /optionalKons/.test(bloque![0]),
      "`grimoireKonIds` vuelve a incluir `optionalKons`. El primer bucle se " +
        "saltará esos kons y el segundo no los construye —solo recorre " +
        "`grimoire.kons`—, así que desaparecerán del panel sin ningún error. " +
        "Pasó con trece kons; el síntoma fue «Could not load schema for table " +
        '"kon-booking"».'
    ).toBe(false);
  });

  it("el segundo bucle sigue recorriendo grimoire.kons", () => {
    // Si algún día recorriera también los opcionales, la exclusión de arriba
    // SÍ podría incluirlos. Las dos mitades tienen que moverse juntas.
    expect(
      /for \(const konId of grimoire\.kons\)/.test(fuente),
      "el segundo bucle ya no recorre `grimoire.kons`: revisa que la exclusión " +
        "del primero siga correspondiéndose con lo que este construye."
    ).toBe(true);
  });

  it("una vista sin tabla no cae al id del kon", () => {
    /**
     * El otro lado del mismo fallo, en el panel: `table: v.table || grimoire.id`
     * convertía «esta vista no dice qué tabla enseña» en «la tabla se llama
     * kon-booking», y el error resultante hablaba de una tabla que nadie había
     * declarado nunca.
     */
    const loader = sinComentarios(
      readFileSync(join(RAIZ, "packages", "admin", "src", "lib", "grimoire-loader.ts"), "utf-8")
    );

    expect(
      /table:\s*v\.table \|\| grimoire\.id/.test(loader),
      "`generateExplorerConfig` vuelve a caer al id del kon como nombre de " +
        "tabla. Un respaldo que fabrica un nombre falso cuesta más de depurar " +
        "que la ausencia del dato: usa la primera tabla declarada."
    ).toBe(false);
  });
});
