/**
 * Data Explorer API — "Data Studio" (Pilar 1)
 *
 * Universal table explorer with:
 *   ✅ Whitelist-based table access (security)
 *   ✅ Server-side pagination (limit/offset)
 *   ✅ Server-side sorting (any column, asc/desc)
 *   ✅ Server-side filtering (field, operator, value)
 *   ✅ Inline edit via PATCH (single cell updates)
 *   ✅ Column metadata (types, editability)
 *   ✅ Smart Views (saved filter presets)
 */
import { Hono } from "hono";
export declare const explorerRoutes: Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
//# sourceMappingURL=data-explorer.d.ts.map