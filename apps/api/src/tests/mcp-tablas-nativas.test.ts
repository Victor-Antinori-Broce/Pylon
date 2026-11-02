/**
 * MCP: las herramientas de colección NO llegan a las tablas del núcleo
 * ============================================================================
 *
 * Auditoría 2026-10-25 (C1): `kitsuden_query_collection` y compañía caían a
 * cualquier tabla del esquema con solo `mcp:read`/`mcp:write`. Con el preset
 * de solo lectura se leía `auth_verifications` (el token de un reset de
 * contraseña) y con `mcp:write` un agente se escribía `scopes: ["admin"]`.
 *
 *   · `mcp:read` no lee ninguna tabla nativa (ni `auth_users`);
 *   · las de credenciales no existen por MCP ni con `admin`;
 *   · `mcp:write` no escribe en `agent_identities`, y `admin` tampoco por aquí;
 *   · los recursos `kitsuden://datasets` solo enseñan lo que el agente puede leer.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { agentIdentities, dataSets } from "../db/schema";
import { app } from "../index";
import { createAgent } from "../services/agent-auth";

import { isDatabaseAvailable, generateTestId } from "./setup";

let dbAvailable = false;

interface Sesion {
  agentId: string;
  token: string;
  sessionId: string;
  cerrar: () => Promise<void>;
}
const abiertas: Sesion[] = [];

async function sesionMcp(scopes: string[]): Promise<Sesion> {
  const { agent, plainApiKey } = await createAgent({
    name: `mcp-nativas-${generateTestId()}`,
    scopes,
    rateLimit: 100_000,
  });
  const res = await app.request(
    new Request("http://localhost:3000/api/mcp", { headers: { Authorization: `Bearer ${plainApiKey}` } })
  );
  expect(res.status).toBe(200);
  const lector = res.body!.getReader();
  let texto = "";
  while (!texto.includes("\n\n")) {
    const { value, done } = await lector.read();
    if (done) break;
    texto += new TextDecoder().decode(value);
  }
  const sessionId = texto.match(/sessionId=([a-zA-Z0-9-]+)/)![1]!;
  const s = { agentId: agent.id, token: plainApiKey, sessionId, cerrar: () => lector.cancel().catch(() => {}) };
  abiertas.push(s);
  return s;
}

let n = 1;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- respuesta JSON-RPC leída en la prueba
async function rpc(s: Sesion, method: string, params: unknown): Promise<any> {
  const res = await app.request(
    new Request(`http://localhost:3000/api/mcp?sessionId=${s.sessionId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${s.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: n++, method, params }),
    })
  );
  return res.json();
}

/** El texto (o el error) de una llamada, para buscar dentro. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ídem
const textoDe = (r: any) => JSON.stringify(r);

describe("MCP: tablas nativas cerradas", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
  });
  afterAll(async () => {
    for (const s of abiertas) await s.cerrar();
  });

  it("mcp:read (preset de solo lectura) no lee tablas nativas", async () => {
    if (!dbAvailable) return;
    const lector = await sesionMcp(["mcp:connect", "mcp:read", "datasets:*:read"]);
    for (const coleccion of ["authUsers", "auth_users", "authVerifications", "agentIdentities", "modules"]) {
      const r = await rpc(lector, "tools/call", {
        name: "kitsuden_query_collection",
        arguments: { collection: coleccion },
      });
      const t = textoDe(r);
      expect(t, coleccion).not.toContain("@");
      expect(t.includes("Collection not found") || r.result?.isError === true || !!r.error, coleccion).toBe(true);
    }
  });

  it("las tablas de credenciales no existen por MCP, ni con admin", async () => {
    if (!dbAvailable) return;
    const admin = await sesionMcp(["mcp:connect", "admin"]);
    for (const coleccion of ["authVerifications", "authAccounts", "authSessions", "agentApiKeys", "apiKeys"]) {
      const r = await rpc(admin, "tools/call", { name: "kitsuden_query_collection", arguments: { collection: coleccion } });
      expect(textoDe(r), coleccion).toContain("Collection not found");
    }
    // auth_users sí la lee un admin (como /api/items), pero sin columnas secretas
    const r = await rpc(admin, "tools/call", { name: "kitsuden_query_collection", arguments: { collection: "authUsers" } });
    expect(textoDe(r)).not.toContain("Collection not found");
  });

  it("mcp:write no se da permisos: agent_identities no se escribe por MCP", async () => {
    if (!dbAvailable) return;
    for (const scopes of [["mcp:connect", "mcp:read", "mcp:write"], ["mcp:connect", "admin"]]) {
      const s = await sesionMcp(scopes);
      const r = await rpc(s, "tools/call", {
        name: "kitsuden_update_record",
        arguments: { collection: "agentIdentities", id: s.agentId, data: { scopes: ["admin"] } },
      });
      expect(textoDe(r)).not.toContain("Updated native record");
      const [fila] = await db
        .select({ scopes: agentIdentities.scopes })
        .from(agentIdentities)
        .where(eq(agentIdentities.id, s.agentId));
      expect(fila!.scopes).toEqual(scopes);
    }
  });

  it("kitsuden_dispatch_worker pide mail:send (mcp:write ya no basta)", async () => {
    if (!dbAvailable) return;
    const editor = await sesionMcp(["mcp:connect", "mcp:read", "mcp:write"]);
    const r = await rpc(editor, "tools/call", {
      name: "kitsuden_dispatch_worker",
      arguments: { queueName: "email", jobName: "x", payload: { to: "victima@example.com" } },
    });
    expect(textoDe(r)).not.toContain("Job dispatched");
  });

  it("kitsuden://datasets solo enseña lo que el agente puede leer, sin policyJson", async () => {
    if (!dbAvailable) return;
    const slug = `solo-admin-${generateTestId()}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const [ds] = await db
      .insert(dataSets)
      .values({ name: "Solo admin", slug, schema: { fields: [] }, policyJson: { readAccess: "admin", writeAccess: "admin" } } as never)
      .returning();
    const lector = await sesionMcp(["mcp:connect", "mcp:read"]);

    const lista = await rpc(lector, "resources/list", {});
    expect(textoDe(lista)).not.toContain(ds!.id);
    const todos = await rpc(lector, "resources/read", { uri: "kitsuden://datasets" });
    expect(textoDe(todos)).not.toContain(slug);
    const uno = await rpc(lector, "resources/read", { uri: `kitsuden://dataset/${ds!.id}` });
    expect(uno.error.code).toBe(-32002);

    const admin = await sesionMcp(["mcp:connect", "admin"]);
    const visto = await rpc(admin, "resources/read", { uri: `kitsuden://dataset/${ds!.id}` });
    expect(textoDe(visto)).toContain(slug);
    expect(textoDe(visto)).not.toContain("policyJson");
  });

  it("GET /api/mcp/logs es solo para admin", async () => {
    if (!dbAvailable) return;
    const lector = await sesionMcp(["mcp:connect", "mcp:read"]);
    const res = await app.request(
      new Request("http://localhost:3000/api/mcp/logs", { headers: { Authorization: `Bearer ${lector.token}` } })
    );
    expect(res.status).toBe(403);
  });
});
