/**
 * La frontera MCP se valida
 * ============================================================================
 *
 * Los argumentos de una herramienta MCP los escribe un MODELO. No son entrada
 * de un cliente nuestro: son texto generado, y llegan hasta `.insert()`,
 * `.update()` y la cola de jobs.
 *
 * Durante un tiempo se leían con `args as any`, que no es un detalle de tipos
 * sino la AUSENCIA de la comprobación. Al quitarlo, el comprobador destapó dos
 * agujeros de verdad:
 *
 *   · `status` es un enum de Postgres (`content_status`) y se aceptaba como
 *     texto libre: un "publicado" reventaba contra el tipo de la columna.
 *   · `dispatch_worker` encolaba un objeto cualquiera en una cola que exige
 *     `{to, subject, html}`: el fallo aparecía después, en el worker.
 *
 * Estas pruebas fijan las tres propiedades que impiden que vuelva:
 *
 *   1. TODA herramienta declarada tiene esquema.
 *   2. Lo que se le declara al modelo coincide con lo que se valida.
 *   3. Un argumento inválido se rechaza ANTES de tocar la base.
 */

import { describe, expect, it } from "vitest";

import {
  executeHardcodedTool,
  listHardcodedMCPTools,
  nombresConEsquema,
} from "../../apps/api/src/services/mcp-tools";

const TODAS = listHardcodedMCPTools().map((t) => t.function.name);
const SESION_ADMIN = { agentId: "a", agentName: "test", scopes: ["admin"] };

describe("frontera MCP", () => {
  it("hay herramientas que inspeccionar", () => {
    expect(TODAS.length).toBeGreaterThan(10);
  });

  it("toda herramienta declarada tiene esquema de validación", () => {
    const sinEsquema = TODAS.filter((n) => !nombresConEsquema().includes(n));

    expect(
      sinEsquema,
      `Estas herramientas se le ofrecen al modelo pero nadie valida lo que ` +
        `manda. Añádeles su entrada en ESQUEMAS_ARGS de mcp-tools.ts. ` +
        `Herramientas: ${sinEsquema.join(", ")}`
    ).toEqual([]);
  });

  it("no hay esquemas huérfanos", () => {
    // Al revés: un esquema sin herramienta es código muerto que aparenta
    // cobertura.
    const huerfanos = nombresConEsquema().filter((n) => !TODAS.includes(n));
    expect(huerfanos, `Esquemas sin herramienta: ${huerfanos.join(", ")}`).toEqual([]);
  });

  it("rechaza una herramienta que no existe", async () => {
    await expect(executeHardcodedTool("kitsuden_borrar_todo", {}, SESION_ADMIN)).rejects.toThrow(
      /Unknown hardcoded MCP tool/
    );
  });

  it("rechaza un estado que no está en el enum", async () => {
    // Antes esto llegaba a la consulta y fallaba contra el tipo de la columna,
    // con un error de Postgres que el modelo no puede interpretar.
    await expect(
      executeHardcodedTool(
        "kitsuden_insert_record",
        { datasetId: "d1", data: { a: 1 }, status: "publicado" },
        SESION_ADMIN
      )
    ).rejects.toThrow(/Argumentos inválidos.*status/s);
  });

  it("rechaza un payload de email incompleto", async () => {
    await expect(
      executeHardcodedTool(
        "kitsuden_dispatch_worker",
        { queueName: "email", jobName: "system.welcome", payload: { to: "a@b.com" } },
        SESION_ADMIN
      )
    ).rejects.toThrow(/Argumentos inválidos/);
  });

  it("rechaza una cola que no existe en vez de encolar a ciegas", async () => {
    await expect(
      executeHardcodedTool(
        "kitsuden_dispatch_worker",
        { queueName: "webhooks", jobName: "x", payload: {} },
        SESION_ADMIN
      )
    ).rejects.toThrow(/Argumentos inválidos/);
  });

  it("rechaza un slug de dataset con caracteres de URL", async () => {
    await expect(
      executeHardcodedTool(
        "kitsuden_create_dataset",
        { name: "X", slug: "../../etc/passwd", fields: [{ key: "a" }] },
        SESION_ADMIN
      )
    ).rejects.toThrow(/Argumentos inválidos.*slug/s);
  });

  it("rechaza un limit fuera de rango en vez de dejarlo pasar", async () => {
    // Un `limit` enorme de un modelo es la forma más fácil de tumbar la base.
    await expect(
      executeHardcodedTool(
        "kitsuden_query_collection",
        { collection: "games", limit: 999999 },
        SESION_ADMIN
      )
    ).rejects.toThrow(/Argumentos inválidos.*limit/s);
  });

  it("rechaza `data` que no es un objeto", async () => {
    await expect(
      executeHardcodedTool(
        "kitsuden_create_record",
        { collection: "games", data: "no soy un objeto" },
        SESION_ADMIN
      )
    ).rejects.toThrow(/Argumentos inválidos.*data/s);
  });

  it("exige id o entryId en update, no uno cualquiera de los dos formatos", async () => {
    await expect(
      executeHardcodedTool("kitsuden_update_record", { data: { a: 1 } }, SESION_ADMIN)
    ).rejects.toThrow(/Argumentos inválidos/);
  });
});
