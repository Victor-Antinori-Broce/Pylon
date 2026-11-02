/**
 * La ruta de una petición, apta para el log: sin tokens dentro.
 * ============================================================================
 *
 * Auditoría 2026-10-15. Hay rutas cuyo CAMINO lleva un secreto de un solo uso:
 * `GET /api/auth/reset-password/<token>` (better-auth, el enlace del correo de
 * recuperación), invitaciones y confirmaciones de los kons. El registro de
 * accesos (`hono/logger` y el access-log estructurado de `telemetry.ts`)
 * escribía el camino tal cual, así que quien leyera los logs (o el sistema
 * donde se envíen) tenía tokens de restablecimiento VIGENTES durante su hora
 * de validez.
 *
 * Se enmascara:
 *   - el segmento que sigue a un nombre que anuncia un secreto
 *     (`reset-password`, `token`, `verify`, `confirm`, `invite`, `magic-link`…);
 *   - cualquier segmento opaco de 32+ caracteres que no sea un UUID (los UUID
 *     son ids de filas y se quieren en el log).
 *   - la query string entera (el `?token=` de verificación de email).
 */

const ANUNCIAN_SECRETO = new Set([
  "reset-password",
  "token",
  "tokens",
  "verify",
  "verify-email",
  "confirm",
  "invite",
  "invites",
  "invitation",
  "magic-link",
  "unsubscribe",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function rutaParaLog(ruta: string): string {
  const [camino] = ruta.split("?");
  const conQuery = camino !== ruta;
  const segmentos = (camino ?? "").split("/");
  for (let i = 0; i < segmentos.length; i++) {
    const seg = segmentos[i]!;
    const anterior = segmentos[i - 1]?.toLowerCase();
    if (seg && anterior && ANUNCIAN_SECRETO.has(anterior)) {
      segmentos[i] = "***";
    } else if (seg.length >= 32 && !UUID.test(seg) && /^[A-Za-z0-9_.~%-]+$/.test(seg)) {
      segmentos[i] = "***";
    }
  }
  return segmentos.join("/") + (conQuery ? "?***" : "");
}

/** Para `hono/logger`: recibe la línea ya formateada (`<-- GET /ruta`). */
export function lineaDeAccesoSinSecretos(linea: string): string {
  return linea.replace(
    /(\s)(\/\S*)/g,
    (_, espacio: string, ruta: string) => espacio + rutaParaLog(ruta)
  );
}
