/**
 * Repeater y lógica condicional — los dos huecos reales frente a ACF/Pods.
 *
 * Lo que de verdad hay que demostrar aquí no es que un array valide, sino las
 * dos cosas que una implementación ingenua se deja:
 *
 *   1. Un campo obligatorio que está OCULTO por su condición no puede bloquear
 *      el formulario. Zod valida cada clave aislada y no ve a sus hermanas, así
 *      que la obligatoriedad tiene que comprobarse sobre el objeto completo.
 *   2. Dentro de un repeater, la condición se resuelve contra SU FILA. Si mirase
 *      al formulario padre, una fila decidiría por las demás.
 */

import { describe, it, expect } from "bun:test";

import {
  buildDatasetEntryValidator,
  isFieldVisible,
  normalizeDatasetField,
  validateDatasetEntry,
} from "../lib/dataset-optimizations";

const campo = (extra: Record<string, unknown>) => ({
  id: crypto.randomUUID(),
  key: "x",
  label: "X",
  type: "text",
  ...extra,
});

describe("repeater", () => {
  const faqs = [
    campo({
      key: "faqs",
      label: "FAQs",
      type: "repeater",
      subFields: [
        campo({ key: "pregunta", label: "Pregunta", type: "text", isRequired: true }),
        campo({ key: "respuesta", label: "Respuesta", type: "text" }),
      ],
    }),
  ];

  it("acepta una lista de filas con la forma declarada", () => {
    const r = validateDatasetEntry(faqs, {
      faqs: [
        { pregunta: "¿Envíos?", respuesta: "Sí" },
        { pregunta: "¿Devoluciones?", respuesta: "30 días" },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data.faqs as unknown[]).length).toBe(2);
  });

  it("rechaza una fila a la que le falta un subcampo obligatorio", () => {
    const r = validateDatasetEntry(faqs, {
      faqs: [{ pregunta: "¿Envíos?" }, { respuesta: "huérfana" }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      // El error apunta a la fila concreta, no al repeater entero: sin eso el
      // formulario no sabe dónde pintar el aviso.
      expect(r.error.issues[0].path).toEqual(["faqs", 1, "pregunta"]);
    }
  });

  it("rechaza algo que no es una lista", () => {
    expect(validateDatasetEntry(faqs, { faqs: { pregunta: "no soy fila" } }).success).toBe(false);
  });

  it("usa minLength/maxLength como mínimo y máximo de FILAS", () => {
    const acotado = [
      campo({
        key: "tramos",
        type: "repeater",
        minLength: 1,
        maxLength: 2,
        subFields: [campo({ key: "precio", type: "number" })],
      }),
    ];
    expect(validateDatasetEntry(acotado, { tramos: [] }).success).toBe(false);
    expect(validateDatasetEntry(acotado, { tramos: [{ precio: 1 }] }).success).toBe(true);
    expect(
      validateDatasetEntry(acotado, { tramos: [{ precio: 1 }, { precio: 2 }, { precio: 3 }] })
        .success
    ).toBe(false);
  });

  it("valida los tipos de los subcampos, no solo su presencia", () => {
    const r = validateDatasetEntry(
      [
        campo({
          key: "tramos",
          type: "repeater",
          subFields: [campo({ key: "precio", type: "number" })],
        }),
      ],
      { tramos: [{ precio: "no soy un número" }] }
    );
    expect(r.success).toBe(false);
  });

  it("un repeater sin subcampos acepta filas vacías en vez de reventar", () => {
    // Es el estado transitorio de un campo recién arrastrado en el admin.
    const r = validateDatasetEntry([campo({ key: "vacio", type: "repeater" })], {
      vacio: [{}, {}],
    });
    expect(r.success).toBe(true);
  });

  it("NO anida: un subcampo de tipo repeater no crea un segundo nivel", () => {
    // El corte a un nivel es deliberado. Lo que importa es que no explote.
    const r = validateDatasetEntry(
      [
        campo({
          key: "a",
          type: "repeater",
          subFields: [campo({ key: "b", type: "repeater", subFields: [campo({ key: "c" })] })],
        }),
      ],
      { a: [{ b: [{ c: "hola" }] }] }
    );
    expect(r.success).toBe(true);
  });
});

describe("lógica condicional", () => {
  const envio = [
    campo({ key: "metodo", label: "Método", type: "select" }),
    campo({
      key: "direccion",
      label: "Dirección",
      type: "text",
      isRequired: true,
      showIf: { field: "metodo", operator: "eq", value: "envio" },
    }),
  ];

  it("exige el campo cuando la condición se cumple", () => {
    const r = validateDatasetEntry(envio, { metodo: "envio" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["direccion"]);
  });

  it("NO lo exige cuando está oculto — el caso que rompe la versión ingenua", () => {
    // Sin esto, el usuario ve un formulario válido que el servidor rechaza por
    // un campo que nunca estuvo en pantalla.
    expect(validateDatasetEntry(envio, { metodo: "recogida" }).success).toBe(true);
  });

  it("lo acepta cuando se cumple y viene relleno", () => {
    expect(validateDatasetEntry(envio, { metodo: "envio", direccion: "Calle 1" }).success).toBe(
      true
    );
  });

  it("trata la cadena vacía como ausente", () => {
    expect(validateDatasetEntry(envio, { metodo: "envio", direccion: "" }).success).toBe(false);
  });

  it("un campo condicional NO obligatorio nunca bloquea", () => {
    const opcional = [
      campo({ key: "metodo", type: "select" }),
      campo({
        key: "nota",
        type: "text",
        showIf: { field: "metodo", operator: "eq", value: "envio" },
      }),
    ];
    expect(validateDatasetEntry(opcional, { metodo: "envio" }).success).toBe(true);
  });

  it("dentro de un repeater la condición mira SU fila, no el formulario", () => {
    const filas = [
      campo({
        key: "items",
        type: "repeater",
        subFields: [
          campo({ key: "tipo", type: "select" }),
          campo({
            key: "detalle",
            label: "Detalle",
            type: "text",
            isRequired: true,
            showIf: { field: "tipo", operator: "eq", value: "otro" },
          }),
        ],
      }),
    ];

    // Fila 0 no lo necesita; fila 1 sí y lo trae. Si la condición se evaluara
    // contra el objeto padre, ninguna de las dos filas encontraría `tipo`.
    expect(
      validateDatasetEntry(filas, {
        items: [{ tipo: "estandar" }, { tipo: "otro", detalle: "a medida" }],
      }).success
    ).toBe(true);

    // Y la fila que lo necesita y no lo trae falla, señalando su índice.
    const r = validateDatasetEntry(filas, {
      items: [{ tipo: "estandar" }, { tipo: "otro" }],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["items", 1, "detalle"]);
  });
});

describe("isFieldVisible", () => {
  const con = (operator: string, value: string) =>
    normalizeDatasetField(campo({ key: "y", showIf: { field: "x", operator, value } }))!;

  it("sin condición, siempre visible", () => {
    expect(isFieldVisible(normalizeDatasetField(campo({}))!, {})).toBe(true);
  });

  it("eq / neq / contains", () => {
    expect(isFieldVisible(con("eq", "a"), { x: "a" })).toBe(true);
    expect(isFieldVisible(con("eq", "a"), { x: "b" })).toBe(false);
    expect(isFieldVisible(con("neq", "a"), { x: "b" })).toBe(true);
    expect(isFieldVisible(con("contains", "am"), { x: "examen" })).toBe(true);
    expect(isFieldVisible(con("contains", "zz"), { x: "examen" })).toBe(false);
  });

  it("compara números como números, no como texto", () => {
    // Como texto, "10" < "9" sería cierto. Ese es el bug clásico.
    expect(isFieldVisible(con("gt", "9"), { x: 10 })).toBe(true);
    expect(isFieldVisible(con("lt", "9"), { x: 10 })).toBe(false);
  });

  it("gt/lt con algo no numérico es falso, no un orden inventado", () => {
    expect(isFieldVisible(con("gt", "9"), { x: "hola" })).toBe(false);
    expect(isFieldVisible(con("lt", "abc"), { x: 1 })).toBe(false);
  });

  it("el campo referenciado ausente equivale a cadena vacía", () => {
    expect(isFieldVisible(con("eq", ""), {})).toBe(true);
    expect(isFieldVisible(con("eq", "a"), {})).toBe(false);
  });

  it("una condición inválida se descarta y el campo queda visible", () => {
    // Un typo en el operador no puede hacer desaparecer datos en silencio.
    const malo = normalizeDatasetField(
      campo({ key: "y", showIf: { field: "x", operator: "aproximadamente", value: "a" } })
    )!;
    expect(malo.showIf).toBeUndefined();
    expect(isFieldVisible(malo, { x: "loquesea" })).toBe(true);
  });

  it("una condición sin campo también se descarta", () => {
    const malo = normalizeDatasetField(
      campo({ key: "y", showIf: { operator: "eq", value: "a" } })
    )!;
    expect(malo.showIf).toBeUndefined();
  });
});

describe("no rompe lo que ya había", () => {
  it("un esquema sin repeater ni showIf sigue validando igual", () => {
    const v = buildDatasetEntryValidator([
      campo({ key: "nombre", type: "text", isRequired: true }),
      campo({ key: "edad", type: "number", minValue: 0 }),
    ]);
    expect(v.safeParse({ nombre: "Ana", edad: 30 }).success).toBe(true);
    expect(v.safeParse({ edad: 30 }).success).toBe(false);
    expect(v.safeParse({ nombre: "Ana", edad: -1 }).success).toBe(false);
  });
});
