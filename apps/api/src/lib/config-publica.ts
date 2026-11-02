/**
 * ¿Está esta instalación lista para servir a internet?
 * ============================================================================
 *
 * ── POR QUE EXISTE ─────────────────────────────────────────────────────────
 *
 * La auditoría de producción encontró tres fallos que comparten forma: el
 * sistema arrancaba perfectamente y fallaba después, delante de un usuario.
 *
 *   · `BETTER_AUTH_URL` escrita como localhost. Las vueltas de OAuth y la
 *     comprobación de origen apuntaban a la máquina de quien abre la página:
 *     el login social se rompía sin ningún error en el servidor.
 *   · Sin transporte de correo. El Mailer cae al driver `log` a propósito
 *     —para que un alta local no falle por no tener SMTP— y en producción eso
 *     significa que la recuperación de contraseña se imprime en una consola
 *     que nadie mira.
 *   · Un secreto de sesión corto.
 *
 * Ninguno da error al arrancar. Por eso se comprueban ANTES de arrancar, con
 * la misma lógica que usa la aplicación, y el arranque se niega a seguir.
 *
 * ── SOLO EN MODO PUBLICO ───────────────────────────────────────────────────
 *
 * Exigir https y un proveedor de correo en local obligaría a configurar
 * Resend para abrir el panel en el portátil. El modo público lo declara el
 * overlay TLS (`KITSUDEN_PUBLIC=true`): una instalación expuesta tiene que
 * DECIRLO, y a partir de ahí no se le perdona nada.
 *
 * ── NADA DE SECRETOS EN LOS MENSAJES ───────────────────────────────────────
 *
 * Estos mensajes acaban en el log del contenedor. Del secreto se dice la
 * longitud, nunca el valor; de la clave de Resend, ni eso.
 */

/**
 * Del fichero concreto, NO del índice del paquete.
 *
 * `@kitsuden/engine` sin más carga el motor entero —repositorio, rutas,
 * políticas— y en vitest reventaba con `withRouteMeta is not a function` antes
 * de llegar a la primera comprobación. `drivers.ts` solo importa tipos: cargarlo
 * no abre conexiones ni deja recursos vivos, que es lo que un paso de arranque
 * necesita para terminar limpio.
 */
import { driverFromEnv } from "@kitsuden/engine/src/mail/drivers";

import { placeholderSecrets } from "./placeholder-secrets";

export interface ProblemaDeConfig {
  variable: string;
  motivo: string;
}

type Entorno = Record<string, string | undefined>;

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

function esLocal(host: string): boolean {
  const h = host.toLowerCase();
  return HOSTS_LOCALES.has(h) || h.endsWith(".localhost");
}

function comprobarUrl(env: Entorno, nombre: string, problemas: ProblemaDeConfig[]): void {
  const valor = env[nombre];
  if (!valor) {
    problemas.push({ variable: nombre, motivo: "no está definida" });
    return;
  }

  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    problemas.push({ variable: nombre, motivo: `no es una URL válida: «${valor}»` });
    return;
  }

  if (url.protocol !== "https:") {
    problemas.push({
      variable: nombre,
      motivo: `usa ${url.protocol.replace(":", "")} y no https: la cookie de sesión viajaría en claro`,
    });
  }

  if (esLocal(url.hostname)) {
    problemas.push({
      variable: nombre,
      motivo:
        `apunta a ${url.hostname}: las vueltas de OAuth y la comprobación de ` +
        `origen irían a la máquina de quien abre la página, no a este servidor`,
    });
  }
}

