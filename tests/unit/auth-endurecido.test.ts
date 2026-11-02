/**
 * La autenticación no vuelve a quedar abierta a la toma de cuentas
 * ============================================================================
 *
 * ── LO QUE ENCONTRO LA AUDITORIA ───────────────────────────────────────────
 *
 * `better-auth` 1.4.19, con la configuración exacta que describe el aviso
 * GHSA-g38m-r43w-p2q7 («account takeover via OAuth auto-link to unverified
 * pre-registered email»):
 *
 *   · registro con email y contraseña activo,
 *   · login con GitHub, Google y Discord,
 *   · vinculación de cuentas por defecto.
 *
 * El ataque: alguien registra tu email con su contraseña, tú entras más tarde
 * con Google, las cuentas se vinculan y esa persona entra en la tuya.
 *
 * ── LO QUE LO CIERRA, Y LO QUE NO ──────────────────────────────────────────
 *
 * Lo cierra la VERSION: desde 1.6.11 better-auth exige que el usuario local
 * tenga el email verificado antes de vincular. Exigir verificación en el alta
 * NO lo mitiga —el aviso lo dice expresamente: la fila del atacante se marca
 * como verificada durante la vinculación—. Por eso esta prueba vigila las dos
 * cosas por separado y no deja que una pase por la otra.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const leer = (...ruta: string[]) => readFileSync(join(RAIZ, ...ruta), "utf-8");

const AUTH = leer("apps", "api", "src", "lib", "auth.ts");
const INDEX = leer("apps", "api", "src", "index.ts");
const LOCK = leer("pnpm-lock.yaml");

/** Compara versiones x.y.z sin dependencias. */
function menor(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i];
  }
  return false;
}

describe("la versión de better-auth", () => {
  it("todo lo resuelto en el lockfile incluye el parche (≥1.6.11)", () => {
    const versiones = [
      ...new Set([...LOCK.matchAll(/better-auth@(\d+\.\d+\.\d+)/g)].map((m) => m[1])),
    ];

    expect(versiones.length, "no se encontró better-auth en el lockfile").toBeGreaterThan(0);

    const vulnerables = versiones.filter((v) => menor(v, "1.6.11"));
    expect(
      vulnerables,
      `El lockfile resuelve better-auth ${vulnerables.join(", ")}, por debajo de 1.6.11: ` +
        `vuelve a estar abierta la toma de cuentas por vinculación OAuth.`
    ).toEqual([]);
  });

  it("los package.json fijan la rama con tilde, no con caret", () => {
    /**
     * `pnpm update` escribió `^1.6.31` aunque se le pidió `~`. Con caret, un
     * `pnpm update` futuro salta a 1.7, que cambia cómo se identifican las
     * cuentas vinculadas. Una actualización de seguridad no puede colar un
     * cambio incompatible.
     */
    for (const ruta of [
      ["apps", "api", "package.json"],
      ["packages", "admin", "package.json"],
      ["packages", "kitsuden", "package.json"],
    ]) {
      const especificador = JSON.parse(leer(...ruta)).dependencies?.["better-auth"];
      expect(especificador, `${ruta.join("/")} no declara better-auth`).toBeDefined();
      expect(
        especificador.startsWith("~"),
        `${ruta.join("/")} declara «${especificador}»: tiene que ir con tilde`
      ).toBe(true);
    }
  });
});

describe("la vinculación de cuentas", () => {
  it("nadie desactiva la comprobación del email local", () => {
    expect(
      /requireLocalEmailVerified\s*:\s*false/.test(AUTH),
      "requireLocalEmailVerified: false reabre exactamente la toma de cuentas del aviso."
    ).toBe(false);
  });

  it("Discord nunca es proveedor de confianza", () => {
    /**
     * Un proveedor de confianza vincula aunque no haya verificado el email, y
     * Discord entrega direcciones sin verificar.
     */
    const confianza = AUTH.match(/trustedProviders\s*:\s*\[([^\]]*)\]/);
    expect(confianza, "trustedProviders tiene que declararse explícitamente").not.toBeNull();
    expect(confianza![1]).not.toMatch(/discord/i);
  });
});

describe("verificación y recuperación", () => {
  it("el alta con contraseña exige verificar el email", () => {
    expect(AUTH).toMatch(/requireEmailVerification\s*:\s*true/);
  });

  it("los dos correos están CONECTADOS, no solo escritos", () => {
    /**
     * La plantilla de recuperación existía y nada la enviaba. Declarar la
     * opción no basta: tiene que encolar la plantilla que existe.
     */
    expect(AUTH).toMatch(/sendResetPassword\s*:/);
    expect(AUTH).toContain('"system.password-recovery"');
    expect(AUTH).toMatch(/sendVerificationEmail\s*:/);
    expect(AUTH).toContain('"system.email-verification"');

    const correos = leer("apps", "api", "src", "mail", "system-mails.ts");
    expect(correos).toContain('name: "system.email-verification"');
    expect(correos).toMatch(/registerAll\(\[[^\]]*verificationMail/);
  });

  it("un reseteo de contraseña cierra las sesiones abiertas", () => {
    expect(AUTH).toMatch(/revokeSessionsOnPasswordReset\s*:\s*true/);
  });

  it("un correo que no se puede encolar deja rastro de error", () => {
    /**
     * `emailQueue.add` devuelve null si Valkey no responde. Sin comprobarlo,
     * una verificación perdida no deja ninguna señal.
     */
    const ayudante = AUTH.slice(
      AUTH.indexOf("async function encolarCorreo"),
      AUTH.indexOf("export const auth")
    );
    expect(ayudante.length, "no se encontró encolarCorreo").toBeGreaterThan(0);
    expect(ayudante).toContain("if (!trabajo)");
    expect(ayudante).toContain("logger.error");
  });
});

describe("el primer administrador", () => {
  it("sale verificado del alta, o se queda fuera de su propia instancia", () => {
    const alta = INDEX.slice(
      INDEX.indexOf('app.post("/api/system/setup"'),
      INDEX.indexOf('app.route("/api/system", systemRoutes)')
    );

    expect(alta.length, "no se encontró el alta del primer administrador").toBeGreaterThan(0);

    const promociones = alta.match(/\.set\(\{[^}]*role: "admin"[^}]*\}\)/g) ?? [];
    expect(promociones.length, "no se encontró la promoción a admin").toBeGreaterThan(0);

    for (const p of promociones) {
      expect(
        p.includes("emailVerified: true"),
        `«${p}» promociona a admin sin verificar el email: con la verificación ` +
          `obligatoria, SetupView hace signIn y el instalador recibe «Email not verified».`
      ).toBe(true);
    }
  });
});
