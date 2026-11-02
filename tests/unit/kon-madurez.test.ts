/**
 * Cada kon declara su madurez
 * ============================================================================
 *
 * `madurez` dice cuánto uso real tiene un kon: «estable» (en producción de
 * punta a punta), «beta» (funciona y tiene tests, con huecos o poco uso real)
 * o «experimental» (nadie lo ha usado de punta a punta). El README, CORE.md y
 * la insignia del panel (vista Kons) salen de este campo, así que un kon sin
 * él se anunciaría como si fuera tan fiable como el blog.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { HAY_KONS_INSTALADOS } from "./helpers/kons-conocidos";

const RAIZ = join(__dirname, "..", "..");
const NIVELES = ["estable", "beta", "experimental"];

function manifiestos(carpeta: string): Array<[string, Record<string, unknown>]> {
  const dir = join(RAIZ, "packages", carpeta);
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "kon.json")))
    .map((e) => [
      `${carpeta}/${e.name}`,
      JSON.parse(readFileSync(join(dir, e.name, "kon.json"), "utf8")),
    ]);
}

// Los instalados (packages/kons, copias de kitsuden-kons) y los del núcleo.
const instalados = manifiestos("kons");
const delNucleo = manifiestos("core");
const todos = [...instalados, ...delNucleo];

describe("madurez de los kons", () => {
  it("hay manifiestos que revisar", () => {
    // Sin kons instalados quedan los tres del núcleo.
    expect(todos.length).toBeGreaterThan(HAY_KONS_INSTALADOS ? 20 : 2);
  });

  it.each(todos)("%s declara una madurez válida", (_ruta, manifiesto) => {
    expect(NIVELES).toContain(manifiesto.madurez);
  });

  it("el esquema la exige y solo admite los tres niveles", () => {
    const esquema = JSON.parse(
      readFileSync(join(RAIZ, "packages", "schemas", "kon-schema.json"), "utf8")
    );
    expect(esquema.required).toContain("madurez");
    expect(esquema.properties.madurez.enum).toEqual(NIVELES);
  });

  it("CORE.md lista cada módulo del núcleo con la misma madurez que su kon.json", () => {
    // La tabla de los kons instalables vive en el README de kitsuden-kons.
    const core = readFileSync(join(RAIZ, "CORE.md"), "utf8");
    for (const [, m] of delNucleo) {
      const fila = new RegExp(`\\|\\s*\`${m.id}\`\\s*\\|\\s*${m.madurez}\\s*\\|`);
      expect(core, `${m.id} (${m.madurez}) en CORE.md`).toMatch(fila);
    }
  });
});
