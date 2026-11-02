/**
 * El registro único de tipos de campo.
 *
 * Este fichero existe para que la divergencia no vuelva. El repo llegó a tener
 * la información de un tipo repartida en cuatro sitios —el enum de Zod, el
 * `switch` del validador, la paleta del admin y las reglas de indexación— y el
 * resultado fue que `multiselect`, `textarea`, `datetime` y `media` validaban
 * perfectamente en el backend sin que nadie pudiera crearlos.
 *
 * Lo que se comprueba aquí no es que el registro tenga tal o cual entrada, sino
 * que los consumidores SIGUEN de acuerdo entre sí.
 */

import { buildFieldValidator, normalizeField } from "@kitsuden/engine";
import {
  FIELD_TYPES,
  FIELD_TYPE_ALIASES,
  FIELD_TYPE_NAMES,
  creatableFieldTypes,
  fieldTypeSpec,
  resolveFieldType,
  shouldIndexByDefault,
  shouldSearchByDefault,
  FieldTypeSchema,
} from "@kitsuden/shared";
import { describe, it, expect } from "bun:test";

describe("los consumidores no pueden divergir", () => {
  it("el enum de Zod se deriva del registro, no lo copia", () => {
    expect(new Set(FieldTypeSchema.options)).toEqual(new Set(FIELD_TYPE_NAMES));
  });

  it("la paleta del admin es un subconjunto real del registro", () => {
    const paleta = creatableFieldTypes().map((t) => t.type);
    expect(paleta.length).toBeGreaterThan(0);
    for (const t of paleta) expect(FIELD_TYPE_NAMES).toContain(t);
  });

  it("TODO tipo declarado compila a un validador sin reventar", () => {
    // Es la comprobación que faltaba: antes se podía añadir un nombre al enum
    // y olvidarse del `switch`, y el tipo caía silenciosamente en el caso por
    // defecto validando como string.
    for (const type of FIELD_TYPE_NAMES) {
      const v = buildFieldValidator([{ key: "campo", type, label: "Campo" }]);
      expect(v.safeParse({}).success).toBe(true);
    }
  });

  it("los cuatro tipos que validaban sin poder crearse ya se pueden crear", () => {
    const paleta = creatableFieldTypes().map((t) => t.type as string);
    for (const t of ["multiselect", "textarea", "datetime", "media"]) {
      expect(paleta).toContain(t);
    }
  });
});

describe("resolución de alias", () => {
  it("un tipo canónico se resuelve a sí mismo", () => {
    for (const t of FIELD_TYPE_NAMES) expect(resolveFieldType(t)).toBe(t);
  });

  it("todo alias apunta a un tipo que existe", () => {
    for (const [alias, destino] of Object.entries(FIELD_TYPE_ALIASES)) {
      expect(FIELD_TYPE_NAMES).toContain(destino);
      expect(resolveFieldType(alias)).toBe(destino);
    }
  });

  it("un tipo desconocido cae en text en vez de reventar", () => {
    // Un esquema con un tipo que este build no conoce debe seguir guardando su
    // dato, no tumbar el formulario. Misma razón que el `passthrough()`.
    expect(resolveFieldType("inventado_en_2030")).toBe("text");
    expect(resolveFieldType(undefined)).toBe("text");
    expect(resolveFieldType(null)).toBe("text");
    expect(fieldTypeSpec("inventado_en_2030")).toBe(FIELD_TYPES.text);
  });

  it("el vocabulario de columnas SQL entra por los alias", () => {
    expect(resolveFieldType("varchar")).toBe("text"); // desconocido → text
    expect(resolveFieldType("integer")).toBe("number");
    expect(resolveFieldType("jsonb")).toBe("json");
    expect(resolveFieldType("timestamp")).toBe("datetime");
    expect(resolveFieldType("checkbox")).toBe("boolean");
  });
});

describe("el tipo crudo se conserva", () => {
  it("normalizeField separa lo que escribió el autor de lo canónico", () => {
    // `getSchemaVersion` hashea `type`. Si resolviéramos alias ahí, cambiar la
    // representación interna marcaría como obsoletas entradas que nadie tocó.
    const f = normalizeField({ key: "x", type: "checkbox" })!;
    expect(f.type).toBe("checkbox");
    expect(f.resolvedType).toBe("boolean");
  });

  it("y aun así valida por el tipo resuelto", () => {
    const v = buildFieldValidator([{ key: "x", type: "checkbox", isRequired: true }]);
    expect(v.safeParse({ x: true }).success).toBe(true);
    expect(v.safeParse({ x: "no soy booleano" }).success).toBe(false);
  });
});

describe("la indexación no cambió de comportamiento", () => {
  // La refactorización movió estas reglas al registro. Estas listas son las
  // que había ANTES, literales, para que un cambio de criterio tenga que ser
  // deliberado y no un efecto colateral.
  it("se indexan por defecto exactamente los mismos tipos que antes", () => {
    const antes = ["email", "url", "select", "relation"];
    for (const t of FIELD_TYPE_NAMES) {
      expect(shouldIndexByDefault(t)).toBe(antes.includes(t));
    }
  });

  it("se buscan por defecto exactamente los mismos que antes", () => {
    const antes = ["text", "textarea"];
    for (const t of FIELD_TYPE_NAMES) {
      expect(shouldSearchByDefault(t)).toBe(antes.includes(t));
    }
  });
});

describe("la vía de escape del jsonb sigue abierta", () => {
  it("las claves no declaradas se conservan tal cual", () => {
    // Es la garantía explícita: un constructor de campos personalizados sin
    // vía de escape obliga a migrar el esquema para guardar un dato suelto.
    const v = buildFieldValidator([{ key: "nombre", type: "text" }]);
    const r = v.safeParse({ nombre: "Ana", loQueSea: { anidado: [1, 2] }, otro: 42 });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.loQueSea).toEqual({ anidado: [1, 2] });
      expect(r.data.otro).toBe(42);
    }
  });

  it("un campo json acepta cualquier estructura", () => {
    const v = buildFieldValidator([{ key: "libre", type: "json" }]);
    expect(v.safeParse({ libre: { a: 1, b: [2, 3], c: { d: true } } }).success).toBe(true);
  });

  it("un esquema vacío no rechaza nada", () => {
    expect(buildFieldValidator([]).safeParse({ cualquier: "cosa" }).success).toBe(true);
  });
});
