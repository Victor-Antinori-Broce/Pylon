/**
 * RLS: la vía «scope de la herramienta + policyJson» también en Postgres
 * ============================================================================
 *
 * Auditoría 2026-10-25: las herramientas MCP corren ahora en la transacción
 * RLS del agente. Para eso Postgres tiene que conocer la regla de fase F que
 * aplica `exigirDataset` (mcp-tools.ts): `mcp:read`/`mcp:write` + lo que
 * permita la `policyJson` del dataset, y una denegación que gana a todo.
 * `kitsuden_agente_abre_por_politica` (rls-policies.sql) es esa regla en SQL.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";

import { db } from "../db";
import { dataSets } from "../db/schema";

import { isDatabaseAvailable, generateTestId } from "./setup";

let dbAvailable = false;

async function abre(scopes: string[], datasetId: string, accion: "read" | "write" | "delete") {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.agent_scopes', ${scopes.join(",")}, true)`);
    const r = (await tx.execute(
      sql`SELECT kitsuden_agente_abre_por_politica(${datasetId}::uuid, ${accion}) AS si`
    )) as unknown as { rows: { si: boolean }[] };
    return r.rows[0]!.si;
  });
}

describe("kitsuden_agente_abre_por_politica", () => {
  let abierto = "";
  let soloLectura = "";
  let soloAdmin = "";
  let slugAbierto = "";

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) return;
    const s = generateTestId().toLowerCase().replace(/[^a-z0-9]/g, "-");
    slugAbierto = `abierto-${s}`;
    const crear = async (slug: string, policyJson: unknown) =>
      (await db.insert(dataSets).values({ name: slug, slug, schema: { fields: [] }, policyJson } as never).returning())[0]!.id;
    abierto = await crear(slugAbierto, { readAccess: "authenticated", writeAccess: "authenticated" });
    soloLectura = await crear(`lectura-${s}`, { readAccess: "public", writeAccess: "admin" });
    soloAdmin = await crear(`admin-${s}`, { readAccess: "admin", writeAccess: "admin" });
  });

  it("la herramienta hace falta: sin mcp:read no se lee nada", async () => {
    if (!dbAvailable) return;
    expect(await abre(["mcp:connect"], abierto, "read")).toBe(false);
    expect(await abre(["mcp:connect", "mcp:read"], abierto, "read")).toBe(true);
  });

  it("la política del dataset decide lo demás", async () => {
    if (!dbAvailable) return;
    const escritor = ["mcp:connect", "mcp:read", "mcp:write"];
    expect(await abre(escritor, abierto, "write")).toBe(true);
    expect(await abre(escritor, abierto, "delete")).toBe(true);
    expect(await abre(escritor, soloLectura, "read")).toBe(true);
    expect(await abre(escritor, soloLectura, "write")).toBe(false);
    expect(await abre(escritor, soloAdmin, "read")).toBe(false);
    // `dataset:view` abre la lectura de un «solo admin», no la escritura
    expect(await abre([...escritor, "dataset:view"], soloAdmin, "read")).toBe(true);
    expect(await abre([...escritor, "dataset:view"], soloAdmin, "write")).toBe(false);
    expect(await abre(["admin"], soloAdmin, "write")).toBe(true);
  });

  it("una denegación del dataset gana", async () => {
    if (!dbAvailable) return;
    expect(await abre(["mcp:read", "mcp:write", `!datasets:${slugAbierto}:*`], abierto, "read")).toBe(false);
    expect(await abre(["mcp:read", "mcp:write", `!datasets:${slugAbierto}:delete`], abierto, "write")).toBe(true);
    expect(await abre(["mcp:read", "mcp:write", `!datasets:${slugAbierto}:delete`], abierto, "delete")).toBe(false);
  });

  it("sin scopes de agente (humanos, sistema) no abre nada", async () => {
    if (!dbAvailable) return;
    expect(await abre([], abierto, "read")).toBe(false);
  });
});
