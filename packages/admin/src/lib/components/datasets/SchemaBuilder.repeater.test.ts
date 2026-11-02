/**
 * La UI del repeater y de la lógica condicional, montada de verdad.
 *
 * Este fichero existe porque "compila" no es "funciona". El repeater estuvo
 * validando en el backend y apareciendo en la paleta durante varias iteraciones
 * sin que nadie pudiera definir sus subcampos, y el typecheck estaba en verde
 * todo ese tiempo.
 *
 * Es el primer test de componente del admin: las dependencias
 * (@testing-library/svelte + jsdom) estaban instaladas y sin usar.
 */

import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";

import SchemaBuilder from "./SchemaBuilder.svelte";

function dataset(fields: unknown[] = []) {
  return {
    id: "ds-1",
    name: "Productos",
    slug: "productos",
    fields,
    policyJson: {
      readAccess: "authenticated" as const,
      writeAccess: "admin" as const,
      enableRLS: false,
      rlsRules: [],
    },
  } as never;
}

const campo = (extra: Record<string, unknown>) => ({
  id: `f-${extra.key ?? "x"}`,
  key: "x",
  label: "X",
  type: "text",
  isRequired: false,
  isUnique: false,
  order: 0,
  hidden: false,
  ...extra,
});

/** Selecciona un campo de la lista para abrir su panel de detalle. */
async function abrirCampo(etiqueta: string) {
  const fila = screen.getByText(etiqueta);
  await fireEvent.click(fila);
}

describe("paleta", () => {
  it("ofrece el repeater y los cuatro tipos que antes no se podían crear", () => {
    render(SchemaBuilder, { props: { definition: dataset() } });
    for (const etiqueta of ["Repeater", "Multi-select", "Long text", "Date & time", "File"]) {
      expect(screen.getByText(etiqueta)).toBeTruthy();
    }
  });

  it("cada tipo de la paleta se pinta con su propia descripción", () => {
    // Si un icono o una etiqueta faltara en el mapa, varios campos saldrían
    // iguales; comprobar las descripciones detecta ese colapso.
    render(SchemaBuilder, { props: { definition: dataset() } });
    expect(screen.getByText("Repeating group of subfields")).toBeTruthy();
    expect(screen.getByText("Any media item — PDF, video, document")).toBeTruthy();
  });
});

describe("editor del repeater", () => {
  const conRepeater = dataset([
    campo({
      key: "faqs",
      label: "FAQs",
      type: "repeater",
      subFields: [campo({ key: "pregunta", label: "Pregunta", type: "text" })],
    }),
  ]);

  it("muestra la sección de subcampos al seleccionar un repeater", async () => {
    render(SchemaBuilder, { props: { definition: conRepeater } });
    await abrirCampo("FAQs");
    expect(screen.getByText("Row fields")).toBeTruthy();
    expect(screen.getByText("Add row field")).toBeTruthy();
  });

  it("pinta los subcampos existentes", async () => {
    render(SchemaBuilder, { props: { definition: conRepeater } });
    await abrirCampo("FAQs");
    expect(screen.getByDisplayValue("Pregunta")).toBeTruthy();
    expect(screen.getByDisplayValue("pregunta")).toBeTruthy();
  });

  it("añade un subcampo al pulsar el botón", async () => {
    render(SchemaBuilder, { props: { definition: conRepeater } });
    await abrirCampo("FAQs");
    const antes = screen.getAllByPlaceholderText("Label").length;
    await fireEvent.click(screen.getByText("Add row field"));
    expect(screen.getAllByPlaceholderText("Label").length).toBe(antes + 1);
  });

  it("avisa cuando un repeater no tiene subcampos — sus filas serían vacías", async () => {
    render(SchemaBuilder, {
      props: { definition: dataset([campo({ key: "vacio", label: "Vacío", type: "repeater" })]) },
    });
    await abrirCampo("Vacío");
    expect(screen.getByText(/No row fields yet/)).toBeTruthy();
  });

  it("los subcampos NO ofrecen repeater — el anidamiento se corta en un nivel", async () => {
    render(SchemaBuilder, { props: { definition: conRepeater } });
    await abrirCampo("FAQs");
    // El <select> del subcampo lista tipos; ninguna de sus opciones es repeater.
    const selects = screen.getAllByRole("combobox");
    const opcionesDeSubcampo = selects
      .flatMap((s) => Array.from(s.querySelectorAll("option")))
      .map((o) => (o as HTMLOptionElement).value);
    expect(opcionesDeSubcampo).toContain("text");
    expect(opcionesDeSubcampo).not.toContain("repeater");
  });

  it("expone min/max como FILAS, no como caracteres", async () => {
    render(SchemaBuilder, { props: { definition: conRepeater } });
    await abrirCampo("FAQs");
    expect(screen.getByLabelText("Min rows")).toBeTruthy();
    expect(screen.getByLabelText("Max rows")).toBeTruthy();
  });

  it("un campo normal no muestra la sección de subcampos", async () => {
    render(SchemaBuilder, {
      props: { definition: dataset([campo({ key: "titulo", label: "Título", type: "text" })]) },
    });
    await abrirCampo("Título");
    expect(screen.queryByText("Row fields")).toBeNull();
  });
});

