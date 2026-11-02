/**
 * El contrato de `Modal`: sin `open` no se ve NADA
 * ============================================================================
 *
 * Este fichero existe por un fallo concreto y caro de encontrar.
 *
 * `Modal` tiene su propia puerta (`{#if open}`), y `open` vale `false` por
 * defecto. Cinco sitios del admin lo usaban así:
 *
 *     {#if showMediaModal}
 *       <Modal title="…" onClose={…}>   <!-- sin `open` -->
 *
 * Parece correcto y compila: el componente se monta cuando toca. Pero dentro,
 * su propio `open` sigue en `false`, así que no pinta nada. El síntoma es el
 * peor posible — **el botón no hace nada**: no hay error, no hay consola, no
 * hay pista. El botón de insertar imagen en el editor del blog llevaba así
 * desde que se escribió, junto con «Manage Tags», «Nueva categoría» y los dos
 * asistentes de crear desde un dataset.
 *
 * Se prueban las dos mitades:
 *   1. El COMPORTAMIENTO del componente, para que quede escrito por qué el
 *      olvido es invisible.
 *   2. Que NINGÚN sitio del admin lo vuelva a omitir. Esto último es lo que de
 *      verdad evita la recaída, porque el fallo no está en `Modal` — está en
 *      quien lo llama.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";

import Modal from "./Modal.svelte";

describe("el contrato de Modal", () => {
  it("SIN `open` no pinta nada, ni siquiera el título", () => {
    render(Modal, { props: { title: "Insertar imagen en el texto" } });
    expect(screen.queryByText("Insertar imagen en el texto")).toBeNull();
  });

  it("con `open` sí se ve", () => {
    render(Modal, { props: { open: true, title: "Insertar imagen en el texto" } });
    expect(screen.getByText("Insertar imagen en el texto")).toBeTruthy();
  });

  it("`open: false` tampoco pinta: el defecto no es una casualidad", () => {
    render(Modal, { props: { open: false, title: "Nada" } });
    expect(screen.queryByText("Nada")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const SRC = join(import.meta.dirname, "..", "..", "..");

function svelteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...svelteFiles(full));
    else if (entry.name.endsWith(".svelte")) out.push(full);
  }
  return out;
}

/** Cada `<Modal …>` del fichero, con su etiqueta de apertura completa. */
function modalTags(source: string): string[] {
  const tags: string[] = [];
  const re = /<Modal(\s|>|\/)/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(source)) !== null) {
    // Hasta el `>` que cierra la etiqueta de apertura, saltándose los que
    // vayan dentro de una expresión `{...}` (p. ej. `{a ? "x" : "y"}`).
    let depth = 0;
    let end = match.index;
    for (let i = match.index; i < source.length; i += 1) {
      const char = source[i];
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0) {
        end = i;
        break;
      }
    }
    tags.push(source.slice(match.index, end + 1));
  }
  return tags;
}

describe("nadie olvida `open`", () => {
  it("todo `<Modal>` del admin lo recibe", () => {
    const culprits: string[] = [];

    for (const file of svelteFiles(SRC)) {
      // El propio Modal no se llama a sí mismo; Dialog lo envuelve con
      // `bind:open`, que también cuenta.
      if (file.endsWith("Modal.svelte")) continue;

      const source = readFileSync(file, "utf8");
      for (const tag of modalTags(source)) {
        if (!/\bopen\b/.test(tag)) {
          culprits.push(`${file.replace(SRC, "src")}: ${tag.slice(0, 60)}…`);
        }
      }
    }

    expect(
      culprits,
      `Estos <Modal> no reciben \`open\`, así que NO SE VEN NUNCA:\n${culprits.join("\n")}`
    ).toEqual([]);
  });
});
