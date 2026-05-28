/**
 * Calculated Fields / KPI System
 *
 * Sistema de campos calculados para datasets y tablas.
 * Permite definir métricas y fórmulas que se evalúan en tiempo real.
 */
export type CalculatedFieldType = "formula" | "count" | "sum" | "average" | "min" | "max" | "concat" | "date_diff" | "conditional" | "lookup";
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
        trueValue?: any;
        falseValue?: any;
        targetTable?: string;
        targetField?: string;
        matchField?: string;
        returnField?: string;
    };
    format?: {
        type: "text" | "number" | "currency" | "percentage" | "date" | "duration" | "badge";
        currency?: string;
        decimals?: number;
        prefix?: string;
        suffix?: string;
        color?: string;
    };
    dependsOn: string[];
    description?: string;
    category?: string;
    isKpi?: boolean;
    target?: number;
    warningThreshold?: number;
}
export interface FilterConfig {
    field: string;
    operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains";
    value: any;
}
export interface FormulaBuilderNode {
    id: string;
    type: "field" | "operator" | "function" | "value" | "group";
    value: any;
    children?: FormulaBuilderNode[];
}
export declare const FORMULA_FUNCTIONS: readonly [{
    readonly id: "abs";
    readonly name: "Absolute";
    readonly description: "Valor absoluto";
    readonly example: "ABS(-5) → 5";
}, {
    readonly id: "round";
    readonly name: "Round";
    readonly description: "Redondear número";
    readonly example: "ROUND(3.14159, 2) → 3.14";
}, {
    readonly id: "ceil";
    readonly name: "Ceiling";
    readonly description: "Redondear arriba";
    readonly example: "CEIL(3.2) → 4";
}, {
    readonly id: "floor";
    readonly name: "Floor";
    readonly description: "Redondear abajo";
    readonly example: "FLOOR(3.8) → 3";
}, {
    readonly id: "len";
    readonly name: "Length";
    readonly description: "Longitud de texto";
    readonly example: "LEN('hello') → 5";
}, {
    readonly id: "upper";
    readonly name: "Uppercase";
    readonly description: "Mayúsculas";
    readonly example: "UPPER('hello') → 'HELLO'";
}, {
    readonly id: "lower";
    readonly name: "Lowercase";
    readonly description: "Minúsculas";
    readonly example: "LOWER('HELLO') → 'hello'";
}, {
    readonly id: "trim";
    readonly name: "Trim";
    readonly description: "Quitar espacios";
    readonly example: "TRIM('  hello  ') → 'hello'";
}, {
    readonly id: "now";
    readonly name: "Now";
    readonly description: "Fecha/hora actual";
    readonly example: "NOW() → 2026-03-18";
}, {
    readonly id: "today";
    readonly name: "Today";
    readonly description: "Fecha actual";
    readonly example: "TODAY() → 2026-03-18";
}, {
    readonly id: "year";
    readonly name: "Year";
    readonly description: "Año de fecha";
    readonly example: "YEAR({createdAt}) → 2026";
}, {
    readonly id: "month";
    readonly name: "Month";
    readonly description: "Mes de fecha";
    readonly example: "MONTH({createdAt}) → 3";
}, {
    readonly id: "day";
    readonly name: "Day";
    readonly description: "Día de fecha";
    readonly example: "DAY({createdAt}) → 18";
}, {
    readonly id: "if";
    readonly name: "If";
    readonly description: "Condicional";
    readonly example: "IF({status}='active', 1, 0)";
}, {
    readonly id: "and";
    readonly name: "And";
    readonly description: "Y lógico";
    readonly example: "AND({a}>0, {b}<100)";
}, {
    readonly id: "or";
    readonly name: "Or";
    readonly description: "O lógico";
    readonly example: "OR({status}='a', {status}='b')";
}, {
    readonly id: "not";
    readonly name: "Not";
    readonly description: "Negación";
    readonly example: "NOT({active})";
}, {
    readonly id: "coalesce";
    readonly name: "Coalesce";
    readonly description: "Primer no-nulo";
    readonly example: "COALESCE({nickname}, {name})";
}];
export declare const FORMULA_OPERATORS: readonly [{
    readonly id: "+";
    readonly name: "Add";
    readonly symbol: "+";
    readonly description: "Suma";
}, {
    readonly id: "-";
    readonly name: "Subtract";
    readonly symbol: "-";
    readonly description: "Resta";
}, {
    readonly id: "*";
    readonly name: "Multiply";
    readonly symbol: "×";
    readonly description: "Multiplicación";
}, {
    readonly id: "/";
    readonly name: "Divide";
    readonly symbol: "÷";
    readonly description: "División";
}, {
    readonly id: "%";
    readonly name: "Modulo";
    readonly symbol: "%";
    readonly description: "Resto";
}, {
    readonly id: "^";
    readonly name: "Power";
    readonly symbol: "^";
    readonly description: "Potencia";
}, {
    readonly id: "==";
    readonly name: "Equals";
    readonly symbol: "=";
    readonly description: "Igual";
}, {
    readonly id: "!=";
    readonly name: "Not Equals";
    readonly symbol: "≠";
    readonly description: "Diferente";
}, {
    readonly id: ">";
    readonly name: "Greater";
    readonly symbol: ">";
    readonly description: "Mayor que";
}, {
    readonly id: ">=";
    readonly name: "Greater Eq";
    readonly symbol: "≥";
    readonly description: "Mayor o igual";
}, {
    readonly id: "<";
    readonly name: "Less";
    readonly symbol: "<";
    readonly description: "Menor que";
}, {
    readonly id: "<=";
    readonly name: "Less Eq";
    readonly symbol: "≤";
    readonly description: "Menor o igual";
}, {
    readonly id: "&";
    readonly name: "Concat";
    readonly symbol: "&";
    readonly description: "Concatenar";
}];
//# sourceMappingURL=calculated-fields.d.ts.map