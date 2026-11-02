/**
 * El token que devuelve /api/v1/agents autentica de verdad
 * ============================================================================
 *
 * `POST /api/v1/agents` y `POST /api/v1/agents/:id/token` (los que usa el
 * panel) guardaban la clave sin `keyId` ni `algorithm`. `authenticateAgent`
 * busca por `keyId`, así que el token recién entregado daba 401 siempre: un
 * agente creado desde el panel nunca podía conectarse.
 */

import { describe, it, expect, beforeAll } from "bun:test";

import { app } from "../index";

import { isDatabaseAvailable, generateTestId, entrarComo } from "./setup";

let dbAvailable = false;

function req(path: string, opts: RequestInit = {}, cookie?: string, bearer?: string): Request {
  const headers = new Headers(opts.headers);
  if (cookie) headers.set("Cookie", cookie);
  if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
  if (opts.body) headers.set("Content-Type", "application/json");
  return new Request(`http://localhost:3000${path}`, { ...opts, headers });
}

/** GET /api/mcp abre un SSE: basta el estado; el cuerpo se cancela */
async function autentica(token: string): Promise<number> {
  const res = await app.request(req("/api/mcp", {}, undefined, token));
  await res.body?.cancel().catch(() => {});
  return res.status;
}

describe("/api/v1/agents: el token entregado autentica", () => {
  let cookie = "";

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) return;
    ({ cookie } = await entrarComo(app, {
      email: `v1-token-${generateTestId()}@example.com`,
      password: "TestPassword123!",
      name: "V1 Token",
      role: "admin",
    }));
  });

  it("el token de un agente recién creado conecta a MCP (antes: 401)", async () => {
    if (!dbAvailable) return;
    const res = await app.request(
      req("/api/v1/agents", { method: "POST", body: JSON.stringify({ name: `v1-${generateTestId()}` }) }, cookie)
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { agent: { id: string }; token: string };
    expect(await autentica(body.token)).toBe(200);
  });

  it("el token regenerado también conecta", async () => {
    if (!dbAvailable) return;
    const creado = await app.request(
      req("/api/v1/agents", { method: "POST", body: JSON.stringify({ name: `v1-${generateTestId()}` }) }, cookie)
    );
    const { agent } = (await creado.json()) as { agent: { id: string } };
    const res = await app.request(req(`/api/v1/agents/${agent.id}/token`, { method: "POST" }, cookie));
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    expect(await autentica(token)).toBe(200);
  });
});