describe("editor de la condición", () => {
  it("con un solo campo, no se puede activar: no hay de qué depender", async () => {
    render(SchemaBuilder, {
      props: { definition: dataset([campo({ key: "solo", label: "Solo", type: "text" })]) },
    });
    await abrirCampo("Solo");
    expect(screen.getByText(/Needs at least one other field/)).toBeTruthy();
  });

  it("con dos campos, activarla muestra origen, operador y valor", async () => {
    render(SchemaBuilder, {
      props: {
        definition: dataset([
          campo({ key: "metodo", label: "Método", type: "select" }),
          campo({ key: "direccion", label: "Dirección", type: "text" }),
        ]),
      },
    });
    await abrirCampo("Dirección");
    expect(screen.getByText("Conditional")).toBeTruthy();

    // El interruptor es el único botón dentro del bloque Conditional.
    const bloque = screen.getByText("Conditional").closest("div")?.parentElement?.parentElement;
    const interruptor = bloque?.querySelector("button");
    expect(interruptor).toBeTruthy();
    await fireEvent.click(interruptor!);

    expect(screen.getByText("equals")).toBeTruthy();
    expect(screen.getByPlaceholderText("value")).toBeTruthy();
  });

  it("el desplegable de origen NO se ofrece a sí mismo", async () => {
    // Una condición autorreferente no se puede evaluar: haría falta el valor
    // para decidir si el valor cuenta.
    render(SchemaBuilder, {
      props: {
        definition: dataset([
          campo({ key: "metodo", label: "Método", type: "select" }),
          campo({ key: "direccion", label: "Dirección", type: "text" }),
        ]),
      },
    });
    await abrirCampo("Dirección");
    const bloque = screen.getByText("Conditional").closest("div")?.parentElement?.parentElement;
    await fireEvent.click(bloque!.querySelector("button")!);

    const opciones = screen
      .getAllByRole("combobox")
      .flatMap((s) => Array.from(s.querySelectorAll("option")))
      .map((o) => (o as HTMLOptionElement).value);
    expect(opciones).toContain("metodo");
    expect(opciones).not.toContain("direccion");
  });

  it("una condición ya guardada se pinta al abrir el campo", async () => {
    render(SchemaBuilder, {
      props: {
        definition: dataset([
          campo({ key: "metodo", label: "Método", type: "select" }),
          campo({
            key: "direccion",
            label: "Dirección",
            type: "text",
            isRequired: true,
            showIf: { field: "metodo", operator: "eq", value: "envio" },
          }),
        ]),
      },
    });
    await abrirCampo("Dirección");
    expect(screen.getByDisplayValue("envio")).toBeTruthy();
    // Y explica la regla que la gente no espera.
    expect(screen.getByText(/Required only while this condition holds/)).toBeTruthy();
  });

  it("avisa de que gt/lt comparan como números", async () => {
    render(SchemaBuilder, {
      props: {
        definition: dataset([
          campo({ key: "cantidad", label: "Cantidad", type: "number" }),
          campo({
            key: "descuento",
            label: "Descuento",
            type: "number",
            showIf: { field: "cantidad", operator: "gt", value: "10" },
          }),
        ]),
      },
    });
    await abrirCampo("Descuento");
    expect(screen.getByText(/Compared as numbers/)).toBeTruthy();
  });
});
