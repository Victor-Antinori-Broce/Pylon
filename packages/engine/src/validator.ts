/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * VALIDATOR ENGINE - Motor de Validación Declarativa
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Motor de validación que procesa reglas JSON declarativas:
 * - Reglas básicas: min, max, enum, pattern, required
 * - Lógica condicional: if/then/else
 * - Validación de tipos nativos
 * - Mensajes de error personalizados
 *
 * @example
 * ```typescript
 * const rules = {
 *   name: { required: true, min: 3, max: 100 },
 *   type: { enum: ["combat", "support", "healer"] },
 *   strength: {
 *     min: 0,
 *     max: 100,
 *     if: { field: "type", eq: "combat" },
 *     then: { min: 10 }
 *   }
 * };
 *
 * const result = validate(data, rules);
 * // { valid: false, errors: [{ field: "strength", message: "..." }] }
 * ```
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS Y CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

/** Regla de validación individual */
export interface ValidationRule {
  /** Valor requerido */
  required?: boolean;
  /** Tipo de dato esperado */
  type?: "string" | "number" | "boolean" | "array" | "object" | "date";
  /** Longitud mínima (strings/arrays) o valor mínimo (números) */
  min?: number;
  /** Longitud máxima (strings/arrays) o valor máximo (números) */
  max?: number;
  /** Valores permitidos */
  enum?: any[];
  /** Patrón regex (solo strings) */
  pattern?: string;
  /** Mensaje de error personalizado */
  message?: string;
  /** Validación condicional */
  if?: Condition;
  /** Regla a aplicar si la condición es verdadera */
  then?: ValidationRule;
  /** Regla a aplicar si la condición es falsa */
  else?: ValidationRule;
  /** Validación custom */
  validate?: (value: any, data: Record<string, any>) => boolean | string;
}

/** Condición para validación if/then */
export interface Condition {
  /** Campo a evaluar */
  field: string;
  /** Operador de comparación */
  eq?: any;
  ne?: any;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  in?: any[];
  contains?: any;
  empty?: boolean;
  /** Negar la condición */
  not?: boolean;
}

/** Esquema de validación completo */
export type ValidationSchema = Record<string, ValidationRule>;

/** Resultado de validación */
export interface ValidationResult {
  /** Indica si todos los datos son válidos */
  valid: boolean;
  /** Lista de errores encontrados */
  errors: ValidationError[];
  /** Datos validados y transformados */
  data?: Record<string, any>;
}

/** Error de validación individual */
export interface ValidationError {
  /** Campo que falló la validación */
  field: string;
  /** Mensaje de error */
  message: string;
  /** Valor recibido */
  received?: any;
  /** Regla que falló */
  rule?: string;
  /** Ruta anidada (para objetos anidados) */
  path?: string;
}

