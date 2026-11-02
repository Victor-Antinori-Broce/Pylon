/**
 * MCP Server HTTP Tests
 *
 * Tests the Model Context Protocol endpoints using a real Agent NHI token.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { parse as parseTron } from "@tron-format/tron";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { agentIdentities } from "../db/schema";
import { app } from "../index";
import { decodeToon } from "../lib/toon-tabular";

import { isDatabaseAvailable, generateTestId, entrarComo } from "./setup";

let dbAvailable = false;

/** Lo que se mira de una respuesta JSON-RPC en las pruebas de errores. */
interface RespuestaRpc {
  jsonrpc: string;
  error: { code: number; data: Record<string, unknown> & { code: string; docs: string } };
  result: {
    isError?: boolean;
    structuredContent: { code: string; retryable: boolean };
    content: Array<{ text: string }>;
  };
}

function req(path: string, opts: RequestInit = {}, cookie?: string, bearer?: string): Request {
  const headers = new Headers(opts.headers);
  if (cookie) headers.set("Cookie", cookie);
  if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
  if (opts.body) headers.set("Content-Type", "application/json");
  return new Request(`http://localhost:3000${path}`, { ...opts, headers });
}

describe("MCP Server", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
  });

  const adminEmail = `mcp-admin-${generateTestId()}@example.com`;
  const password = "TestPassword123!";
  let cookieAdmin = "";
  let agentToken = "";
  let datasetId = "";
  let sessionId = "";
  // El flujo SSE queda abierto mientras dure la suite: cancelarlo borra la
  // sesión MCP (`cancel()` en routes/mcp.ts) y los POST de después darían 404.
  let lectorSse: {
    read(): Promise<{ value?: Uint8Array; done: boolean }>;
    cancel(): Promise<void>;
  } | null = null;

  afterAll(async () => {
    await lectorSse?.cancel().catch(() => {});
  });

  describe("Setup", () => {
    it("creates an admin user and signs in", async () => {
      if (!dbAvailable) return;

      // Admin so they can create API keys (and datasets).
      ({ cookie: cookieAdmin } = await entrarComo(app, {
        email: adminEmail,
        password,
        name: "MCP Admin",
        role: "admin",
      }));
    });

    it("creates a dataset with sample data for tool tests", async () => {
      if (!dbAvailable) return;

      const dsRes = await app.request(
        req(
          "/api/data-sets",
          {
            method: "POST",
            body: JSON.stringify({
              name: `MCP Test Dataset ${generateTestId()}`,
              slug: `mcp-ds-${generateTestId()}`,
              description: "Dataset for MCP tool test",
              schema: {
                fields: [{ id: "f1", key: "title", type: "text", label: "Title", required: true }],
                version: "2.0",
              },
            }),
          },
          cookieAdmin
        )
      );
      expect(dsRes.status).toBe(201);
      const dsBody = (await dsRes.json()) as any;
      datasetId = dsBody.id;

      const entryRes = await app.request(
        req(
          `/api/data-sets/${datasetId}/entries`,
          {
            method: "POST",
            body: JSON.stringify({
              title: "MCP Entry",
              // `title` es obligatorio en el esquema del dataset y ahora se
              // valida al insertar (antes respondía 400 «Required»).
              data: { title: "MCP Entry", note: "sample" },
              status: "published",
            }),
          },
          cookieAdmin
        )
      );
      expect(entryRes.status).toBe(201);
    });

    it("creates an Agent NHI token with MCP scope", async () => {
      if (!dbAvailable) return;

      const res = await app.request(
        req(
          "/api/keys",
          {
            method: "POST",
            body: JSON.stringify({ name: "MCP Test Agent" }),
          },
          cookieAdmin
        )
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      agentToken = body.token;
      expect(agentToken).toMatch(/^kitsuden_agent_/);

      // Grant the MCP connection scope required by the MCP auth middleware.
      await db
        .update(agentIdentities)
        .set({ scopes: ["admin", "mcp:connect"] })
        .where(eq(agentIdentities.id, body.id));
    });
  });

  describe("SSE Endpoint", () => {
    it("should establish SSE connection with a valid agent token", async () => {
      if (!dbAvailable) return;

      const res = await app.request(req("/api/mcp", {}, undefined, agentToken));
      expect(res.status).toBe(200);

      const contentType = res.headers.get("content-type") || "";
      expect(contentType).toContain("text/event-stream");

      // El flujo no termina nunca (keepalive cada 30 s): `res.text()` esperaba
      // a un final que no llega y el test caducaba a los 5 s. Se lee solo el
      // primer evento.
      const lector = res.body!.getReader();
      lectorSse = lector;
      let body = "";
      while (!body.includes("\n\n")) {
        const { value, done } = await lector.read();
        if (done) break;
        body += new TextDecoder().decode(value);
      }
      expect(body).toContain("event: endpoint");
      expect(body).toContain("/api/mcp?sessionId=");

      const match = body.match(/sessionId=([a-zA-Z0-9-]+)/);
      expect(match).not.toBeNull();
      sessionId = match![1];
    });

    it("should reject SSE connection without auth", async () => {
      if (!dbAvailable) return;

      const res = await app.request(req("/api/mcp"));
      expect(res.status).toBe(401);
      // JSON-RPC intacto, y el mismo problema que la API REST en error.data
      const body = (await res.json()) as RespuestaRpc;
      expect(body.jsonrpc).toBe("2.0");
      expect(body.error.code).toBe(-32000);
      expect(body.error.data).toMatchObject({
        code: "KITSUDEN_E_UNAUTHENTICATED",
        status: 401,
        retryable: false,
        retry_after: null,
      });
      expect(body.error.data.docs).toContain("#kitsuden_e_unauthenticated");
    });
  });

  describe("JSON-RPC Endpoint", () => {
    it("should respond to initialize", async () => {
      if (!dbAvailable) return;
      expect(sessionId).not.toBe("");

      const res = await app.request(
        req(
          `/api/mcp?sessionId=${sessionId}`,
          {
            method: "POST",
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "initialize",
              params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: { name: "test-client", version: "1.0.0" },
              },
            }),
          },
          undefined,
          agentToken
        )
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.jsonrpc).toBe("2.0");
      expect(body.id).toBe(1);
      expect(body.result.protocolVersion).toBe("2024-11-05");
      expect(body.result.serverInfo.name).toBe("kitsuden-mcp-server");
    });

    it("should reject requests without sessionId (other than initialize)", async () => {
      if (!dbAvailable) return;

      const res = await app.request(
        req(
          "/api/mcp",
          {
            method: "POST",
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
          },
          undefined,
          agentToken
        )
      );

      expect(res.status).toBe(400);
    });

    // Streamable HTTP (OAuth para MCP, docs/agents/oauth.md): `initialize` sin
    // sesión abre una y la devuelve en `Mcp-Session-Id`; con esa cabecera se sigue.
    it("initialize without a session opens a Streamable HTTP session", async () => {
      if (!dbAvailable) return;
      const res = await app.request(
        req(
          "/api/mcp",
          {
            method: "POST",
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
          },
          undefined,
          agentToken
        )
      );
      expect(res.status).toBe(200);
      const id = res.headers.get("mcp-session-id");
      expect(id).toBeTruthy();
      const siguiente = await app.request(
        req(
          "/api/mcp",
          {
            method: "POST",
            headers: { "Mcp-Session-Id": id! },
            body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
          },
          undefined,
          agentToken
        )
      );
      expect(siguiente.status).toBe(200);
      const stream = await app.request(req("/api/mcp", { headers: { "Mcp-Session-Id": id! } }, undefined, agentToken));
      expect(stream.status).toBe(405);
    });
  });

  describe("Tool: kitsuden_query_dataset", () => {
    it("should query dataset via MCP tool", async () => {
      if (!dbAvailable) return;
      expect(sessionId).not.toBe("");

      const res = await app.request(
        req(
          `/api/mcp?sessionId=${sessionId}`,
          {
            method: "POST",
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method: "tools/call",
              params: {
                name: "kitsuden_query_dataset",
                arguments: {
                  datasetId,
                  limit: 5,
                },
              },
            }),
          },
          undefined,
          agentToken
        )
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.jsonrpc).toBe("2.0");
      expect(body.id).toBe(2);
      expect(body.result).toBeDefined();
      expect(body.result.content).toBeDefined();
      // Antes bastaba con que hubiera `content`, y pasaba aunque la herramienta
      // respondiera «Agent lacks required scope»: la sesión no llevaba scopes.
      expect(body.result.isError).not.toBe(true);
    });

    it("el resultado dice su formato en _meta y vuelve a dar los datos; format:'json' es JSON compacto", async () => {
      if (!dbAvailable) return;
      const llamar = async (args: Record<string, unknown>) => {
        const res = await app.request(
          req(
            `/api/mcp?sessionId=${sessionId}`,
            {
              method: "POST",
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 3,
                method: "tools/call",
                params: { name: "kitsuden_query_dataset", arguments: { datasetId, limit: 5, ...args } },
              }),
            },
            undefined,
            agentToken
          )
        );
        return (await res.json()) as any;
      };

      const auto = await llamar({});
      const formato = auto.result._meta?.["kitsuden/format"];
      expect(["json", "toon", "tron"]).toContain(formato);
      const texto = auto.result.content[0].text as string;
      // (lo que ve el agente depende de la política del dataset; aquí importa que no se pierda nada)
      const filas = formato === "toon" ? decodeToon(texto) : formato === "tron" ? parseTron(texto) : JSON.parse(texto);
      expect(Array.isArray(filas)).toBe(true);

      const json = await llamar({ format: "json" });
      expect(json.result._meta?.["kitsuden/format"]).toBe("json");
      const textoJson = json.result.content[0].text as string;
      expect(textoJson).not.toContain("\n");
      expect(JSON.parse(textoJson)).toEqual(filas);
    });
  });

  describe("Errores con los campos de problem+json", () => {
    const rpc = (cuerpo: unknown) =>
      app.request(
        req(
          `/api/mcp?sessionId=${sessionId}`,
          { method: "POST", body: JSON.stringify(cuerpo) },
          undefined,
          agentToken
        )
      );

    it("método desconocido → error.data con KITSUDEN_E_NOT_FOUND", async () => {
      if (!dbAvailable) return;
      const res = await rpc({ jsonrpc: "2.0", id: 9, method: "tools/frobnicate" });
      const body = (await res.json()) as RespuestaRpc;
      expect(body.error.code).toBe(-32601);
      expect(body.error.data.code).toBe("KITSUDEN_E_NOT_FOUND");
      expect(body.error.data.retryable).toBe(false);
    });

    it("herramienta desconocida → isError con structuredContent y el resumen en el texto", async () => {
      if (!dbAvailable) return;
      const res = await rpc({
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: { name: "no_existe_esta_herramienta", arguments: {} },
      });
      const body = (await res.json()) as RespuestaRpc;
      expect(body.result.isError).toBe(true);
      // Con los scopes del agente ya en la sesión, una herramienta que no
      // existe es NOT_FOUND (antes salía FORBIDDEN: se comprobaba contra []).
      const code = body.result.structuredContent.code;
      expect(code).toBe("KITSUDEN_E_NOT_FOUND");
      expect(body.result.structuredContent.retryable).toBe(false);
      expect(body.result.content[0].text).toContain(`"code":"${code}"`);
    });

    it("cuerpo que no es JSON → -32700 con KITSUDEN_E_BAD_REQUEST (antes, 500)", async () => {
      if (!dbAvailable) return;
      const res = await app.request(
        req(
          `/api/mcp?sessionId=${sessionId}`,
          { method: "POST", body: "{esto no es json" },
          undefined,
          agentToken
        )
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as RespuestaRpc;
      expect(body.error.code).toBe(-32700);
      expect(body.error.data.code).toBe("KITSUDEN_E_BAD_REQUEST");
    });
  });

  describe("RLS via MCP", () => {
    it("should require auth for all MCP endpoints", async () => {
      if (!dbAvailable) return;

      const res = await app.request(req("/api/mcp"));
      expect(res.status).toBe(401);
    });
  });
});
