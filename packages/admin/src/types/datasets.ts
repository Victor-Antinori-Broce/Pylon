/**
 * Dataset Module Types
 * Defines the schema for virtual tables (dataset_definitions + dataset_entries)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MIGRADO: Este archivo ahora re-exporta desde @kitsuden/shared
 * para mantener una única fuente de verdad.
 *
 * El "Puente Zod" garantiza que Frontend y Backend usen los mismos tipos.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// El re-export de abajo NO trae el nombre al ambito local: para usarlo aqui
// hace falta un import de verdad.
import { creatableFieldTypes } from "@kitsuden/shared";

// ═══════════════════════════════════════════════════════════════════════════
// RE-EXPORTACIONES DESDE EL PUENTE ZOD (@kitsuden/shared)
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
  creatableFieldTypes,
} from "@kitsuden/shared";

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS ESPECÍFICOS DE UI (Solo Frontend)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Opción de tipo de campo para la UI del SchemaBuilder
 */
export interface FieldTypeOption {
  type: import("@kitsuden/shared").FieldType;
  label: string;
  icon: string;
  description: string;
  color: string;
}

/**
 * Opciones de tipos de campo disponibles en el SchemaBuilder.
 *
 * Se derivan del registro compartido en vez de mantener aqui una segunda
 * lista. Esa segunda lista es la razon por la que `multiselect`, `textarea`,
 * `datetime` y `media` validaban en el backend sin poder crearse: nadie los
 * anadio aqui al anadirlos alli.
 *
 * Los tipos marcados `creatable: false` en el registro (alias heredados)
 * quedan fuera a proposito: siguen validando, pero ofrecer dos nombres para lo
 * mismo en la paleta solo confunde.
 */
export const FIELD_TYPE_OPTIONS: FieldTypeOption[] = creatableFieldTypes().map((t) => ({
  type: t.type,
  label: t.label,
  icon: t.icon,
  description: t.description,
  color: t.color,
}));

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS LEGACY (Mantener para compatibilidad)
// ═══════════════════════════════════════════════════════════════════════════

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function generateFieldKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTA DE MIGRACIÓN
// ═══════════════════════════════════════════════════════════════════════════
//
// Antes: Cada app definía sus propios tipos, causando desfase.
// Después: Todos usan @kitsuden/shared que contiene la Verdad Absoluta.
//
// Si necesitas modificar la estructura de un Dataset:
// 1. Edita packages/shared/src/schemas.ts
// 2. Ejecuta `pnpm build` en packages/shared
// 3. Los cambios se propagan automáticamente a API y Frontend
//
// La validación Zod en el backend rechazará automáticamente payloads
// que no cumplan con el esquema, previniendo corrupción de datos.