/** Opciones de validación */
export interface ValidatorOptions {
  /** Eliminar campos no definidos en el schema */
  stripUnknown?: boolean;
  /** Detenerse en el primer error */
  abortEarly?: boolean;
  /** Permitir campos adicionales */
  allowUnknown?: boolean;
  /** Contexto para validaciones custom */
  context?: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDADORES INDIVIDUALES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valida una regla contra un valor.
 */
function validateRule(
  value: any,
  rule: ValidationRule,
  fieldName: string,
  fullData: Record<string, any>,
  path?: string
): ValidationError[] {
  const errors: ValidationError[] = [];
  const fieldPath = path ? `${path}.${fieldName}` : fieldName;

  // Manejar condicional if/then/else
  if (rule.if) {
    const conditionMet = evaluateCondition(rule.if, fullData);
    const activeRule = conditionMet ? rule.then : rule.else;
    if (activeRule) {
      errors.push(...validateRule(value, activeRule, fieldName, fullData, path));
    }
    // Continuar con validaciones base
  }

  // Validar required
  if (rule.required && (value === undefined || value === null || value === "")) {
    errors.push({
      field: fieldName,
      path: fieldPath,
      message: rule.message || `${fieldName} is required`,
      received: value,
      rule: "required",
    });
    return errors; // Si es requerido y no existe, no seguir validando
  }

  // Si no es requerido y está vacío, pasar
  if (!rule.required && (value === undefined || value === null || value === "")) {
    return errors;
  }

  // Validar tipo
  if (rule.type) {
    const typeError = validateType(value, rule.type, fieldName, fieldPath, rule.message);
    if (typeError) {
      errors.push(typeError);
      return errors; // Si el tipo es incorrecto, no seguir
    }
  }

  // Validar min (strings: length, números: valor, arrays: length)
  if (rule.min !== undefined) {
    const minError = validateMin(value, rule.min, fieldName, fieldPath, rule.message);
    if (minError) errors.push(minError);
  }

  // Validar max
  if (rule.max !== undefined) {
    const maxError = validateMax(value, rule.max, fieldName, fieldPath, rule.message);
    if (maxError) errors.push(maxError);
  }

  // Validar enum
  if (rule.enum && !rule.enum.includes(value)) {
    errors.push({
      field: fieldName,
      path: fieldPath,
      message: rule.message || `${fieldName} must be one of: ${rule.enum.join(", ")}`,
      received: value,
      rule: "enum",
    });
  }

  // Validar pattern
  if (rule.pattern && typeof value === "string") {
    const regex = new RegExp(rule.pattern);
    if (!regex.test(value)) {
      errors.push({
        field: fieldName,
        path: fieldPath,
        message: rule.message || `${fieldName} format is invalid`,
        received: value,
        rule: "pattern",
      });
    }
  }

  // Validación custom
  if (rule.validate) {
    const result = rule.validate(value, fullData);
    if (result !== true) {
      errors.push({
        field: fieldName,
        path: fieldPath,
        message: typeof result === "string" ? result : `${fieldName} is invalid`,
        received: value,
        rule: "validate",
      });
    }
  }

  return errors;
}

/**
 * Evalúa una condición contra los datos.
 */
function evaluateCondition(condition: Condition, data: Record<string, any>): boolean {
  const value = data[condition.field];
  let result = false;

  if (condition.eq !== undefined) {
    result = value === condition.eq;
  } else if (condition.ne !== undefined) {
    result = value !== condition.ne;
  } else if (condition.gt !== undefined) {
    result = typeof value === "number" && value > condition.gt;
  } else if (condition.gte !== undefined) {
    result = typeof value === "number" && value >= condition.gte;
  } else if (condition.lt !== undefined) {
    result = typeof value === "number" && value < condition.lt;
  } else if (condition.lte !== undefined) {
    result = typeof value === "number" && value <= condition.lte;
  } else if (condition.in !== undefined) {
    result = condition.in.includes(value);
  } else if (condition.contains !== undefined) {
    result = Array.isArray(value) && value.includes(condition.contains);
  } else if (condition.empty !== undefined) {
    const isEmpty = value === undefined || value === null ||
                   (typeof value === "string" && value === "") ||
                   (Array.isArray(value) && value.length === 0) ||
                   (typeof value === "object" && Object.keys(value).length === 0);
    result = condition.empty === isEmpty;
  }

  return condition.not ? !result : result;
}

/**
 * Valida el tipo de un valor.
 */
function validateType(
  value: any,
  expectedType: string,
  fieldName: string,
  fieldPath: string,
  customMessage?: string
): ValidationError | null {
  const actualType = getType(value);

  if (actualType !== expectedType) {
    return {
      field: fieldName,
      path: fieldPath,
      message: customMessage || `${fieldName} must be ${expectedType}, received ${actualType}`,
      received: value,
      rule: "type",
    };
  }

  return null;
}

/**
 * Obtiene el tipo de un valor.
 */
function getType(value: any): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  return typeof value;
}

/**
 * Valida el mínimo (longitud para strings/arrays, valor para números).
 */
function validateMin(
  value: any,
  min: number,
  fieldName: string,
  fieldPath: string,
  customMessage?: string
): ValidationError | null {
  let valid = true;
  let actual: number;

  if (typeof value === "string" || Array.isArray(value)) {
    actual = value.length;
    valid = actual >= min;
  } else if (typeof value === "number") {
    actual = value;
    valid = actual >= min;
  }

  if (!valid) {
    return {
      field: fieldName,
      path: fieldPath,
      message: customMessage || `${fieldName} must be at least ${min}`,
      received: actual ?? value,
      rule: "min",
    };
  }

  return null;
}

/**
 * Valida el máximo.
 */
