/**
 * Una instalación pública no arranca mal configurada
 * ============================================================================
 *
 * La auditoría de producción encontró que `BETTER_AUTH_URL` estaba escrita
 * como localhost en el compose y que ningún transporte de correo llegaba al
 * contenedor. Las dos cosas arrancaban sin error y fallaban después: el login
 * social con una vuelta a la máquina equivocada, y la recuperación de
 * contraseña impresa en una consola.
 *
 * Estas pruebas fijan lo que el paso [0/6] del arranque tiene que rechazar, y
 * sobre todo lo que NO puede hacer: escribir un secreto en el log.
 */

import { describe, expect, it } from "vitest";

import { problemasDeConfigPublica } from "../../apps/api/src/lib/config-publica";

const SECRETO = "x".repeat(48);

/** Una configuración pública correcta. Cada prueba rompe una sola cosa. */
const BUENA = {
  BETTER_AUTH_URL: "https://cms.example.com",
  ADMIN_URL: "https://cms.example.com",
  APP_URL: "https://cms.example.com",
  ALLOWED_ORIGINS: "https://cms.example.com",
  RESEND_API_KEY: "re_de_prueba_no_real",
  MAIL_FROM: "Kitsuden <noreply@example.com>",
  BETTER_AUTH_SECRET: SECRETO,
};

const variables = (env: Record<string, string | undefined>) =>
  problemasDeConfigPublica(env).map((p) => p.variable);

describe("configuración pública", () => {
  it("una configuración correcta no tiene problemas", () => {
    expect(problemasDeConfigPublica(BUENA)).toEqual([]);
  });

  it("los valores por defecto del compose NO pasan", () => {
    /**
     * Es exactamente lo que había desplegado: si esto pasara, el paso de
     * arranque sería decorativo.
     */
    const porDefecto = {
      BETTER_AUTH_URL: "http://localhost:3000",
      ADMIN_URL: "http://localhost:3001",
      APP_URL: "http://localhost:3001",
      ALLOWED_ORIGINS: "http://localhost:5173,http://localhost:3000,http://localhost:3001",
      MAIL_FROM: "noreply@localhost",
      BETTER_AUTH_SECRET: SECRETO,
    };

    const v = variables(porDefecto);
    expect(v).toContain("BETTER_AUTH_URL");
    expect(v).toContain("ADMIN_URL");
    expect(v).toContain("ALLOWED_ORIGINS");
    expect(v).toContain("MAIL_FROM");
    expect(v).toContain("RESEND_API_KEY / SMTP_HOST");
  });

  it("http con dominio real también se rechaza", () => {
    expect(variables({ ...BUENA, BETTER_AUTH_URL: "http://cms.example.com" })).toEqual([
      "BETTER_AUTH_URL",
    ]);
  });

  it("127.0.0.1 y *.localhost cuentan como locales", () => {
    expect(variables({ ...BUENA, ADMIN_URL: "https://127.0.0.1" })).toContain("ADMIN_URL");
    expect(variables({ ...BUENA, APP_URL: "https://panel.localhost" })).toContain("APP_URL");
  });

  it("un solo origen local entre varios basta para rechazar", () => {
    expect(
      variables({ ...BUENA, ALLOWED_ORIGINS: "https://cms.example.com,http://localhost:5173" })
    ).toEqual(["ALLOWED_ORIGINS"]);
  });

  it("sin transporte de correo se rechaza, aunque todo lo demás esté bien", () => {
    const { RESEND_API_KEY: _quitada, ...sinCorreo } = BUENA;
    expect(variables(sinCorreo)).toEqual(["RESEND_API_KEY / SMTP_HOST"]);
  });

  it("SMTP también cuenta como transporte real", () => {
    const { RESEND_API_KEY: _quitada, ...sinResend } = BUENA;
    expect(variables({ ...sinResend, SMTP_HOST: "smtp.example.com" })).toEqual([]);
  });

  it("forzar MAIL_DRIVER=log se rechaza aunque haya clave", () => {
    /**
     * La resolución es la del propio Mailer: un driver explícito gana a la
     * clave. Si el chequeo mirara solo si existe RESEND_API_KEY, diría «hay
     * correo» mientras la aplicación imprime en consola.
     */
    expect(variables({ ...BUENA, MAIL_DRIVER: "log" })).toEqual(["RESEND_API_KEY / SMTP_HOST"]);
  });

  it("un secreto corto se rechaza", () => {
    expect(variables({ ...BUENA, BETTER_AUTH_SECRET: "corto" })).toEqual(["BETTER_AUTH_SECRET"]);
  });

  it("ningún mensaje contiene un secreto", () => {
    /**
     * Estos mensajes acaban en el log del contenedor. Se prueba con valores
     * reconocibles para que, si alguno se cuela, la prueba lo encuentre.
     */
    const secreto = "SECRETO-QUE-NO-DEBE-SALIR-" + "z".repeat(10);
    const clave = "re_CLAVE_QUE_NO_DEBE_SALIR";

    const mensajes = problemasDeConfigPublica({
      BETTER_AUTH_URL: "http://localhost:3000",
      MAIL_FROM: "noreply@localhost",
      BETTER_AUTH_SECRET: secreto,
      RESEND_API_KEY: clave,
      MAIL_DRIVER: "log",
    })
      .map((p) => p.motivo)
      .join("\n");

    expect(mensajes).not.toContain(secreto);
    expect(mensajes).not.toContain(clave);
  });
});

