/**
 * ============================================================================
 * COMPILADOR DE CAMPOS → ZOD
 * ============================================================================
 *
 * Una definición de campo es un contrato de AUTORÍA: lleva etiqueta, icono,
 * ancho y orden, cosas que a la validación no le importan. Un `ValidationRule`
 * es un contrato de EJECUCIÓN: lleva funciones, que no se pueden serializar en
 * un `kon.json`.
 *
 * Fundirlos en un solo tipo habría dado un tipo que hace mal las dos cosas.
 * Lo que se unifica aquí es el CAMINO: cualquier vocabulario de campos del
 * repo —datasets, campos personalizados de un torneo, columnas SQL— se
 * normaliza a `NormalizedField` y se compila con esta única función.
 *
 * Vive en el engine y no en la app porque validar la forma de un dato es
 * framework, no lógica de negocio de la API.
 *
 * INVARIANTE QUE NO SE TOCA: el objeto resultante es `passthrough()`. Las
 * claves que no están en el esquema se conservan tal cual. Es lo que permite
 * meter campos arbitrarios en el jsonb sin declararlos, y es deliberado: un
 * constructor de campos personalizados sin vía de escape obliga a migrar el
 * esquema para guardar un dato suelto.
 */

import {
  fieldTypeSpec,
  resolveFieldType,
  camposDelSchema,
  LONGITUD_MAXIMA_A_PROBAR,
  patronSeguro,
} from "@kitsuden/shared";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Contrato normalizado
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldCondition {
  field: string;
  operator: "eq" | "neq" | "contains" | "gt" | "lt";
  value: string;
}

export interface NormalizedField {
  key: string;
  /**
   * El tipo TAL COMO lo escribió el autor, sin resolver alias.
   *
   * Se conserva crudo a propósito: `getSchemaVersion` lo hashea para detectar
   * si el esquema cambió, y resolver alias aquí movería el hash de todos los
   * esquemas que usen uno — marcando como obsoletas entradas que nadie tocó.
   * La versión debe reflejar lo que escribió el autor, no nuestra
   * representación interna.
   */
  type: string;
  /** El tipo canónico del registro. Es el que usa la compilación. */
  resolvedType: string;
  label: string;
  required: boolean;
  defaultValue?: unknown;
  options?: Array<string | { value?: string; label?: string }>;
  isUnique?: boolean;
  validationRegex?: string;
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
  index?: boolean;
  searchable?: boolean | undefined;
  /** Forma de cada fila para `repeater`. Un solo nivel. */
  subFields?: unknown[];
  /** Visibilidad condicional. */
  showIf?: FieldCondition;
}

const CONDITION_OPERATORS = new Set(["eq", "neq", "contains", "gt", "lt"]);

/**
 * Normaliza los vocabularios de campo que conviven en el repo:
 *
 *   - admin moderno:  { key, type, isRequired, ... }
 *   - backend antiguo:{ fieldName, fieldType, required, ... }
 *   - kon-esports:    { key, type, required, help, visibility, min, max }
 *   - columnas SQL:   { name, type: "varchar" | "integer" | ... }
 *
 * El tipo se resuelve contra el registro compartido, que ya sabe de alias, así
 * que añadir un vocabulario nuevo no toca este fichero.
 */
export function normalizeField(field: unknown): NormalizedField | null {
  if (!field || typeof field !== "object") return null;
  const f = field as Record<string, unknown>;

  const key = (f.key ?? f.fieldName ?? f.name) as string | undefined;
  if (!key || typeof key !== "string" || key.length === 0) return null;

  const rawType = (f.type ?? f.fieldType ?? "text") as string;

  return {
    key,
    type: rawType,
    resolvedType: resolveFieldType(rawType),
    label: (f.label ?? f.fieldName ?? key) as string,
    required: Boolean(f.required ?? f.isRequired ?? f.is_required ?? false),
    defaultValue: parseDefaultValue(f.defaultValue ?? f.default),
    options: f.options as NormalizedField["options"],
    isUnique: Boolean(f.isUnique ?? f.is_unique ?? false),
    validationRegex: (f.validationRegex ?? f.pattern) as string | undefined,
    // `min`/`max` son los nombres que usa kon-esports; significan lo mismo.
    minValue: (f.minValue ?? f.min) as number | undefined,
    maxValue: (f.maxValue ?? f.max) as number | undefined,
    minLength: f.minLength as number | undefined,
    maxLength: f.maxLength as number | undefined,
    index: Boolean(f.index ?? f.indexable ?? false),
    searchable:
      f.searchable === undefined && f.search === undefined && f.fullText === undefined
        ? undefined
        : Boolean(f.searchable ?? f.search ?? f.fullText ?? false),
    subFields: Array.isArray(f.subFields) ? f.subFields : undefined,
    showIf: normalizeCondition(f.showIf),
  };
}

