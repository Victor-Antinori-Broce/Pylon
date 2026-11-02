/**
 * Un kon aparece UNA vez en el registro del panel
 * ============================================================================
 *
 * ── EL FALLO, MEDIDO ───────────────────────────────────────────────────────
 *
 * `GET /api/admin/registry` devolvía `kon-dms` **tres veces**, con los tres
 * objetos idénticos. La causa: el kon está listado en tres grimoires
 * —`corporate`, `sharepoint` y `vekdocs`— y el ensamblado empujaba una
 * configuración por cada uno sin comprobar si ya estaba.
 *
 * ── POR QUE IMPORTA MAS DE LO QUE PARECE ───────────────────────────────────
 *
 * Lo visible es el kon repetido tres veces en la barra lateral. Lo que no se
 * ve: Svelte indexa las listas por clave, y una clave duplicada no desordena
 * la lista — la rompe. Un id repetido puede tumbar el renderizado del menú
 * entero, y el síntoma («el panel no carga») no apunta a un manifiesto de
 * grimoire.
 *
 * ── POR QUE ESTA PRUEBA NO USA LA BASE ─────────────────────────────────────
 *
 * `buildAdminRegistry()` necesita base de datos, y en el entorno de pruebas
 * eso es pg-mem, que devuelve una lista vacía: una prueba que recorre cero
 * kons pasa siempre. Así que se comprueba lo mismo desde los manifiestos, que
 * es donde está la causa, y se exige además que el ensamblado tenga el
 * control.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const GRIMOIRES = join(RAIZ, "packages", "grimoires");
const REGISTRO = join(RAIZ, "apps", "api", "src", "services", "admin-registry.ts");

/** Qué kons reclama cada grimoire. */
function reclamados(): Map<string, string[]> {
  const porKon = new Map<string, string[]>();
  if (!existsSync(GRIMOIRES)) return porKon;

  for (const dir of readdirSync(GRIMOIRES)) {
    const manifiesto = join(GRIMOIRES, dir, "grimoire.json");
    if (!existsSync(manifiesto)) continue;

    let g: { id?: string; kons?: string[] };
    try {
      g = JSON.parse(readFileSync(manifiesto, "utf-8"));
    } catch {
      continue;
    }

    for (const konId of g.kons ?? []) {
      porKon.set(konId, [...(porKon.get(konId) ?? []), g.id || dir]);
    }
  }

  return porKon;
}

describe("el registro no repite kons", () => {
  const porKon = reclamados();

  it("se han leído grimoires", () => {
    expect(porKon.size, "no se leyó ningún grimoire con kons").toBeGreaterThan(0);
  });

  it("compartir un kon entre grimoires es normal y está permitido", () => {
    /**
     * Esto NO es lo que se persigue: un kon en varios grimoires es legítimo —
     * `kon-dms` sirve igual a un grimoire corporativo que a uno de documentos.
     * Se comprueba que el caso existe de verdad, porque si dejara de existir
     * la prueba de abajo dejaría de vigilar nada.
     */
    const compartidos = [...porKon].filter(([, gs]) => gs.length > 1);

    expect(
      compartidos.length,
      "ya no hay ningún kon en dos grimoires; esta prueba y la siguiente " +
        "dejaron de tener caso que vigilar."
    ).toBeGreaterThan(0);
  });

  it("el ensamblado descarta lo que ya registró", () => {
    const fuente = readFileSync(REGISTRO, "utf-8");

    /**
     * Se ancla en `const yaRegistrados` y se avanza desde ahí. La primera
     * versión cortaba desde `for (const grimoire of grimoires) {`, que aparece
     * ANTES —hay otro bucle igual que solo junta ids— así que el trozo
     * analizado quedaba vacío y la prueba fallaba con el código correcto.
     * Un corte mal puesto hace que el guardián mire donde no es.
     */
    const desde = fuente.indexOf("const yaRegistrados");
    expect(desde, "no se encontró el control de ya-registrados").toBeGreaterThan(-1);

    const bucle = fuente.slice(desde, desde + 1200);

    expect(
      bucle.includes("yaRegistrados"),
      "sin un control de ya-registrados, un kon en tres grimoires genera tres " +
        "entradas idénticas con el mismo id."
    ).toBe(true);

    expect(
      /if \(yaRegistrados\.has\([^)]+\)\) continue;/.test(bucle),
      "el bucle tiene que saltarse los kons que ya tienen configuración."
    ).toBe(true);
  });
});
