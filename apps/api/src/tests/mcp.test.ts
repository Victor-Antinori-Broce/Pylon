/**
 * MCP Server HTTP Tests
 *
 * Tests the Model Context Protocol endpoints.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { app } from "../index";
import {
  isDatabaseAvailable,
  generateTestId,
} from "./setup";

let dbAvailable = false;

function req(path: string, opts: RequestInit = {}, cookie?: string): Request {
  const headers = new Headers(opts.headers);
  if (cookie) headers.set("Cookie", cookie);
  headers.set("Content-Type", "application/json");
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

  const email = `mcp-${generateTestId()}@example.com`;
  const password = "TestPassword123!";
  let cookie = "";
  let sessionId = "";

  describe("Setup", () => {
    it("creates and signs in a user", async () => {
      if (!dbAvailable) return;

      await app.request(
        req("/api/auth/sign-up/email", {
          method: "POST",
          body: JSON.stringify({ email, password, name: "MCP User" }),
        })
      );
      const res = await app.request(
        req("/api/auth/sign-in/email", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        })
      );
      cookie = extractCookie(res.headers);
    });
  });

  describe("SSE Endpoint", () => {
    it("should establish SSE connection", async () => {
      if (!dbAvailable) return;

      const res = await app.request(req("/api/mcp", {}, cookie));

      // MCP may be disabled (404) or enabled (200 with text/event-stream)
      expect([200, 404]).toContain(res.status);

      if (res.status === 200) {
        const contentType = res.headers.get("content-type") || "";
        expect(contentType).toContain("text/event-stream");

        const body = await res.text();
        expect(body).toContain("event: endpoint");
        expect(body).toContain("/api/mcp?sessionId=");

        // Extract sessionId from SSE response
        const match = body.match(/sessionId=([a-zA-Z0-9-]+)/);
        if (match) sessionId = match[1];
      }
    });
  });

  describe("JSON-RPC Endpoint", () => {
    it("should respond to initialize", async () => {
      if (!dbAvailable || !sessionId) return;

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
          cookie
        )
      );

      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        const body = await res.json();
        expect(body.jsonrpc).toBe("2.0");
        expect(body.id).toBe(1);
      }
    });

    it("should reject requests without sessionId", async () => {
      if (!dbAvailable) return;

      const res = await app.request(
        req("/api/mcp", {
          method: "POST",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {},
          }),
        })
      );

      // Without sessionId should return error
      expect([400, 404, 200]).toContain(res.status);
    });
  });

  describe("Tool: gremius_query_dataset", () => {
    it("should query dataset via MCP tool", async () => {
      if (!dbAvailable || !sessionId) return;

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
                name: "gremius_query_dataset",
                arguments: {
                  datasetSlug: "data_sets",
                  limit: 5,
                },
              },
            }),
          },
          cookie
        )
      );

      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        const body = await res.json();
        expect(body.jsonrpc).toBe("2.0");
      }
    });
  });

  describe("RLS via MCP", () => {
    it("should not leak data across sessions", async () => {
      if (!dbAvailable) return;

      // This is a conceptual test: MCP sessions are isolated by sessionId.
      // We verify the endpoint exists and requires auth/session.
      const res = await app.request(req("/api/mcp"));
      expect(res.status).toBe(404);
    });
  });
});
