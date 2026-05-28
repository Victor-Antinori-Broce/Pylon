/**
 * DataExplorer Field Registry
 *
 * Sistema extensible de tipos de campo para el DataExplorer.
 * Permite registrar componentes personalizados por tipo de campo.
 */
import type { Component } from "svelte";
export type FieldType = "text" | "textarea" | "richtext" | "number" | "boolean" | "select" | "multiselect" | "date" | "datetime" | "json" | "media" | "relation" | "email" | "url" | "slug" | "color" | "calculated" | "blocks" | "status-badge" | string;
export interface FieldConfig {
    type: FieldType;
    label?: string;
    description?: string;
    required?: boolean;
    readonly?: boolean;
    hidden?: boolean;
    options?: {
        minLength?: number;
        maxLength?: number;
        placeholder?: string;
        min?: number;
        max?: number;
        step?: number;
        enum?: string;
        choices?: Array<{
            label: string;
            value: string;
            color?: string;
        }>;
        features?: ("bold" | "italic" | "heading" | "list" | "link" | "image" | "embed" | "code")[];
        accept?: string;
        multiple?: boolean;
        crop?: boolean;
        aspectRatio?: string;
        table?: string;
        displayField?: string;
        expression?: string;
        backend?: boolean;
        colors?: Record<string, string>;
        blockTypes?: string[];
        [key: string]: any;
    };
    validation?: {
        pattern?: string;
        custom?: string;
    };
}
export interface CalculatedFieldConfig extends FieldConfig {
    type: "calculated";
    calculate: (row: any, context?: any) => any;
    dependsOn: string[];
    format?: "text" | "number" | "currency" | "percentage" | "datetime" | "badge";
}
export interface FieldComponentProps {
    value: any;
    row: any;
    config: FieldConfig;
    mode: "view" | "edit" | "inline";
    onChange?: (value: any) => void;
}
export type FieldComponent = Component<FieldComponentProps>;
declare class FieldRegistry {
    private components;
    private calculatedFields;
    /**
     * Registrar un componente para un tipo de campo
     */
    register(type: FieldType, component: FieldComponent): void;
    /**
     * Obtener el componente para un tipo de campo
     */
    get(type: FieldType): FieldComponent | undefined;
    /**
     * Verificar si existe un componente para el tipo
     */
    has(type: FieldType): boolean;
    /**
     * Registrar un campo calculado
     */
    registerCalculated(name: string, config: CalculatedFieldConfig): void;
    /**
     * Obtener configuración de campo calculado
     */
    getCalculated(name: string): CalculatedFieldConfig | undefined;
    /**
     * Evaluar un campo calculado
     */
    evaluateCalculated(name: string, row: any, context?: any): any;
    /**
     * Obtener todos los tipos registrados
     */
    getRegisteredTypes(): FieldType[];
    /**
     * Extender un tipo existente con opciones adicionales
     */
    extend(baseType: FieldType, extendedType: string, _defaultOptions: any): void;
}
export declare const fieldRegistry: FieldRegistry;
/**
 * Helpers para expresiones de campos calculados
 */
export declare const calculatedHelpers: {
    count: (arr: any[] | undefined) => number;
    sum: (arr: any[], field: string) => number;
    avg: (arr: any[], field: string) => number;
    concat: (...parts: (string | undefined)[]) => string;
    dateFormat: (date: string | Date, format: string) => string;
    timeAgo: (date: string | Date) => string;
    currency: (value: number, currency?: string) => string;
    if: (condition: boolean, trueValue: any, falseValue: any) => any;
    get: (obj: any, path: string, defaultValue?: any) => any;
};
export declare const fieldPresets: {
    status: (colors?: Record<string, string>) => FieldConfig;
    relation: (table: string, displayField?: string, multiple?: boolean) => FieldConfig;
    media: (options?: {
        multiple?: boolean;
        crop?: boolean;
        aspectRatio?: string;
    }) => FieldConfig;
    count: (arrayField: string, label?: string) => CalculatedFieldConfig;
    timeAgo: (dateField: string, label?: string) => CalculatedFieldConfig;
};
export {};
//# sourceMappingURL=fieldRegistry.d.ts.map