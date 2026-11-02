/**
 * `buildDatasetWhere` y los datasets por dueño.
 *
 * El admin recibía 0 filas en `GET /api/data-sets/:id/entries` de un dataset
 * con `rlsRules` de dueño, porque la regla `data->>'ownerId' = <usuario>` se
 * le aplicaba también. El admin ve todo; cualquier otro rol (editor incluido)
 * sigue filtrado por las reglas.
 */
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, test } from "vitest";

import { buildDatasetWhere, type RLSRule } from "../../packages/shared/src/rls-builder";

const dialecto = new PgDialect();
const DS = "11111111-1111-4111-8111-111111111111";
const reglas: RLSRule[] = [{ field: "ownerId", operator: "eq", value: "__USER_ID__" }];

function sqlDe(rol: string | undefined, id = "u-1") {
  const { where, hasRLS } = buildDatasetWhere(DS, reglas, { id, role: rol });
  return { texto: dialecto.sqlToQuery(where!).sql, hasRLS };
}

describe("buildDatasetWhere con reglas de dueño", () => {
  test("admin: solo el filtro de dataset, sin regla de dueño", () => {
    const r = sqlDe("admin");
    expect(r.hasRLS).toBe(false);
    expect(r.texto).not.toContain("->>");
  });

  test.each(["user", "editor", undefined])("rol %s: sigue filtrado por dueño", (rol) => {
    const r = sqlDe(rol);
    expect(r.hasRLS).toBe(true);
    expect(r.texto).toContain("->>");
  });

  test("anónimo: la regla con __USER_ID__ no deja pasar nada", () => {
    const { where } = buildDatasetWhere(DS, reglas, null);
    expect(dialecto.sqlToQuery(where!).sql).toContain("1 = 0");
  });
});