/**
 * Las cinco formas de equivocarse con la lista de orígenes
 *
 * Es donde se cae un despliegue de verdad, y sin ruido: la web carga entera y
 * solo fallan el login y los comentarios — justo lo que nadie prueba al
 * desplegar. Pasó con las tres webs a la vez.
 */
describe("ALLOWED_ORIGINS en un despliegue real", () => {
  it("vacía no pasa: ninguna web podría hablar con la API", () => {
    expect(variables({ ...BUENA, ALLOWED_ORIGINS: "" })).toContain("ALLOWED_ORIGINS");
    expect(variables({ ...BUENA, ALLOWED_ORIGINS: undefined })).toContain("ALLOWED_ORIGINS");
    expect(problemasDeConfigPublica({ ...BUENA, ALLOWED_ORIGINS: "" })[0].motivo).toMatch(/vacía/);
  });

  it("http donde el sitio es https no pasa: son orígenes distintos", () => {
    const p = problemasDeConfigPublica({
      ...BUENA,
      APP_URL: "https://example.com",
      ALLOWED_ORIGINS: "http://example.com",
    });
    expect(p.map((x) => x.motivo).join(" ")).toMatch(/no es https/);
  });

  it("una barra al final no pasa: un origen no la lleva y no coincidiría nunca", () => {
    const p = problemasDeConfigPublica({
      ...BUENA,
      APP_URL: "https://cms.example.com",
      ALLOWED_ORIGINS: "https://cms.example.com/",
    });
    expect(p.map((x) => x.motivo).join(" ")).toMatch(/barra o ruta/);
  });

  it("olvidar la web principal no pasa aunque el panel esté", () => {
    // El fallo real: el panel funcionaba y la web principal se quedó sin login
    const p = problemasDeConfigPublica({
      ...BUENA,
      APP_URL: "https://example.com",
      BETTER_AUTH_URL: "https://example.com",
      ADMIN_URL: "https://cms.example.com",
      ALLOWED_ORIGINS: "https://cms.example.com",
    });
    expect(p.map((x) => x.motivo).join(" ")).toMatch(/no incluye https:\/\/example\.com/);
  });

  it("las tres webs bien puestas pasan", () => {
    expect(
      problemasDeConfigPublica({
        ...BUENA,
        APP_URL: "https://example.com",
        BETTER_AUTH_URL: "https://example.com",
        ADMIN_URL: "https://cms.example.com",
        ALLOWED_ORIGINS:
          "https://example.com,https://otra-web.example,https://tercera-web.example,https://cms.example.com",
      })
    ).toEqual([]);
  });
});
