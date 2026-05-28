// @ts-nocheck
/**
 * Calculated Fields / KPI System
 *
 * Sistema de campos calculados para datasets y tablas.
 * Permite definir métricas y fórmulas que se evalúan en tiempo real.
 */
// Funciones disponibles en el builder
export const FORMULA_FUNCTIONS = [
    { id: "abs", name: "Absolute", description: "Valor absoluto", example: "ABS(-5) → 5" },
    { id: "round", name: "Round", description: "Redondear número", example: "ROUND(3.14159, 2) → 3.14" },
    { id: "ceil", name: "Ceiling", description: "Redondear arriba", example: "CEIL(3.2) → 4" },
    { id: "floor", name: "Floor", description: "Redondear abajo", example: "FLOOR(3.8) → 3" },
    { id: "len", name: "Length", description: "Longitud de texto", example: "LEN('hello') → 5" },
    { id: "upper", name: "Uppercase", description: "Mayúsculas", example: "UPPER('hello') → 'HELLO'" },
    { id: "lower", name: "Lowercase", description: "Minúsculas", example: "LOWER('HELLO') → 'hello'" },
    { id: "trim", name: "Trim", description: "Quitar espacios", example: "TRIM('  hello  ') → 'hello'" },
    { id: "now", name: "Now", description: "Fecha/hora actual", example: "NOW() → 2026-03-18" },
    { id: "today", name: "Today", description: "Fecha actual", example: "TODAY() → 2026-03-18" },
    { id: "year", name: "Year", description: "Año de fecha", example: "YEAR({createdAt}) → 2026" },
    { id: "month", name: "Month", description: "Mes de fecha", example: "MONTH({createdAt}) → 3" },
    { id: "day", name: "Day", description: "Día de fecha", example: "DAY({createdAt}) → 18" },
    { id: "if", name: "If", description: "Condicional", example: "IF({status}='active', 1, 0)" },
    { id: "and", name: "And", description: "Y lógico", example: "AND({a}>0, {b}<100)" },
    { id: "or", name: "Or", description: "O lógico", example: "OR({status}='a', {status}='b')" },
    { id: "not", name: "Not", description: "Negación", example: "NOT({active})" },
    { id: "coalesce", name: "Coalesce", description: "Primer no-nulo", example: "COALESCE({nickname}, {name})" },
];
// Operadores
export const FORMULA_OPERATORS = [
    { id: "+", name: "Add", symbol: "+", description: "Suma" },
    { id: "-", name: "Subtract", symbol: "-", description: "Resta" },
    { id: "*", name: "Multiply", symbol: "×", description: "Multiplicación" },
    { id: "/", name: "Divide", symbol: "÷", description: "División" },
    { id: "%", name: "Modulo", symbol: "%", description: "Resto" },
    { id: "^", name: "Power", symbol: "^", description: "Potencia" },
    { id: "==", name: "Equals", symbol: "=", description: "Igual" },
    { id: "!=", name: "Not Equals", symbol: "≠", description: "Diferente" },
    { id: ">", name: "Greater", symbol: ">", description: "Mayor que" },
    { id: ">=", name: "Greater Eq", symbol: "≥", description: "Mayor o igual" },
    { id: "<", name: "Less", symbol: "<", description: "Menor que" },
    { id: "<=", name: "Less Eq", symbol: "≤", description: "Menor o igual" },
    { id: "&", name: "Concat", symbol: "&", description: "Concatenar" },
];
//# sourceMappingURL=calculated-fields.js.map