/**
 * Un kon que declara sus tablas no las descubre otra vez
 * ============================================================================
 *
 * ── LO QUE SE VEIA ─────────────────────────────────────────────────────────
 *
 * En CardSim, dos filas de pestañas para las MISMAS siete tablas:
 *
 *     Juegos · Cartas · Mazos · Sesiones · Matches · Clasificación · Cola
 *     Cartas · Cardsim games · Cardsim decks · Cardsim sessions · …
 *
 * La de arriba con las etiquetas del manifiesto; la de abajo con el nombre de
 * la tabla humanizado. Lo mismo dos veces, y la segunda con nombres peores.
 *
 * ── POR QUE ────────────────────────────────────────────────────────────────
 *
 * El explorador tiene un descubrimiento —pregunta a la base qué tablas hay— y
 * está pensado para el caso de CERO CONFIGURACIÓN: sueltas un directorio con
 * su `kon.json` y aparece. La condición para lanzarlo era:
 *
 *     if (!config?.views || config.views.length === 0)
 *
 * y no bastaba: `onMount` corre en el primer render, cuando el contenedor
 * todavía no ha resuelto qué vista está activa, así que `config.views` llega
 * vacío y el descubrimiento se dispara aunque el kon declare siete tablas.
 *
 * Una condición que depende de CUÁNDO se mire no es una condición.
 *
 * ── Y EL BOTON DE ALTA ─────────────────────────────────────────────────────
 *
 * El mismo cromosoma: la etiqueta salía de `tables[0].label` —la PRIMERA tabla
 * del kon, fija—, así que estando en «Cartas» el botón decía «Agregar Juegos».
 * Es la familia del `apiBase` que servía la primera tabla a las once pestañas
 * de Academy: coger `[0]` y llamarlo «el del kon» acierta mientras solo hay uno.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const EXPLORADOR = join(
  RAIZ,
  "packages",
  "admin",
  "src",
  "lib",
  "components",
  "admin",
  "DataExplorer.svelte"
);

describe("el descubrimiento no compite con el manifiesto", () => {
  const fuente = readFileSync(EXPLORADOR, "utf-8");

  it("no se lanza si el kon declara sus tablas", () => {
    const montaje = fuente.slice(fuente.indexOf("onMount(async () => {"));
    const cuerpo = montaje.slice(0, montaje.indexOf("\n  });") + 6);

    expect(cuerpo, "no se encontró el `onMount` del descubrimiento").toContain(
      "discoverGrimoireTables"
    );

    expect(
      cuerpo.includes("allTables?.length"),
      "la condición tiene que mirar `allTables`, que viene del manifiesto y es " +
        "estable desde el primer render. `config.views.length === 0` depende de " +
        "cuándo se mire: en el primer render aún está vacío y el descubrimiento " +
        "se dispara igual, duplicando las pestañas."
    ).toBe(true);
  });

  it("si llega a correr, respeta los nombres declarados", () => {
    const descubrir = fuente.slice(fuente.indexOf("async function discoverGrimoireTables"));
    const cuerpo = descubrir.slice(0, 1600);

    expect(
      cuerpo.includes("allTables?.find((d) => d.name === t.name)?.label"),
      "humanizar el nombre de la tabla es el ÚLTIMO recurso: «Cardsim games» " +
        "es peor que «Juegos» en todos los idiomas."
    ).toBe(true);
  });
});

describe("el botón de alta nombra lo que se está viendo", () => {
  const fuente = readFileSync(EXPLORADOR, "utf-8");

  it("la etiqueta sale de la tabla activa, no de la primera del kon", () => {
    const etiqueta = fuente.slice(
      fuente.indexOf("const etiquetaDeAlta"),
      fuente.indexOf("const columns")
    );

    expect(etiqueta.length, "no se encontró `etiquetaDeAlta`").toBeGreaterThan(0);

    expect(
      etiqueta.includes("allTables?.find((t) => t.name === tablaActiva)?.label"),
      "el nombre tiene que ser el de `tablaActiva`. Con `config.singularName` " +
        "—que es `tables[0].label`— estando en «Cartas» el botón decía " +
        "«Agregar Juegos»."
    ).toBe(true);
  });

  it("`config.singularName` queda solo como respaldo", () => {
    const etiqueta = fuente.slice(
      fuente.indexOf("const etiquetaDeAlta"),
      fuente.indexOf("const columns")
    );

    /**
     * El orden importa: si `config.singularName` se consultara antes que la
     * tabla activa, volvería a ganar la primera tabla del kon y el fallo
     * reaparecería intacto.
     */
    const iTabla = etiqueta.indexOf("tablaActiva");
    const iConfig = etiqueta.indexOf("config?.singularName");

    expect(iTabla, "no se consulta la tabla activa").toBeGreaterThan(-1);
    expect(
      iConfig === -1 || iTabla < iConfig,
      "la tabla activa tiene que consultarse ANTES que `config.singularName`."
    ).toBe(true);
  });
});
