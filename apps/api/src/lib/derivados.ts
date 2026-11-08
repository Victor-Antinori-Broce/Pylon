/**
 * Derivados al vuelo de `/media`: `?w=320` sirve la imagen a ESE ancho
 * ============================================================================
 *
 * ── POR QUÉ ────────────────────────────────────────────────────────────────
 *
 * Las webs pedían cada imagen a tamaño completo aunque el hueco fuera de
 * 32 px: un icono de una rejilla descargaba la cabecera entera de Steam, y la
 * portada de Valhalla pesaba 3,8 MB de imágenes (medido el 2026-11-06). El
 * pipeline de `/api/media/transform/:id` ya existe, pero trabaja por ID de la
 * biblioteca y la mayoría de las imágenes de las webs son del espejo
 * (`cartas/`, `juegos/`), que se referencia POR RUTA.
 *
 * Ahora cualquier imagen de `/media` admite `?w=<ancho>`: se genera una
 * versión redimensionada, se guarda en `.derivados/<ancho>/<clave>` y la
 * próxima vez se sirve del disco. El original nunca se toca; un ancho mayor
 * que el original devuelve el original (agrandar solo gasta bytes).
 *
 * La caché es `immutable`: la clave del espejo es hash de su origen y el
 * ancho va en la ruta del derivado, así que el contenido de una URL no cambia
 * jamás. Formato y calidad: los del original (ya vienen en webp), salvo
 * png/jpeg grandes, que salen en webp.
 */

import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { DIRECTORIO_LOCAL } from "./almacen";

const DIRECTORIO_DERIVADOS = join(DIRECTORIO_LOCAL, ".derivados");

/** Ancho pedido razonable: ni diminuto ni un agujero de memoria para sharp */
const ANCHO_MIN = 16;
const ANCHO_MAX = 2400;

const EXTENSIONES_REESCALABLES = /\.(webp|png|jpe?g|avif)$/i;

export function anchoPedido(valor: string | undefined): number | null {
  if (!valor) return null;
  const ancho = Number(valor);
  if (!Number.isInteger(ancho) || ancho < ANCHO_MIN || ancho > ANCHO_MAX) return null;
  return ancho;
}

export function esReescalable(clave: string): boolean {
  return EXTENSIONES_REESCALABLES.test(clave);
}

/** Dónde se guarda el derivado; null si el ancho no es válido */
export function rutaDeDerivado(clave: string, ancho: number): string {
  return join(DIRECTORIO_DERIVADOS, String(ancho), clave);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sharp = (entrada: string | Buffer) => any;

let _sharp: Sharp | null | undefined;

/** sharp viene como dependencia opcional del despliegue; si falta, se sirve el original */
async function cargarSharp(): Promise<Sharp | null> {
  if (_sharp !== undefined) return _sharp;
  try {
    const modulo = (await import("sharp")) as unknown as { default: Sharp };
    _sharp = modulo.default ?? (modulo as unknown as Sharp);
  } catch {
    _sharp = null;
  }
  return _sharp;
}

/**
 * Garantiza el derivado de `rutaOriginal` a `ancho` y devuelve su ruta en
 * disco; null si no se puede (sin sharp, o el original ya es más estrecho —
 * en ese caso no hay nada que ahorrar y se sirve el original de siempre).
 */
export async function garantizarDerivado(
  clave: string,
  rutaOriginal: string,
  ancho: number
): Promise<string | null> {
  const destino = rutaDeDerivado(clave, ancho);
  try {
    const ya = await stat(destino);
    if (ya.isFile() && ya.size > 0) return destino;
  } catch {
    // No estaba: se genera
  }

  const sharp = await cargarSharp();
  if (!sharp) return null;

  try {
    const { width: anchoOriginal = 0 } = await sharp(rutaOriginal).metadata();
    if (anchoOriginal > 0 && anchoOriginal <= ancho) return null;

    const imagen = sharp(rutaOriginal).resize({ width: ancho, withoutEnlargement: true });
    // png/jpeg entran mejor en webp; webp/avif se quedan en su formato
    const salida = /\.(png|jpe?g)$/i.test(clave) ? imagen.webp({ quality: 82 }) : imagen;
    const buffer = await salida.toBuffer();

    await mkdir(dirname(destino), { recursive: true });
    // Escritura atómica: un lector a mitad de generación no ve medio fichero
    const temporal = `${destino}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporal, buffer);
    await rename(temporal, destino);
    return destino;
  } catch {
    return null;
  }
}
