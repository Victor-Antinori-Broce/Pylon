/**
 * System Routes HTTP Tests
 *
 * Tests health checks, init-check, setup, grimoires, themes.
 */

import { describe, it, expect, beforeAll } from "bun:test";

import { isDatabaseAvailable, generateTestId } from "./setup";

let dbAvailable = false;
let appInstance: any = null;

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
    const mod = await import("../index");
    appInstance = mod.app;

    dbAvailable = await isDatabaseAvailable();
  });

  const email = `system-${generateTestId()}@example.com`;
  const password = "TestPassword123!";
  let cookie = "";

  describe("Public Endpoints", () => {
    it("GET /api/system/init-check → returns initialization status", async () => {
      const res = await appInstance!.request(req("/api/system/init-check"));
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(typeof body.initialized).toBe("boolean");
    });

    it("GET /api/system/themes → lists themes", async () => {
      const res = await appInstance!.request(req("/api/system/themes"));
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(Array.isArray(body.docs)).toBe(true);
    });

    it("GET /api/system/grimoires → lists grimoires", async () => {
      const res = await appInstance!.request(req("/api/system/grimoires"));
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(Array.isArray(body)).toBe(true);
    });

    it("GET /api/system/grimoires/:id → returns grimoire detail", async () => {
      const listRes = await appInstance!.request(req("/api/system/grimoires"));
      expect(listRes.status).toBe(200);
      const grimoires = (await listRes.json()) as any[];
      const grimoireId = grimoires[0]?.id ?? "grimoire-default";

      const res = await appInstance!.request(req(`/api/system/grimoires/${grimoireId}`));
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body.id).toBe(grimoireId);
    });

    it("GET /api/system/active-theme-config → returns theme config", async () => {
      const res = await appInstance!.request(req("/api/system/active-theme-config"));
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body).toHaveProperty("theme");
      expect(body).toHaveProperty("branding");
    });
  });

  describe("Setup", () => {
    it("POST /api/system/setup → creates first admin or rejects when initialized", async () => {
      // Dar de alta el primer admin pasa por Better-Auth: varias tablas, hash
      // argon2 y una transacción. pg-mem no lo sostiene (la propia suite aplica
      // las migraciones con 63 sentencias que fallan), así que sin PostgreSQL
      // real esto no prueba el alta, prueba pg-mem.
      if (!dbAvailable) return;

      const initRes = await appInstance!.request(req("/api/system/init-check"));
      expect(initRes.status).toBe(200);
      const { initialized } = (await initRes.json()) as any;

      const setupEmail = `setup-${generateTestId()}@example.com`;
      const res = await appInstance!.request(
        req("/api/system/setup", {
          method: "POST",
          body: JSON.stringify({
            name: "Setup Admin",
            email: setupEmail,
            password,
          }),
        })
      );

      if (initialized) {
        expect(res.status).toBe(403);
      } else {
        expect([200, 201]).toContain(res.status);
      }
    });

    it("POST /api/system/setup → un fallo NO devuelve el SQL al cliente", async () => {
      // Esta ruta es pública y previa a la autenticación. Devolvía `e.message`,
      // que en un error de Drizzle es la consulta entera con sus parámetros:
      // el esquema y el email recién enviado, para cualquiera que llame.
      const res = await appInstance!.request(
        req("/api/system/setup", {
          method: "POST",
          body: JSON.stringify({
            name: "Leak Probe",
            email: `leak-${generateTestId()}@example.com`,
            password,
          }),
        })
      );

      const body = await res.text();
      expect(body).not.toContain("select ");
      expect(body).not.toContain("auth_users");
      expect(body).not.toContain("params:");
    });
  });

  describe("Authenticated Endpoints", () => {
    it("creates and signs in a user", async () => {
      if (!dbAvailable) return;

      await appInstance!.request(
        req("/api/auth/sign-up/email", {
          method: "POST",
          body: JSON.stringify({ email, password, name: "System User" }),
        })
      );
      const res = await appInstance!.request(
        req("/api/auth/sign-in/email", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        })
      );
      cookie = extractCookie(res.headers);
    });

    it("POST /api/system/grimoire-state → deactivates grimoire when authenticated", async () => {
      if (!dbAvailable) return;

      const res = await appInstance!.request(
        req(
          "/api/system/grimoire-state",
          {
            method: "POST",
            body: JSON.stringify({ action: "deactivate" }),
          },
          cookie
        )
      );
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
    });
  });
});
