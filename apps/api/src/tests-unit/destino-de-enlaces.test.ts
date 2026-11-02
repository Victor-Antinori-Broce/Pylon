/**
 * El enlace de verificación vuelve al panel y nunca a un dominio ajeno
 * ============================================================================
 *
 * better-auth pone `callbackURL=/` cuando el alta no trae destino, y `/` se
 * resolvía contra la API: quien confirmaba su email acababa en la raíz de la
 * API. Ver `lib/destino-de-enlaces.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "bun:test";

import { destinoSeguro, fijarDestinoDelEnlace } from "../lib/destino-de-enlaces";

const PANEL = "https://panel.ejemplo.com";
const PERMITIDOS = ["https://api.ejemplo.com", "https://panel.ejemplo.com", "https://www.ejemplo.com"];

const enlace = (callback: string | null) => {
  const base = "https://api.ejemplo.com/api/auth/verify-email?token=abc.def";
  return callback === null ? base : `${base}&callbackURL=${encodeURIComponent(callback)}`;
};
const callbackDe = (url: string) => new URL(url).searchParams.get("callbackURL");

describe("destinoSeguro", () => {
  it("vacío o `/` → la raíz del panel, no la de la API", () => {
    expect(destinoSeguro(undefined, PANEL, PERMITIDOS)).toBe("https://panel.ejemplo.com/");
    expect(destinoSeguro("", PANEL, PERMITIDOS)).toBe("https://panel.ejemplo.com/");
    expect(destinoSeguro("/", PANEL, PERMITIDOS)).toBe("https://panel.ejemplo.com/");
  });

  it("una ruta relativa se conserva, pero en el panel", () => {
    expect(destinoSeguro("/settings?tab=perfil", PANEL, PERMITIDOS)).toBe(
      "https://panel.ejemplo.com/settings?tab=perfil"
    );
    // ADMIN_URL con barra final no duplica la barra
    expect(destinoSeguro("/x", `${PANEL}/`, PERMITIDOS)).toBe("https://panel.ejemplo.com/x");
  });

  it("un origen de confianza se respeta (una web pública vuelve a sí misma)", () => {
    expect(destinoSeguro("https://www.ejemplo.com/gracias", PANEL, PERMITIDOS)).toBe(
      "https://www.ejemplo.com/gracias"
    );
    expect(destinoSeguro("https://panel.ejemplo.com/", PANEL, [])).toBe("https://panel.ejemplo.com/");
  });

  it("NO es una redirección abierta: un dominio ajeno acaba en el panel", () => {
    const ataques = [
      "https://malo.example/robar",
      "http://panel.ejemplo.com/", // mismo host, otro protocolo: otro origen
      "https://panel.ejemplo.com.malo.example/",
      "https://panel.ejemplo.com@malo.example/",
      "//malo.example/",
      "/\\malo.example/",
      "/%2fmalo.example",
      "javascript:alert(1)",
      "data:text/html,hola",
      "malo.example",
    ];
    for (const a of ataques) {
      expect(destinoSeguro(a, PANEL, PERMITIDOS), a).toBe("https://panel.ejemplo.com/");
    }
  });

  it("un comodín de ALLOWED_ORIGINS no autoriza nada", () => {
    expect(destinoSeguro("https://x.ejemplo.com/", PANEL, ["*.ejemplo.com"])).toBe(
      "https://panel.ejemplo.com/"
    );
  });
});

describe("fijarDestinoDelEnlace", () => {
  it("reescribe el `callbackURL=/` que pone better-auth", () => {
    const fijado = fijarDestinoDelEnlace(enlace("/"), PANEL, PERMITIDOS);
    expect(callbackDe(fijado)).toBe("https://panel.ejemplo.com/");
    // el resto del enlace no cambia
    expect(new URL(fijado).searchParams.get("token")).toBe("abc.def");
    expect(new URL(fijado).origin + new URL(fijado).pathname).toBe(
      "https://api.ejemplo.com/api/auth/verify-email"
    );
  });

  it("añade el destino si el enlace no lo trae", () => {
    expect(callbackDe(fijarDestinoDelEnlace(enlace(null), PANEL, PERMITIDOS))).toBe(
      "https://panel.ejemplo.com/"
    );
  });

  it("sustituye un destino ajeno", () => {
    expect(callbackDe(fijarDestinoDelEnlace(enlace("https://malo.example/"), PANEL, PERMITIDOS))).toBe(
      "https://panel.ejemplo.com/"
    );
  });

  it("vale también para el enlace de restablecer contraseña (callbackURL vacío)", () => {
    const reset = "https://api.ejemplo.com/api/auth/reset-password/tok123?callbackURL=";
    const fijado = fijarDestinoDelEnlace(reset, PANEL, PERMITIDOS);
    expect(callbackDe(fijado)).toBe("https://panel.ejemplo.com/");
    expect(new URL(fijado).pathname).toBe("/api/auth/reset-password/tok123");
  });

  it("un enlace ilegible sale sin tocar", () => {
    expect(fijarDestinoDelEnlace("no es una url", PANEL, PERMITIDOS)).toBe("no es una url");
  });
});

describe("auth.ts lo usa en los dos correos", () => {
  const AUTH = readFileSync(join(import.meta.dir, "..", "lib", "auth.ts"), "utf8");

  it("verificación y restablecimiento pasan por fijarDestinoDelEnlace", () => {
    expect(AUTH).toMatch(/verifyUrl:\s*fijarDestinoDelEnlace\(url, URL_DEL_PANEL, ORIGENES_DE_CONFIANZA\)/);
    expect(AUTH).toMatch(/resetUrl:\s*fijarDestinoDelEnlace\(url, URL_DEL_PANEL, ORIGENES_DE_CONFIANZA\)/);
  });

  it("la lista de confianza es la misma que la de better-auth", () => {
    expect(AUTH).toMatch(/trustedOrigins:\s*ORIGENES_DE_CONFIANZA/);
  });
});
