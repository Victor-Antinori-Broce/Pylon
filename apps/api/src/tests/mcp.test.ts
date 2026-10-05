/**
 * MCP Server HTTP Tests
 *
 * Tests the Model Context Protocol endpoints using a real Agent NHI token.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { agentIdentities, authUsers } from "../db/schema";
import { app } from "../index";

import { isDatabaseAvailable, generateTestId } from "./setup";

let dbAvailable = false;

function req(path: string, opts: RequestInit = {}, cookie?: string, bearer?: string): Request {
  const headers = new Headers(opts.headers);
  if (cookie) headers.set("Cookie", cookie);
  if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
  if (opts.body) headers.set("Content-Type", "application/json");
  return new Request(`http://localhost:3000${path}`, { ...opts, headers });
}

function extractCookie(headers: Headers): string {
  const setCookie = headers.get("set-cookie") || "";
  return setCookie.split(";")[0];
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

  describe("Setup", () => {
    it("creates an admin user and signs in", async () => {
      if (!dbAvailable) return;

      await app.request(
        req("/api/auth/sign-up/email", {
          method: "POST",
          body: JSON.stringify({
            email: adminEmail,
            password,
            name: "MCP Admin",
          }),
        })
      );
      const res = await app.request(
        req("/api/auth/sign-in/email", {
          method: "POST",
          body: JSON.stringify({ email: adminEmail, password }),
        })
      );
      cookieAdmin = extractCookie(res.headers);

      // Promote user to admin so they can create API keys.
      const session = await app.request(req("/api/auth/get-session", {}, cookieAdmin));
      const sessionBody = (await session.json()) as any;
      await db
        .update(authUsers)
        .set({ role: "admin" })
        .where(eq(authUsers.id, sessionBody.user.id));
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
              data: { note: "sample" },
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

      const body = await res.text();
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

    it("should reject requests without sessionId", async () => {
      if (!dbAvailable) return;

      const res = await app.request(
        req(
          "/api/mcp",
          {
            method: "POST",
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "initialize",
              params: {},
            }),
          },
          undefined,
          agentToken
        )
      );

      expect(res.status).toBe(400);
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
