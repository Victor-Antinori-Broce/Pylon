/**
 * Ningún token de un solo uso en el log de accesos (auditoría 2026-10-15):
 * `GET /api/auth/reset-password/<token>` se escribía tal cual.
 */
import { describe, expect, it } from "vitest";

import { lineaDeAccesoSinSecretos, rutaParaLog } from "../../apps/api/src/lib/ruta-para-log";

describe("rutaParaLog", () => {
  it("enmascara el token de restablecimiento y los de invitación", () => {
    expect(rutaParaLog("/api/auth/reset-password/AbCdEf123456")).toBe(
      "/api/auth/reset-password/***"
    );
    expect(rutaParaLog("/api/esports/invites/xyz/accept")).toBe("/api/esports/invites/***/accept");
  });

  it("enmascara segmentos opacos largos y la query", () => {
    expect(rutaParaLog(`/api/x/${"a1B2".repeat(10)}`)).toBe("/api/x/***");
    expect(rutaParaLog("/api/auth/verify-email?token=secreto")).toBe("/api/auth/verify-email?***");
  });

  it("deja los UUID y las rutas normales (sirven para depurar)", () => {
    const uuid = "6f1c2a9e-1d2b-4c3d-9e8f-0a1b2c3d4e5f";
    expect(rutaParaLog(`/api/data-sets/${uuid}/entries`)).toBe(`/api/data-sets/${uuid}/entries`);
    expect(rutaParaLog("/api/blog/mi-post")).toBe("/api/blog/mi-post");
  });

  it("formato de hono/logger", () => {
    expect(lineaDeAccesoSinSecretos("<-- GET /api/auth/reset-password/tok123")).toBe(
      "<-- GET /api/auth/reset-password/***"
    );
    expect(lineaDeAccesoSinSecretos("--> GET /api/blog 200 3ms")).toBe("--> GET /api/blog 200 3ms");
  });
});
