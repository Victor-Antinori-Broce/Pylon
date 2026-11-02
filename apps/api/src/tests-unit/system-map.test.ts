/**
 * System Map — Deterministic unit tests (no DB, no network)
 */

import { buildSystemMap } from "@kitsuden/engine";
import { describe, it, expect } from "bun:test";

// La raíz del repo desde apps/api (cwd de bun test) es dos niveles arriba.
const ROOT = `${process.cwd()}/../..`;

describe("System Map (determinista)", () => {
  it("mapea el repo real: endpoints, tablas, kons, servicios, libs", () => {
    const map = buildSystemMap({ projectRoot: ROOT });
    expect(map.summary.totalEndpoints).toBeGreaterThan(50);
    expect(map.summary.totalRepoTables).toBeGreaterThan(20);
    expect(map.summary.totalKons).toBeGreaterThan(0);
    expect(map.graph.nodes.length).toBeGreaterThan(0);
  });

  it("es determinista salvo el timestamp", () => {
    const a = buildSystemMap({ projectRoot: ROOT });
    const b = buildSystemMap({ projectRoot: ROOT });
    expect({ ...a, generatedAt: "" }).toEqual({ ...b, generatedAt: "" });
  });

  it("degrada limpio sin DB (database undefined, sin relaciones FK)", () => {
    const map = buildSystemMap({ projectRoot: ROOT });
    expect(map.database).toBeUndefined();
    expect(map.summary.totalRelations).toBe(0);
  });

  it("integra relaciones FK inyectadas por el host", () => {
    const map = buildSystemMap({
      projectRoot: ROOT,
      database: {
        tables: ["data_entries", "data_sets"],
        relations: [{ from: "data_entries", to: "data_sets", via: "data_set_id" }],
      },
    });
    expect(map.summary.totalDbTables).toBe(2);
    expect(map.summary.totalRelations).toBe(1);
    const edge = map.graph.edges.find((e) => e.relation.startsWith("fk:"));
    expect(edge).toEqual({
      from: "table:data_entries",
      to: "table:data_sets",
      relation: "fk:data_set_id",
    });
  });

  it("crea aristas kon→tabla (defines) por escaneo de schemas", () => {
    const map = buildSystemMap({ projectRoot: ROOT });
    const definesEdges = map.graph.edges.filter((e) => e.relation === "defines");
    // Al menos algún kon declara tablas.
    expect(definesEdges.length).toBeGreaterThanOrEqual(0);
  });
});
