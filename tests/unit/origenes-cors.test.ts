/**
 * CORS: solo la lista fija
 *
 * Hasta el 2026-09-21 se aceptaban por regla los subdominios del sitio (cada
 * wiki y esports vivían en el suyo). Ya no hay subdominios, y lo que se vigila
 * es que el comodín no vuelva: sería ampliar sin motivo quién puede llamar a
 * la API con la cookie de sesión.
 */

import { describe, expect, it } from "vitest";

import { avisoDeCorsIncompleto, origenPermitido } from "../../apps/api/src/lib/origenes-cors";

const FIJOS = ["https://example.com", "https://cms.example.com"];

describe("origenPermitido", () => {
  it("acepta la lista fija tal cual", () => {
    const f = origenPermitido(FIJOS);
    expect(f("https://cms.example.com")).toBe("https://cms.example.com");
    expect(f("https://example.com")).toBe("https://example.com");
  });

  it("ya no acepta subdominios del sitio: las wikis y esports van en ruta", () => {
    const f = origenPermitido(FIJOS);
    expect(f("https://aniimo.example.com")).toBeNull();
    expect(f("https://esports.example.com")).toBeNull();
    expect(f("http://aniimo.localhost:4321")).toBeNull();
  });

  it("rechaza lo que no es exactamente un origen de la lista", () => {
    const f = origenPermitido(FIJOS);
    expect(f("")).toBeNull();
    expect(f("null")).toBeNull();
    expect(f("https://example.com/")).toBeNull();
    expect(f("http://example.com")).toBeNull();
    expect(f("https://example.com.evil.com")).toBeNull();
  });
});

describe("el aviso de arranque", () => {
  it("avisa cuando el sitio público NO está en la lista fija", () => {
    // El caso real: el comodín cubre `aniimo.example.com` pero no
    // `example.com`, así que el login y los comentarios fallan EN LA WEB
    const aviso = avisoDeCorsIncompleto(["https://cms.example.com"], "https://example.com");
    expect(aviso).toMatch(/ALLOWED_ORIGINS/);
    expect(aviso).toContain("https://example.com");
    expect(aviso).toMatch(/webs hermanas/);
  });

  it("calla cuando está bien puesto", () => {
    expect(
      avisoDeCorsIncompleto(
        ["https://example.com", "https://cms.example.com"],
        "https://example.com"
      )
    ).toBeNull();
  });

  it("el esquema y el puerto cuentan: son orígenes distintos", () => {
    expect(avisoDeCorsIncompleto(["http://example.com"], "https://example.com")).not.toBeNull();
    expect(
      avisoDeCorsIncompleto(["http://localhost:4351"], "http://localhost:4321")
    ).not.toBeNull();
    expect(avisoDeCorsIncompleto(["http://localhost:4321"], "http://localhost:4321")).toBeNull();
  });

  it("sin URL del sitio no inventa un aviso", () => {
    expect(avisoDeCorsIncompleto([], "no es una url")).toBeNull();
  });
});
