/**
 * Los correos de verificación y recuperación llevan a algún sitio
 * ============================================================================
 *
 * Conectar `sendResetPassword` y `sendVerificationEmail` en el servidor no
 * bastaba: el panel no tenía «¿olvidaste tu contraseña?», ni formulario para
 * fijar la nueva, ni forma de reenviar la verificación. Con la verificación
 * obligatoria, alguien con la contraseña correcta recibía «Email not verified»
 * y ningún botón. Era la familia de siempre —el código completo en un lado y
 * nada que lo llame en el otro—, esta vez creada por el propio arreglo.
 *
 * ── POR QUE TODO VIVE EN EL LOGIN ──────────────────────────────────────────
 *
 * Sin sesión, `+layout.svelte` pinta `LoginView` en CUALQUIER ruta. Una página
 * `/reset-password` aparte nunca llegaría a verse. better-auth vuelve a la raíz
 * con `?token=`, y el login lo reconoce.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const LOGIN = readFileSync(
  join(RAIZ, "packages", "admin", "src", "views", "auth", "LoginView.svelte"),
  "utf-8"
);
const STORE = readFileSync(
  join(RAIZ, "packages", "admin", "src", "lib", "auth.svelte.ts"),
  "utf-8"
);
const LAYOUT = readFileSync(
  join(RAIZ, "packages", "admin", "src", "routes", "+layout.svelte"),
  "utf-8"
);

describe("recuperación desde el login del panel", () => {
  it("el store llama a los endpoints reales de better-auth 1.6", () => {
    /**
     * Los nombres cambiaron entre versiones (`/forget-password` pasó a
     * `/request-password-reset`). Un nombre viejo no da error de tipos: da un
     * 404 al pulsar el botón.
     */
    expect(STORE).toContain("/api/auth/request-password-reset");
    expect(STORE).toContain("/api/auth/reset-password");
    expect(STORE).toContain("/api/auth/send-verification-email");
    expect(STORE).not.toContain("/api/auth/forget-password");
  });

  it("signIn conserva el código del error", () => {
    expect(STORE).toMatch(/\.code\s*=\s*body\.code/);
  });

  it("el login ofrece reenviar la verificación cuando hace falta", () => {
    expect(LOGIN).toContain('"EMAIL_NOT_VERIFIED"');
    expect(LOGIN).toContain("resendVerification(");
  });

  it("el login ofrece recuperar la contraseña y fijar la nueva", () => {
    expect(LOGIN).toContain("requestPasswordReset(");
    expect(LOGIN).toContain("resetPassword(");
    expect(LOGIN).toContain('params.get("token")');
  });

  it("el aviso de envío no revela si la cuenta existe", () => {
    const olvido = LOGIN.slice(LOGIN.indexOf("async function handleOlvido"));
    const cuerpo = olvido.slice(0, olvido.indexOf("async function handleNueva"));
    /**
     * Desde que el panel tiene diccionarios (en/es), el aviso no está escrito en
     * el componente: se pide con t("loginView.<clave>"). Se resuelve la clave en
     * los dos idiomas y se exige la misma redacción neutra en ambos.
     */
    const clave = cuerpo.match(/\bt\("loginView\.(\w+)"\)/g)?.map((m) => m.slice(13, -2)) ?? [];
    const textoEn = (idioma: string) =>
      clave
        .map((k) => {
          const dic = readFileSync(
            join(RAIZ, "packages", "admin", "src", "lib", "i18n", `${idioma}.ts`),
            "utf-8"
          );
          return dic.match(new RegExp(`^    ${k}: "(.*)",$`, "m"))?.[1] ?? "";
        })
        .join(" ");
    expect(textoEn("es")).toMatch(/Si existe una cuenta/);
    expect(textoEn("en")).toMatch(/If an account exists/);
  });

  it("el enlace vuelve a la raíz, que es donde el login puede verlo", () => {
    /**
     * Si alguien cambia `redirectTo` a una ruta propia sin tocar el layout,
     * el enlace del correo aterriza en un login que ignora el token.
     */
    expect(LAYOUT).toContain("<LoginView />");
    expect(STORE).toMatch(/redirectTo:\s*`\$\{window\.location\.origin\}\/`/);
  });

  it("tras cambiar la contraseña, el token sale de la URL", () => {
    const nueva = LOGIN.slice(LOGIN.indexOf("async function handleNueva"));
    expect(nueva.slice(0, 1500)).toContain("history.replaceState");
  });
});
