/**
 * Pegar y arrastrar imágenes en el editor
 * ============================================================================
 *
 * Para un blog, pegar una captura es LA forma de meter imágenes: la haces y la
 * pegas. Antes no existía — había que abrir el selector, subir, y volver.
 *
 * Lo que se fija aquí es la frontera que hace que esto no estorbe:
 *
 *   · Pegar TEXTO tiene que seguir funcionando. Es el 99% de los pegados, y
 *     cancelarlo siempre habría roto el editor entero para ganar una comodidad.
 *   · `dragover` hay que cancelarlo o el navegador ABRE el fichero soltado y se
 *     lleva por delante el artículo a medio escribir, sin avisar de nada.
 */

import { render } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";

import SlashCommandEditor from "./SlashCommandEditor.svelte";

/** Un fichero de mentira; solo se mira su `type`. */
const fichero = (name: string, type: string) => new File(["x"], name, { type });

/**
 * jsdom no construye `ClipboardEvent`/`DragEvent` con datos, así que se monta
 * el evento a mano. Es lo que el navegador entrega: un `DataTransfer` con
 * `files`.
 */
function eventoCon(tipo: string, ficheros: File[]): Event {
  const evento = new Event(tipo, { bubbles: true, cancelable: true });
  const datos = { files: ficheros, items: [], types: ficheros.length ? ["Files"] : ["text/plain"] };
  Object.defineProperty(evento, tipo === "paste" ? "clipboardData" : "dataTransfer", {
    value: datos,
  });
  return evento;
}

function montar(onSubirFicheros?: (f: File[]) => void) {
  const { container } = render(SlashCommandEditor, { props: { value: "", onSubirFicheros } });
  const textarea = container.querySelector("textarea");
  if (!textarea) throw new Error("no hay textarea");
  return textarea;
}

describe("pegar", () => {
  it("una captura se manda a subir", () => {
    const subir = vi.fn();
    const textarea = montar(subir);

    textarea.dispatchEvent(eventoCon("paste", [fichero("captura.png", "image/png")]));

    expect(subir).toHaveBeenCalledTimes(1);
    expect(subir.mock.calls[0][0][0].name).toBe("captura.png");
  });

  it("PEGAR TEXTO no se toca", () => {
    // Si se cancelara siempre, pegar texto dejaría de funcionar — y eso es lo
    // que se hace casi todo el rato.
    const subir = vi.fn();
    const textarea = montar(subir);

    const evento = eventoCon("paste", []);
    textarea.dispatchEvent(evento);

    expect(subir).not.toHaveBeenCalled();
    expect(evento.defaultPrevented).toBe(false);
  });

  it("con imagen SÍ se cancela, para que no se pegue el binario como texto", () => {
    const textarea = montar(vi.fn());
    const evento = eventoCon("paste", [fichero("a.png", "image/png")]);

    textarea.dispatchEvent(evento);

    expect(evento.defaultPrevented).toBe(true);
  });

  it("de un portapapeles mixto solo salen las imágenes", () => {
    // Copiar una imagen de una web trae ADEMÁS su HTML; y alguien puede
    // arrastrar un PDF junto a una foto.
    const subir = vi.fn();
    const textarea = montar(subir);

    textarea.dispatchEvent(
      eventoCon("paste", [fichero("doc.pdf", "application/pdf"), fichero("foto.jpg", "image/jpeg")])
    );

    expect(subir.mock.calls[0][0]).toHaveLength(1);
    expect(subir.mock.calls[0][0][0].name).toBe("foto.jpg");
  });
});

describe("arrastrar y soltar", () => {
  it("soltar una imagen la manda a subir", () => {
    const subir = vi.fn();
    const textarea = montar(subir);

    textarea.dispatchEvent(eventoCon("drop", [fichero("b.webp", "image/webp")]));

    expect(subir).toHaveBeenCalledTimes(1);
  });

  it("`dragover` se CANCELA o el navegador abre el fichero", () => {
    // Es el fallo clásico del arrastrar y soltar: sueltas encima y el navegador
    // navega al fichero, perdiendo el artículo. No hay error ni aviso.
    const textarea = montar(vi.fn());
    const evento = new Event("dragover", { bubbles: true, cancelable: true });

    textarea.dispatchEvent(evento);

    expect(evento.defaultPrevented).toBe(true);
  });

  it("soltar algo que no es imagen no hace nada", () => {
    const subir = vi.fn();
    const textarea = montar(subir);

    textarea.dispatchEvent(eventoCon("drop", [fichero("hoja.xlsx", "application/vnd.ms-excel")]));

    expect(subir).not.toHaveBeenCalled();
  });
});

describe("sin quien suba, no se estorba", () => {
  it("sin `onSubirFicheros` el pegado queda para el navegador", () => {
    // El editor no sabe subir por su cuenta. Si nadie escucha, cancelar el
    // evento solo conseguiría que pegar dejara de funcionar.
    const textarea = montar(undefined);
    const evento = eventoCon("dragover", []);

    textarea.dispatchEvent(evento);

    expect(evento.defaultPrevented).toBe(false);
  });
});
