/**
 * `/g/<id>` no bloquea lo que no es un kon
 * ============================================================================
 *
 * `GrimoirePage` enseña «Este kon no está activado» cuando el kon está apagado.
 * Sin eso, entrar a un kon apagado pintaba su explorador con «0 records» y un
 * botón «Agregar» que abría un formulario quejándose de una tabla inexistente:
 * el error hablaba de la tabla cuando lo que faltaba era el kon.
 *
 * ── PERO NO TODO LO QUE CUELGA DE `/g/` ES UN KON ──────────────────────────
 *
 * `grimoire-loader.ts` registra vistas del SISTEMA por clave —`system-tools-editor`,
 * `system-tools-builder`, `system-tools-agents`— y el editor de contenido vive
 * en `/g/system-tools/editor`. `system-tools` no aparece en la tabla `modules`
 * porque no es un kon.
 *
 * La primera versión de la comprobación no lo distinguía, así que el editor de
 * blog pasó a responder «Este kon no está activado». Se rompió una pantalla que
 * funcionaba al arreglar otra — y dos rondas antes ya estaba escrito en
 * `routes/content/edit/+page.ts` que `system-tools` NO es un kon, precisamente
 * para no cometer ese error.
 *
 * Por eso la condición tiene DOS mitades y esta prueba vigila que sigan las dos.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sinComentarios } from "./helpers/comentarios";

const RAIZ = join(__dirname, "..", "..");
const PAGINA = join(
  RAIZ,
  "packages",
  "admin",
  "src",
  "lib",
  "components",
  "admin",
  "GrimoirePage.svelte"
);
const CARGADOR = join(RAIZ, "packages", "admin", "src", "lib", "grimoire-loader.ts");

describe("pantalla de kon", () => {
  const pagina = sinComentarios(readFileSync(PAGINA, "utf-8"));

  it("comprueba si el id es de un kon antes de bloquear", () => {
    expect(
      /esUnKon/.test(pagina),
      "GrimoirePage vuelve a decidir el bloqueo solo con `enabledKeys`. Los ids " +
        "que sirve el registro de vistas del sistema (system-tools/editor, " +
        "system-tools/builder) no están en `modules`, así que se bloquearían " +
        "pantallas que funcionan."
    ).toBe(true);

    // La condición tiene que ABRIR cuando no es un kon, no cerrar.
    const linea = pagina.split("\n").find((l) => l.includes("!esUnKon"));
    expect(
      linea,
      "`konActivado` debe empezar por `!esUnKon`: si el id no es de un kon, esta " +
        "pantalla no tiene nada que decir sobre su activación."
    ).toBeTruthy();
  });

  it("system-tools sigue siendo una clave del registro de vistas", () => {
    // Si esto desapareciera, la excepción de arriba ya no haría falta — pero
    // habría que comprobar que el editor de contenido no se quedó sin destino.
    const cargador = readFileSync(CARGADOR, "utf-8");
    expect(
      cargador.includes('"system-tools-editor"'),
      "ya no existe la vista `system-tools-editor`: revisa a dónde redirige " +
        "/content/edit antes de dar por buena esta prueba."
    ).toBe(true);
  });
});
