/**
 * Tamaño máximo del cuerpo de una petición a `/api/*`.
 * ============================================================================
 *
 * Auditoría 2026-10-15: no había `bodyLimit`, y Bun acepta hasta 128 MB por
 * petición. Cualquier ruta que haga `c.req.json()` —incluidas las públicas
 * (comentarios, búsqueda, inscripciones)— leía en memoria lo que le mandaran:
 * unas pocas peticiones concurrentes de 100 MB bastan para tumbar el proceso.
 *
 * 10 MB por defecto. Las subidas de ficheros tienen su propio límite en su kon
 * (tipo y tamaño), así que sus prefijos quedan fuera de este.
 */
import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

export const LIMITE_CUERPO_BYTES = 10 * 1024 * 1024;

/** Rutas que reciben ficheros y aplican su propio límite. */
export const PREFIJOS_CON_LIMITE_PROPIO = [
  "/api/media",
  "/api/academy/media",
  "/api/dms",
  "/api/ocr",
  "/api/ocr-training",
  "/api/datasets/import",
];

export function tieneLimitePropio(camino: string): boolean {
  return PREFIJOS_CON_LIMITE_PROPIO.some((p) => camino === p || camino.startsWith(`${p}/`));
}

export function limiteDeCuerpo(maxBytes = LIMITE_CUERPO_BYTES): MiddlewareHandler {
  const limitar = bodyLimit({
    maxSize: maxBytes,
    onError: (c) => c.json({ error: "Payload Too Large", maxBytes }, 413),
  });
  return (c, next) => (tieneLimitePropio(c.req.path) ? next() : limitar(c, next));
}
