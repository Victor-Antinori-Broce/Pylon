/**
 * Grimoire Games HTTP Tests
 *
 * Tests gaming domain routes if grimoire-games is loaded.
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

describe("Grimoire Games HTTP", () => {
  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
  });

  const email = `games-${generateTestId()}@example.com`;
  const password = "TestPassword123!";
  let cookie = "";

  describe("Setup", () => {
    it("creates and signs in a user", async () => {
      if (!dbAvailable) return;

      await app.request(
        req("/api/auth/sign-up/email", {
          method: "POST",
          body: JSON.stringify({ email, password, name: "Games User" }),
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

  describe("Games Routes", () => {
    it("GET /api/games → lists games or 404 if grimoire not loaded", async () => {
      if (!dbAvailable) return;

      const res = await app.request(req("/api/games", {}, cookie));
      expect([200, 404]).toContain(res.status);

      if (res.status === 200) {
        const body = await res.json();
        expect(Array.isArray(body.docs) || Array.isArray(body)).toBe(true);
      }
    });

    it("POST /api/games → creates game or 404 if grimoire not loaded", async () => {
      if (!dbAvailable) return;

      const res = await app.request(
        req(
          "/api/games",
          {
            method: "POST",
            body: JSON.stringify({
              title: `Test Game ${generateTestId()}`,
              slug: `test-game-${generateTestId()}`,
              description: "Created by test suite",
              status: "published",
            }),
          },
          cookie
        )
      );

      expect([201, 404, 403]).toContain(res.status);
    });

    it("GET /api/platforms → lists platforms or 404", async () => {
      if (!dbAvailable) return;

      const res = await app.request(req("/api/platforms", {}, cookie));
      expect([200, 404]).toContain(res.status);
    });

    it("GET /api/tags → lists tags or 404", async () => {
      if (!dbAvailable) return;

      const res = await app.request(req("/api/tags", {}, cookie));
      expect([200, 404]).toContain(res.status);
    });
  });

  describe("Relations", () => {
    it("GET /api/games/:id/platforms → game platforms or 404", async () => {
      if (!dbAvailable) return;

      const res = await app.request(
        req(`/api/games/${generateTestId()}/platforms`, {}, cookie)
      );
      expect([200, 404]).toContain(res.status);
    });
  });
});
