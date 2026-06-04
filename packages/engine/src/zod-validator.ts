/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ZOD VALIDATOR - Protección Anti-Alucinaciones
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Integración de Zod con el motor de validación declarativa.
 * Proporciona schemas estrictos para prevenir que la IA genere datos imposibles.
 *
 * Features:
 * - Schemas Zod predefinidos para datasets comunes (characters, skills, items)
 * - Conversión automática ValidationRule → ZodSchema
 * - Validación estricta con mensajes de error amigables para IA
 * - Sanitización de datos desconocidos
 *
 * @example
 * ```typescript
 * import { validateWithZod, characterSchema } from "./zod-validator";
 *
 * // Validar contra schema Zod
 * const result = validateWithZod(characterSchema, {
 *   name: "Mage",
 *   mana_cost: -10 // ← Rechazado!
 * });
 *
 * // Resultado
 * { success: false, errors: ["mana_cost: Number must be >= 0"] }
 * ```
 */

import { z, ZodSchema, ZodError, ZodObject, ZodRawShape } from "zod";
import type { ValidationRule, ValidationSchema } from "./validator";

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMAS ZOD PREDEFINIDOS - Anti-Alucinaciones
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Schema base para cualquier entidad del sistema.
 * Previene campos peligrosos o desconocidos.
 */
export const baseEntitySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

/**
 * Schema para personajes (characters) - Gaming CMS.
 * Protege contra valores imposibles en stats.
 */
export const characterSchema = baseEntitySchema.extend({
  // Stats básicos con rangos realistas
  level: z.number().int().min(1).max(100).default(1),
  rarity: z.number().int().min(3).max(5),
  
  // Elementos válidos del juego
  element: z.enum(["pyro", "hydro", "electro", "cryo", "anemo", "geo", "dendro"], {
    errorMap: () => ({ message: "Elemento inválido. Opciones: pyro, hydro, electro, cryo, anemo, geo, dendro" })
  }),
  
  // Tipos de arma permitidos
  weapon_type: z.enum(["sword", "claymore", "polearm", "bow", "catalyst"]),
  
  // Stats numéricas con rangos anti-alucinación
  hp: z.number().min(0).max(999999),
  atk: z.number().min(0).max(999999),
  def: z.number().min(0).max(999999),
  mana_cost: z.number().min(0).max(1000).optional(),
  cooldown: z.number().min(0).max(3600).optional(), // segundos, máx 1 hora
  
  // Slug para URLs
  slug: z.string()
    .regex(/^[a-z0-9-]+$/, "Slug solo puede contener minúsculas, números y guiones")
    .max(200),
  
  // Metadata flexible pero controlada
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Schema para habilidades (skills).
 */
export const skillSchema = baseEntitySchema.extend({
  character_id: z.string().uuid(),
  
  // Daño/healing con rangos razonables
  damage: z.number().min(0).max(999999).optional(),
  healing: z.number().min(0).max(999999).optional(),
  
  // Costos que no pueden ser negativos
  mana_cost: z.number().min(0).max(1000),
  energy_cost: z.number().min(0).max(1000).optional(),
  
  // Cooldowns razonables
  cooldown_seconds: z.number().min(0).max(3600),
  duration_seconds: z.number().min(0).max(3600).optional(),
  
  // Tipo de habilidad
  skill_type: z.enum(["normal", "charged", "plunge", "skill", "burst", "passive"]),
  
  // Elemento (opcional, hereda del personaje si no se especifica)
  element: z.enum(["pyro", "hydro", "electro", "cryo", "anemo", "geo", "dendro"]).optional(),
});

/**
 * Schema para armas (weapons).
 */
export const weaponSchema = baseEntitySchema.extend({
  type: z.enum(["sword", "claymore", "polearm", "bow", "catalyst"]),
  rarity: z.number().int().min(1).max(5),
  
  // Stats base
  base_atk: z.number().min(0).max(1000),
  sub_stat: z.enum(["crit_rate", "crit_dmg", "atk_percent", "def_percent", "hp_percent", 
                    "elemental_mastery", "energy_recharge", "physical_dmg"]).optional(),
  sub_stat_value: z.number().min(0).max(100).optional(), // porcentaje
});

/**
 * Schema para builds (snapshots inmutables).
 */
export const buildSchema = z.object({
  character_id: z.string().uuid(),
  weapon_id: z.string().uuid(),
  artifact_ids: z.array(z.string().uuid()).max(5),
  
  // Valores calculados (denormalizados)
  total_atk: z.number().min(0),
  total_hp: z.number().min(0),
  total_def: z.number().min(0),
  
  // Snapshot de datos para inmutabilidad
  _snapshot: z.object({
    character: z.record(z.unknown()),
    weapon: z.record(z.unknown()),
    artifacts: z.array(z.record(z.unknown())),
    calculated_at: z.string().datetime(),
  }),
});

/**
 * Schema para agentes (ya existe en el sistema pero reforzado).
 */
export const agentIdentitySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  type: z.enum(["claude-desktop", "service", "internal", "webhook"]),
  scopes: z.array(z.string()).default([]),
  rateLimit: z.number().int().min(1).max(10000).default(60),
  capabilities: z.array(z.string()).default([]),
  systemPrompt: z.string().max(10000).optional(),
  allowedTools: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSIÓN: ValidationRule → ZodSchema
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convierte una regla de validación declarativa a schema Zod.
 */
export function ruleToZod(rule: ValidationRule): ZodSchema {
  let schema: ZodSchema = z.any();

  // Tipo base
  switch (rule.type) {
    case "string":
      schema = z.string();
      break;
    case "number":
      schema = z.number();
      break;
    case "boolean":
      schema = z.boolean();
      break;
    case "array":
      schema = z.array(z.any());
      break;
    case "object":
      schema = z.record(z.any());
      break;
    case "date":
      schema = z.union([z.date(), z.string().datetime()]);
      break;
    default:
      schema = z.any();
  }

  // Required
  if (rule.required) {
    schema = (schema as any).refine(
      (val: any) => val !== undefined && val !== null && val !== "",
      { message: rule.message || "Campo requerido" }
    );
  } else {
    schema = schema.optional();
  }

  // Min (longitud para strings/arrays, valor para números)
  if (rule.min !== undefined) {
    if (rule.type === "number") {
      schema = (schema as z.ZodNumber).min(rule.min, {
        message: rule.message || `Debe ser mayor o igual a ${rule.min}`
      });
    } else if (rule.type === "string") {
      schema = (schema as z.ZodString).min(rule.min, {
        message: rule.message || `Mínimo ${rule.min} caracteres`
      });
    }
  }

  // Max
  if (rule.max !== undefined) {
    if (rule.type === "number") {
      schema = (schema as z.ZodNumber).max(rule.max, {
        message: rule.message || `Debe ser menor o igual a ${rule.max}`
      });
    } else if (rule.type === "string") {
      schema = (schema as z.ZodString).max(rule.max, {
        message: rule.message || `Máximo ${rule.max} caracteres`
      });
    }
  }

  // Enum
  if (rule.enum) {
    schema = z.enum(rule.enum as [string, ...string[]], {
      errorMap: () => ({ message: rule.message || `Valores permitidos: ${rule.enum?.join(", ")}` })
    });
  }

  // Pattern (regex)
  if (rule.pattern) {
    schema = (schema as z.ZodString).regex(new RegExp(rule.pattern), {
      message: rule.message || "Formato inválido"
    });
  }

  return schema;
}

/**
 * Convierte un esquema de validación declarativo completo a Zod.
 */
export function validationSchemaToZod(schema: ValidationSchema): ZodObject<ZodRawShape> {
  const shape: ZodRawShape = {};
  
  for (const [field, rule] of Object.entries(schema)) {
    shape[field] = ruleToZod(rule);
  }
  
  return z.object(shape).strict();
}

// ═══════════════════════════════════════════════════════════════════════════════
// API PÚBLICA
// ═══════════════════════════════════════════════════════════════════════════════

export interface ZodValidationResult {
  success: boolean;
  data?: any;
  errors: Array<{
    field: string;
    message: string;
    received?: any;
  }>;
}

/**
 * Valida datos contra un schema Zod.
 */
export function validateWithZod(schema: ZodSchema, data: unknown): ZodValidationResult {
  try {
    const parsed = schema.parse(data);
    return {
      success: true,
      data: parsed,
      errors: []
    };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        errors: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          received: err.code
        }))
      };
    }
    return {
      success: false,
      errors: [{ field: "unknown", message: String(error) }]
    };
  }
}

