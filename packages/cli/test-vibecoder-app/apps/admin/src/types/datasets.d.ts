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
export { type FieldType, type RelationType, type RelationTarget, type RelationConfig, type SelectOption, type FieldDefinition, type DatasetPolicy, type DatasetWorkflow, type DatasetDefinition, type DatasetEntry, type CreateDatasetPayload, type UpdateDatasetPayload, FieldTypeSchema, RelationTypeSchema, RelationTargetSchema, FieldDefinitionSchema, DatasetDefinitionSchema, generateFieldId, createEmptyField, safeValidateDataset, } from "@gremius/shared";
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
export declare const FIELD_TYPE_OPTIONS: FieldTypeOption[];
export declare function generateSlug(name: string): string;
export declare function generateFieldKey(label: string): string;
//# sourceMappingURL=datasets.d.ts.map