import { t } from "$lib/i18n";
/**
 * Calculated Fields / KPI Components
 *
 * Componentes para crear y gestionar campos calculados en datasets.
 */

export { default as FormulaBuilder } from "./FormulaBuilder.svelte";
export { default as KpiCreator } from "./KpiCreator.svelte";

// Inline type definitions (avoiding external dependency)
export type CalculatedFieldType =
  | "formula"
  | "count"
  | "sum"
  | "average"
  | "min"
  | "max"
  | "concat"
  | "date_diff"
  | "conditional"
  | "lookup";

export interface FilterConfig {
  field: string;
  operator: string;
  value?: any;
}

export interface CalculatedField {
  id: string;
  name: string;
  label: string;
  type: CalculatedFieldType;
  config: {
    expression?: string;
    sourceTable?: string;
    sourceField?: string;
    filter?: FilterConfig;
    fields?: string[];
    separator?: string;
    startField?: string;
    endField?: string;
    unit?: "days" | "hours" | "minutes" | "seconds";
    condition?: {
      field: string;
      operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty";
      value?: any;
    };
    trueValue?: string;
    falseValue?: string;
    lookupTable?: string;
    lookupField?: string;
    lookupKey?: string;
  };
  format?: {
    type: string;
    currency?: string;
    decimals?: number;
    prefix?: string;
    suffix?: string;
  };
  dependsOn?: string[];
  isKpi?: boolean;
  target?: number;
  warningThreshold?: number;
}

export interface FormulaBuilderNode {
  type: "field" | "operator" | "function" | "value";
  value: string;
  children?: FormulaBuilderNode[];
}

export const FORMULA_FUNCTIONS = [
  { id: "abs", label: "ABS", description: t("index.valorAbsoluto") },
  { id: "round", label: t("index.round"), description: t("index.redondear") },
  { id: "ceil", label: "CEIL", description: t("index.redondearHaciaArriba") },
  { id: "floor", label: t("index.floor"), description: t("index.redondearHaciaAbajo") },
  { id: "min", label: "MIN", description: t("index.valorMinimo") },
  { id: "max", label: "MAX", description: t("index.valorMaximo") },
  { id: "sum", label: "SUM", description: t("index.suma") },
  { id: "avg", label: "AVG", description: t("index.promedio") },
  { id: "count", label: t("index.count"), description: t("index.contar") },
  { id: "if", label: "IF", description: t("index.condicional") },
  { id: "and", label: "AND", description: t("index.yLogico") },
  { id: "or", label: "OR", description: t("index.oLogico") },
  { id: "not", label: "NOT", description: t("index.negacion") },
  { id: "concat", label: t("index.concat"), description: t("index.concatenar") },
  { id: "length", label: t("index.length"), description: t("index.longitud") },
  { id: "upper", label: t("index.upper"), description: t("index.mayusculas") },
  { id: "lower", label: t("index.lower"), description: t("index.minusculas") },
  { id: "substring", label: t("index.substring"), description: t("index.subcadena") },
  { id: "replace", label: t("index.replace"), description: t("index.reemplazar") },
  { id: "date_diff", label: t("index.dateDiff"), description: t("index.diferenciaDeFechas") },
  { id: "now", label: "NOW", description: t("index.fechaActual") },
  { id: "today", label: t("index.today"), description: t("index.hoy") },
];

export const FORMULA_OPERATORS = [
  { id: "+", label: "+", description: t("index.suma") },
  { id: "-", label: "-", description: t("index.resta") },
  { id: "*", label: "×", description: t("index.multiplicacion") },
  { id: "/", label: "÷", description: t("index.division") },
  { id: "%", label: "%", description: t("index.modulo") },
  { id: "^", label: "^", description: t("index.potencia") },
  { id: "=", label: "=", description: t("index.igual") },
  { id: "!=", label: "≠", description: t("index.diferente") },
  { id: ">", label: ">", description: t("index.mayorQue") },
  { id: ">=", label: "≥", description: t("index.mayorOIgual") },
  { id: "<", label: "<", description: t("index.menorQue") },
  { id: "<=", label: "≤", description: t("index.menorOIgual") },
  { id: "&", label: "&", description: t("index.concatenar") },
];

export const fieldPresets = {
  price: { type: "number", label: t("index.precio") },
  quantity: { type: "number", label: t("index.cantidad") },
  discount: { type: "number", label: t("index.descuento") },
  subtotal: { type: "number", label: t("index.subtotal") },
  tax: { type: "number", label: t("index.impuesto") },
  total: { type: "number", label: t("index.total") },
};

export const calculatedHelpers = {
  // Helper functions for calculated fields
  evaluateExpression: (expression: string, context: Record<string, any>): number => {
    try {
      // Simple evaluation - in production, use a proper formula parser
      const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, "");
      return new Function("context", `with(context) { return ${sanitized}; }`)(context);
    } catch {
      return 0;
    }
  },
};
