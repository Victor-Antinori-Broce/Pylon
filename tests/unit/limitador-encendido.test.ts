/**
 * `RATE_LIMIT_ENABLED` de verdad apaga el limitador
 *
 * Se leía en `lib/config.ts` y nadie lo consultaba: el limitador iba siempre
 * encendido, y Schemathesis (apps/api/scripts/schemathesis.ts) se llenaba de
 * 429. Ahora `limitadorEncendido()` decide en los dos sitios que lo montan
 * (`critical-features.ts` y los límites de cada kon en `module-loader.ts`).
 */
import { afterEach, describe, expect, it } from "vitest";

import { limitadorEncendido } from "../../apps/api/src/lib/rate-limiter";

const antes = process.env.RATE_LIMIT_ENABLED;
afterEach(() => {
  if (antes === undefined) delete process.env.RATE_LIMIT_ENABLED;
  else process.env.RATE_LIMIT_ENABLED = antes;
});

describe("limitadorEncendido", () => {
  it("de fábrica, encendido", () => {
    delete process.env.RATE_LIMIT_ENABLED;
    expect(limitadorEncendido()).toBe(true);
  });

  it("con `true`, encendido; con cualquier otra cosa, apagado (la regla de config.ts)", () => {
    process.env.RATE_LIMIT_ENABLED = "true";
    expect(limitadorEncendido()).toBe(true);
    process.env.RATE_LIMIT_ENABLED = "false";
    expect(limitadorEncendido()).toBe(false);
    process.env.RATE_LIMIT_ENABLED = "0";
    expect(limitadorEncendido()).toBe(false);
  });

  it("los dos sitios que montan el limitador lo consultan", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const lib = join(__dirname, "..", "..", "apps", "api", "src", "lib");
    expect(readFileSync(join(lib, "critical-features.ts"), "utf-8")).toMatch(
      /if \(limitadorEncendido\(\)\)/
    );
    expect(readFileSync(join(lib, "module-loader.ts"), "utf-8")).toMatch(
      /if \(!limitadorEncendido\(\)\) return;/
    );
  });
});
