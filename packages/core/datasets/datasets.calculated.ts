/**
 * DataSets Calculated Fields - Backend
 *
 * Sistema de campos calculados server-side para DataSets.
 * Permite definir fórmulas tipo Excel que se evalúan en el backend.
 *
 * Características:
 * - Expresiones matemáticas y lógicas
 * - Referencias a campos del dataset: {fieldName}
 * - Funciones built-in: SUM, COUNT, AVG, IF, etc.
 * - Agregaciones sobre relaciones
 * - Evaluación segura (sandboxed)
 */

import { z } from "zod";

import { evaluarExpresionSegura } from "./expresion-segura";

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS DE CAMPOS CALCULADOS
// ═══════════════════════════════════════════════════════════════════════════

export type CalculatedFieldType =
  | "formula" // Expresión matemática/lógica: {price} * {quantity}
  | "count" // Contar registros relacionados
  | "sum" // Sumar valores de relación
  | "avg" // Promedio
  | "min" // Valor mínimo
  | "max" // Valor máximo
  | "concat" // Concatenar strings
  | "date_diff" // Diferencia entre fechas
  | "date_add" // Sumar tiempo a fecha
  | "conditional" // IF/THEN/ELSE
  | "lookup" // Buscar valor en otra tabla
  | "rollup"; // Agregación desde relación

// ═══════════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface CalculatedField {
  id: string;
  dataSetId: string;
  name: string; // Nombre técnico (usado en API)
  label: string; // Label para UI
  type: CalculatedFieldType;

  // Configuración según el tipo
  config: {
    // Para tipo "formula"
    expression?: string; // Ej: "{price} * {quantity} * (1 - {discount})"

    // Para agregaciones (count, sum, avg, min, max)
    sourceTable?: string; // Tabla/relación fuente
    sourceField?: string; // Campo a agregar
    filter?: FilterConfig; // Filtro opcional

    // Para concat
    fields?: string[]; // Campos a concatenar
    separator?: string; // Separador

    // Para date_diff/date_add
    startField?: string; // Campo fecha inicio
    endField?: string; // Campo fecha fin
    dateField?: string; // Campo base para date_add
    value?: number; // Valor a sumar/restar
    unit?: "days" | "hours" | "minutes" | "seconds" | "months" | "years";

    // Para conditional
    condition?: ConditionConfig;
    trueValue?: any;
    falseValue?: any;

    // Para lookup
    targetTable?: string;
    targetField?: string;
    matchField?: string; // Campo local para matching
    returnField?: string; // Campo a retornar

    // Para rollup
    relationField?: string; // Campo que define la relación
  };

  // Formato de salida
  format?: {
    type:
      | "text"
      | "number"
      | "currency"
      | "percentage"
      | "date"
      | "datetime"
      | "duration"
      | "badge"
      | "boolean";
    currency?: string; // Para currency: "USD", "EUR"
    decimals?: number; // Para number/currency
    prefix?: string; // Ej: "$"
    suffix?: string; // Ej: "%", " items"
    color?: string; // Para badge
  };

  // Dependencias (campos que usa)
  dependsOn: string[];

  // Metadata
  description?: string;
  category?: string; // Para agrupar KPIs
  isKpi?: boolean; // Es un KPI principal?
  target?: number; // Valor objetivo (para KPIs)
  warningThreshold?: number; // Umbral de alerta

  // Estado
  isActive: boolean;
  sortOrder: number;

  // Audit
  createdAt: Date;
  updatedAt: Date;
  createdById?: string;
}

export interface FilterConfig {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains" | "empty" | "not_empty";
  value?: any;
}

export interface ConditionConfig {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty" | "in";
  value?: any;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMAS ZOD
// ═══════════════════════════════════════════════════════════════════════════

export const filterConfigSchema = z.object({
  field: z.string(),
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "empty", "not_empty"]),
  value: z.any().optional(),
});

export const conditionConfigSchema = z.object({
  field: z.string(),
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "empty", "not_empty", "in"]),
  value: z.any().optional(),
});

