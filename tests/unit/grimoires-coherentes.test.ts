/**
 * Lo que un grimoire promete es lo que trae
 * ============================================================================
 *
 * Un grimoire es una lista de kons con una descripción que dice para qué sirve.
 * Nada comprobaba que las dos cosas se parecieran, y no se parecían:
 *
 *   · `grimoire-sharepoint` prometía «document libraries» y traía CERO kons.
 *   · `grimoire-corporate` prometía «document management, employee
 *     directories» y traía solo kon-crm.
 *   · `grimoire-gremius` no incluía kon-comments pese a decir que sirve para
 *     wikis, donde los comentarios son media razón de visitar la página.
 *   · `grimoire-viggo` listaba kon-broadcast DOS veces: como obligatorio y
 *     otra vez como opcional.
 *
 * Ninguna de esas cuatro daba error en ningún sitio. Se veían mirando la
 * tarjeta del grimoire y contando.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { estadoDelKon } from "./helpers/kons-conocidos";

const RAIZ = join(__dirname, "..", "..");
const GRIMOIRES = join(RAIZ, "packages", "grimoires");
const KONS = join(RAIZ, "packages", "kons");
const CORE = join(RAIZ, "packages", "core");

interface Grimoire {
  id: string;
  description?: string;
  kons?: string[];
  optional_kons?: string[];
}

function listarGrimoires(): Array<[string, Grimoire]> {
  return readdirSync(GRIMOIRES, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(GRIMOIRES, e.name, "grimoire.json")))
    .map((e) => [
      e.name,
      JSON.parse(readFileSync(join(GRIMOIRES, e.name, "grimoire.json"), "utf8")) as Grimoire,
    ]);
}

/** ¿Existe este kon? Los del núcleo viven en packages/core con otro nombre. */
function konExiste(id: string): boolean {
  if (existsSync(join(KONS, id)) || existsSync(join(CORE, id.replace(/^kon-/, "")))) return true; // kon-media → core/media
  // Desde la fase C un kon puede no estar instalado y existir (repo
  // kitsuden-kons): se mira el checkout hermano y, sin él, no se puede saber.
  return estadoDelKon(id) !== "no-existe";
}

const grimoires = listarGrimoires();

describe("los grimoires del repositorio", () => {
  it("hay grimoires que revisar", () => {
    expect(grimoires.length).toBeGreaterThan(3);
  });

  it.each(grimoires.map(([d, g]) => [d, g] as const))(
    "%s: no repite un kon entre obligatorios y opcionales",
    (_dir, g) => {
      // Viggo tenía kon-broadcast en las dos listas. La tarjeta lo contaba dos
      // veces y no está claro qué significa «opcional» para algo obligatorio.
      const repetidos = (g.optional_kons ?? []).filter((k) => (g.kons ?? []).includes(k));

      expect(repetidos).toEqual([]);
    }
  );

  it.each(grimoires.map(([d, g]) => [d, g] as const))(
    "%s: no repite un kon dentro de la misma lista",
    (_dir, g) => {
      for (const lista of [g.kons ?? [], g.optional_kons ?? []]) {
        expect(new Set(lista).size).toBe(lista.length);
      }
    }
  );

  it.each(grimoires.map(([d, g]) => [d, g] as const))(
    "%s: todos los kons que nombra existen",
    (_dir, g) => {
      const fantasmas = [...(g.kons ?? []), ...(g.optional_kons ?? [])].filter(
        (k) => !konExiste(k)
      );

      expect(
        fantasmas,
        `Nombra kons que no están en el disco. Pasó al fusionar los cuatro ` +
          `kon-broadcast-* en kon-broadcast: las listas se quedaron apuntando ` +
          `a carpetas borradas. Kons: ${fantasmas.join(", ")}`
      ).toEqual([]);
    }
  );

  it.each(grimoires.map(([d, g]) => [d, g] as const))(
    "%s: usa el id completo del kon, con su prefijo",
    (_dir, g) => {
      // Sin prefijo la clave no casa con ningún manifiesto, y ahí empezaba la
      // cadena de entradas fantasma en la pantalla de Kons.
      const sinPrefijo = [...(g.kons ?? []), ...(g.optional_kons ?? [])].filter(
        (k) => !k.startsWith("kon-")
      );

      expect(sinPrefijo).toEqual([]);
    }
  );
});

describe("lo que la descripción promete", () => {
  /**
   * Palabra en la descripción → kon que la cumple.
   *
   * Deliberadamente corto: solo lo que es inequívoco. No pretende adivinar la
   * composición de un grimoire, solo cazar el caso en que su propio texto
   * nombra una función y la lista no la trae.
   */
  const PROMESAS: Array<{ patron: RegExp; kon: string; que: string }> = [
    { patron: /document (management|librar)/i, kon: "kon-dms", que: "gestión documental" },
    { patron: /employee director/i, kon: "kon-directory", que: "directorio de empleados" },

    // AQUÍ SOLO VAN KONS `optional`, y el motivo importa.
    //
    // La primera versión de esta tabla exigía «contenido editorial → kon-blog»
    // y con ella añadí kon-blog a grimoire-gremius. Rompió
    // core-no-pertenece-a-marca.test.ts, que tiene razón: kon-blog es
    // `core-den`, viene encendido con TODA instalación, y una marca no puede
    // reclamar algo que ya tiene todo el mundo. Gremius cumple esa promesa sin
    // listarlo.
    //
    // Solo tiene sentido exigir lo que hay que encender a propósito.
  ];

  it.each(grimoires.map(([d, g]) => [d, g] as const))("%s cumple lo que dice", (_dir, g) => {
    const incluidos = new Set([...(g.kons ?? []), ...(g.optional_kons ?? [])]);
    const incumplidas = PROMESAS.filter(
      (p) => p.patron.test(g.description ?? "") && !incluidos.has(p.kon)
    ).map((p) => `promete ${p.que} pero no incluye ${p.kon}`);

    expect(incumplidas).toEqual([]);
  });
});