/**
 * Valida usando un esquema declarativo (conversión automática a Zod).
 */
export function validateDeclarativeWithZod(
  schema: ValidationSchema,
  data: unknown
): ZodValidationResult {
  const zodSchema = validationSchemaToZod(schema);
  return validateWithZod(zodSchema, data);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE PARA BATCH API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Crea un validador compatible con BatchProcessor que usa Zod.
 */
export function createZodBatchValidator(schema: ZodSchema) {
  return (data: unknown) => {
    const result = validateWithZod(schema, data);
    return {
      valid: result.success,
      errors: result.errors.map(e => ({
        field: e.field,
        message: e.message,
        path: e.field
      }))
    };
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY DE SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

const schemaRegistry = new Map<string, ZodSchema>([
  ["character", characterSchema],
  ["characters", characterSchema],
  ["skill", skillSchema],
  ["skills", skillSchema],
  ["weapon", weaponSchema],
  ["weapons", weaponSchema],
  ["build", buildSchema],
  ["builds", buildSchema],
  ["agent", agentIdentitySchema],
  ["agents", agentIdentitySchema],
]);

/**
 * Obtiene un schema Zod por nombre de dataset.
 */
export function getSchemaForDataset(dataset: string): ZodSchema | undefined {
  return schemaRegistry.get(dataset.toLowerCase());
}

/**
 * Registra un nuevo schema Zod para un dataset.
 */
export function registerSchema(dataset: string, schema: ZodSchema): void {
  schemaRegistry.set(dataset.toLowerCase(), schema);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MENSAJES AMIGABLES PARA IA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Genera un mensaje de error que la IA puede entender y actuar.
 */
export function generateAIRecoveryHint(errors: Array<{ field: string; message: string }>): string {
  if (errors.length === 0) return "Validación exitosa.";
  
  const hints = errors.map(err => {
    switch (err.field) {
      case "mana_cost":
      case "damage":
      case "hp":
      case "atk":
      case "def":
        return `El campo '${err.field}' debe ser un número positivo (>= 0). Valores negativos no son válidos en este sistema.`;
      case "rarity":
        return "La rareza debe estar entre 3 (raro) y 5 (legendario). No existen rarezas superiores a 5 en este sistema.";
      case "element":
        return "Los elementos válidos son: pyro (fuego), hydro (agua), electro (rayo), cryo (hielo), anemo (viento), geo (tierra), dendro (naturaleza).";
      case "slug":
        return "El slug debe estar en minúsculas, sin espacios, usando solo guiones (-) como separadores.";
      default:
        return `Error en '${err.field}': ${err.message}`;
    }
  });
  
  return hints.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTACIONES
// ═══════════════════════════════════════════════════════════════════════════════

export {
  z,
  ZodSchema,
  ZodError,
};
