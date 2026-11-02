/**
 * Un kon que no carga tiene que notarse
 * ============================================================================
 *
 * `readKonManifest` terminaba en un `catch { return null }` que envolvía la
 * función entera. Con eso, tres situaciones muy distintas producían el mismo
 * resultado exacto y ninguna decía nada:
 *
 *   - el directorio no es un kon        → correcto, es lo normal
 *   - el kon.json tiene una coma de más → el kon desaparece del arranque
 *   - el fichero no se puede leer       → el kon desaparece del arranque
 *
 * Las dos últimas son averías. Estas pruebas fijan que se avisen, y que un
 * manifiesto que no declara un kon no se cuele como si lo fuera.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { leerManifiestoKon } from "../../apps/api/src/lib/grimoire-manifest";

const temporales: string[] = [];

function dirCon(ficheros: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "kitsuden-kon-"));
  temporales.push(dir);
  for (const [nombre, contenido] of Object.entries(ficheros)) {
    writeFileSync(join(dir, nombre), contenido);
  }
  return dir;
}

afterAll(() => {
  for (const dir of temporales) rmSync(dir, { recursive: true, force: true });
});

let avisos: string[] = [];

beforeEach(() => {
  avisos = [];
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    avisos.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lectura del manifiesto de un kon", () => {
  it("lee un kon.json correcto sin decir nada", async () => {
    const dir = dirCon({
      "kon.json": JSON.stringify({ id: "kon-prueba", name: "Prueba", type: "kon" }),
    });

    expect((await leerManifiestoKon(dir))?.id).toBe("kon-prueba");
    expect(avisos).toEqual([]);
  });

  it("avisa cuando el kon.json está roto, en vez de tragárselo", async () => {
    const dir = dirCon({ "kon.json": '{ "id": "kon-roto",, }' });

    expect(await leerManifiestoKon(dir)).toBeNull();
    expect(avisos.join("\n")).toContain("no es JSON válido");
  });

  it("distingue 'no hay manifiesto' de 'el manifiesto está roto'", async () => {
    // Sin kon.json no pasa nada malo: la mayoría de directorios no son kons.
    const dir = dirCon({ "otra-cosa.txt": "hola" });

    expect(await leerManifiestoKon(dir)).toBeNull();
    expect(avisos).toEqual([]);
  });

  it("no acepta como kon un manifiesto que declara otra cosa", async () => {
    const dir = dirCon({
      "kon.json": JSON.stringify({ id: "kitsuden-viggo", name: "Viggo", type: "theme" }),
    });

    expect(await leerManifiestoKon(dir)).toBeNull();
    expect(avisos.join("\n")).toContain("no declara un kon");
  });

  it("sigue aceptando el manifiesto heredado sin `type`", async () => {
    const dir = dirCon({ "kon.json": JSON.stringify({ id: "kon-antiguo", name: "Antiguo" }) });

    expect((await leerManifiestoKon(dir))?.id).toBe("kon-antiguo");
    expect(avisos).toEqual([]);
  });
});
