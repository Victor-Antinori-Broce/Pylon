/**
 * Qué orígenes pueden llamar a la API con credenciales
 * ============================================================================
 *
 * Los de la lista fija (`ALLOWED_ORIGINS`: panel y webs públicas), y nada más.
 *
 * Hasta el 2026-09-21 se aceptaban además los SUBDOMINIOS del sitio público,
 * porque cada wiki (`aniimo.<dominio>`) y esports (`esports.<dominio>`) vivían
 * en el suyo. Ya no hay subdominios: la wiki es `/<juego>/wiki/` y esports
 * `/esports/`, así que comparten origen con su web y el comodín solo ampliaba
 * a quién se le permite llamar con la cookie de sesión.
 */

export function origenPermitido(fijos: readonly string[]): (origen: string) => string | null {
  const lista = new Set(fijos);
  return (origen: string) => (origen && lista.has(origen) ? origen : null);
}

/**
 * ¿El sitio público puede llamarse a sí mismo?
 * ============================================================================
 *
 * El sitio público tiene que estar en la lista fija: `example.com`.
 * Es la pieza que más se olvida, y su síntoma es de los peores: la web
 * carga perfecta y solo fallan el login y los comentarios, que es justo lo que
 * nadie prueba al desplegar.
 *
 * Devuelve el aviso que hay que enseñar al arrancar, o `null` si está bien.
 */
export function avisoDeCorsIncompleto(fijos: readonly string[], urlPublica: string): string | null {
  let sitio: URL;
  try {
    sitio = new URL(urlPublica);
  } catch {
    return null; // Sin URL del sitio no hay nada que comprobar
  }

  if (fijos.includes(sitio.origin)) return null;

  return (
    `ALLOWED_ORIGINS no incluye el sitio público (${sitio.origin}): el login y los comentarios ` +
    `fallarán ahí por CORS aunque la web cargue bien. Las webs hermanas van también, una por origen.`
  );
}
