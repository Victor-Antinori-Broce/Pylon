/**
 * Calculated Fields / KPI Components
 *
 * Componentes para crear y gestionar campos calculados en datasets.
 */
export { default as FormulaBuilder } from "./FormulaBuilder.svelte";
export { default as KpiCreator } from "./KpiCreator.svelte";
export type CalculatedFieldType = "formula" | "count" | "sum" | "average" | "min" | "max" | "concat" | "date_diff" | "conditional" | "lookup";
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
        lookupTable?: string;
        lookupField?: string;
        lookupKey?: string;
    };
}
export interface FormulaBuilderNode {
    type: "field" | "operator" | "function" | "value";
    value: string;
    children?: FormulaBuilderNode[];
}
export declare const FORMULA_FUNCTIONS: {
    id: string;
    label: string;
    description: string;
}[];
export declare const FORMULA_OPERATORS: {
    id: string;
    label: string;
    description: string;
}[];
export declare const fieldPresets: {
    price: {
        type: string;
        label: string;
    };
    quantity: {
        type: string;
        label: string;
    };
    discount: {
        type: string;
        label: string;
    };
    subtotal: {
        type: string;
        label: string;
    };
    tax: {
        type: string;
        label: string;
    };
    total: {
        type: string;
        label: string;
    };
};
export declare const calculatedHelpers: {
    evaluateExpression: (expression: string, context: Record<string, any>) => number;
};
//# sourceMappingURL=index.d.ts.map