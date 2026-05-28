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
export type CalculatedFieldType = "formula" | "count" | "sum" | "avg" | "min" | "max" | "concat" | "date_diff" | "date_add" | "conditional" | "lookup" | "rollup";
export interface CalculatedField {
    id: string;
    dataSetId: string;
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
        dateField?: string;
        value?: number;
        unit?: "days" | "hours" | "minutes" | "seconds" | "months" | "years";
        condition?: ConditionConfig;
        trueValue?: any;
        falseValue?: any;
        targetTable?: string;
        targetField?: string;
        matchField?: string;
        returnField?: string;
        relationField?: string;
    };
    format?: {
        type: "text" | "number" | "currency" | "percentage" | "date" | "datetime" | "duration" | "badge" | "boolean";
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
    isActive: boolean;
    sortOrder: number;
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
export declare const filterConfigSchema: z.ZodObject<{
    field: z.ZodString;
    operator: z.ZodEnum<["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "empty", "not_empty"]>;
    value: z.ZodOptional<z.ZodAny>;
}, "strip", z.ZodTypeAny, {
    field: string;
    operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
    value?: any;
}, {
    field: string;
    operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
    value?: any;
}>;
export declare const conditionConfigSchema: z.ZodObject<{
    field: z.ZodString;
    operator: z.ZodEnum<["eq", "neq", "gt", "gte", "lt", "lte", "contains", "empty", "not_empty", "in"]>;
    value: z.ZodOptional<z.ZodAny>;
}, "strip", z.ZodTypeAny, {
    field: string;
    operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
    value?: any;
}, {
    field: string;
    operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
    value?: any;
}>;
export declare const calculatedFieldConfigSchema: z.ZodObject<{
    expression: z.ZodOptional<z.ZodString>;
    sourceTable: z.ZodOptional<z.ZodString>;
    sourceField: z.ZodOptional<z.ZodString>;
    filter: z.ZodOptional<z.ZodObject<{
        field: z.ZodString;
        operator: z.ZodEnum<["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "empty", "not_empty"]>;
        value: z.ZodOptional<z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        field: string;
        operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
        value?: any;
    }, {
        field: string;
        operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
        value?: any;
    }>>;
    fields: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    separator: z.ZodOptional<z.ZodString>;
    startField: z.ZodOptional<z.ZodString>;
    endField: z.ZodOptional<z.ZodString>;
    dateField: z.ZodOptional<z.ZodString>;
    value: z.ZodOptional<z.ZodNumber>;
    unit: z.ZodOptional<z.ZodEnum<["days", "hours", "minutes", "seconds", "months", "years"]>>;
    condition: z.ZodOptional<z.ZodObject<{
        field: z.ZodString;
        operator: z.ZodEnum<["eq", "neq", "gt", "gte", "lt", "lte", "contains", "empty", "not_empty", "in"]>;
        value: z.ZodOptional<z.ZodAny>;
    }, "strip", z.ZodTypeAny, {
        field: string;
        operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
        value?: any;
    }, {
        field: string;
        operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
        value?: any;
    }>>;
    trueValue: z.ZodOptional<z.ZodAny>;
    falseValue: z.ZodOptional<z.ZodAny>;
    targetTable: z.ZodOptional<z.ZodString>;
    targetField: z.ZodOptional<z.ZodString>;
    matchField: z.ZodOptional<z.ZodString>;
    returnField: z.ZodOptional<z.ZodString>;
    relationField: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    filter?: {
        field: string;
        operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
        value?: any;
    } | undefined;
    value?: number | undefined;
    fields?: string[] | undefined;
    dateField?: string | undefined;
    expression?: string | undefined;
    unit?: "days" | "hours" | "minutes" | "seconds" | "months" | "years" | undefined;
    separator?: string | undefined;
    targetTable?: string | undefined;
    sourceTable?: string | undefined;
    sourceField?: string | undefined;
    startField?: string | undefined;
    endField?: string | undefined;
    condition?: {
        field: string;
        operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
        value?: any;
    } | undefined;
    trueValue?: any;
    falseValue?: any;
    targetField?: string | undefined;
    matchField?: string | undefined;
    returnField?: string | undefined;
    relationField?: string | undefined;
}, {
    filter?: {
        field: string;
        operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
        value?: any;
    } | undefined;
    value?: number | undefined;
    fields?: string[] | undefined;
    dateField?: string | undefined;
    expression?: string | undefined;
    unit?: "days" | "hours" | "minutes" | "seconds" | "months" | "years" | undefined;
    separator?: string | undefined;
    targetTable?: string | undefined;
    sourceTable?: string | undefined;
    sourceField?: string | undefined;
    startField?: string | undefined;
    endField?: string | undefined;
    condition?: {
        field: string;
        operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
        value?: any;
    } | undefined;
    trueValue?: any;
    falseValue?: any;
    targetField?: string | undefined;
    matchField?: string | undefined;
    returnField?: string | undefined;
    relationField?: string | undefined;
}>;
export declare const formatConfigSchema: z.ZodObject<{
    type: z.ZodEnum<["text", "number", "currency", "percentage", "date", "datetime", "duration", "badge", "boolean"]>;
    currency: z.ZodOptional<z.ZodString>;
    decimals: z.ZodOptional<z.ZodNumber>;
    prefix: z.ZodOptional<z.ZodString>;
    suffix: z.ZodOptional<z.ZodString>;
    color: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "number" | "boolean" | "date" | "duration" | "text" | "datetime" | "currency" | "percentage" | "badge";
    color?: string | undefined;
    prefix?: string | undefined;
    currency?: string | undefined;
    decimals?: number | undefined;
    suffix?: string | undefined;
}, {
    type: "number" | "boolean" | "date" | "duration" | "text" | "datetime" | "currency" | "percentage" | "badge";
    color?: string | undefined;
    prefix?: string | undefined;
    currency?: string | undefined;
    decimals?: number | undefined;
    suffix?: string | undefined;
}>;
export declare const createCalculatedFieldSchema: z.ZodObject<{
    dataSetId: z.ZodString;
    name: z.ZodString;
    label: z.ZodString;
    type: z.ZodEnum<["formula", "count", "sum", "avg", "min", "max", "concat", "date_diff", "date_add", "conditional", "lookup", "rollup"]>;
    config: z.ZodObject<{
        expression: z.ZodOptional<z.ZodString>;
        sourceTable: z.ZodOptional<z.ZodString>;
        sourceField: z.ZodOptional<z.ZodString>;
        filter: z.ZodOptional<z.ZodObject<{
            field: z.ZodString;
            operator: z.ZodEnum<["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "empty", "not_empty"]>;
            value: z.ZodOptional<z.ZodAny>;
        }, "strip", z.ZodTypeAny, {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        }, {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        }>>;
        fields: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        separator: z.ZodOptional<z.ZodString>;
        startField: z.ZodOptional<z.ZodString>;
        endField: z.ZodOptional<z.ZodString>;
        dateField: z.ZodOptional<z.ZodString>;
        value: z.ZodOptional<z.ZodNumber>;
        unit: z.ZodOptional<z.ZodEnum<["days", "hours", "minutes", "seconds", "months", "years"]>>;
        condition: z.ZodOptional<z.ZodObject<{
            field: z.ZodString;
            operator: z.ZodEnum<["eq", "neq", "gt", "gte", "lt", "lte", "contains", "empty", "not_empty", "in"]>;
            value: z.ZodOptional<z.ZodAny>;
        }, "strip", z.ZodTypeAny, {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        }, {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        }>>;
        trueValue: z.ZodOptional<z.ZodAny>;
        falseValue: z.ZodOptional<z.ZodAny>;
        targetTable: z.ZodOptional<z.ZodString>;
        targetField: z.ZodOptional<z.ZodString>;
        matchField: z.ZodOptional<z.ZodString>;
        returnField: z.ZodOptional<z.ZodString>;
        relationField: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        filter?: {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        } | undefined;
        value?: number | undefined;
        fields?: string[] | undefined;
        dateField?: string | undefined;
        expression?: string | undefined;
        unit?: "days" | "hours" | "minutes" | "seconds" | "months" | "years" | undefined;
        separator?: string | undefined;
        targetTable?: string | undefined;
        sourceTable?: string | undefined;
        sourceField?: string | undefined;
        startField?: string | undefined;
        endField?: string | undefined;
        condition?: {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        } | undefined;
        trueValue?: any;
        falseValue?: any;
        targetField?: string | undefined;
        matchField?: string | undefined;
        returnField?: string | undefined;
        relationField?: string | undefined;
    }, {
        filter?: {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        } | undefined;
        value?: number | undefined;
        fields?: string[] | undefined;
        dateField?: string | undefined;
        expression?: string | undefined;
        unit?: "days" | "hours" | "minutes" | "seconds" | "months" | "years" | undefined;
        separator?: string | undefined;
        targetTable?: string | undefined;
        sourceTable?: string | undefined;
        sourceField?: string | undefined;
        startField?: string | undefined;
        endField?: string | undefined;
        condition?: {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        } | undefined;
        trueValue?: any;
        falseValue?: any;
        targetField?: string | undefined;
        matchField?: string | undefined;
        returnField?: string | undefined;
        relationField?: string | undefined;
    }>;
    format: z.ZodOptional<z.ZodObject<{
        type: z.ZodEnum<["text", "number", "currency", "percentage", "date", "datetime", "duration", "badge", "boolean"]>;
        currency: z.ZodOptional<z.ZodString>;
        decimals: z.ZodOptional<z.ZodNumber>;
        prefix: z.ZodOptional<z.ZodString>;
        suffix: z.ZodOptional<z.ZodString>;
        color: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "number" | "boolean" | "date" | "duration" | "text" | "datetime" | "currency" | "percentage" | "badge";
        color?: string | undefined;
        prefix?: string | undefined;
        currency?: string | undefined;
        decimals?: number | undefined;
        suffix?: string | undefined;
    }, {
        type: "number" | "boolean" | "date" | "duration" | "text" | "datetime" | "currency" | "percentage" | "badge";
        color?: string | undefined;
        prefix?: string | undefined;
        currency?: string | undefined;
        decimals?: number | undefined;
        suffix?: string | undefined;
    }>>;
    description: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    isKpi: z.ZodOptional<z.ZodBoolean>;
    target: z.ZodOptional<z.ZodNumber>;
    warningThreshold: z.ZodOptional<z.ZodNumber>;
    dependsOn: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    config: {
        filter?: {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        } | undefined;
        value?: number | undefined;
        fields?: string[] | undefined;
        dateField?: string | undefined;
        expression?: string | undefined;
        unit?: "days" | "hours" | "minutes" | "seconds" | "months" | "years" | undefined;
        separator?: string | undefined;
        targetTable?: string | undefined;
        sourceTable?: string | undefined;
        sourceField?: string | undefined;
        startField?: string | undefined;
        endField?: string | undefined;
        condition?: {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        } | undefined;
        trueValue?: any;
        falseValue?: any;
        targetField?: string | undefined;
        matchField?: string | undefined;
        returnField?: string | undefined;
        relationField?: string | undefined;
    };
    type: "max" | "concat" | "lookup" | "count" | "min" | "sum" | "avg" | "formula" | "date_diff" | "conditional" | "date_add" | "rollup";
    label: string;
    dataSetId: string;
    dependsOn: string[];
    description?: string | undefined;
    category?: string | undefined;
    format?: {
        type: "number" | "boolean" | "date" | "duration" | "text" | "datetime" | "currency" | "percentage" | "badge";
        color?: string | undefined;
        prefix?: string | undefined;
        currency?: string | undefined;
        decimals?: number | undefined;
        suffix?: string | undefined;
    } | undefined;
    target?: number | undefined;
    isKpi?: boolean | undefined;
    warningThreshold?: number | undefined;
}, {
    name: string;
    config: {
        filter?: {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        } | undefined;
        value?: number | undefined;
        fields?: string[] | undefined;
        dateField?: string | undefined;
        expression?: string | undefined;
        unit?: "days" | "hours" | "minutes" | "seconds" | "months" | "years" | undefined;
        separator?: string | undefined;
        targetTable?: string | undefined;
        sourceTable?: string | undefined;
        sourceField?: string | undefined;
        startField?: string | undefined;
        endField?: string | undefined;
        condition?: {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        } | undefined;
        trueValue?: any;
        falseValue?: any;
        targetField?: string | undefined;
        matchField?: string | undefined;
        returnField?: string | undefined;
        relationField?: string | undefined;
    };
    type: "max" | "concat" | "lookup" | "count" | "min" | "sum" | "avg" | "formula" | "date_diff" | "conditional" | "date_add" | "rollup";
    label: string;
    dataSetId: string;
    description?: string | undefined;
    category?: string | undefined;
    format?: {
        type: "number" | "boolean" | "date" | "duration" | "text" | "datetime" | "currency" | "percentage" | "badge";
        color?: string | undefined;
        prefix?: string | undefined;
        currency?: string | undefined;
        decimals?: number | undefined;
        suffix?: string | undefined;
    } | undefined;
    target?: number | undefined;
    dependsOn?: string[] | undefined;
    isKpi?: boolean | undefined;
    warningThreshold?: number | undefined;
}>;
export declare const updateCalculatedFieldSchema: z.ZodObject<Omit<{
    dataSetId: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<["formula", "count", "sum", "avg", "min", "max", "concat", "date_diff", "date_add", "conditional", "lookup", "rollup"]>>;
    config: z.ZodOptional<z.ZodObject<{
        expression: z.ZodOptional<z.ZodString>;
        sourceTable: z.ZodOptional<z.ZodString>;
        sourceField: z.ZodOptional<z.ZodString>;
        filter: z.ZodOptional<z.ZodObject<{
            field: z.ZodString;
            operator: z.ZodEnum<["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "empty", "not_empty"]>;
            value: z.ZodOptional<z.ZodAny>;
        }, "strip", z.ZodTypeAny, {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        }, {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        }>>;
        fields: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        separator: z.ZodOptional<z.ZodString>;
        startField: z.ZodOptional<z.ZodString>;
        endField: z.ZodOptional<z.ZodString>;
        dateField: z.ZodOptional<z.ZodString>;
        value: z.ZodOptional<z.ZodNumber>;
        unit: z.ZodOptional<z.ZodEnum<["days", "hours", "minutes", "seconds", "months", "years"]>>;
        condition: z.ZodOptional<z.ZodObject<{
            field: z.ZodString;
            operator: z.ZodEnum<["eq", "neq", "gt", "gte", "lt", "lte", "contains", "empty", "not_empty", "in"]>;
            value: z.ZodOptional<z.ZodAny>;
        }, "strip", z.ZodTypeAny, {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        }, {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        }>>;
        trueValue: z.ZodOptional<z.ZodAny>;
        falseValue: z.ZodOptional<z.ZodAny>;
        targetTable: z.ZodOptional<z.ZodString>;
        targetField: z.ZodOptional<z.ZodString>;
        matchField: z.ZodOptional<z.ZodString>;
        returnField: z.ZodOptional<z.ZodString>;
        relationField: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        filter?: {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        } | undefined;
        value?: number | undefined;
        fields?: string[] | undefined;
        dateField?: string | undefined;
        expression?: string | undefined;
        unit?: "days" | "hours" | "minutes" | "seconds" | "months" | "years" | undefined;
        separator?: string | undefined;
        targetTable?: string | undefined;
        sourceTable?: string | undefined;
        sourceField?: string | undefined;
        startField?: string | undefined;
        endField?: string | undefined;
        condition?: {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        } | undefined;
        trueValue?: any;
        falseValue?: any;
        targetField?: string | undefined;
        matchField?: string | undefined;
        returnField?: string | undefined;
        relationField?: string | undefined;
    }, {
        filter?: {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        } | undefined;
        value?: number | undefined;
        fields?: string[] | undefined;
        dateField?: string | undefined;
        expression?: string | undefined;
        unit?: "days" | "hours" | "minutes" | "seconds" | "months" | "years" | undefined;
        separator?: string | undefined;
        targetTable?: string | undefined;
        sourceTable?: string | undefined;
        sourceField?: string | undefined;
        startField?: string | undefined;
        endField?: string | undefined;
        condition?: {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        } | undefined;
        trueValue?: any;
        falseValue?: any;
        targetField?: string | undefined;
        matchField?: string | undefined;
        returnField?: string | undefined;
        relationField?: string | undefined;
    }>>;
    format: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        type: z.ZodEnum<["text", "number", "currency", "percentage", "date", "datetime", "duration", "badge", "boolean"]>;
        currency: z.ZodOptional<z.ZodString>;
        decimals: z.ZodOptional<z.ZodNumber>;
        prefix: z.ZodOptional<z.ZodString>;
        suffix: z.ZodOptional<z.ZodString>;
        color: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "number" | "boolean" | "date" | "duration" | "text" | "datetime" | "currency" | "percentage" | "badge";
        color?: string | undefined;
        prefix?: string | undefined;
        currency?: string | undefined;
        decimals?: number | undefined;
        suffix?: string | undefined;
    }, {
        type: "number" | "boolean" | "date" | "duration" | "text" | "datetime" | "currency" | "percentage" | "badge";
        color?: string | undefined;
        prefix?: string | undefined;
        currency?: string | undefined;
        decimals?: number | undefined;
        suffix?: string | undefined;
    }>>>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    category: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    isKpi: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    target: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    warningThreshold: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    dependsOn: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodString, "many">>>;
}, "dataSetId">, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    description?: string | undefined;
    category?: string | undefined;
    config?: {
        filter?: {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        } | undefined;
        value?: number | undefined;
        fields?: string[] | undefined;
        dateField?: string | undefined;
        expression?: string | undefined;
        unit?: "days" | "hours" | "minutes" | "seconds" | "months" | "years" | undefined;
        separator?: string | undefined;
        targetTable?: string | undefined;
        sourceTable?: string | undefined;
        sourceField?: string | undefined;
        startField?: string | undefined;
        endField?: string | undefined;
        condition?: {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        } | undefined;
        trueValue?: any;
        falseValue?: any;
        targetField?: string | undefined;
        matchField?: string | undefined;
        returnField?: string | undefined;
        relationField?: string | undefined;
    } | undefined;
    type?: "max" | "concat" | "lookup" | "count" | "min" | "sum" | "avg" | "formula" | "date_diff" | "conditional" | "date_add" | "rollup" | undefined;
    format?: {
        type: "number" | "boolean" | "date" | "duration" | "text" | "datetime" | "currency" | "percentage" | "badge";
        color?: string | undefined;
        prefix?: string | undefined;
        currency?: string | undefined;
        decimals?: number | undefined;
        suffix?: string | undefined;
    } | undefined;
    label?: string | undefined;
    target?: number | undefined;
    dependsOn?: string[] | undefined;
    isKpi?: boolean | undefined;
    warningThreshold?: number | undefined;
}, {
    name?: string | undefined;
    description?: string | undefined;
    category?: string | undefined;
    config?: {
        filter?: {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        } | undefined;
        value?: number | undefined;
        fields?: string[] | undefined;
        dateField?: string | undefined;
        expression?: string | undefined;
        unit?: "days" | "hours" | "minutes" | "seconds" | "months" | "years" | undefined;
        separator?: string | undefined;
        targetTable?: string | undefined;
        sourceTable?: string | undefined;
        sourceField?: string | undefined;
        startField?: string | undefined;
        endField?: string | undefined;
        condition?: {
            field: string;
            operator: "in" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "empty" | "not_empty";
            value?: any;
        } | undefined;
        trueValue?: any;
        falseValue?: any;
        targetField?: string | undefined;
        matchField?: string | undefined;
        returnField?: string | undefined;
        relationField?: string | undefined;
    } | undefined;
    type?: "max" | "concat" | "lookup" | "count" | "min" | "sum" | "avg" | "formula" | "date_diff" | "conditional" | "date_add" | "rollup" | undefined;
    format?: {
        type: "number" | "boolean" | "date" | "duration" | "text" | "datetime" | "currency" | "percentage" | "badge";
        color?: string | undefined;
        prefix?: string | undefined;
        currency?: string | undefined;
        decimals?: number | undefined;
        suffix?: string | undefined;
    } | undefined;
    label?: string | undefined;
    target?: number | undefined;
    dependsOn?: string[] | undefined;
    isKpi?: boolean | undefined;
    warningThreshold?: number | undefined;
}>;
export interface EvaluationContext {
    row: Record<string, any>;
    entries?: Record<string, any>[];
    relatedData?: Record<string, any>;
    now?: Date;
}
/**
 * Evalúa una expresión matemática/lógica
 * Ej: "{price} * {quantity} * (1 - {discount})"
 */
export declare function evaluateExpression(expression: string, context: EvaluationContext): any;
/**
 * Evalúa una condición
 */
export declare function evaluateCondition(condition: ConditionConfig, context: EvaluationContext): boolean;
/**
 * Funciones de agregación
 */
export declare const aggregationFunctions: {
    sum: (entries: any[], field: string) => number;
    count: (entries: any[]) => number;
    avg: (entries: any[], field: string) => number;
    min: (entries: any[], field: string) => number;
    max: (entries: any[], field: string) => number;
};
/**
 * Funciones de fecha
 */
export declare const dateFunctions: {
    diff: (start: Date, end: Date, unit: string) => number;
    add: (date: Date, value: number, unit: string) => Date;
    now: () => Date;
    today: () => Date;
};
/**
 * Evalúa un campo calculado completo
 */
export declare function evaluateCalculatedField(field: CalculatedField, context: EvaluationContext): any;
export declare function formatCalculatedValue(value: any, format?: CalculatedField["format"]): any;
export declare const FORMULA_FUNCTIONS: readonly [{
    readonly id: "abs";
    readonly name: "Absolute";
    readonly description: "Valor absoluto";
    readonly example: "ABS(-5) → 5";
    readonly category: "math";
}, {
    readonly id: "round";
    readonly name: "Round";
    readonly description: "Redondear número";
    readonly example: "ROUND(3.14159, 2) → 3.14";
    readonly category: "math";
}, {
    readonly id: "ceil";
    readonly name: "Ceiling";
    readonly description: "Redondear arriba";
    readonly example: "CEIL(3.2) → 4";
    readonly category: "math";
}, {
    readonly id: "floor";
    readonly name: "Floor";
    readonly description: "Redondear abajo";
    readonly example: "FLOOR(3.8) → 3";
    readonly category: "math";
}, {
    readonly id: "sqrt";
    readonly name: "Square Root";
    readonly description: "Raíz cuadrada";
    readonly example: "SQRT(16) → 4";
    readonly category: "math";
}, {
    readonly id: "pow";
    readonly name: "Power";
    readonly description: "Potencia";
    readonly example: "POW(2, 3) → 8";
    readonly category: "math";
}, {
    readonly id: "len";
    readonly name: "Length";
    readonly description: "Longitud de texto";
    readonly example: "LEN('hello') → 5";
    readonly category: "text";
}, {
    readonly id: "upper";
    readonly name: "Uppercase";
    readonly description: "Mayúsculas";
    readonly example: "UPPER('hello') → 'HELLO'";
    readonly category: "text";
}, {
    readonly id: "lower";
    readonly name: "Lowercase";
    readonly description: "Minúsculas";
    readonly example: "LOWER('HELLO') → 'hello'";
    readonly category: "text";
}, {
    readonly id: "trim";
    readonly name: "Trim";
    readonly description: "Quitar espacios";
    readonly example: "TRIM('  hello  ') → 'hello'";
    readonly category: "text";
}, {
    readonly id: "concat";
    readonly name: "Concatenate";
    readonly description: "Unir textos";
    readonly example: "CONCAT('Hello', ' ', 'World')";
    readonly category: "text";
}, {
    readonly id: "substring";
    readonly name: "Substring";
    readonly description: "Extraer parte";
    readonly example: "SUBSTRING('hello', 0, 3) → 'hel'";
    readonly category: "text";
}, {
    readonly id: "now";
    readonly name: "Now";
    readonly description: "Fecha/hora actual";
    readonly example: "NOW() → 2026-03-19";
    readonly category: "date";
}, {
    readonly id: "today";
    readonly name: "Today";
    readonly description: "Fecha actual";
    readonly example: "TODAY() → 2026-03-19";
    readonly category: "date";
}, {
    readonly id: "year";
    readonly name: "Year";
    readonly description: "Año de fecha";
    readonly example: "YEAR({createdAt}) → 2026";
    readonly category: "date";
}, {
    readonly id: "month";
    readonly name: "Month";
    readonly description: "Mes de fecha";
    readonly example: "MONTH({createdAt}) → 3";
    readonly category: "date";
}, {
    readonly id: "day";
    readonly name: "Day";
    readonly description: "Día de fecha";
    readonly example: "DAY({createdAt}) → 19";
    readonly category: "date";
}, {
    readonly id: "datediff";
    readonly name: "Date Diff";
    readonly description: "Diferencia de fechas";
    readonly example: "DATEDIFF({start}, {end}, 'days')";
    readonly category: "date";
}, {
    readonly id: "if";
    readonly name: "If";
    readonly description: "Condicional";
    readonly example: "IF({status}='active', 1, 0)";
    readonly category: "logic";
}, {
    readonly id: "and";
    readonly name: "And";
    readonly description: "Y lógico";
    readonly example: "AND({a}>0, {b}<100)";
    readonly category: "logic";
}, {
    readonly id: "or";
    readonly name: "Or";
    readonly description: "O lógico";
    readonly example: "OR({status}='a', {status}='b')";
    readonly category: "logic";
}, {
    readonly id: "not";
    readonly name: "Not";
    readonly description: "Negación";
    readonly example: "NOT({active})";
    readonly category: "logic";
}, {
    readonly id: "coalesce";
    readonly name: "Coalesce";
    readonly description: "Primer no-nulo";
    readonly example: "COALESCE({nickname}, {name})";
    readonly category: "logic";
}, {
    readonly id: "sum";
    readonly name: "Sum";
    readonly description: "Sumar valores";
    readonly example: "SUM({items}, 'price')";
    readonly category: "aggregate";
}, {
    readonly id: "count";
    readonly name: "Count";
    readonly description: "Contar items";
    readonly example: "COUNT({items})";
    readonly category: "aggregate";
}, {
    readonly id: "avg";
    readonly name: "Average";
    readonly description: "Promedio";
    readonly example: "AVG({items}, 'price')";
    readonly category: "aggregate";
}, {
    readonly id: "min";
    readonly name: "Minimum";
    readonly description: "Valor mínimo";
    readonly example: "MIN({items}, 'price')";
    readonly category: "aggregate";
}, {
    readonly id: "max";
    readonly name: "Maximum";
    readonly description: "Valor máximo";
    readonly example: "MAX({items}, 'price')";
    readonly category: "aggregate";
}];
export declare const FORMULA_OPERATORS: readonly [{
    readonly id: "+";
    readonly name: "Add";
    readonly symbol: "+";
    readonly description: "Suma";
    readonly precedence: 2;
}, {
    readonly id: "-";
    readonly name: "Subtract";
    readonly symbol: "-";
    readonly description: "Resta";
    readonly precedence: 2;
}, {
    readonly id: "*";
    readonly name: "Multiply";
    readonly symbol: "×";
    readonly description: "Multiplicación";
    readonly precedence: 3;
}, {
    readonly id: "/";
    readonly name: "Divide";
    readonly symbol: "÷";
    readonly description: "División";
    readonly precedence: 3;
}, {
    readonly id: "%";
    readonly name: "Modulo";
    readonly symbol: "%";
    readonly description: "Resto";
    readonly precedence: 3;
}, {
    readonly id: "^";
    readonly name: "Power";
    readonly symbol: "^";
    readonly description: "Potencia";
    readonly precedence: 4;
}, {
    readonly id: "==";
    readonly name: "Equals";
    readonly symbol: "=";
    readonly description: "Igual";
    readonly precedence: 1;
}, {
    readonly id: "!=";
    readonly name: "Not Equals";
    readonly symbol: "≠";
    readonly description: "Diferente";
    readonly precedence: 1;
}, {
    readonly id: ">";
    readonly name: "Greater";
    readonly symbol: ">";
    readonly description: "Mayor que";
    readonly precedence: 1;
}, {
    readonly id: ">=";
    readonly name: "Greater Eq";
    readonly symbol: "≥";
    readonly description: "Mayor o igual";
    readonly precedence: 1;
}, {
    readonly id: "<";
    readonly name: "Less";
    readonly symbol: "<";
    readonly description: "Menor que";
    readonly precedence: 1;
}, {
    readonly id: "<=";
    readonly name: "Less Eq";
    readonly symbol: "≤";
    readonly description: "Menor o igual";
    readonly precedence: 1;
}, {
    readonly id: "&";
    readonly name: "Concat";
    readonly symbol: "&";
    readonly description: "Concatenar";
    readonly precedence: 1;
}];
//# sourceMappingURL=datasets.calculated.d.ts.map