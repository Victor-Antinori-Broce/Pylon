/**
 * Dataset Module Types
 * Defines the schema for virtual tables (dataset_definitions + dataset_entries)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * MIGRADO: Este archivo ahora re-exporta desde @gremius/shared
 * para mantener una única fuente de verdad.
 * 
 * El "Puente Zod" garantiza que Frontend y Backend usen los mismos tipos.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════
// RE-EXPORTACIONES DESDE EL PUENTE ZOD (@gremius/shared)
// ═══════════════════════════════════════════════════════════════════════════

export {
  // Tipos core
  type FieldType,
  type RelationType,
  type RelationTarget,
  type RelationConfig,
  type SelectOption,
  type FieldDefinition,
  type DatasetPolicy,
  type DatasetWorkflow,
  type DatasetDefinition,
  type DatasetEntry,
  type CreateDatasetPayload,
  type UpdateDatasetPayload,
  
  // Esquemas Zod (para validación runtime si se necesita)
  FieldTypeSchema,
  RelationTypeSchema,
  RelationTargetSchema,
  FieldDefinitionSchema,
  DatasetDefinitionSchema,
  
  // Helpers
  generateFieldId,
  createEmptyField,
  safeValidateDataset,
} from "@gremius/shared";

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS ESPECÍFICOS DE UI (Solo Frontend)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Opción de tipo de campo para la UI del SchemaBuilder
 */
export interface FieldTypeOption {
  type: import("@gremius/shared").FieldType;
  label: string;
  icon: string;
  description: string;
  color: string;
}

/**
 * Opciones de tipos de campo disponibles en el SchemaBuilder
 */
export const FIELD_TYPE_OPTIONS: FieldTypeOption[] = [
  { type: "text", label: "Text", icon: "Type", description: "Single or multi-line text", color: "#00E5FF" },
  { type: "number", label: "Number", icon: "Hash", description: "Integer or decimal", color: "#76FF03" },
  { type: "boolean", label: "Boolean", icon: "ToggleLeft", description: "True / False toggle", color: "#FFD600" },
  { type: "date", label: "Date", icon: "Calendar", description: "Date or datetime", color: "#E040FB" },
  { type: "image", label: "Image", icon: "ImageIcon", description: "Image upload or URL", color: "#FF6E40" },
  { type: "url", label: "URL", icon: "Link2", description: "Web address", color: "#40C4FF" },
  { type: "email", label: "Email", icon: "Mail", description: "Email address", color: "#FFAB00" },
  { type: "select", label: "Select", icon: "List", description: "Dropdown from options", color: "#69F0AE" },
  { type: "json", label: "JSON", icon: "Braces", description: "Raw JSON object", color: "#B388FF" },
  { type: "richtext", label: "Rich Text", icon: "FileText", description: "Formatted content", color: "#FF80AB" },
  { type: "relation", label: "Relation", icon: "GitBranch", description: "Link to another collection", color: "#FF2A6D" },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS LEGACY (Mantener para compatibilidad)
// ═══════════════════════════════════════════════════════════════════════════

export function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function generateFieldKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTA DE MIGRACIÓN
// ═══════════════════════════════════════════════════════════════════════════
// 
// Antes: Cada app definía sus propios tipos, causando desfase.
// Después: Todos usan @gremius/shared que contiene la Verdad Absoluta.
//
// Si necesitas modificar la estructura de un Dataset:
// 1. Edita packages/shared/src/schemas.ts
// 2. Ejecuta `pnpm build` en packages/shared
// 3. Los cambios se propagan automáticamente a API y Frontend
//
// La validación Zod en el backend rechazará automáticamente payloads
// que no cumplan con el esquema, previniendo corrupción de datos.
