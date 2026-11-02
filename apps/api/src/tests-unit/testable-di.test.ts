/**
 * Testable DI — prueba que un kon se puede testear en aislamiento con
 * dependencias mockeadas selectivamente (createTestKonContext).
 */

import type { KonContext } from "@kitsuden/shared";
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";

import { createTestKonContext, makeCapturingLogger } from "../lib/test-kon-context";

// Un "kon" de ejemplo: recibe el contexto y devuelve su router.
function demoKon(ctx: KonContext) {
  const app = new Hono();
  app.get("/cached", async (c) => {
    const hit = await ctx.cache.get<string>("k");
    if (hit) return c.json({ from: "cache", value: hit });
    await ctx.cache.set("k", "hello", 60);
    ctx.logger.info("cache miss");
    return c.json({ from: "compute", value: "hello" });
  });
  return app;
}

describe("Testable DI — createTestKonContext", () => {
  it("testea un kon con cache in-memory real, sin DB ni Valkey", async () => {
    const { logger, lines } = makeCapturingLogger();
    const ctx = createTestKonContext({
      logger,
      config: { siteName: "Demo" },
    });
    const app = demoKon(ctx);

    const miss = await app.request("http://x/cached");
    expect(await miss.json()).toEqual({ from: "compute", value: "hello" });

    const hit = await app.request("http://x/cached");
    expect(await hit.json()).toEqual({ from: "cache", value: "hello" });

    // El logger capturó el "cache miss" (aserción sobre efectos).
    expect(lines.some((l) => l.message === "cache miss")).toBe(true);
  });

  it("config default de test + override selectivo", () => {
    const ctx = createTestKonContext({ config: { siteName: "X" } });
    expect(ctx.config.environment).toBe("test");
    expect(ctx.config.siteName).toBe("X");
  });

  it("una dependencia NO mockeada lanza error claro si se toca", () => {
    const ctx = createTestKonContext();
    expect(() => (ctx.db as unknown as { select: () => void }).select()).toThrow(
      /not.*mock|no fue mockeado/i
    );
  });
});
