import { z } from "zod";
const FieldTypeSchema = z.enum([
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
  "kpi"
]);
const RelationTypeSchema = z.enum([
  "one-to-one",
  "one-to-many",
  "many-to-many"
]);
const RelationTargetSchema = z.enum([
  "games",
  "blog-posts",
  "platforms",
  "tags",
  "streamers",
  "dataset"
]);
const RelationConfigSchema = z.object({
  target: RelationTargetSchema,
  targetDatasetId: z.string().optional(),
  targetDatasetName: z.string().optional(),
  type: RelationTypeSchema,
  displayField: z.string().optional()
});
const SelectOptionSchema = z.object({
  label: z.string(),
  value: z.string()
});
const FieldDefinitionSchema = z.object({
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
  hidden: z.boolean().default(false)
});
const DatasetPolicySchema = z.object({
  readAccess: z.enum(["admin", "public", "authenticated"]),
  writeAccess: z.enum(["admin", "authenticated"]),
  enableRLS: z.boolean().default(false),
  rlsRules: z.array(z.object({
    field: z.string(),
    operator: z.enum(["eq", "neq", "contains", "gt", "lt"]),
    value: z.string()
  })).optional()
});
const DatasetWorkflowSchema = z.object({
  requireApproval: z.boolean(),
  approverUserIds: z.array(z.string()).optional()
});
const DatasetDefinitionSchema = z.object({
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
  updatedAt: z.string().datetime().optional()
});
z.object({
  id: z.string(),
  datasetId: z.string(),
  data: z.record(z.any()),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});
DatasetDefinitionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  // Campos opcionales para creación
  displayConfig: z.object({
    titleField: z.string().optional(),
    sortField: z.string().optional(),
    sortDirection: z.enum(["asc", "desc"]).optional()
  }).optional()
});
DatasetDefinitionSchema.partial().omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  displayConfig: z.object({
    titleField: z.string().optional(),
    sortField: z.string().optional(),
    sortDirection: z.enum(["asc", "desc"]).optional()
  }).optional()
});
