/**
 * Un kon core no puede pertenecer a un grimoire
 * ============================================================================
 *
 * ── LA INVARIANTE ──────────────────────────────────────────────────────────
 *
 * Un kon `core` (o `core-den`) viene con TODA instalación y está encendido por
 * defecto. Un grimoire es una MARCA —Gremius, Viggo, Corporate— y sus kons se
 * encienden cuando esa marca está activa.
 *
 * Las dos cosas a la vez no significan nada: «viene siempre» y «viene con esta
 * marca» se contradicen.
 *
 * ── QUE PASABA ─────────────────────────────────────────────────────────────
 *
 * `kon-blog` estaba declarado como `core-den` en el registro Y listado entre
 * los kons de `grimoire-gremius`. Eso producía dos efectos, los dos raros:
 *
 *   1. El panel enseñaba DOS tarjetas del mismo kon —«kon-blog» (core) y
 *      «blog» (grimoire)—, cada una con su botón de apagar.
 *   2. La tarjeta de un kon core aparecía con `grimoireId: grimoire-gremius`,
 *      es decir, un kon que viene con todo el mundo marcado como propiedad de
 *      una marca concreta.
 *
 * La deduplicación por clave canónica tapó lo primero. Esta prueba impide lo
 * segundo, que es la causa: mientras la contradicción esté en los datos, cada
 * capa que los lea tiene que decidir cuál de las dos verdades se cree.
 *
 * ── LO QUE SI VALE ─────────────────────────────────────────────────────────
 *
 * Un grimoire puede reclamar kons `optional` o `grimoire` — eso es justo para
 * lo que sirve: `grimoire-corporate` enciende `kon-crm`, que por defecto está
 * apagado. Lo que no puede reclamar es algo que ya viene encendido siempre.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const REGISTRO = join(RAIZ, "apps", "api", "src", "services", "module-registry.ts");
const GRIMOIRES = join(RAIZ, "packages", "grimoires");

/** Categoría declarada de cada kon en el registro estático. */
function categoriasDelRegistro(): Map<string, string> {
  const fuente = readFileSync(REGISTRO, "utf-8");
  const cats = new Map<string, string>();

  for (const m of fuente.matchAll(/key:\s*"([^"]+)"([\s\S]*?)category:\s*"([^"]+)"/g)) {
    // La primera aparición manda: el `[\s\S]*?` no cruza a la entrada
    // siguiente porque es perezoso, pero si alguna entrada no declarara
    // categoría se colaría la de la de al lado. Quedarse con la primera evita
    // que eso cambie una categoría ya leída.
    if (!cats.has(m[1])) cats.set(m[1], m[3]);
  }

  return cats;
}

describe("core y grimoire son excluyentes", () => {
  const categorias = categoriasDelRegistro();

  it("el registro se ha podido leer", () => {
    expect(
      categorias.size,
      "no se extrajo ninguna categoría de `module-registry.ts`. Si cambió el " +
        "formato, esta prueba pasaría vacía y no vigilaría nada."
    ).toBeGreaterThan(5);
  });

  it("ningún grimoire reclama un kon core", () => {
    const problemas: string[] = [];

    for (const dir of readdirSync(GRIMOIRES)) {
      const manifiesto = join(GRIMOIRES, dir, "grimoire.json");
      if (!existsSync(manifiesto)) continue;

      let g: { id?: string; kons?: string[] };
      try {
        g = JSON.parse(readFileSync(manifiesto, "utf-8"));
      } catch {
        continue;
      }

      for (const kon of g.kons ?? []) {
        const categoria = categorias.get(kon);
        if (categoria === "core" || categoria === "core-den") {
          problemas.push(
            `${g.id ?? dir} reclama \`${kon}\`, que está declarado como ` +
              `\`${categoria}\` en el registro. Un kon core viene con toda ` +
              `instalación y ya está encendido por defecto: que además sea de ` +
              `una marca hace que el panel lo trate como dos kons distintos y ` +
              `que su tarjeta salga marcada como propiedad de un grimoire. ` +
              `Quítalo de la lista del grimoire, o cámbiale la categoría.`
          );
        }
      }
    }

    expect(problemas, problemas.join("\n\n")).toEqual([]);
  });

  it("`kon-blog` sigue siendo core y de nadie más", () => {
    /**
     * El caso concreto que se corrigió, escrito aparte para que si alguien
     * vuelve a meter blog en un grimoire el mensaje diga exactamente eso en vez
     * de un fallo genérico.
     */
    expect(["core", "core-den"]).toContain(categorias.get("kon-blog"));

    const gremius = JSON.parse(
      readFileSync(join(GRIMOIRES, "grimoire-gremius", "grimoire.json"), "utf-8")
    ) as { kons?: string[] };

    expect(
      gremius.kons ?? [],
      "el blog es del CMS, no de Gremius: publicar contenido lo hace toda " +
        "instalación, con marca o sin ella."
    ).not.toContain("kon-blog");
  });
});
