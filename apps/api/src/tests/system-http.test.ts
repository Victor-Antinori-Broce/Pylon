// @ts-nocheck

/**
 * System Routes HTTP Tests
 *
 * Tests health checks, init-check, setup, realms, themes.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import {
  isDatabaseAvailable,
  generateTestId,
} from "./setup";

let dbAvailable = false;
let app: any;

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

describe("System HTTP", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    const mod = await import("../index");
    app = mod.app;
  });

  const email = `system-${generateTestId()}@example.com`;
  const password = "TestPassword123!";
  let cookie = "";

  describe("Public Endpoints", () => {
    it("GET /api/system/init-check → returns initialization status", async () => {
      const res = await app.request(req("/api/system/init-check"));
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      expect(typeof body.initialized).toBe("boolean");
      expect(typeof body.hasUsers).toBe("boolean");
    });

    it("GET /api/system/themes → lists themes", async () => {
      const res = await app.request(req("/api/system/themes"));
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      expect(Array.isArray(body)).toBe(true);
    });

    it("GET /api/system/realms → lists realms", async () => {
      const res = await app.request(req("/api/system/realms"));
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      expect(Array.isArray(body)).toBe(true);
    });

    it("GET /api/system/realms/:id → returns realm detail or 404", async () => {
      const res = await app.request(req("/api/system/realms/realm-default"));
      expect([200, 404]).toContain(res.status);
    });

    it("GET /api/system/active-theme-config → returns theme config", async () => {
      const res = await app.request(req("/api/system/active-theme-config"));
      expect([200, 404]).toContain(res.status);
    });
  });

  describe("Setup", () => {
    it("POST /api/system/setup → creates first admin", async () => {
      const res = await app.request(
        req("/api/system/setup", {
          method: "POST",
          body: JSON.stringify({
            siteName: "Test Setup",
            adminEmail: `setup-${generateTestId()}@example.com`,
            adminPassword: password,
            adminName: "Setup Admin",
          }),
        })
      );

      // May return 200 (success) or 400 (already initialized)
      expect([200, 400]).toContain(res.status);
    });
  });

  describe("Authenticated Endpoints", () => {
    it("creates and signs in a user", async () => {
      if (!dbAvailable) return;

      await app.request(
        req("/api/auth/sign-up/email", {
          method: "POST",
          body: JSON.stringify({ email, password, name: "System User" }),
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

    it("GET /api/system/realm-state → returns realm state (auth required)", async () => {
      if (!dbAvailable) return;

      const res = await app.request(req("/api/system/realm-state", {}, cookie));
      expect([200, 404]).toContain(res.status);
    });
  });
});
