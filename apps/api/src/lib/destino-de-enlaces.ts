/**
 * A dónde vuelve quien pulsa el enlace de un correo de autenticación
 * ============================================================================
 *
 * better-auth construye el enlace de verificación como
 *
 *     <API>/api/auth/verify-email?token=…&callbackURL=<destino>
 *
 * y, si el alta no trae `callbackURL`, pone `/`. Una ruta relativa se resuelve
 * contra la API —que es donde está el enlace—, así que quien confirmaba su
 * email acababa en la raíz de la API (un JSON) y no en el panel. Lo mismo con
 * el `?callbackURL=` del enlace de restablecer contraseña.
 *
 * Esta función reescribe ese parámetro ANTES de que el enlace salga en el
 * correo:
 *
 *   · vacío o relativo  → la misma ruta, pero en el panel (`ADMIN_URL`);
 *   · absoluto y de un origen permitido → se deja tal cual (una web pública
 *     que da de alta a sus lectores puede querer volver a sí misma);
 *   · cualquier otra cosa → la raíz del panel.
 *
 * Lo último es lo que impide la redirección abierta: un enlace nuestro nunca
 * manda a un dominio que no esté en la lista. better-auth ya valida el
 * `callbackURL` contra `trustedOrigins` en las peticiones del navegador, pero
 * NO cuando se llama a `auth.api.*` desde el servidor (no hay `request`), y en
 * tests desactiva la comprobación entera. Aquí se cierra para todos los casos.
 *
 * Solo se comparan ORÍGENES exactos (`https://host:puerto`). Un patrón con
 * comodín de `ALLOWED_ORIGINS` (`*.ejemplo.com`) no autoriza nada aquí: ante la
 * duda, el panel.
 */

/** `https://host:puerto` de una URL absoluta http(s), o `null`. */
function origenDe(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Ruta relativa a la raíz y nada más: `/`, `/x?y=1`. Fuera `//host` y `/\host`,
 * que el navegador interpreta como otro dominio.
 */
function esRutaLocal(valor: string): boolean {
  return /^\/(?![/\\])/.test(valor) && !/[\\\s]/.test(valor) && !/^\/%(2f|5c)/i.test(valor);
}

/** Base del panel sin barra final (`ADMIN_URL` puede venir con ella). */
function basePanel(panel: string): string {
  return panel.replace(/\/+$/, "");
}

/**
 * Decide el destino seguro para `callbackURL`.
 *
 * @param destino   lo que trae el enlace (o nada)
 * @param panel     `ADMIN_URL`
 * @param permitidos orígenes de confianza (los mismos que `trustedOrigins`)
 */
export function destinoSeguro(
  destino: string | null | undefined,
  panel: string,
  permitidos: readonly string[]
): string {
  const base = basePanel(panel);
  const valor = (destino ?? "").trim();

  if (!valor) return `${base}/`;
  if (esRutaLocal(valor)) return `${base}${valor}`;

  const origen = origenDe(valor);
  if (origen) {
    const deConfianza = new Set(
      [panel, ...permitidos].map((p) => origenDe(p.trim())).filter((o): o is string => !!o)
    );
    if (deConfianza.has(origen)) return valor;
  }

  return `${base}/`;
}

/**
 * Reescribe el `callbackURL` de un enlace de better-auth (verificación o
 * restablecimiento). Si el enlace no se puede leer como URL se devuelve sin
 * tocar: mejor un enlace que funcione a medias que un correo sin enlace.
 */
export function fijarDestinoDelEnlace(
  enlace: string,
  panel: string,
  permitidos: readonly string[]
): string {
  let u: URL;
  try {
    u = new URL(enlace);
  } catch {
    return enlace;
  }
  u.searchParams.set("callbackURL", destinoSeguro(u.searchParams.get("callbackURL"), panel, permitidos));
  return u.toString();
}