export const calculatedFieldConfigSchema = z.object({
  expression: z.string().max(2000).optional(),
  sourceTable: z.string().optional(),
  sourceField: z.string().optional(),
  filter: filterConfigSchema.optional(),
  fields: z.array(z.string()).optional(),
  separator: z.string().optional(),
  startField: z.string().optional(),
  endField: z.string().optional(),
  dateField: z.string().optional(),
  value: z.number().optional(),
  unit: z.enum(["days", "hours", "minutes", "seconds", "months", "years"]).optional(),
  condition: conditionConfigSchema.optional(),
  trueValue: z.any().optional(),
  falseValue: z.any().optional(),
  targetTable: z.string().optional(),
  targetField: z.string().optional(),
  matchField: z.string().optional(),
  returnField: z.string().optional(),
  relationField: z.string().optional(),
});

export const formatConfigSchema = z.object({
  type: z.enum([
    "text",
    "number",
    "currency",
    "percentage",
    "date",
    "datetime",
    "duration",
    "badge",
    "boolean",
  ]),
  currency: z.string().optional(),
  decimals: z.number().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  color: z.string().optional(),
});

export const createCalculatedFieldSchema = z.object({
  dataSetId: z.guid(),
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Must start with letter, only letters/numbers/underscores"),
  label: z.string().min(1).max(200),
  type: z.enum([
    "formula",
    "count",
    "sum",
    "avg",
    "min",
    "max",
    "concat",
    "date_diff",
    "date_add",
    "conditional",
    "lookup",
    "rollup",
  ]),
  config: calculatedFieldConfigSchema,
  format: formatConfigSchema.optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  isKpi: z.boolean().optional(),
  target: z.number().optional(),
  warningThreshold: z.number().optional(),
  dependsOn: z.array(z.string()).default([]),
});

export const updateCalculatedFieldSchema = createCalculatedFieldSchema
  .partial()
  .omit({ dataSetId: true })
  .extend({
    // Editables solo en UPDATE (la tabla los tiene con defaults en CREATE).
    // Sin esto, Zod los descartaba en el safeParse y el PATCH nunca podía
    // activar/desactivar un campo ni reordenarlo.
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  });

// ═══════════════════════════════════════════════════════════════════════════
// MOTOR DE EVALUACIÓN DE FÓRMULAS
// ═══════════════════════════════════════════════════════════════════════════

export interface EvaluationContext {
  row: Record<string, unknown>; // Registro actual
  entries?: Record<string, unknown>[]; // Entradas relacionadas (para agregaciones)
  relatedData?: Record<string, unknown>; // Datos de relaciones
  now?: Date; // Fecha actual (para testing)
}

/**
 * Evalúa una expresión matemática/lógica
 * Ej: "{price} * {quantity} * (1 - {discount})"
 *
 * Antes era `new Function("return " + expresión)()` con los valores de los
 * campos pegados como texto: ejecución de código en el servidor para quien
 * pudiera guardar una fórmula o un valor de texto acabado en `\`. Ahora la
 * interpreta `evaluarExpresionSegura` (ver `expresion-segura.ts`). Cualquier
 * error sigue devolviendo `null`.
 */
export function evaluateExpression(expression: string, context: EvaluationContext): any {
  try {
    return evaluarExpresionSegura(expression, context.row ?? {});
  } catch (err) {
    console.error(
      "Expression evaluation error:",
      err instanceof Error ? err.message : String(err),
      "Expression:",
      String(expression).slice(0, 200)
    );
    return null;
  }
}

/**
 * Igualdad para filtros de datasets.
 *
 * Ni `==` ni `===` sirven aquí. El valor del filtro llega de JSON —casi
 * siempre como texto, `"30"`— y el de la fila sale de una columna JSONB, donde
 * ese mismo dato puede estar guardado como número. Con `===`, el filtro
 * `edad eq 30` no encontraría nada. Con `==` sí, pero `==` arrastra sus
 * trampas: `"" == 0` y `"0" == false` son ciertos, así que un filtro `eq 0`
 * acabaría casando con las filas que tienen el campo VACÍO. En un CMS eso son
 * resultados mal, no un detalle de estilo.
 *
 * Así que se coacciona a propósito solo donde significa algo (texto↔número,
 * texto↔booleano, fechas) y el vacío se queda fuera. El mismo criterio lo usan
 * `eq`, `neq` e `in`, que antes no coincidían entre sí.
 */
