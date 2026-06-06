/**
 * RLS Builder - Re-export from @gremius/shared
 *
 * This module has been moved to packages/shared/src/rls-builder.ts
 * for use by both core API and self-contained grimoires.
 *
 * This file is kept for backward compatibility with existing imports.
 */

export {
  buildDrizzleWhere,
  buildDatasetWhere,
  checkReadAccess,
  checkWriteAccess,
  createRLSFilter,
} from "@gremius/shared";

export type { RLSType, RLSRule, PolicyJson, RLSUser } from "@gremius/shared";
