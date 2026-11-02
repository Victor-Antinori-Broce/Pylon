/**
 * El tema no es el grimoire
 * ============================================================================
 *
 * En `packages/grimoires/<id>/` hay dos manifiestos y se parecen lo bastante
 * como para confundirse: los dos traen `id`, `name` y `version`.
 *
 *   grimoire.json → type: "grimoire", id: "grimoire-viggo", kons: [...]
 *   kitsuden.json → type: "theme",    id: "kitsuden-viggo", css_entry
 *
 * Seis sitios leían el segundo como respaldo del primero sin comprobar cuál
 * era cuál. Como el tema no tiene `kons`, un `grimoire.json` ausente o roto no
 * daba error: daba un grimoire con el id del tema y con CERO kons montados.
 *
 * Lo que se protege aquí es justo eso: que el respaldo siga existiendo para
 * los grimoires heredados que solo traen kitsuden.json, pero que NUNCA acepte
 * el tema en su lugar.
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  leerKonsDelGrimoire,
  leerManifiestoGrimoire,
  manifiestoEsDeTipo,
} from "../../apps/api/src/lib/grimoire-manifest";

const RAIZ = join(__dirname, "..", "..");
const GRIMOIRES = join(RAIZ, "packages", "grimoires");

const temporales: string[] = [];

/** Crea un directorio de grimoire de mentira con los ficheros que se le pasen. */
function dirConManifiestos(ficheros: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "kitsuden-grimoire-"));
  temporales.push(dir);
  for (const [nombre, contenido] of Object.entries(ficheros)) {
    writeFileSync(
      join(dir, nombre),
      typeof contenido === "string" ? contenido : JSON.stringify(contenido)
    );
  }
  return dir;
}

afterAll(() => {
  for (const dir of temporales) rmSync(dir, { recursive: true, force: true });
});

const TEMA = {
  id: "kitsuden-viggo",
  name: "Viggo",
  version: "1.0.0",
  type: "theme",
  css_entry: "variables.css",
};

const GRIMOIRE = {
  id: "grimoire-viggo",
  name: "Viggo",
  version: "1.0.0",
  type: "grimoire",
  kons: ["kon-esports", "kon-broadcast"],
};

describe("manifiestoEsDeTipo", () => {
  it("rechaza el manifiesto de tema cuando se espera un grimoire", () => {
    expect(manifiestoEsDeTipo(TEMA, "grimoire")).toBe(false);
  });

  it("acepta el manifiesto de grimoire", () => {
    expect(manifiestoEsDeTipo(GRIMOIRE, "grimoire")).toBe(true);
  });

  it("acepta un manifiesto heredado sin `type`", () => {
    // La forma antigua no declaraba tipo. Rechazarla rompería grimoires de
    // terceros que hoy cargan bien, y el respaldo existe precisamente por ellos.
    expect(manifiestoEsDeTipo({ id: "algo", name: "Algo" }, "grimoire")).toBe(true);
  });

  it("rechaza lo que no es un objeto con id", () => {
    expect(manifiestoEsDeTipo(null, "grimoire")).toBe(false);
    expect(manifiestoEsDeTipo("grimoire-viggo", "grimoire")).toBe(false);
    expect(manifiestoEsDeTipo({ name: "sin id" }, "grimoire")).toBe(false);
    expect(manifiestoEsDeTipo({ id: "" }, "grimoire")).toBe(false);
  });

  it("separa kon de grimoire en ambos sentidos", () => {
    expect(manifiestoEsDeTipo({ id: "kon-crm", type: "kon" }, "kon")).toBe(true);
    expect(manifiestoEsDeTipo({ id: "kon-crm", type: "kon" }, "grimoire")).toBe(false);
    expect(manifiestoEsDeTipo(GRIMOIRE, "kon")).toBe(false);
  });
});

describe("leerManifiestoGrimoire", () => {
  it("prefiere grimoire.json aunque kitsuden.json esté al lado", async () => {
    const dir = dirConManifiestos({ "grimoire.json": GRIMOIRE, "kitsuden.json": TEMA });

    const leido = await leerManifiestoGrimoire(dir);

    expect(leido?.id).toBe("grimoire-viggo");
    expect(leido?.kons).toEqual(["kon-esports", "kon-broadcast"]);
  });

  it("NO cae en el tema cuando falta grimoire.json", async () => {
    // Esta es la regresión. Antes devolvía el tema: id "kitsuden-viggo" y
    // cero kons, sin error, y el grimoire quedaba registrado en falso.
    const dir = dirConManifiestos({ "kitsuden.json": TEMA });

    expect(await leerManifiestoGrimoire(dir)).toBeNull();
    expect(await leerKonsDelGrimoire(dir)).toEqual([]);
  });

  it("NO cae en el tema cuando grimoire.json está corrupto", async () => {
    const dir = dirConManifiestos({ "grimoire.json": "{ esto no es json", "kitsuden.json": TEMA });

    expect(await leerManifiestoGrimoire(dir)).toBeNull();
  });

  it("sigue aceptando el kitsuden.json de un grimoire heredado", async () => {
    const dir = dirConManifiestos({
      "kitsuden.json": { id: "grimoire-antiguo", name: "Antiguo", bundled_modules: ["kon-blog"] },
    });

    expect((await leerManifiestoGrimoire(dir))?.id).toBe("grimoire-antiguo");
    expect(await leerKonsDelGrimoire(dir)).toEqual(["kon-blog"]);
  });

  it("devuelve null si no hay ningún manifiesto", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kitsuden-vacio-"));
    temporales.push(dir);
    mkdirSync(join(dir, "sub"), { recursive: true });

    expect(await leerManifiestoGrimoire(dir)).toBeNull();
  });
});

describe("los grimoires reales del repositorio", () => {
  const IDS = [
    "grimoire-corporate",
    "grimoire-default",
    "grimoire-gremius",
    "grimoire-sharepoint",
    "grimoire-vekdocs",
    "grimoire-viggo",
  ];

  it.each(IDS)("%s resuelve a su propio id, no al del tema", async (id) => {
    const manifiesto = await leerManifiestoGrimoire(join(GRIMOIRES, id));

    expect(manifiesto).not.toBeNull();
    expect(manifiesto!.id).toBe(id);
    expect(manifiesto!.type).toBe("grimoire");
    // El id del tema empieza por "kitsuden-" (o es "sharepoint"): si alguna vez
    // vuelve a colarse, esto lo caza.
    expect(manifiesto!.id.startsWith("kitsuden-")).toBe(false);
  });
});
