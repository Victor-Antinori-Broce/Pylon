/**
 * El panel aplica el tema del grimorio activo con lo que devuelve
 * `GET /api/system/grimoires` (`config.theme`). Antes la API no mandaba
 * `config` y `applyGrimoireTheme` salía sin hacer nada.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { applyGrimoireTheme, resetGrimoireTheme } from "./theme.svelte";

function respuesta(cuerpo: unknown) {
  return { ok: true, json: async () => cuerpo } as Response;
}

/** Forma de la respuesta de listGrimoiresHandler (colores de prueba, no los del grimorio real). */
const grimoires = [
  {
    id: "grimoire-default",
    name: "Default Grimoire",
    isActive: true,
    config: { theme: { primary_color: "#336699", accent_color: "#cc8844" } },
  },
];

describe("applyGrimoireTheme", () => {
  afterEach(() => {
    resetGrimoireTheme();
    vi.restoreAllMocks();
  });

  it("aplica primary/accent del grimorio activo a las variables del panel", async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("/api/system/grimoires")
        ? respuesta(grimoires)
        : respuesta({ activeGrimoire: "grimoire-default" })
    ) as unknown as typeof fetch;

    await applyGrimoireTheme();

    const estilo = document.documentElement.style;
    expect(estilo.getPropertyValue("--kitsuden-primary")).toBe("51 102 153");
    expect(estilo.getPropertyValue("--kitsuden-secondary")).toBe("204 136 68");
  });

  it("sin config en la respuesta no toca nada", async () => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("/api/system/grimoires")
        ? respuesta([{ id: "grimoire-default" }])
        : respuesta({ activeGrimoire: "grimoire-default" })
    ) as unknown as typeof fetch;

    await applyGrimoireTheme();

    expect(document.documentElement.style.getPropertyValue("--kitsuden-primary")).toBe("");
  });
});
