/**
 * ============================================================================
 * EL PUENTE ZOD - Esquemas de Validación Compartidos
 * ============================================================================
 * 
 * Única fuente de verdad para validación de datos entre Backend (Hono) 
 * y Frontend (SvelteKit). 
 * 
 * Cualquier cambio en la estructura de datos debe reflejarse aquí.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Field Types
// ─────────────────────────────────────────────────────────────────────────────

export const FieldTypeSchema = z.enum([
  "text",
  "number",
  "boolean",
  "date",
  "image",
  "url",
  "email",
  "select",
  "json",
  "richtext",
  "relation",
]);

export type FieldType = z.infer<typeof FieldTypeSchema>;

export const RelationTypeSchema = z.enum([
  "one-to-one",
  "one-to-many",
  "many-to-many",
]);

export type RelationType = z.infer<typeof RelationTypeSchema>;

export const RelationTargetSchema = z.enum([
  "games",
  "blog-posts",
  "platforms",
  "tags",
  "streamers",
  "dataset",
]);

export type RelationTarget = z.infer<typeof RelationTargetSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Field Definition (El corazón del esquema)
// ─────────────────────────────────────────────────────────────────────────────

export const RelationConfigSchema = z.object({
  target: RelationTargetSchema,
  targetDatasetId: z.string().optional(),
  targetDatasetName: z.string().optional(),
  type: RelationTypeSchema,
  displayField: z.string().optional(),
});

export type RelationConfig = z.infer<typeof RelationConfigSchema>;

export const SelectOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export type SelectOption = z.infer<typeof SelectOptionSchema>;

/**
 * Esquema Zod para la definición de un campo individual.
 * 
 * CRÍTICO: Este esquema valida que cada campo tenga:
 * - id único
 * - key (nombre máquina)
 * - label (nombre visible)  
 * - type (uno de los FieldTypes permitidos)
 * - Validaciones opcionales (required, unique, regex, min/max)
 */
export const FieldDefinitionSchema = z.object({
  // Identificación
  id: z.string().min(1, "Field ID is required"),
  key: z.string().min(1, "Field key is required"),
  label: z.string().min(1, "Field label is required"),
  type: FieldTypeSchema,
  
  // Metadata
  helpText: z.string().optional(),
  order: z.number().int().min(0).default(0),
  
  // Validaciones (estilo Django)
  isRequired: z.boolean().default(false),
  isUnique: z.boolean().default(false),
  validationRegex: z.string().optional(),
  defaultValue: z.string().optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(0).optional(),
  
  // Opciones para selects
  options: z.array(SelectOptionSchema).optional(),
  
  // Configuración de relaciones
  relation: RelationConfigSchema.optional(),
  
  // Configuración UI
  width: z.number().optional(),
  hidden: z.boolean().default(false),
});

export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Dataset Policy & Workflow (Enterprise)
// ─────────────────────────────────────────────────────────────────────────────

export const DatasetPolicySchema = z.object({
  readAccess: z.enum(["admin", "public", "authenticated"]),
  writeAccess: z.enum(["admin", "authenticated"]),
  enableRLS: z.boolean().default(false),
  rlsRules: z.array(
    z.object({
      field: z.string(),
      operator: z.enum(["eq", "neq", "contains", "gt", "lt"]),
      value: z.string(),
    })
  ).optional(),
});

export type DatasetPolicy = z.infer<typeof DatasetPolicySchema>;

export const DatasetWorkflowSchema = z.object({
  requireApproval: z.boolean(),
  approverUserIds: z.array(z.string()).optional(),
});

export type DatasetWorkflow = z.infer<typeof DatasetWorkflowSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Dataset Definition (La Verdad Absoluta)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Esquema Zod para la definición completa de un Dataset.
 * 
 * CRÍTICO: Este esquema garantiza que:
 * 1. El dataset tiene un nombre y slug válidos
 * 2. Contiene un array de fields (NO un objeto plano)
 * 3. Cada field cumple con FieldDefinitionSchema
 * 
 * Uso en Backend: Valida el payload POST/PATCH con @hono/zod-validator
 * Uso en Frontend: Importa el tipo inferido con z.infer<typeof DatasetDefinitionSchema>
 */
export const DatasetDefinitionSchema = z.object({
  // Identificación
  id: z.string(),
  name: z.string().min(1, "Dataset name is required"),
  slug: z.string().min(1, "Dataset slug is required"),
  description: z.string().optional(),
  icon: z.string().optional(),
  
  // El corazón: array de fields estructurados
  fields: z.array(FieldDefinitionSchema).min(0),
  
  // Configuración Enterprise
  policyJson: DatasetPolicySchema.nullable().optional(),
  workflowJson: DatasetWorkflowSchema.nullable().optional(),
  
  // Metadata
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type DatasetDefinition = z.infer<typeof DatasetDefinitionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Dataset Entry
// ─────────────────────────────────────────────────────────────────────────────

export const DatasetEntrySchema = z.object({
  id: z.string(),
  datasetId: z.string(),
  data: z.record(z.any()),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type DatasetEntry = z.infer<typeof DatasetEntrySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Validación de Payloads (para uso en Hono)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Esquema para crear un nuevo Dataset (sin ID ni timestamps)
 */
export const CreateDatasetPayloadSchema = DatasetDefinitionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Campos opcionales para creación
  gameId: z.string().optional(),
  displayConfig: z.object({
    titleField: z.string().optional(),
    sortField: z.string().optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
  }).optional(),
});

export type CreateDatasetPayload = z.infer<typeof CreateDatasetPayloadSchema>;

/**
 * Esquema para actualizar un Dataset (todos los campos opcionales)
 */
export const UpdateDatasetPayloadSchema = DatasetDefinitionSchema.partial().omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  gameId: z.string().optional(),
  displayConfig: z.object({
    titleField: z.string().optional(),
    sortField: z.string().optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
  }).optional(),
});

export type UpdateDatasetPayload = z.infer<typeof UpdateDatasetPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de Validación
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida que un objeto sea un DatasetDefinition válido.
 * Lanza ZodError si no cumple el esquema.
 */
export function validateDatasetDefinition(data: unknown): DatasetDefinition {
  return DatasetDefinitionSchema.parse(data);
}

/**
 * Valida de forma segura sin lanzar excepciones.
 * Retorna { success: true, data } o { success: false, error }
 */
export function safeValidateDataset(data: unknown): 
  | { success: true; data: DatasetDefinition }
  | { success: false; error: z.ZodError } {
  const result = DatasetDefinitionSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Genera un ID de field único
 */
export function generateFieldId(): string {
  return `fld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Crea un field vacío del tipo especificado
 */
export function createEmptyField(type: FieldType, order: number): FieldDefinition {
  return {
    id: generateFieldId(),
    key: "",
    label: "",
    type,
    isRequired: false,
    isUnique: false,
    order,
    hidden: false,
  };
}
