/**
 * Lo que la observabilidad enseña sin sesión.
 *
 * `GET /` devolvía a cualquiera recuentos de usuarios/entradas/agentes y la
 * actividad reciente (títulos de entradas, nombres), sin límite de peticiones
 * y lanzando varios COUNT. `GET /metrics` era público.
 */
import { afterEach, describe, expect, it } from "vitest";

import { observabilityRoutes, tokenDeMetricasValido } from "../../apps/api/src/lib/observability";

const antes = process.env.METRICS_TOKEN;
afterEach(() => {
  if (antes === undefined) delete process.env.METRICS_TOKEN;
  else process.env.METRICS_TOKEN = antes;
});

describe("observabilidad sin sesión", () => {
  it("GET / solo dice que está viva", async () => {
    const res = await observabilityRoutes.request("/");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Kitsuden API", status: "ok" });
  });

  it("GET /metrics sin token ni sesión: 401", async () => {
    delete process.env.METRICS_TOKEN;
    expect((await observabilityRoutes.request("/metrics")).status).toBe(401);
  });

  it("GET /admin/logs sin sesión: 401", async () => {
    expect((await observabilityRoutes.request("/admin/logs")).status).toBe(401);
  });
});

describe("tokenDeMetricasValido", () => {
  it("sin METRICS_TOKEN (o demasiado corto) nunca vale", () => {
    delete process.env.METRICS_TOKEN;
    expect(tokenDeMetricasValido("Bearer cualquiera")).toBe(false);
    process.env.METRICS_TOKEN = "corto";
    expect(tokenDeMetricasValido("Bearer corto")).toBe(false);
  });

  it("solo el token exacto, con Bearer", () => {
    process.env.METRICS_TOKEN = "token-de-metricas-largo-1234";
    expect(tokenDeMetricasValido("Bearer token-de-metricas-largo-1234")).toBe(true);
    expect(tokenDeMetricasValido("Bearer token-de-metricas-largo-123")).toBe(false);
    expect(tokenDeMetricasValido("token-de-metricas-largo-1234")).toBe(false);
    expect(tokenDeMetricasValido(undefined)).toBe(false);
  });
});

describe("index.ts: lo que sale sin sesión", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const fuente = fs.readFileSync(path.resolve(__dirname, "../../apps/api/src/index.ts"), "utf8");
  const almacen = fs.readFileSync(
    path.resolve(__dirname, "../../apps/api/src/lib/almacen.ts"),
    "utf8"
  );

  it("/media sale con CSP sandbox (un .svg/.html subido no ejecuta en el origen de la API)", () => {
    expect(almacen).toMatch(/CSP_DE_MEDIOS\s*=\s*\n?\s*"default-src 'none';[^"]*sandbox"/);
    expect(fuente).toContain('"Content-Security-Policy": CSP_DE_MEDIOS');
  });

  it("las comprobaciones de salud públicas no devuelven el mensaje del error", () => {
    const salud = fuente.slice(
      fuente.indexOf('app.get("/api/health"'),
      fuente.indexOf("// 🎛️ HEADLESS MODE")
    );
    expect(salud).not.toMatch(/error: messageOf\(err\)/);
  });

  it("el WebSocket comprueba Origin contra ALLOWED_ORIGINS", () => {
    expect(fuente).toMatch(/origen && !corsConfig\.origins\.includes\(origen\)/);
  });

  it("las claves legacy kitsuden_sk_ ya no entran (retiradas el 2026-08-01)", () => {
    expect(fuente).toContain("Date.now() >= FIN_CLAVES_LEGACY");
  });
});
