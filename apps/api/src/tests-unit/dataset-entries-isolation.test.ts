/**
 * Dataset entries — aislamiento por owner (regresión del RLS route mismatch)
 * ============================================================================
 * BUG CERRADO (2026-07-19): `GET /:id/entries` filtraba SOLO por dataSetId,
 * con la `db` global y sin checar `policyJson`. Cualquier usuario (incluso
 * anónimo) veía las entries de todos. Afectaba a los DOS caminos:
 *   - apps/api/src/routes/crud.ts        (Data Sets Lite)
 *   - packages/core/datasets/    (el kon real)
 * Además `withTransactionalRLS()` estaba montado en `/api/datasets/*` (sin
 * guion) mientras la ruta real es `/api/data-sets` → sin Nivel 2 tampoco.
 *
 * Tests puros del helper que hace el aislamiento + guardias estáticas de que
 * los handlers lo usan (ver test-suite-caveats: evitamos runtime mockeable).
 */

import { describe, expect, test } from "bun:test";

import { buildDatasetWhere, checkReadAccess } from "../lib/rls-builder";
import type { PolicyJson, RLSRule, RLSUser } from "../lib/rls-builder";

const OWNER_RULE: RLSRule[] = [{ field: "ownerId", operator: "eq", value: "{{current_user_id}}" }];

const alice: RLSUser = { id: "user-alice", role: "user" };
const admin: RLSUser = { id: "user-admin", role: "admin" };

describe("checkReadAccess — puerta de lectura", () => {
  test("sin policy → solo admin (deny-by-default)", () => {
    expect(checkReadAccess(null, null)).toBe(false);
    expect(checkReadAccess(null, alice)).toBe(false);
    expect(checkReadAccess(null, admin)).toBe(true);
  });

  test("authenticated → rechaza anónimo, acepta logueado", () => {
    const policy = { readAccess: "authenticated" } as PolicyJson;
    expect(checkReadAccess(policy, null)).toBe(false);
    expect(checkReadAccess(policy, alice)).toBe(true);
  });

  test("public → acepta anónimo (caso CMS)", () => {
    expect(checkReadAccess({ readAccess: "public" } as PolicyJson, null)).toBe(true);
  });

  test("admin → solo admin", () => {
    const policy = { readAccess: "admin" } as PolicyJson;
    expect(checkReadAccess(policy, alice)).toBe(false);
    expect(checkReadAccess(policy, admin)).toBe(true);
  });
});

describe("buildDatasetWhere — filtro de aislamiento", () => {
  test("con rlsRules de owner produce un WHERE con RLS", () => {
    const { where, hasRLS } = buildDatasetWhere("ds-1", OWNER_RULE, alice);
    expect(hasRLS).toBe(true);
    expect(where).toBeDefined();
  });

  test("sin rlsRules solo filtra por dataset (hasRLS=false)", () => {
    const { where, hasRLS } = buildDatasetWhere("ds-1", undefined, alice);
    expect(hasRLS).toBe(false);
    expect(where).toBeDefined();
  });

  test("el WHERE nunca es undefined — jamás se listan todas las entries", () => {
    for (const user of [alice, admin, null as unknown as RLSUser]) {
      for (const rules of [OWNER_RULE, undefined]) {
        expect(buildDatasetWhere("ds-1", rules, user).where).toBeDefined();
      }
    }
  });
});

describe("Guardias estáticas — los handlers aplican la política", () => {
  test("crud.ts GET /:id/entries usa checkReadAccess + buildDatasetWhere", async () => {
    const source = await Bun.file(`${import.meta.dir}/../routes/crud.ts`).text();
    // Fase E: `legible()` mira primero los scopes por dataset del agente y, si
    // no dicen nada, la política con checkReadAccess.
    expect(source).toContain("if (!legible(dataset, user)) {");
    expect(source).toContain("return checkReadAccess((dataset.policyJson ?? null) as PolicyJson | null, user);");
    expect(source).toContain("buildDatasetWhere(datasetId, policy?.rlsRules, user)");
    // Ya no debe existir el filtro ingenuo por dataSetId a secas.
    expect(source).not.toMatch(
      /\.from\(dataEntries\)\s*\n\s*\.where\(eq\(dataEntries\.dataSetId, c\.req\.param\("id"\)\)\)/
    );
  });

  test("crud.ts ejecuta sobre el executor del request-scope (tx RLS)", async () => {
    const source = await Bun.file(`${import.meta.dir}/../routes/crud.ts`).text();
    expect(source).toContain("resolveExecutor(db)");
  });

  test("withTransactionalRLS cubre /api/data-sets (no solo /api/datasets)", async () => {
    const source = await Bun.file(`${import.meta.dir}/../index.ts`).text();
    expect(source).toContain('app.use("/api/data-sets/:id/entries", withTransactionalRLS())');
    expect(source).toContain('app.use("/api/data-sets/:slug/entries", withTransactionalRLS())');
  });
});