export function mismoValor(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  // "Sin valor" es UNA sola cosa: null y undefined no se distinguen, pero
  // tampoco casan con nada más (ni con 0, ni con "", ni con false).
  const aVacio = a === null || a === undefined;
  const bVacio = b === null || b === undefined;
  if (aVacio || bVacio) return aVacio && bVacio;

  // Dos fechas con el mismo instante son iguales aunque sean objetos distintos.
  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : Date.parse(String(a));
    const tb = b instanceof Date ? b.getTime() : Date.parse(String(b));
    return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb;
  }

  // Booleano contra texto: valen "true"/"false", que es lo que manda un
  // formulario. NO valen 0/1/""; ahí `==` acierta por accidente y se equivoca
  // en cuanto el campo está vacío.
  if (typeof a === "boolean" || typeof b === "boolean") {
    const comoBool = (v: unknown): boolean | null =>
      typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : null;
    const ab = comoBool(a);
    const bb = comoBool(b);
    return ab !== null && bb !== null && ab === bb;
  }

  // Número contra texto: se compara como número. La cadena vacía o en blanco
  // NO es cero — es justo el caso que rompía el operador laxo.
  if (typeof a === "number" || typeof b === "number") {
    const num = typeof a === "number" ? a : (b as number);
    const otro = typeof a === "number" ? b : a;
    if (typeof otro !== "string" || otro.trim() === "") return false;
    const n = Number(otro);
    return Number.isFinite(n) && n === num;
  }

  return false;
}

/**
 * Evalúa una condición
 */
export function evaluateCondition(condition: ConditionConfig, context: EvaluationContext): boolean {
  const { row } = context;
  const fieldValue = row[condition.field];
  const compareValue = condition.value;

  switch (condition.operator) {
    case "eq":
      return mismoValor(fieldValue, compareValue);
    case "neq":
      return !mismoValor(fieldValue, compareValue);
    case "gt":
      return Number(fieldValue) > Number(compareValue);
    case "gte":
      return Number(fieldValue) >= Number(compareValue);
    case "lt":
      return Number(fieldValue) < Number(compareValue);
    case "lte":
      return Number(fieldValue) <= Number(compareValue);
    case "contains":
      return String(fieldValue).includes(String(compareValue));
    case "empty":
      return fieldValue === null || fieldValue === undefined || fieldValue === "";
    case "not_empty":
      return fieldValue !== null && fieldValue !== undefined && fieldValue !== "";
    case "in":
      // Mismo criterio que `eq`: antes esto usaba `includes`, o sea `===`, y
      // por eso `eq 30` encontraba un `"30"` guardado como texto pero
      // `in [30]` no. Dos operadores hermanos no pueden discrepar.
      return Array.isArray(compareValue) && compareValue.some((v) => mismoValor(fieldValue, v));
    default:
      return false;
  }
}

/**
 * Funciones de agregación
 */
export const aggregationFunctions = {
  sum: (entries: any[], field: string): number => {
    return entries.reduce((acc, entry) => acc + (Number(entry[field]) || 0), 0);
  },

  count: (entries: any[]): number => entries.length,

  avg: (entries: any[], field: string): number => {
    if (!entries.length) return 0;
    const sum = aggregationFunctions.sum(entries, field);
    return sum / entries.length;
  },

  min: (entries: any[], field: string): number => {
    if (!entries.length) return 0;
    return Math.min(...entries.map((e) => Number(e[field]) || Infinity));
  },

  max: (entries: any[], field: string): number => {
    if (!entries.length) return 0;
    return Math.max(...entries.map((e) => Number(e[field]) || -Infinity));
  },
};

/**
 * Funciones de fecha
 */
