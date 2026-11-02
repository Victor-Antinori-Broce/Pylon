/**
 * `/api/*` no lee cuerpos de más de 10 MB (auditoría 2026-10-15: no había
 * límite y Bun acepta 128 MB por petición). Las subidas llevan el suyo.
 */
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { limiteDeCuerpo, tieneLimitePropio } from "../../apps/api/src/lib/limite-de-cuerpo";

function app() {
  const a = new Hono();
  a.use("/api/*", limiteDeCuerpo(1024));
  a.post("/api/*", async (c) => c.text(String((await c.req.text()).length)));
  return a;
}

describe("limiteDeCuerpo", () => {
  it("413 por encima del límite, 200 por debajo", async () => {
    expect(
      (await app().request("/api/comments", { method: "POST", body: "x".repeat(2048) })).status
    ).toBe(413);
    expect(
      (await app().request("/api/comments", { method: "POST", body: "x".repeat(100) })).status
    ).toBe(200);
  });

  it("las rutas de subida usan su propio límite", async () => {
    expect(tieneLimitePropio("/api/media/upload")).toBe(true);
    expect(tieneLimitePropio("/api/mediax")).toBe(false);
    expect(
      (await app().request("/api/media/upload", { method: "POST", body: "x".repeat(2048) })).status
    ).toBe(200);
  });
});
