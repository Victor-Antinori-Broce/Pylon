/**
 * GremiusCMS — Aggregated Schema for Drizzle Kit
 *
 * Re-exports the core schema plus all module schemas so that
 * `drizzle-kit generate` and `drizzle-kit push` see every table.
 *
 * When adding a new module with its own schema, add a re-export line here.
 */

// ── Core tables (auth, users, media, games, blog, etc.) ──
export * from "./schema";

// ── Module schemas ──
export * from "../../../../packages/grimoires/ai-memories/schema";
export * from "../modules/booking/booking.schema";
export * from "../modules/directory/directory.schema";
export * from "../modules/dms/dms.schema";
export * from "../modules/formulas/formulas.schema";
export * from "../modules/academy/academy.schema";
export * from "../modules/webhooks/webhooks.schema";
export * from "../modules/promote/promote.schema";
export * from "../modules/connectors/connectors.schema";
