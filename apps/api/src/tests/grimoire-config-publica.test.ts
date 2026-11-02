/**
 * `GET /api/system/grimoires` devuelve de `config` solo lo que el panel usa
 * (`config.theme`), campo a campo. El resto del manifiesto no sale.
 */
import { describe, it, expect } from "bun:test";

import { configPublicaDeGrimoire } from "../routes/system";

describe("configPublicaDeGrimoire", () => {
  it("copia los colores y las css_vars --kitsuden-*", () => {
    expect(
      configPublicaDeGrimoire({
        theme: {
          primary_color: "#00e5ff",
          accent_color: "#ff2a6d",
          css_vars: { "--kitsuden-bg": "9 9 11", "--otra": "x", "--kitsuden-n": 3 },
        },
      })
    ).toEqual({
      theme: {
        primary_color: "#00e5ff",
        accent_color: "#ff2a6d",
        css_vars: { "--kitsuden-bg": "9 9 11" },
      },
    });
  });

  it("no deja salir nada fuera de theme ni claves desconocidas dentro", () => {
    const salida = configPublicaDeGrimoire({
      apiKey: "no-debe-salir",
      webhooks: { url: "https://x" },
      theme: { primary_color: "#fff", token: "no-debe-salir", css_entry: "variables.css" },
    });
    expect(salida).toEqual({ theme: { primary_color: "#fff" } });
    expect(JSON.stringify(salida)).not.toContain("no-debe-salir");
  });

  it("sin config o sin theme devuelve un objeto vacío", () => {
    expect(configPublicaDeGrimoire(undefined)).toEqual({});
    expect(configPublicaDeGrimoire({ otra: 1 })).toEqual({});
    expect(configPublicaDeGrimoire({ theme: "rojo" })).toEqual({});
  });
});
