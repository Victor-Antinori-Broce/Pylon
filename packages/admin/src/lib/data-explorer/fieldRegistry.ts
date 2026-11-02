import { localeFormato } from "$lib/i18n";
/**
 * DataExplorer Field Registry
 *
 * Sistema extensible de tipos de campo para el DataExplorer.
 * Permite registrar componentes personalizados por tipo de campo.
 */

import type { Component } from "svelte";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type FieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "number"
  | "boolean"
  | "select"
  | "multiselect"
  | "date"
  | "datetime"
  | "json"
  | "media"
  | "relation"
  | "email"
  | "url"
  | "slug"
  | "color"
  | "calculated"
  | "blocks"
  | "status-badge"
  | string; // Para tipos custom

export interface FieldConfig {
  type: FieldType;
  label?: string;
  description?: string;
  required?: boolean;
  readonly?: boolean;
  hidden?: boolean;

  // Opciones específicas por tipo
  options?: {
    // text/textarea
    minLength?: number;
    maxLength?: number;
    placeholder?: string;

    // number
    min?: number;
    max?: number;
    step?: number;

    // select/multiselect
    enum?: string;
    choices?: Array<{ label: string; value: string; color?: string }>;

    // richtext
    features?: ("bold" | "italic" | "heading" | "list" | "link" | "image" | "embed" | "code")[];

    // media
    accept?: string;
    multiple?: boolean;
    crop?: boolean;
    aspectRatio?: string;

    // relation
    table?: string;
    displayField?: string;

    // calculated
    expression?: string; // Frontend expression
    backend?: boolean; // Si el cálculo viene del backend

    // status-badge
    colors?: Record<string, string>;

    // blocks
    blockTypes?: string[];

    // Custom
    [key: string]: any;
  };

  // Validación
  validation?: {
    pattern?: string;
    custom?: string; // Function as string
  };
}

export interface CalculatedFieldConfig extends FieldConfig {
  type: "calculated";
  calculate: (row: any, context?: any) => any;
  dependsOn: string[]; // Campos de los que depende
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

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

class FieldRegistry {
  private components = new Map<FieldType, FieldComponent>();
  private calculatedFields = new Map<string, CalculatedFieldConfig>();

  /**
   * Registrar un componente para un tipo de campo
   */
  register(type: FieldType, component: FieldComponent): void {
    this.components.set(type, component);
  }

  /**
   * Obtener el componente para un tipo de campo
   */
  get(type: FieldType): FieldComponent | undefined {
    return this.components.get(type);
  }

  /**
   * Verificar si existe un componente para el tipo
   */
  has(type: FieldType): boolean {
    return this.components.has(type);
  }

  /**
   * Registrar un campo calculado
   */
  registerCalculated(name: string, config: CalculatedFieldConfig): void {
    this.calculatedFields.set(name, config);
  }

  /**
   * Obtener configuración de campo calculado
   */
  getCalculated(name: string): CalculatedFieldConfig | undefined {
    return this.calculatedFields.get(name);
  }

  /**
   * Evaluar un campo calculado
   */
  evaluateCalculated(name: string, row: any, context?: any): any {
    const config = this.calculatedFields.get(name);
    if (!config) return undefined;

    try {
      return config.calculate(row, context);
    } catch (err) {
      console.error(`Error evaluating calculated field "${name}":`, err);
      return null;
    }
  }

  /**
   * Obtener todos los tipos registrados
   */
  getRegisteredTypes(): FieldType[] {
    return Array.from(this.components.keys());
  }

  /**
   * Extender un tipo existente con opciones adicionales
   */
  extend(baseType: FieldType, extendedType: string, _defaultOptions: any): void {
    const baseComponent = this.components.get(baseType);
    if (!baseComponent) {
      throw new Error(`Cannot extend unregistered type: ${baseType}`);
    }

    // Crear componente wrapper que mergea opciones
    const ExtendedComponent = baseComponent as any; // Svelte component

    this.register(extendedType, ExtendedComponent);
  }
}

// Singleton global
export const fieldRegistry = new FieldRegistry();

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS DE CÁLCULO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Helpers para expresiones de campos calculados
 */
export const calculatedHelpers = {
  // Contar elementos
  count: (arr: any[] | undefined): number => arr?.length || 0,

  // Sumar valores
  sum: (arr: any[], field: string): number =>
    arr?.reduce((acc, item) => acc + (Number(item[field]) || 0), 0) || 0,

  // Promedio
  avg: (arr: any[], field: string): number => {
    if (!arr?.length) return 0;
    return calculatedHelpers.sum(arr, field) / arr.length;
  },

  // Concatenar strings
  concat: (...parts: (string | undefined)[]): string => parts.filter(Boolean).join(" "),

  // Formatear fecha
  dateFormat: (date: string | Date, format: string): string => {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "—";

    const map: Record<string, string> = {
      YYYY: d.getFullYear().toString(),
      MM: String(d.getMonth() + 1).padStart(2, "0"),
      DD: String(d.getDate()).padStart(2, "0"),
      HH: String(d.getHours()).padStart(2, "0"),
      mm: String(d.getMinutes()).padStart(2, "0"),
    };

    return format.replace(/YYYY|MM|DD|HH|mm/g, (match) => map[match]);
  },

  // Tiempo relativo
  timeAgo: (date: string | Date): string => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "just now";
  },

  // Formatear moneda
  currency: (value: number, currency = "USD"): string =>
    new Intl.NumberFormat(localeFormato(), { style: "currency", currency }).format(value),

  // Condicional
  if: (condition: boolean, trueValue: any, falseValue: any): any =>
    condition ? trueValue : falseValue,

  // Obtener valor anidado
  get: (obj: any, path: string, defaultValue?: any): any => {
    const keys = path.split(".");
    let result = obj;
    for (const key of keys) {
      result = result?.[key];
      if (result === undefined) return defaultValue;
    }
    return result;
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PRESETS COMUNES
// ═══════════════════════════════════════════════════════════════════════════════

export const fieldPresets = {
  // Campo de estado con colores automáticos
  status: (colors?: Record<string, string>): FieldConfig => ({
    type: "status-badge",
    options: { colors },
  }),

  // Campo de relación simple
  relation: (table: string, displayField = "name", multiple = false): FieldConfig => ({
    type: "relation",
    options: { table, displayField, multiple },
  }),

  // Campo de media con preview
  media: (options?: { multiple?: boolean; crop?: boolean; aspectRatio?: string }): FieldConfig => ({
    type: "media",
    options,
  }),

  // Campo calculado de conteo
  count: (arrayField: string, label?: string): CalculatedFieldConfig => ({
    type: "calculated",
    label,
    dependsOn: [arrayField],
    calculate: (row) => calculatedHelpers.count(row[arrayField]),
  }),

  // Campo de tiempo relativo
  timeAgo: (dateField: string, label?: string): CalculatedFieldConfig => ({
    type: "calculated",
    label,
    dependsOn: [dateField],
    calculate: (row) => calculatedHelpers.timeAgo(row[dateField]),
    format: "text",
  }),
};
