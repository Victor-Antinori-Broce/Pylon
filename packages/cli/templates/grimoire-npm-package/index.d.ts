/**
 * Example Grimoire — Entry Point
 *
 * Exports the GrimoireDefinition used by GremiusCMS module-loader.
 */
import type { GrimoireDefinition, GrimoireContext } from "@gremius/shared";
import { Hono } from "hono";
export * from "./schema.js";
export declare function createExampleGrimoire(ctx: GrimoireContext): Hono;
export declare const grimoire: GrimoireDefinition;
export default grimoire;
//# sourceMappingURL=index.d.ts.map
