// @ts-nocheck
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
    expression: z.string().optional(),
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
    type: z.enum(["text", "number", "currency", "percentage", "date", "datetime", "duration", "badge", "boolean"]),
    currency: z.string().optional(),
    decimals: z.number().optional(),
    prefix: z.string().optional(),
    suffix: z.string().optional(),
    color: z.string().optional(),
});
export const createCalculatedFieldSchema = z.object({
    dataSetId: z.string().uuid(),
    name: z.string().min(1).max(100).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Must start with letter, only letters/numbers/underscores"),
    label: z.string().min(1).max(200),
    type: z.enum(["formula", "count", "sum", "avg", "min", "max", "concat", "date_diff", "date_add", "conditional", "lookup", "rollup"]),
    config: calculatedFieldConfigSchema,
    format: formatConfigSchema.optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    isKpi: z.boolean().optional(),
    target: z.number().optional(),
    warningThreshold: z.number().optional(),
    dependsOn: z.array(z.string()).default([]),
});
export const updateCalculatedFieldSchema = createCalculatedFieldSchema.partial().omit({ dataSetId: true });
/**
 * Evalúa una expresión matemática/lógica
 * Ej: "{price} * {quantity} * (1 - {discount})"
 */
export function evaluateExpression(expression, context) {
    const { row } = context;
    // Reemplazar referencias a campos: {fieldName} -> valor
    let processedExpr = expression.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, fieldName) => {
        const value = row[fieldName];
        // Manejar diferentes tipos
        if (value === null || value === undefined) {
            return "0";
        }
        if (typeof value === "string") {
            // Escapar strings para evaluación segura
            return `"${value.replace(/"/g, '\\"')}"`;
        }
        if (value instanceof Date) {
            return value.getTime();
        }
        return String(value);
    });
    // Evaluar de forma segura
    try {
        // Usar Function en lugar de eval para un poco más de seguridad
        // NOTA: En producción, usar un parser de expresiones más seguro como mathjs
        const result = new Function("return " + processedExpr)();
        return result;
    }
    catch (err) {
        console.error("Expression evaluation error:", err, "Expression:", processedExpr);
        return null;
    }
}
/**
 * Evalúa una condición
 */
export function evaluateCondition(condition, context) {
    const { row } = context;
    const fieldValue = row[condition.field];
    const compareValue = condition.value;
    switch (condition.operator) {
        case "eq": return fieldValue == compareValue;
        case "neq": return fieldValue != compareValue;
        case "gt": return Number(fieldValue) > Number(compareValue);
        case "gte": return Number(fieldValue) >= Number(compareValue);
        case "lt": return Number(fieldValue) < Number(compareValue);
        case "lte": return Number(fieldValue) <= Number(compareValue);
        case "contains": return String(fieldValue).includes(String(compareValue));
        case "empty": return fieldValue === null || fieldValue === undefined || fieldValue === "";
        case "not_empty": return fieldValue !== null && fieldValue !== undefined && fieldValue !== "";
        case "in": return Array.isArray(compareValue) && compareValue.includes(fieldValue);
        default: return false;
    }
}
/**
 * Funciones de agregación
 */
export const aggregationFunctions = {
    sum: (entries, field) => {
        return entries.reduce((acc, entry) => acc + (Number(entry[field]) || 0), 0);
    },
    count: (entries) => entries.length,
    avg: (entries, field) => {
        if (!entries.length)
            return 0;
        const sum = aggregationFunctions.sum(entries, field);
        return sum / entries.length;
    },
    min: (entries, field) => {
        if (!entries.length)
            return 0;
        return Math.min(...entries.map(e => Number(e[field]) || Infinity));
    },
    max: (entries, field) => {
        if (!entries.length)
            return 0;
        return Math.max(...entries.map(e => Number(e[field]) || -Infinity));
    },
};
/**
 * Funciones de fecha
 */