export const dateFunctions = {
  diff: (start: Date, end: Date, unit: string): number => {
    const diffMs = end.getTime() - start.getTime();
    switch (unit) {
      case "seconds":
        return Math.floor(diffMs / 1000);
      case "minutes":
        return Math.floor(diffMs / (1000 * 60));
      case "hours":
        return Math.floor(diffMs / (1000 * 60 * 60));
      case "days":
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
      case "months":
        return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
      case "years":
        return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365));
      default:
        return diffMs;
    }
  },

  add: (date: Date, value: number, unit: string): Date => {
    const result = new Date(date);
    switch (unit) {
      case "seconds":
        result.setSeconds(result.getSeconds() + value);
        break;
      case "minutes":
        result.setMinutes(result.getMinutes() + value);
        break;
      case "hours":
        result.setHours(result.getHours() + value);
        break;
      case "days":
        result.setDate(result.getDate() + value);
        break;
      case "months":
        result.setMonth(result.getMonth() + value);
        break;
      case "years":
        result.setFullYear(result.getFullYear() + value);
        break;
    }
    return result;
  },

  now: (): Date => new Date(),

  today: (): Date => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// EVALUADOR PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Evalúa un campo calculado completo
 */
export function evaluateCalculatedField(field: CalculatedField, context: EvaluationContext): any {
  const { config, type } = field;

  /**
   * Convierte un valor de fila en fecha, o `null`.
   *
   * `context.row` es `Record<string, unknown>`: aquí puede llegar cualquier
   * cosa que alguien haya guardado en el campo. `new Date(unknown)` no compila,
   * pero forzarlo con un cast tampoco vale, y no por los tipos:
   *
   *     new Date(true)  →  1970-01-01T00:00:00.000Z
   *
   * **No es una fecha inválida.** El `isNaN(...getTime())` que había debajo la
   * daba por buena, así que un campo booleano —o el número 0— se convertía en
   * una fecha de 1970 y el campo calculado devolvía una diferencia de 56 años
   * sin que nada fallara.
   *
   * Solo pasan los tres tipos que representan una fecha de verdad.
   */
  const comoFecha = (v: unknown): Date | null => {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v !== "string" && typeof v !== "number") return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  try {
    switch (type) {
      case "formula": {
        if (!config.expression) return null;
        return evaluateExpression(config.expression, context);
      }

      case "conditional": {
        if (!config.condition) return null;
        const conditionMet = evaluateCondition(config.condition, context);
        return conditionMet ? config.trueValue : config.falseValue;
      }

      case "concat": {
        if (!config.fields) return null;
        const values = config.fields.map((f) => context.row[f] || "");
        return values.join(config.separator || " ");
      }

      case "date_diff": {
        if (!config.startField || !config.endField) return null;
        const start = comoFecha(context.row[config.startField]);
        const end = comoFecha(context.row[config.endField]);
        if (!start || !end) return null;
        return dateFunctions.diff(start, end, config.unit || "days");
      }

      case "date_add": {
        if (!config.dateField || config.value === undefined) return null;
        const date = comoFecha(context.row[config.dateField]);
        if (!date) return null;
        return dateFunctions.add(date, config.value, config.unit || "days");
      }

      case "count":
      case "sum":
      case "avg":
      case "min":
      case "max": {
        // Estos requieren datos relacionados que se pasan en context.entries
        if (!context.entries || !config.sourceField) return null;
        const func = aggregationFunctions[type];
        return func(context.entries, config.sourceField);
      }

      case "rollup": {
        // Agregación desde una relación
        if (!context.entries || !config.sourceField) return null;
        // Aplicar filtro si existe
        let entries = context.entries;
        if (config.filter) {
          entries = entries.filter((e) => {
            const value = e[config.filter!.field];
            switch (config.filter!.operator) {
              case "eq":
                return mismoValor(value, config.filter!.value);
              case "neq":
                return !mismoValor(value, config.filter!.value);
              case "gt":
                return Number(value) > Number(config.filter!.value);
              case "lt":
                return Number(value) < Number(config.filter!.value);
              default:
                return true;
            }
          });
        }
        return aggregationFunctions.sum(entries, config.sourceField);
      }

      case "lookup": {
        // Buscar valor en datos relacionados
        if (!context.relatedData || !config.returnField) return null;
        const matchValue = context.row[config.matchField!];
        // `relatedData[tabla]` es `unknown`: con una configuración de lookup
        // mal guardada, `.find` revienta en ejecución en vez de no encontrar.
        const relacionadas = context.relatedData[config.targetTable!];
        const found = Array.isArray(relacionadas)
          ? relacionadas.find(
              (item: Record<string, unknown>) => item[config.targetField!] === matchValue
            )
          : undefined;
        return found?.[config.returnField] || null;
      }

      default:
        return null;
    }
  } catch (err) {
    console.error(`Error evaluating calculated field "${field.name}":`, err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMATEO DE RESULTADOS
// ═══════════════════════════════════════════════════════════════════════════

export function formatCalculatedValue(value: any, format?: CalculatedField["format"]): any {
  if (value === null || value === undefined) return null;
  if (!format) return value;

  switch (format.type) {
    case "number": {
      const num = Number(value);
      if (isNaN(num)) return value;
      return format.decimals !== undefined ? num.toFixed(format.decimals) : num;
    }

    case "currency": {
      const currency = Number(value);
      if (isNaN(currency)) return value;
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: format.currency || "USD",
        minimumFractionDigits: format.decimals || 2,
        maximumFractionDigits: format.decimals || 2,
      }).format(currency);
      return format.prefix ? `${format.prefix}${formatted}` : formatted;
    }

    case "percentage": {
      const pct = Number(value);
      if (isNaN(pct)) return value;
      const formatted =
        format.decimals !== undefined
          ? `${(pct * 100).toFixed(format.decimals)}%`
          : `${(pct * 100).toFixed(0)}%`;
      return format.suffix ? `${formatted}${format.suffix}` : formatted;
    }

    case "date":
    case "datetime": {
      if (!(value instanceof Date) && typeof value !== "string") return value;
      const date = value instanceof Date ? value : new Date(value);
      if (isNaN(date.getTime())) return value;
      return date.toISOString();
    }

    case "duration": {
      const seconds = Number(value);
      if (isNaN(seconds)) return value;
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      if (hours > 0) return `${hours}h ${mins}m`;
      if (mins > 0) return `${mins}m ${secs}s`;
      return `${secs}s`;
    }

    case "boolean": {
      return Boolean(value);
    }

    case "badge":
    case "text":
    default: {
      let result = String(value);
      if (format.prefix) result = format.prefix + result;
      if (format.suffix) result = result + format.suffix;
      return result;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES PARA BUILDER DE FÓRMULAS
// ═══════════════════════════════════════════════════════════════════════════

export const FORMULA_FUNCTIONS = [
  {
    id: "abs",
    name: "Absolute",
    description: "Valor absoluto",
    example: "ABS(-5) → 5",
    category: "math",
  },
  {
    id: "round",
    name: "Round",
    description: "Redondear número",
    example: "ROUND(3.14159, 2) → 3.14",
    category: "math",
  },
  {
    id: "ceil",
    name: "Ceiling",
    description: "Redondear arriba",
    example: "CEIL(3.2) → 4",
    category: "math",
  },
  {
    id: "floor",
    name: "Floor",
    description: "Redondear abajo",
    example: "FLOOR(3.8) → 3",
    category: "math",
  },
  {
    id: "sqrt",
    name: "Square Root",
    description: "Raíz cuadrada",
    example: "SQRT(16) → 4",
    category: "math",
  },
  { id: "pow", name: "Power", description: "Potencia", example: "POW(2, 3) → 8", category: "math" },
  {
    id: "len",
    name: "Length",
    description: "Longitud de texto",
    example: "LEN('hello') → 5",
    category: "text",
  },
  {
    id: "upper",
    name: "Uppercase",
    description: "Mayúsculas",
    example: "UPPER('hello') → 'HELLO'",
    category: "text",
  },
  {
    id: "lower",
    name: "Lowercase",
    description: "Minúsculas",
    example: "LOWER('HELLO') → 'hello'",
    category: "text",
  },
  {
    id: "trim",
    name: "Trim",
    description: "Quitar espacios",
    example: "TRIM('  hello  ') → 'hello'",
    category: "text",
  },
  {
    id: "concat",
    name: "Concatenate",
    description: "Unir textos",
    example: "CONCAT('Hello', ' ', 'World')",
    category: "text",
  },
  {
    id: "substring",
    name: "Substring",
    description: "Extraer parte",
    example: "SUBSTRING('hello', 0, 3) → 'hel'",
    category: "text",
  },
  {
    id: "now",
    name: "Now",
    description: "Fecha/hora actual",
    example: "NOW() → 2026-03-19",
    category: "date",
  },
  {
    id: "today",
    name: "Today",
    description: "Fecha actual",
    example: "TODAY() → 2026-03-19",
    category: "date",
  },
  {
    id: "year",
    name: "Year",
    description: "Año de fecha",
    example: "YEAR({createdAt}) → 2026",
    category: "date",
  },
  {
    id: "month",
    name: "Month",
    description: "Mes de fecha",
    example: "MONTH({createdAt}) → 3",
    category: "date",
  },
  {
    id: "day",
    name: "Day",
    description: "Día de fecha",
    example: "DAY({createdAt}) → 19",
    category: "date",
  },
  {
    id: "datediff",
    name: "Date Diff",
    description: "Diferencia de fechas",
    example: "DATEDIFF({start}, {end}, 'days')",
    category: "date",
  },
  {
    id: "if",
    name: "If",
    description: "Condicional",
    example: "IF({status}='active', 1, 0)",
    category: "logic",
  },
  {
    id: "and",
    name: "And",
    description: "Y lógico",
    example: "AND({a}>0, {b}<100)",
    category: "logic",
  },
  {
    id: "or",
    name: "Or",
    description: "O lógico",
    example: "OR({status}='a', {status}='b')",
    category: "logic",
  },
  { id: "not", name: "Not", description: "Negación", example: "NOT({active})", category: "logic" },
  {
    id: "coalesce",
    name: "Coalesce",
    description: "Primer no-nulo",
    example: "COALESCE({nickname}, {name})",
    category: "logic",
  },
  {
    id: "sum",
    name: "Sum",
    description: "Sumar valores",
    example: "SUM({items}, 'price')",
    category: "aggregate",
  },
  {
    id: "count",
    name: "Count",
    description: "Contar items",
    example: "COUNT({items})",
    category: "aggregate",
  },
  {
    id: "avg",
    name: "Average",
    description: "Promedio",
    example: "AVG({items}, 'price')",
    category: "aggregate",
  },
  {
    id: "min",
    name: "Minimum",
    description: "Valor mínimo",
    example: "MIN({items}, 'price')",
    category: "aggregate",
  },
  {
    id: "max",
    name: "Maximum",
    description: "Valor máximo",
    example: "MAX({items}, 'price')",
    category: "aggregate",
  },
] as const;

export const FORMULA_OPERATORS = [
  { id: "+", name: "Add", symbol: "+", description: "Suma", precedence: 2 },
  { id: "-", name: "Subtract", symbol: "-", description: "Resta", precedence: 2 },
  { id: "*", name: "Multiply", symbol: "×", description: "Multiplicación", precedence: 3 },
  { id: "/", name: "Divide", symbol: "÷", description: "División", precedence: 3 },
  { id: "%", name: "Modulo", symbol: "%", description: "Resto", precedence: 3 },
  { id: "^", name: "Power", symbol: "^", description: "Potencia", precedence: 4 },
  { id: "==", name: "Equals", symbol: "=", description: "Igual", precedence: 1 },
  { id: "!=", name: "Not Equals", symbol: "≠", description: "Diferente", precedence: 1 },
  { id: ">", name: "Greater", symbol: ">", description: "Mayor que", precedence: 1 },
  { id: ">=", name: "Greater Eq", symbol: "≥", description: "Mayor o igual", precedence: 1 },
  { id: "<", name: "Less", symbol: "<", description: "Menor que", precedence: 1 },
  { id: "<=", name: "Less Eq", symbol: "≤", description: "Menor o igual", precedence: 1 },
  { id: "&", name: "Concat", symbol: "&", description: "Concatenar", precedence: 1 },
] as const;
