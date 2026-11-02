/**
 * Índices de datasets: la clave de un campo no puede inyectar SQL
 * ============================================================================
 *
 * Auditoría 2026-10-25 (A2): `datasets.indexes.ts` metía `field.key` dentro de
 * un `CREATE INDEX … (data->>'<clave>')` ejecutado con `sql.raw`. La clave la
 * escribe un editor; el índice lo aplica un admin. Ahora una clave que no es
 * un identificador simple no genera índice, y el nombre del índice es siempre
 * un identificador limpio.
 */

import { describe, expect, it } from "vitest";

import { suggestIndexesForDataset } from "../../packages/core/datasets/datasets.indexes";

describe("sugerencias de índices", () => {
  it("una clave con comillas o punto y coma no genera SQL", () => {
    const malas = [
      "x')); DROP TABLE auth_users; --",
      "a'b",
      "a;b",
      "a b",
      "a)--",
    ];
    for (const key of malas) {
      expect(suggestIndexesForDataset("juegos", { fields: [{ key, type: "date" }] }), key).toEqual([]);
    }
  });

  it("una clave normal sigue dando su índice, con nombre limpio aunque el slug lleve guiones", () => {
    const [s] = suggestIndexesForDataset("mis-juegos", { fields: [{ key: "fecha_salida", type: "date" }] });
    expect(s!.sql).toBe(
      "CREATE INDEX idx_mis_juegos_fecha_salida_btree ON data_entries (((data->>'fecha_salida')::timestamp));"
    );
    expect(s!.table).toBe("mis-juegos");
  });

  it("un slug con comillas no rompe el nombre del índice", () => {
    const [s] = suggestIndexesForDataset("a'; drop table x; --", { fields: [{ key: "n", type: "number" }] });
    expect(s!.sql).not.toMatch(/[';]\s*drop/i);
    expect(s!.sql).toMatch(/^CREATE INDEX [a-z0-9_]{1,63} ON data_entries /);
  });
});
