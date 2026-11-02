/**
 * La vista generada de un modelo (defineModelo, fase H3)
 * ============================================================================
 *
 * Se le da el DESCRIPTOR real de un modelo (el que sirve `describe-<modelo>`)
 * y una API simulada: tiene que pintar la lista con las columnas del modelo,
 * un formulario con el control de cada tipo (select del enumerado, casilla
 * del booleano, número con sus límites), mandar solo lo que hay que mandar al
 * crear y al editar, y enseñar los errores por campo de un 422.
 */
import { campo, defineModelo, descriptorDeModelo } from "@kitsuden/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "$lib/i18n";

import ModelView from "./ModelView.svelte";

vi.setConfig({ testTimeout: 60_000 });

const nota = defineModelo({
  nombre: "note",
  etiqueta: "Note",
  descripcion: "A personal note.",
  campos: {
    title: campo.texto({ max: 200, requerido: true, etiqueta: "Title" }),
    status: campo.enumerado(["draft", "published"], { requerido: true, porDefecto: "draft", etiqueta: "Status" }),
    priority: campo.entero({ min: 0, max: 5, requerido: true, porDefecto: 0, etiqueta: "Priority" }),
    pinned: campo.booleano({ requerido: true, porDefecto: false, etiqueta: "Pinned" }),
    meta: campo.json({ etiqueta: "Metadata" }),
  },
  acceso: { leer: "dueno", escribir: "dueno" },
});
const descriptor = descriptorDeModelo(nota);
const BASE = "/api/notas/notes";

const FILA = {
  id: "11111111-1111-1111-1111-111111111111",
  ownerId: "ana",
  title: "Comprar pan",
  status: "draft",
  priority: 2,
  pinned: true,
  meta: null,
  createdAt: "2026-10-28T10:00:00.000Z",
  updatedAt: "2026-10-28T10:00:00.000Z",
};

interface Llamada {
  metodo: string;
  url: string;
  cuerpo: unknown;
}

function apiSimulada(respuestas: Record<string, (cuerpo: unknown) => Response>) {
  const llamadas: Llamada[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const metodo = init?.method ?? "GET";
      const cuerpo = init?.body ? JSON.parse(String(init.body)) : undefined;
      llamadas.push({ metodo, url: String(url), cuerpo });
      const ruta = String(url).replace(/^https?:\/\/[^/]+/, "").split("?")[0];
      const r = respuestas[`${metodo} ${ruta}`];
      return r ? r(cuerpo) : new Response("{}", { status: 404 });
    })
  );
  return llamadas;
}
const json = (datos: unknown, status = 200) =>
  new Response(JSON.stringify(datos), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("ModelView", () => {
  it("pinta la lista con las columnas del modelo y el acceso declarado", async () => {
    setLocale("en");
    apiSimulada({ [`GET ${BASE}`]: () => json({ data: [FILA], total: 1, limit: 20, offset: 0 }) });
    render(ModelView, { descriptor, base: BASE });
    const tabla = await screen.findByTestId("model-table");
    expect(tabla.textContent).toContain("Comprar pan");
    expect(tabla.textContent).toContain("Title");
    expect(tabla.textContent).toContain("Owner");
    expect(tabla.textContent).toContain("Yes"); // pinned
    expect(tabla.textContent).not.toContain("Metadata"); // json no va en la lista
    expect(screen.getByTestId("model-view").textContent).toContain("note:write");
  });

  it("el alta: un control por tipo y solo se manda lo que se rellenó", async () => {
    setLocale("en");
    const llamadas = apiSimulada({
      [`GET ${BASE}`]: () => json({ data: [], total: 0, limit: 20, offset: 0 }),
      [`POST ${BASE}`]: (c) => json({ ...FILA, ...(c as object) }, 201),
    });
    render(ModelView, { descriptor, base: BASE });
    await fireEvent.click(await screen.findByTestId("model-new"));
    const form = await screen.findByTestId("model-form");
    expect(form.querySelector("select#campo-status")).not.toBeNull();
    expect(form.querySelector("input#campo-pinned[type=checkbox]")).not.toBeNull();
    const prioridad = form.querySelector("input#campo-priority") as HTMLInputElement;
    expect(prioridad.type).toBe("number");
    expect(prioridad.max).toBe("5");
    expect((form.querySelector("input#campo-title") as HTMLInputElement).maxLength).toBe(200);

    await fireEvent.input(form.querySelector("input#campo-title")!, { target: { value: "Nueva" } });
    await fireEvent.submit(form);
    await waitFor(() => expect(llamadas.some((l) => l.metodo === "POST")).toBe(true));
    const post = llamadas.find((l) => l.metodo === "POST")!;
    expect(post.cuerpo).toEqual({ title: "Nueva", status: "draft", priority: 0, pinned: false });
  });

  it("editar manda solo lo cambiado; un 422 se enseña junto a su campo", async () => {
    setLocale("es");
    const llamadas = apiSimulada({
      [`GET ${BASE}`]: () => json({ data: [FILA], total: 1, limit: 20, offset: 0 }),
      [`PATCH ${BASE}/${FILA.id}`]: () =>
        json(
          {
            code: "KITSUDEN_E_VALIDATION",
            detail: "Validación fallida",
            details: { fields: { title: ["Too big: expected string to have <=200 characters"] } },
          },
          422
        ),
    });
    render(ModelView, { descriptor, base: BASE });
    await screen.findByTestId("model-table");
    await fireEvent.click(screen.getByText("Editar"));
    const form = await screen.findByTestId("model-form");
    await fireEvent.input(form.querySelector("input#campo-title")!, { target: { value: "Otro" } });
    await fireEvent.submit(form);
    await waitFor(() => expect(screen.getByTestId("error-title").textContent).toContain("200"));
    const patch = llamadas.find((l) => l.metodo === "PATCH")!;
    expect(patch.cuerpo).toEqual({ title: "Otro" });
  });

  it("borrar pide confirmación y llama a DELETE (204 sin cuerpo)", async () => {
    setLocale("en");
    vi.stubGlobal("confirm", () => true);
    const llamadas = apiSimulada({
      [`GET ${BASE}`]: () => json({ data: [FILA], total: 1, limit: 20, offset: 0 }),
      [`DELETE ${BASE}/${FILA.id}`]: () => new Response(null, { status: 204 }),
    });
    render(ModelView, { descriptor, base: BASE });
    await screen.findByTestId("model-table");
    await fireEvent.click(screen.getByText("Delete"));
    await waitFor(() => expect(llamadas.some((l) => l.metodo === "DELETE")).toBe(true));
    await screen.findByText("Deleted");
  });
});
