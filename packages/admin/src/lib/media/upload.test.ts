/**
 * Subir a la biblioteca — el contrato con el endpoint
 * ============================================================================
 *
 * Este fichero existe porque había TRES subidas escritas por separado y una de
 * ellas estaba rota de dos formas a la vez, en silencio:
 *
 *   · `DynamicForm` mandaba el fichero como `file`; el endpoint lee `files`.
 *     Moría antes de empezar con «No files provided».
 *   · Y leía `data.url`, que **nunca existió** en esa respuesta. Aunque la
 *     subida hubiera funcionado, el campo se guardaba con `undefined`.
 *
 * Nadie lo vio porque un `alert()` con «Failed to upload» y un campo vacío se
 * parecen mucho a «esa imagen no era válida».
 *
 * Lo que se fija aquí es la forma del intercambio, que es donde estaba el fallo.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import { api } from "$lib/api";

import { imagenesDe, subirMedios } from "./upload";

vi.mock("$lib/api", () => ({ api: { uploadMedia: vi.fn() } }));

const uploadMedia = api.uploadMedia as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => uploadMedia.mockReset());

const fichero = (name = "a.png", type = "image/png") => new File(["x"], name, { type });

describe("subir", () => {
  it("devuelve la URL, que es lo que quien sube necesita", () => {
    // El motivo de todo: sin `url` en la respuesta, el editor del blog tenía
    // que recargar la biblioteca entera para encontrar por id lo que acababa
    // de subir, y el formulario de datasets ni lo intentaba.
    uploadMedia.mockResolvedValue({
      success: true,
      files: [{ id: "m1", filename: "a.png", url: "/uploads/a.png", success: true }],
    });

    return expect(subirMedios([fichero()])).resolves.toEqual({
      subidos: [
        { id: "m1", url: "/uploads/a.png", filename: "a.png", width: undefined, height: undefined },
      ],
      errores: [],
    });
  });

  it("arrastra las dimensiones cuando vienen", async () => {
    uploadMedia.mockResolvedValue({
      success: true,
      files: [
        { id: "m1", filename: "a.png", url: "/u/a.png", width: 1200, height: 630, success: true },
      ],
    });

    const { subidos } = await subirMedios([fichero()]);
    expect(subidos[0]).toMatchObject({ width: 1200, height: 630 });
  });

  it("un fallo parcial NO es una excepción: es un resultado con errores", async () => {
    // El endpoint responde 207 cuando unos entran y otros no. Lanzar aquí
    // tiraría también las que sí se subieron.
    uploadMedia.mockResolvedValue({
      success: false,
      files: [
        { id: "m1", filename: "ok.png", url: "/u/ok.png", success: true },
        { filename: "enorme.png", success: false, error: "File too large (max 10MB)" },
      ],
    });

    const { subidos, errores } = await subirMedios([fichero(), fichero("enorme.png")]);
    expect(subidos).toHaveLength(1);
    expect(errores[0]).toContain("enorme.png");
    // El motivo concreto viaja: «error al subir» a secas no distingue un
    // fichero de 20 MB de un disco lleno.
    expect(errores[0]).toContain("10MB");
  });

  it("un `success: true` SIN url se cuenta como error, no se cuela vacío", async () => {
    // Es exactamente el fallo que tenía DynamicForm: guardaba `undefined` en el
    // campo y el formulario parecía correcto hasta que alguien abría la entrada.
    uploadMedia.mockResolvedValue({
      success: true,
      files: [{ id: "m1", filename: "a.png", success: true }],
    });

    const { subidos, errores } = await subirMedios([fichero()]);
    expect(subidos).toEqual([]);
    expect(errores[0]).toMatch(/no devolvió la imagen/);
  });

  it("sin ficheros no llama al servidor", async () => {
    await subirMedios([]);
    await subirMedios(null);
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it("acepta un FileList igual que un array", async () => {
    // El `<input type=file>` da un FileList; el pegar y arrastrar da un array.
    uploadMedia.mockResolvedValue({ success: true, files: [] });
    const comoFileList = { 0: fichero(), length: 1, item: () => fichero() } as unknown as FileList;

    await subirMedios(comoFileList);
    expect(uploadMedia).toHaveBeenCalledWith([expect.any(File)]);
  });
});

describe("filtrar lo pegado o arrastrado", () => {
  it("solo pasan las imágenes", () => {
    const datos = {
      files: [fichero("doc.pdf", "application/pdf"), fichero("foto.jpg", "image/jpeg")],
    } as unknown as DataTransfer;

    expect(imagenesDe(datos).map((f) => f.name)).toEqual(["foto.jpg"]);
  });

  it("sin datos devuelve lista vacía, no revienta", () => {
    expect(imagenesDe(null)).toEqual([]);
  });
});