/** Lista de lo que impide servir a internet. Vacía = lista. */
export function problemasDeConfigPublica(env: Entorno = process.env): ProblemaDeConfig[] {
  const problemas: ProblemaDeConfig[] = [];

  for (const nombre of ["BETTER_AUTH_URL", "ADMIN_URL", "APP_URL"]) {
    comprobarUrl(env, nombre, problemas);
  }

  /**
   * ── LA LISTA DE ORÍGENES ────────────────────────────────────────────────
   *
   * Aquí se cae el despliegue real, y sin ruido: la web carga entera y solo
   * fallan el login y los comentarios, que es justo lo que nadie prueba al
   * desplegar. Cuatro formas de equivocarse, las cuatro silenciosas:
   *
   *   1. Dejarla VACÍA: ninguna web puede hablar con la API.
   *   2. Dejar los puertos locales de desarrollo.
   *   3. Escribir `http://` donde el sitio es `https://`: son orígenes
   *      distintos y el navegador no los cruza.
   *   4. Escribir una URL con barra o ruta (`https://web.com/`): un origen es
   *      esquema + host + puerto, así que esa entrada NO coincide nunca.
   *
   * Y la quinta, la que pasó de verdad: olvidarse de la web principal.
   */
  const origenes = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (origenes.length === 0) {
    problemas.push({
      variable: "ALLOWED_ORIGINS",
      motivo:
        "está vacía: ninguna web podría llamar a la API con la sesión, así que " +
        "el login y los comentarios fallarían en todas aunque las páginas carguen",
    });
  }

  for (const origen of origenes) {
    let url: URL;
    try {
      url = new URL(origen);
    } catch {
      problemas.push({ variable: "ALLOWED_ORIGINS", motivo: `«${origen}» no es un origen válido` });
      continue;
    }

    if (esLocal(url.hostname)) {
      problemas.push({
        variable: "ALLOWED_ORIGINS",
        motivo: `incluye ${origen}: cualquier página servida desde esa máquina podría llamar a la API con la sesión del usuario`,
      });
      continue;
    }

    if (url.protocol !== "https:") {
      problemas.push({
        variable: "ALLOWED_ORIGINS",
        motivo: `${origen} no es https: el navegador lo trata como otro origen distinto del sitio y la sesión viajaría en claro`,
      });
    }

    /**
     * Un origen es esquema + host + puerto y NADA más. `https://web.com/` con
     * barra parece lo mismo y no coincide nunca: la comprobación compara
     * cadenas exactas contra `Origin`, que el navegador manda sin barra.
     */
    if (origen !== url.origin) {
      problemas.push({
        variable: "ALLOWED_ORIGINS",
        motivo: `«${origen}» lleva barra o ruta: un origen es «${url.origin}» y así no coincide nunca`,
      });
    }
  }

  /**
   * Y la web principal tiene que estar en la lista.
   *
   * Solo vale la lista fija (`origenes-cors.ts`): ya no hay subdominios que
   * se acepten por regla. Es el olvido más fácil, porque la web carga entera y
   * solo fallan el login y los comentarios.
   */
  const app = env.APP_URL;
  if (app && origenes.length > 0) {
    try {
      const origenDeLaApp = new URL(app).origin;
      if (!origenes.includes(origenDeLaApp)) {
        problemas.push({
          variable: "ALLOWED_ORIGINS",
          motivo:
            `no incluye ${origenDeLaApp}, que es APP_URL: la web principal se quedaría ` +
            `sin login ni comentarios`,
        });
      }
    } catch {
      // `APP_URL` mal formada ya la señala `comprobarUrl` más arriba
    }
  }

  // La MISMA resolución que usa el Mailer. Reimplementarla aquí es como se
  // llega a un chequeo que dice «hay correo» mientras la app usa otro driver.
  const driver = driverFromEnv(env).name;
  if (driver === "log" || driver === "memory") {
    problemas.push({
      variable: "RESEND_API_KEY / SMTP_HOST",
      motivo:
        `el correo usaría el driver «${driver}»: la verificación de email y la ` +
        `recuperación de contraseña no llegarían a nadie`,
    });
  }

  const remitente = env.MAIL_FROM ?? "";
  const dominio = (remitente.split("@")[1] ?? "").replace(/>\s*$/, "").trim();
  if (!dominio || esLocal(dominio)) {
    problemas.push({
      variable: "MAIL_FROM",
      motivo:
        `«${remitente || "(vacío)"}» no tiene un dominio real: los proveedores ` +
        `rechazan ese remitente o lo mandan a spam`,
    });
  }

  const secreto = env.BETTER_AUTH_SECRET ?? "";
  if (secreto.length < 32) {
    problemas.push({
      variable: "BETTER_AUTH_SECRET",
      motivo: `tiene ${secreto.length} caracteres; hacen falta al menos 32`,
    });
  }

  for (const variable of placeholderSecrets(env)) {
    problemas.push({
      variable,
      motivo: "still holds a placeholder from an example file: generate a real value",
    });
  }

  return problemas;
}
