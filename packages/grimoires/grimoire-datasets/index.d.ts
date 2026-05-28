/**
 * Gremius Core Grimoire - DataSets
 *
 * Dynamic data collections with automatic API generation.
 * This is a CORE grimoire - enabled by default but can be disabled.
 *
 * Provides:
 * - Dynamic schema definition
 * - Auto-generated REST API
 * - RLS (Row Level Security)
 * - Validation with Zod
 * - Relations between datasets
 */
import type { GrimoireDefinition } from "@gremius/shared";
import { createDatasetsRouter } from "./datasets.routes";
import { adminConfig } from "./datasets.admin";
export * from "./datasets.schema";
export * from "./datasets.calculated.schema";
export { adminConfig };
export * from "./datasets.import-export";
export * from "./datasets.snapshots";
export * from "./datasets.indexes";
/**
 * Grimoire definition for DataSets
 */
export declare const grimoire: GrimoireDefinition;
export { createDatasetsRouter };
export type { CalculatedField, CalculatedFieldType, FilterConfig, FormulaBuilderNode, } from "./calculated-fields";
export { FORMULA_FUNCTIONS, FORMULA_OPERATORS, } from "./calculated-fields";
export default grimoire;
//# sourceMappingURL=index.d.ts.map