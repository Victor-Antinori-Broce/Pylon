/**
 * Una clase con `display` propio no puede anular el atributo `hidden`
 * ============================================================================
 *
 * ── EL FALLO ───────────────────────────────────────────────────────────────
 *
 * `[hidden] { display: none }` vive en la hoja del NAVEGADOR, y cualquier
 * regla de autor le gana. Así que basta con que la clase del elemento declare
 * su propio `display` para que el atributo deje de hacer nada:
 *
 *     .nueva { display: flex; }     →   <form class="nueva" hidden>   se ve
 *     .row   { display: flex; }     →   <div  class="row"   hidden>   se ve
 *
 * En el editor de tier lists eso dejaba el formulario de «Nueva tier list»
 * abierto SIEMPRE, encajado entre la cabecera y el tablero, se hubiera pulsado
 * el botón o no — y «Cancelar» no cerraba nada: ponía el atributo que ya
 * estaba puesto. En `scoreboard.js`, el marcador vacío y los botones de
 * pantalla seguían a la vista junto al aviso de que no hay partido.
 *
 * ── POR QUE ES DIFICIL DE VER ──────────────────────────────────────────────
 *
 * Porque el JavaScript es correcto y no falla: `form.hidden = true` deja el
 * atributo puesto, `el.hidden` devuelve `true`, y hasta las pruebas que
 * comprueban `expect(el.hidden).toBe(true)` pasan. Lo único que no ocurre es
 * que se oculte. No hay error, no hay traza, y el síntoma —«la pantalla sale
 * rara»— no apunta a la CSS.
 *
 * ── LA REGLA ───────────────────────────────────────────────────────────────
 *
 * Todo artefacto de vista que use el atributo declara `[hidden]` con
 * `!important` en su propia hoja. Una línea, y cubre también las clases que
 * alguien añada mañana.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { HAY_KONS_INSTALADOS } from "./helpers/kons-conocidos";

const RAIZ = join(__dirname, "..", "..");
const KONS = join(RAIZ, "packages", "kons");

/** Los artefactos de vista de admin que aporta cada kon. */
function artefactos(): { kon: string; fichero: string; fuente: string }[] {
  const encontrados: { kon: string; fichero: string; fuente: string }[] = [];

  for (const kon of readdirSync(KONS)) {
    const dir = join(KONS, kon, "admin");
    if (!existsSync(dir)) continue;

    for (const fichero of readdirSync(dir)) {
      if (!fichero.endsWith(".js")) continue;
      encontrados.push({ kon, fichero, fuente: readFileSync(join(dir, fichero), "utf-8") });
    }
  }

  return encontrados;
}

/** Clases cuya regla declara `display`. Son las que pisan el atributo. */
function clasesConDisplay(fuente: string): Set<string> {
  const clases = new Set<string>();

  for (const regla of fuente.matchAll(/\.([a-zA-Z0-9_-]+)[^{}]*\{([^}]*)\}/g)) {
    if (/(^|[;\s])display\s*:/.test(regla[2])) clases.add(regla[1]);
  }

  return clases;
}

/** Elementos del marcado que llevan `hidden` Y una clase, en cualquier orden. */
function ocultosConClase(fuente: string): string[] {
  const clases: string[] = [];

  for (const re of [
    /<[a-z0-9]+[^>]*\bclass="([^"]+)"[^>]*\bhidden\b/g,
    /<[a-z0-9]+[^>]*\bhidden\b[^>]*\bclass="([^"]+)"/g,
  ]) {
    for (const m of fuente.matchAll(re)) clases.push(...m[1].split(/\s+/));
  }

  return clases;
}

describe("el atributo `hidden` oculta de verdad", () => {
  const todos = artefactos();

  it.skipIf(!HAY_KONS_INSTALADOS)("se han encontrado artefactos que revisar", () => {
    /**
     * Sin esto, mover o renombrar la carpeta `admin/` dejaría la prueba
     * recorriendo una lista vacía y pasando en verde sin mirar nada.
     */
    expect(todos.length, "no se localizó ningún artefacto de vista").toBeGreaterThan(3);
  });

  for (const { kon, fichero, fuente } of todos) {
    const usaHidden = /\bhidden\b/.test(fuente);
    if (!usaHidden) continue;

    it(`${kon}/${fichero}`, () => {
      const conDisplay = clasesConDisplay(fuente);
      const enPeligro = [...new Set(ocultosConClase(fuente))].filter((c) => conDisplay.has(c));

      // Si nadie choca, no se exige nada: la regla solo hace falta donde puede
      // pisarse, y pedirla en todas partes sería ruido.
      if (enPeligro.length === 0) return;

      expect(
        /\[hidden\]\s*\{[^}]*display\s*:\s*none[^}]*!important/.test(fuente),
        `Las clases ${enPeligro.map((c) => `.${c}`).join(", ")} declaran su ` +
          `propio \`display\` y se usan con el atributo \`hidden\`, que en ese ` +
          `elemento no oculta nada: la hoja del navegador pierde contra la del ` +
          `autor. El JS seguirá poniendo el atributo sin error y sin efecto. ` +
          `Añade \`[hidden] { display: none !important; }\` a la hoja de este ` +
          `artefacto.`
      ).toBe(true);
    });
  }
});
