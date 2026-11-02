/**
 * Todo kon se comprueba
 * ============================================================================
 *
 * `pnpm typecheck` es `pnpm -r --no-bail typecheck`: recorre los paquetes y
 * ejecuta ESE script. Un paquete que no lo declara no falla — simplemente no
 * se mira. Durante un tiempo 13 de los 29 kons estaban así, y el resultado fue
 * el peor posible: `pnpm typecheck` decía "0 errores" mientras dos archivos de
 * `kon-blog` y `kon-dms` ni siquiera parseaban (un import había quedado dentro
 * de otro import). Un verde que miente es peor que un rojo.
 *
 * Esta prueba exige que cada kon publicable declare `typecheck` y tenga el
 * `tsconfig.json` que necesita para ejecutarlo. No comprueba los tipos —de eso
 * ya se encarga `tsc`—, comprueba que ALGUIEN los comprueba.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { HAY_KONS_INSTALADOS } from "./helpers/kons-conocidos";

const RAIZ = join(__dirname, "..", "..");
const KONS = join(RAIZ, "packages", "kons");

/** Kons reales: carpeta con package.json. */
function listarKons(): string[] {
  return readdirSync(KONS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(KONS, e.name, "package.json")))
    .map((e) => e.name);
}

describe("cobertura de typecheck en los kons", () => {
  it.skipIf(!HAY_KONS_INSTALADOS)("hay kons que inspeccionar", () => {
    // Si el descubrimiento se rompe, las dos pruebas de abajo pasarían con la
    // lista vacía y este archivo dejaría de proteger nada, en silencio.
    expect(listarKons().length).toBeGreaterThan(20);
  });

  it("todos declaran el script typecheck", () => {
    const sinScript = listarKons().filter((kon) => {
      const pkg = JSON.parse(readFileSync(join(KONS, kon, "package.json"), "utf8"));
      return !pkg.scripts?.typecheck;
    });

    expect(
      sinScript,
      `Estos kons no declaran "typecheck", así que \`pnpm -r typecheck\` los ` +
        `SALTA y su verde no significa nada. Añade ` +
        `"typecheck": "tsc --noEmit" a su package.json. Kons: ${sinScript.join(", ")}`
    ).toEqual([]);
  });

  it("todos tienen el tsconfig que ese script necesita", () => {
    const sinConfig = listarKons().filter((kon) => !existsSync(join(KONS, kon, "tsconfig.json")));

    expect(
      sinConfig,
      `Sin tsconfig.json propio, \`tsc --noEmit\` en el kon hereda lo que ` +
        `encuentre hacia arriba y comprueba un conjunto de archivos que no es ` +
        `el suyo. Kons: ${sinConfig.join(", ")}`
    ).toEqual([]);
  });
});
