/**
 * `listarObjetos` en disco local (2026-10-19).
 *
 * `DELETE /api/media/cache/:id` llamaba a `ctx.storage.list`, que no existía en
 * ningún almacén: respondía 500 siempre. Ahora existe y en local recorre la
 * carpeta del prefijo; aquí se comprueba contra un directorio temporal de
 * verdad (las claves salen con `/` también en Windows, y un prefijo con `..`
 * no lista fuera del almacén).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let dir: string;
let listarObjetos: (prefijo: string) => Promise<string[]>;
const previo = { ruta: process.env.STORAGE_LOCAL_PATH, prov: process.env.DEFAULT_STORAGE_PROVIDER };

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kitsuden-almacen-"));
  mkdirSync(join(dir, "transforms", "abc", "sub"), { recursive: true });
  mkdirSync(join(dir, "transforms", "abcd"), { recursive: true });
  writeFileSync(join(dir, "transforms", "abc", "a.webp"), "a");
  writeFileSync(join(dir, "transforms", "abc", "sub", "b.webp"), "b");
  writeFileSync(join(dir, "transforms", "abcd", "c.webp"), "c");

  process.env.STORAGE_LOCAL_PATH = dir;
  process.env.DEFAULT_STORAGE_PROVIDER = "local";
  vi.resetModules();
  ({ listarObjetos } = await import("../../apps/api/src/lib/almacen"));
});

afterAll(() => {
  if (previo.ruta === undefined) delete process.env.STORAGE_LOCAL_PATH;
  else process.env.STORAGE_LOCAL_PATH = previo.ruta;
  if (previo.prov === undefined) delete process.env.DEFAULT_STORAGE_PROVIDER;
  else process.env.DEFAULT_STORAGE_PROVIDER = previo.prov;
  rmSync(dir, { recursive: true, force: true });
});

describe("listarObjetos (disco local)", () => {
  it("devuelve las claves bajo la carpeta del prefijo, con subcarpetas y separador /", async () => {
    expect(await listarObjetos("transforms/abc/")).toEqual([
      "transforms/abc/a.webp",
      "transforms/abc/sub/b.webp",
    ]);
  });

  it("una carpeta que no existe es una lista vacía, no un error", async () => {
    expect(await listarObjetos("transforms/no-existe/")).toEqual([]);
  });

  it("un prefijo que sale del almacén lanza en vez de listar fuera", async () => {
    await expect(listarObjetos("../../")).rejects.toThrow(/fuera del directorio/);
  });
});