function validateMax(
  value: any,
  max: number,
  fieldName: string,
  fieldPath: string,
  customMessage?: string
): ValidationError | null {
  let valid = true;
  let actual: number;

  if (typeof value === "string" || Array.isArray(value)) {
    actual = value.length;
    valid = actual <= max;
  } else if (typeof value === "number") {
    actual = value;
    valid = actual <= max;
  }

  if (!valid) {
    return {
      field: fieldName,
      path: fieldPath,
      message: customMessage || `${fieldName} must be at most ${max}`,
      received: actual ?? value,
      rule: "max",
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API PÚBLICA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Valida un objeto contra un esquema de validación.
 *
 * @example
 * ```typescript
 * const schema = {
 *   name: { required: true, min: 3, max: 100 },
 *   email: { required: true, pattern: "^[^@]+@[^@]+$" },
 *   age: { type: "number", min: 0, max: 150 },
 *   role: { enum: ["admin", "user"] },
 *   department: {
 *     if: { field: "role", eq: "admin" },
 *     then: { required: true }
 *   }
 * };
 *
 * const result = validate({ name: "John", email: "john@example.com", role: "admin" }, schema);
 * // { valid: false, errors: [{ field: "department", message: "..." }] }
 * ```
 */
export function validate(
  data: Record<string, any>,
  schema: ValidationSchema,
  options: ValidatorOptions = {}
): ValidationResult {
  const errors: ValidationError[] = [];
  const validatedData: Record<string, any> = {};
  const {
    stripUnknown = false,
    abortEarly = false,
    allowUnknown = false,
  } = options;

  // Validar campos definidos en el schema
  for (const [fieldName, rule] of Object.entries(schema)) {
    const value = data[fieldName];
    const fieldErrors = validateRule(value, rule, fieldName, data);

    if (fieldErrors.length > 0) {
      errors.push(...fieldErrors);
      if (abortEarly) {
        return { valid: false, errors };
      }
    } else if (value !== undefined) {
      validatedData[fieldName] = value;
    }
  }

  // Manejar campos desconocidos
  for (const key of Object.keys(data)) {
    if (!(key in schema)) {
      if (!allowUnknown && !stripUnknown) {
        errors.push({
          field: key,
          path: key,
          message: `${key} is not allowed`,
          received: data[key],
          rule: "unknown",
        });
        if (abortEarly) {
          return { valid: false, errors };
        }
      } else if (allowUnknown) {
        validatedData[key] = data[key];
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: validatedData,
  };
}

/**
 * Valida un array de objetos contra un esquema.
 */
export function validateBatch(
  items: Record<string, any>[],
  schema: ValidationSchema,
  options: ValidatorOptions = {}
): Array<ValidationResult & { index: number }> {
  return items.map((item, index) => ({
    index,
    ...validate(item, schema, options),
  }));
}

/**
 * Crea un validador reutilizable con un schema predefinido.
 */
export function createValidator(
  schema: ValidationSchema,
  defaultOptions: ValidatorOptions = {}
) {
  return {
    validate: (data: Record<string, any>, options?: ValidatorOptions) =>
      validate(data, schema, { ...defaultOptions, ...options }),
    validateBatch: (items: Record<string, any>[], options?: ValidatorOptions) =>
      validateBatch(items, schema, { ...defaultOptions, ...options }),
    schema,
  };
}

/**
 * Composición de schemas (merge de múltiples schemas).
 */
export function composeSchemas(...schemas: ValidationSchema[]): ValidationSchema {
  return schemas.reduce((acc, schema) => ({ ...acc, ...schema }), {});
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMAS PREDEFINIDOS
// ═══════════════════════════════════════════════════════════════════════════════

/** Schema base para IDs */
export const idSchema: ValidationSchema = {
  id: { type: "string", required: true, min: 1 },
};

/** Schema base para timestamps */
export const timestampSchema: ValidationSchema = {
  createdAt: { type: "string", required: false },
  updatedAt: { type: "string", required: false },
};

/** Schema para paginación */
export const paginationSchema: ValidationSchema = {
  page: { type: "number", min: 1, default: 1 },
  limit: { type: "number", min: 1, max: 1000, default: 50 },
  offset: { type: "number", min: 0, default: 0 },
};

/** Schema para agent identities */
export const agentIdentitySchema: ValidationSchema = {
  name: { required: true, min: 1, max: 200 },
  description: { max: 2000 },
  type: { enum: ["custom", "service", "system", "user"], default: "custom" },
  isActive: { type: "boolean", default: true },
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTACIONES
// ═══════════════════════════════════════════════════════════════════════════════

export type {
  ValidationRule,
  Condition,
  ValidationSchema,
  ValidationResult,
  ValidationError,
  ValidatorOptions,
};
