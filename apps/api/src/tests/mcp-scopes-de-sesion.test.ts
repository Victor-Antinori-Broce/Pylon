/**
 * Scopes del agente en la sesión MCP
 * ============================================================================
 *
 * La sesión MCP se abría con un agente autenticado, pero no guardaba sus
 * scopes: cada herramienta se comprobaba contra una lista vacía y fallaba
 * siempre («Agent lacks required scope»). Aquí, contra la ruta real:
 *
 *   - las herramientas que el scope permite funcionan, y las demás no;
 *   - otra clave que conozca el sessionId no habla por la sesión ajena;
 *   - quitar un scope surte efecto en el siguiente mensaje, sin reconectar;
 *   - la lista de herramientas permitidas del agente (panel) filtra
 *     `tools/list` y `tools/call`.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { agentIdentities } from "../db/schema";
import { app } from "../index";

import { isDatabaseAvailable, generateTestId, entrarComo } from "./setup";

let dbAvailable = false;

type Lector = { read(): Promise<{ value?: Uint8Array; done: boolean }>; cancel(): Promise<void> };
const lectores: Lector[] = [];

function req(path: string, opts: RequestInit = {}, cookie?: string, bearer?: string): Request {
  const headers = new Headers(opts.headers);
  if (cookie) headers.set("Cookie", cookie);
  if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
  if (opts.body) headers.set("Content-Type", "application/json");
  return new Request(`http://localhost:3000${path}`, { ...opts, headers });
}

async function crearAgente(cookie: string, nombre: string, scopes: string[]) {
  const res = await app.request(
    req("/api/keys", { method: "POST", body: JSON.stringify({ name: nombre }) }, cookie)
  );
  expect(res.status).toBe(201);
  const body = (await res.json()) as { id: string; token: string };
  await db.update(agentIdentities).set({ scopes }).where(eq(agentIdentities.id, body.id));
  return { id: body.id, token: body.token };
}

/** Abre la sesión SSE y devuelve su id; el flujo queda abierto hasta el final */
async function abrirSesion(token: string): Promise<string> {
  const res = await app.request(req("/api/mcp", {}, undefined, token));
  expect(res.status).toBe(200);
  const lector = res.body!.getReader() as Lector;
  lectores.push(lector);
  let texto = "";
  while (!texto.includes("\n\n")) {
    const { value, done } = await lector.read();
    if (done) break;
    texto += new TextDecoder().decode(value);
  }
  return texto.match(/sessionId=([a-zA-Z0-9-]+)/)![1]!;
}

async function rpc(sesion: string, token: string, method: string, params: unknown = {}) {
  const res = await app.request(
    req(
      `/api/mcp?sessionId=${sesion}`,
      { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) },
      undefined,
      token
    )
  );
  return { status: res.status, body: (await res.json()) as any };
}

const llamar = (sesion: string, token: string, name: string, args: unknown = {}) =>
  rpc(sesion, token, "tools/call", { name, arguments: args });

describe("MCP: los scopes del agente llegan a la sesión", () => {
  let cookie = "";
  let lector = { id: "", token: "" };
  let otro = { id: "", token: "" };
  let sesion = "";

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) return;
    ({ cookie } = await entrarComo(app, {
      email: `mcp-scopes-${generateTestId()}@example.com`,
      password: "TestPassword123!",
      name: "MCP Scopes",
      role: "admin",
    }));
    lector = await crearAgente(cookie, "Lector MCP", ["mcp:connect", "mcp:read"]);
    otro = await crearAgente(cookie, "Otro MCP", ["mcp:connect", "admin"]);
    sesion = await abrirSesion(lector.token);
  });

  afterAll(async () => {
    for (const l of lectores) await l.cancel().catch(() => {});
  });

  it("una herramienta de lectura funciona con mcp:read (antes fallaba siempre)", async () => {
    if (!dbAvailable) return;
    const { status, body } = await llamar(sesion, lector.token, "kitsuden_list_datasets");
    expect(status).toBe(200);
    expect(body.result.isError).not.toBe(true);
  });

  it("una de escritura se niega: el agente no tiene mcp:write", async () => {
    if (!dbAvailable) return;
    const { body } = await llamar(sesion, lector.token, "kitsuden_create_record", {});
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.code).toBe("KITSUDEN_E_FORBIDDEN");
    expect(body.result.content[0].text).toContain("mcp:write");
  });

  it("otra clave válida no puede hablar por la sesión (ni heredar sus scopes)", async () => {
    if (!dbAvailable) return;
    const { status, body } = await llamar(sesion, otro.token, "kitsuden_list_datasets");
    expect(status).toBe(400);
    expect(body.error.data.code).toBe("KITSUDEN_E_BAD_REQUEST");
  });

  it("quitar el scope surte efecto en el siguiente mensaje, sin reconectar", async () => {
    if (!dbAvailable) return;
    await db
      .update(agentIdentities)
      .set({ scopes: ["mcp:connect"] })
      .where(eq(agentIdentities.id, lector.id));
    const { body } = await llamar(sesion, lector.token, "kitsuden_list_datasets");
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.code).toBe("KITSUDEN_E_FORBIDDEN");
    // Se devuelve para el resto de la suite
    await db
      .update(agentIdentities)
      .set({ scopes: ["mcp:connect", "mcp:read"] })
      .where(eq(agentIdentities.id, lector.id));
  });

  it("las herramientas permitidas del agente filtran tools/list y tools/call", async () => {
    if (!dbAvailable) return;
    await db
      .update(agentIdentities)
      .set({ allowedTools: ["kitsuden_list_datasets"] })
      .where(eq(agentIdentities.id, lector.id));

    const lista = await rpc(sesion, lector.token, "tools/list");
    const nombres = (lista.body.result.tools as Array<{ name: string }>).map((t) => t.name);
    expect(nombres).toEqual(["kitsuden_list_datasets"]);

    const permitida = await llamar(sesion, lector.token, "kitsuden_list_datasets");
    expect(permitida.body.result.isError).not.toBe(true);

    // Tiene mcp:read, pero no está en su lista
    const fuera = await llamar(sesion, lector.token, "kitsuden_system_status");
    expect(fuera.body.error.data.code).toBe("KITSUDEN_E_FORBIDDEN");
  });
});