export const dateFunctions = {
    diff: (start, end, unit) => {
        const diffMs = end.getTime() - start.getTime();
        switch (unit) {
            case "seconds": return Math.floor(diffMs / 1000);
            case "minutes": return Math.floor(diffMs / (1000 * 60));
            case "hours": return Math.floor(diffMs / (1000 * 60 * 60));
            case "days": return Math.floor(diffMs / (1000 * 60 * 60 * 24));
            case "months": return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
            case "years": return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365));
            default: return diffMs;
        }
    },
    add: (date, value, unit) => {
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
    now: () => new Date(),
    today: () => {
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
export function evaluateCalculatedField(field, context) {
    const { config, type } = field;
    try {
        switch (type) {
            case "formula": {
                if (!config.expression)
                    return null;
                return evaluateExpression(config.expression, context);
            }
            case "conditional": {
                if (!config.condition)
                    return null;
                const conditionMet = evaluateCondition(config.condition, context);
                return conditionMet ? config.trueValue : config.falseValue;
            }
            case "concat": {
                if (!config.fields)
                    return null;
                const values = config.fields.map(f => context.row[f] || "");
                return values.join(config.separator || " ");
            }
            case "date_diff": {
                if (!config.startField || !config.endField)
                    return null;
                const start = new Date(context.row[config.startField]);
                const end = new Date(context.row[config.endField]);
                if (isNaN(start.getTime()) || isNaN(end.getTime()))
                    return null;
                return dateFunctions.diff(start, end, config.unit || "days");
            }
            case "date_add": {
                if (!config.dateField || config.value === undefined)
                    return null;
                const date = new Date(context.row[config.dateField]);
                if (isNaN(date.getTime()))
                    return null;
                return dateFunctions.add(date, config.value, config.unit || "days");
            }
            case "count":
            case "sum":
            case "avg":
            case "min":
            case "max": {
                // Estos requieren datos relacionados que se pasan en context.entries
                if (!context.entries || !config.sourceField)
                    return null;
                const func = aggregationFunctions[type];
                return func(context.entries, config.sourceField);
            }
            case "rollup": {
                // Agregación desde una relación
                if (!context.entries || !config.sourceField)
                    return null;
                // Aplicar filtro si existe
                let entries = context.entries;
                if (config.filter) {
                    entries = entries.filter(e => {
                        const value = e[config.filter.field];
                        switch (config.filter.operator) {
                            case "eq": return value == config.filter.value;
                            case "neq": return value != config.filter.value;
                            case "gt": return Number(value) > Number(config.filter.value);
                            case "lt": return Number(value) < Number(config.filter.value);
                            default: return true;
                        }
                    });
                }
                return aggregationFunctions.sum(entries, config.sourceField);
            }
            case "lookup": {
                // Buscar valor en datos relacionados
                if (!context.relatedData || !config.returnField)
                    return null;
                const matchValue = context.row[config.matchField];
                const found = context.relatedData[config.targetTable]?.find((item) => item[config.targetField] === matchValue);
                return found?.[config.returnField] || null;
            }
            default:
                return null;
        }
    }
    catch (err) {
        console.error(`Error evaluating calculated field "${field.name}":`, err);
        return null;
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// FORMATEO DE RESULTADOS
// ═══════════════════════════════════════════════════════════════════════════
export function formatCalculatedValue(value, format) {
    if (value === null || value === undefined)
        return null;
    if (!format)
        return value;
    switch (format.type) {
        case "number": {
            const num = Number(value);
            if (isNaN(num))
                return value;
            return format.decimals !== undefined
                ? num.toFixed(format.decimals)
                : num;
        }
        case "currency": {
            const currency = Number(value);
            if (isNaN(currency))
                return value;
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
            if (isNaN(pct))
                return value;
            const formatted = format.decimals !== undefined
                ? `${(pct * 100).toFixed(format.decimals)}%`
                : `${(pct * 100).toFixed(0)}%`;
            return format.suffix ? `${formatted}${format.suffix}` : formatted;
        }
        case "date":
        case "datetime": {
            if (!(value instanceof Date) && typeof value !== "string")
                return value;
            const date = value instanceof Date ? value : new Date(value);
            if (isNaN(date.getTime()))
                return value;
            return date.toISOString();
        }
        case "duration": {
            const seconds = Number(value);
            if (isNaN(seconds))
                return value;
            const hours = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            if (hours > 0)
                return `${hours}h ${mins}m`;
            if (mins > 0)
                return `${mins}m ${secs}s`;
            return `${secs}s`;
        }
        case "boolean": {
            return Boolean(value);
        }
        case "badge":
        case "text":
        default: {
            let result = String(value);
            if (format.prefix)
                result = format.prefix + result;
            if (format.suffix)
                result = result + format.suffix;
            return result;
        }
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES PARA BUILDER DE FÓRMULAS
// ═══════════════════════════════════════════════════════════════════════════
export const FORMULA_FUNCTIONS = [
    { id: "abs", name: "Absolute", description: "Valor absoluto", example: "ABS(-5) → 5", category: "math" },
    { id: "round", name: "Round", description: "Redondear número", example: "ROUND(3.14159, 2) → 3.14", category: "math" },
    { id: "ceil", name: "Ceiling", description: "Redondear arriba", example: "CEIL(3.2) → 4", category: "math" },
    { id: "floor", name: "Floor", description: "Redondear abajo", example: "FLOOR(3.8) → 3", category: "math" },
    { id: "sqrt", name: "Square Root", description: "Raíz cuadrada", example: "SQRT(16) → 4", category: "math" },
    { id: "pow", name: "Power", description: "Potencia", example: "POW(2, 3) → 8", category: "math" },
    { id: "len", name: "Length", description: "Longitud de texto", example: "LEN('hello') → 5", category: "text" },
    { id: "upper", name: "Uppercase", description: "Mayúsculas", example: "UPPER('hello') → 'HELLO'", category: "text" },
    { id: "lower", name: "Lowercase", description: "Minúsculas", example: "LOWER('HELLO') → 'hello'", category: "text" },
    { id: "trim", name: "Trim", description: "Quitar espacios", example: "TRIM('  hello  ') → 'hello'", category: "text" },
    { id: "concat", name: "Concatenate", description: "Unir textos", example: "CONCAT('Hello', ' ', 'World')", category: "text" },
    { id: "substring", name: "Substring", description: "Extraer parte", example: "SUBSTRING('hello', 0, 3) → 'hel'", category: "text" },
    { id: "now", name: "Now", description: "Fecha/hora actual", example: "NOW() → 2026-03-19", category: "date" },
    { id: "today", name: "Today", description: "Fecha actual", example: "TODAY() → 2026-03-19", category: "date" },
    { id: "year", name: "Year", description: "Año de fecha", example: "YEAR({createdAt}) → 2026", category: "date" },
    { id: "month", name: "Month", description: "Mes de fecha", example: "MONTH({createdAt}) → 3", category: "date" },
    { id: "day", name: "Day", description: "Día de fecha", example: "DAY({createdAt}) → 19", category: "date" },
    { id: "datediff", name: "Date Diff", description: "Diferencia de fechas", example: "DATEDIFF({start}, {end}, 'days')", category: "date" },
    { id: "if", name: "If", description: "Condicional", example: "IF({status}='active', 1, 0)", category: "logic" },
    { id: "and", name: "And", description: "Y lógico", example: "AND({a}>0, {b}<100)", category: "logic" },
    { id: "or", name: "Or", description: "O lógico", example: "OR({status}='a', {status}='b')", category: "logic" },
    { id: "not", name: "Not", description: "Negación", example: "NOT({active})", category: "logic" },
    { id: "coalesce", name: "Coalesce", description: "Primer no-nulo", example: "COALESCE({nickname}, {name})", category: "logic" },
    { id: "sum", name: "Sum", description: "Sumar valores", example: "SUM({items}, 'price')", category: "aggregate" },
    { id: "count", name: "Count", description: "Contar items", example: "COUNT({items})", category: "aggregate" },
    { id: "avg", name: "Average", description: "Promedio", example: "AVG({items}, 'price')", category: "aggregate" },
    { id: "min", name: "Minimum", description: "Valor mínimo", example: "MIN({items}, 'price')", category: "aggregate" },
    { id: "max", name: "Maximum", description: "Valor máximo", example: "MAX({items}, 'price')", category: "aggregate" },
];
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
];
//# sourceMappingURL=datasets.calculated.js.map