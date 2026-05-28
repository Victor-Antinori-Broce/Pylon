import type { GrimoireContext } from "@gremius/shared";
import { Hono } from "hono";
export * from "./conta.schema";
export type { ContaDb } from "./types";
export { ContaService, validateLedgerLines, applyJournalTemplate, type ValidationResult, type TemplateVariables, } from "./conta.service";
export declare function createGrimoireConta(ctx: GrimoireContext): Hono;
export declare const grimoire: import("@gremius/shared").GrimoireDefinition;
export default grimoire;
//# sourceMappingURL=index.d.ts.map