export function normalizeFields(fields: unknown): NormalizedField[] {
  // Lista o `{fields}`: ver `camposDelSchema` en @kitsuden/shared
  return camposDelSchema(fields)
    .map(normalizeField)
    .filter((f): f is NormalizedField => f !== null);
}

function parseDefaultValue(raw: unknown): unknown {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Una condición a medias es peor que ninguna: si viene incompleta o con un
 * operador inexistente se descarta y el campo se comporta como siempre
 * visible. Lo contrario —tratarla como "nunca visible"— haría desaparecer
 * datos en silencio por un typo en el esquema.
 */
export function normalizeCondition(raw: unknown): FieldCondition | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as Record<string, unknown>;
  if (typeof c.field !== "string" || c.field.length === 0) return undefined;
  if (typeof c.operator !== "string" || !CONDITION_OPERATORS.has(c.operator)) return undefined;
  return {
    field: c.field,
    operator: c.operator as FieldCondition["operator"],
    value: String(c.value ?? ""),
  };
}

/**
 * Evalúa una condición contra el objeto en el que vive el campo — el
 * formulario completo para un campo de primer nivel, o LA FILA para un
 * subcampo de repeater.
 */
export function isFieldVisible(
  field: Pick<NormalizedField, "showIf">,
  scope: Record<string, unknown>
): boolean {
  const c = field.showIf;
  if (!c) return true;

  const actual = scope[c.field];
  // Comparar como texto mantiene la condición legible y estable: el esquema
  // guarda `value` como string y el dato puede llegar como número o booleano.
  const a = actual === undefined || actual === null ? "" : String(actual);

  switch (c.operator) {
    case "eq":
      return a === c.value;
    case "neq":
      return a !== c.value;
    case "contains":
      return a.includes(c.value);
    case "gt":
    case "lt": {
      // Si alguno de los lados no es numérico, la comparación no significa
      // nada; se resuelve a falso en vez de a un orden lexicográfico engañoso
      // ("10" < "9" sería cierto como texto).
      const na = Number(actual);
      const nb = Number(c.value);
      if (Number.isNaN(na) || Number.isNaN(nb)) return false;
      return c.operator === "gt" ? na > nb : na < nb;
    }
    default:
      return true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Compilación a Zod
// ─────────────────────────────────────────────────────────────────────────────

export function extractOptionValues(options: NormalizedField["options"]): string[] {
  if (!Array.isArray(options)) return [];
  return options
    .map((o) => (typeof o === "string" ? o : (o as { value?: string }).value))
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

/**
 * Construye el validador de un campo a partir de la FAMILIA declarada en el
 * registro, no de su nombre. Por eso `datetime` y `date` comparten camino sin
 * repetir una rama, y añadir un tipo nuevo de una familia existente no toca
 * esta función.
 */
/**
 * Una dirección web: http(s) y nada más.
 *
 * `z.string().url()` a secas acepta `javascript:alert(1)` y `data:`, y un campo
 * `url` o `image` acaba en un `href` o un `src` del sitio público.
 */
function urlWeb() {
  return z
    .string()
    .url()
    .refine((v) => /^https?:\/\//i.test(v), { message: "La URL tiene que ser http(s)" });
}

function fieldToZod(field: NormalizedField): z.ZodTypeAny {
  const spec = fieldTypeSpec(field.resolvedType);

  switch (spec.kind) {
    case "number": {
      let n = z.number();
      if (field.minValue !== undefined) n = n.min(field.minValue);
      if (field.maxValue !== undefined) n = n.max(field.maxValue);
      return n;
    }

    case "boolean":
      return z.boolean();

    case "date":
      return z.union([
        z.string().datetime({ message: "Invalid datetime" }),
        z.string().date(),
        z.coerce.date(),
      ]);

    case "uuid":
      return z.guid();

    case "mediaRef":
      // Id de la mediateca o URL http(s)
      return z.union([z.guid(), urlWeb()]);

    case "json":
      return z.record(z.string(), z.any());

    case "stringArray": {
      const values = extractOptionValues(field.options);
      return values.length > 0
        ? z.array(z.enum(values as [string, ...string[]]))
        : z.array(z.string());
    }

    case "rows": {
      // Los subcampos no llevan `subFields`, así que esta llamada no puede
      // volver a entrar aquí: el anidamiento se corta en un nivel.
      const rows = buildObjectValidator(normalizeFields(field.subFields ?? []));
      let arr = z.array(rows);
      // El repeater reutiliza minLength/maxLength como mínimo/máximo de FILAS.
      if (field.minLength !== undefined) arr = arr.min(field.minLength);
      if (field.maxLength !== undefined) arr = arr.max(field.maxLength);
      return arr;
    }

    case "string":
    default: {
      if (spec.supportsOptions) {
        const values = extractOptionValues(field.options);
        if (values.length > 0) return z.enum(values as [string, ...string[]]);
      }
      if (spec.format === "email") return z.string().email();
      if (spec.format === "url") return urlWeb();

      let s = z.string();
      if (field.minLength !== undefined) s = s.min(field.minLength);
      if (field.maxLength !== undefined) s = s.max(field.maxLength);
      if (field.validationRegex) {
        // Patrón del editor: inválido o con riesgo de ReDoS se ignora, y el
        // valor que se prueba tiene tope (auditoría 2026-10-25,
        // @kitsuden/shared patron-seguro).
        const re = patronSeguro(field.validationRegex);
        if (re) s = s.max(LONGITUD_MAXIMA_A_PROBAR).regex(re);
      }
      return s;
    }
  }
}

/**
 * Construye el validador de UN objeto: formulario completo o fila de repeater.
 *
 * Lo delicado es el `required` condicional. Un campo obligatorio que solo se
 * muestra cuando otro vale X no puede declararse obligatorio en el shape: Zod
 * valida cada clave aislada y no ve a sus hermanas, así que rechazaría el
 * formulario incluso con el campo oculto, que el usuario jamás pudo rellenar.
 *
 * Por eso los condicionales se declaran opcionales y su obligatoriedad se
 * comprueba en un `superRefine` que sí ve el objeto entero, emitiendo el error
 * en la ruta del campo para que el formulario lo pinte donde toca.
 */
export function buildObjectValidator(normalized: NormalizedField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  const condicionales: NormalizedField[] = [];

  for (const field of normalized) {
    let schema = fieldToZod(field);
    const esCondicional = field.showIf !== undefined;

    if (!field.required || esCondicional) {
      schema = schema.optional();
    }
    if (esCondicional && field.required) {
      condicionales.push(field);
    }
    if (field.defaultValue !== undefined) {
      schema = schema.default(field.defaultValue as never);
    }
    shape[field.key] = schema;
  }

  // passthrough: las claves no declaradas se conservan. Ver cabecera.
  const objeto = z.object(shape).passthrough();
  if (condicionales.length === 0) return objeto;

  return objeto.superRefine((data, ctx) => {
    for (const field of condicionales) {
      if (!isFieldVisible(field, data as Record<string, unknown>)) continue;
      const v = (data as Record<string, unknown>)[field.key];
      if (v === undefined || v === null || v === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field.key],
          message: `${field.label} is required when ${field.showIf?.field} ${field.showIf?.operator} "${field.showIf?.value}"`,
        });
      }
    }
  });
}

/** Compila un conjunto de definiciones de campo (de cualquier vocabulario). */
export function buildFieldValidator(fields: unknown) {
  return buildObjectValidator(normalizeFields(fields));
}

/** Valida un objeto contra un conjunto de definiciones de campo. */
export function validateAgainstFields(
  fields: unknown,
  data: Record<string, unknown>
): { success: true; data: Record<string, unknown> } | { success: false; error: z.ZodError } {
  const result = buildFieldValidator(fields).safeParse(data);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, error: result.error };
}
