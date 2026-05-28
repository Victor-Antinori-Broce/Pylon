/**
 * Calculated Fields / KPI Components
 *
 * Componentes para crear y gestionar campos calculados en datasets.
 */
export { default as FormulaBuilder } from "./FormulaBuilder.svelte";
export { default as KpiCreator } from "./KpiCreator.svelte";
export const FORMULA_FUNCTIONS = [
    { id: "abs", label: "ABS", description: "Valor absoluto" },
    { id: "round", label: "ROUND", description: "Redondear" },
    { id: "ceil", label: "CEIL", description: "Redondear hacia arriba" },
    { id: "floor", label: "FLOOR", description: "Redondear hacia abajo" },
    { id: "min", label: "MIN", description: "Valor mínimo" },
    { id: "max", label: "MAX", description: "Valor máximo" },
    { id: "sum", label: "SUM", description: "Suma" },
    { id: "avg", label: "AVG", description: "Promedio" },
    { id: "count", label: "COUNT", description: "Contar" },
    { id: "if", label: "IF", description: "Condicional" },
    { id: "and", label: "AND", description: "Y lógico" },
    { id: "or", label: "OR", description: "O lógico" },
    { id: "not", label: "NOT", description: "Negación" },
    { id: "concat", label: "CONCAT", description: "Concatenar" },
    { id: "length", label: "LENGTH", description: "Longitud" },
    { id: "upper", label: "UPPER", description: "Mayúsculas" },
    { id: "lower", label: "LOWER", description: "Minúsculas" },
    { id: "substring", label: "SUBSTRING", description: "Subcadena" },
    { id: "replace", label: "REPLACE", description: "Reemplazar" },
    { id: "date_diff", label: "DATE_DIFF", description: "Diferencia de fechas" },
    { id: "now", label: "NOW", description: "Fecha actual" },
    { id: "today", label: "TODAY", description: "Hoy" },
];
export const FORMULA_OPERATORS = [
    { id: "+", label: "+", description: "Suma" },
    { id: "-", label: "-", description: "Resta" },
    { id: "*", label: "×", description: "Multiplicación" },
    { id: "/", label: "÷", description: "División" },
    { id: "%", label: "%", description: "Módulo" },
    { id: "^", label: "^", description: "Potencia" },
    { id: "=", label: "=", description: "Igual" },
    { id: "!=", label: "≠", description: "Diferente" },
    { id: ">", label: ">", description: "Mayor que" },
    { id: ">=", label: "≥", description: "Mayor o igual" },
    { id: "<", label: "<", description: "Menor que" },
    { id: "<=", label: "≤", description: "Menor o igual" },
    { id: "&", label: "&", description: "Concatenar" },
];
export const fieldPresets = {
    price: { type: "number", label: "Precio" },
    quantity: { type: "number", label: "Cantidad" },
    discount: { type: "number", label: "Descuento" },
    subtotal: { type: "number", label: "Subtotal" },
    tax: { type: "number", label: "Impuesto" },
    total: { type: "number", label: "Total" },
};
export const calculatedHelpers = {
    // Helper functions for calculated fields
    evaluateExpression: (expression, context) => {
        try {
            // Simple evaluation - in production, use a proper formula parser
            const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, "");
            return new Function("context", `with(context) { return ${sanitized}; }`)(context);
        }
        catch {
            return 0;
        }
    },
};
//# sourceMappingURL=index.js.map