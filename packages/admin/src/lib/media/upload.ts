/**
 * Subir ficheros a la biblioteca
 * ============================================================================
 *
 * Una sola función para todo el admin. Existía escrita tres veces —en el editor
 * del blog, en la vista de Media y en el formulario de datasets— y las tres
 * hacían cosas distintas:
 *
 *   · El editor del blog subía bien, pero luego RECARGABA la biblioteca entera
 *     para encontrar por `id` lo que acababa de subir, porque la respuesta no
 *     traía la URL.
 *   · El formulario de datasets mandaba el campo con el nombre equivocado
 *     (`file` donde el API lee `files`) y leía `data.url`, que nunca existió.
 *     Estaba roto de las dos formas a la vez.
 *
 * Ahora el endpoint devuelve la URL y aquí se normaliza el resultado, así que
 * quien sube recibe directamente lo que necesita para pintarlo o insertarlo.
 */

import { api } from "$lib/api";

export interface MedioSubido {
  id: string;
  url: string;
  filename: string;
  width?: number;
  height?: number;
}

export interface ResultadoSubida {
  subidos: MedioSubido[];
  /**
   * Fallos, ya con nombre de fichero y motivo.
   *
   * «Error al subir» a secas no dice si el problema es el tamaño, el formato o
   * el disco, que son tres acciones distintas para quien lo lee.
   */
  errores: string[];
}

/**
 * Sube y devuelve lo que quedó guardado.
 *
 * **Nunca lanza por un fichero malo.** El endpoint responde 207 cuando unos
 * entran y otros no, así que aquí un fallo parcial es un resultado normal con
 * su lista de errores — y quien llama decide si eso es grave. Solo un fallo de
 * red o de sesión sale como excepción.
 */
export async function subirMedios(
  ficheros: FileList | File[] | null | undefined
): Promise<ResultadoSubida> {
  const lista = ficheros ? Array.from(ficheros) : [];
  if (lista.length === 0) return { subidos: [], errores: [] };

  const respuesta = await api.uploadMedia(lista);

  const subidos: MedioSubido[] = [];
  const errores: string[] = [];

  for (const fichero of respuesta.files) {
    if (!fichero.success) {
      errores.push(`${fichero.filename}: ${fichero.error ?? "falló"}`);
      continue;
    }
    // Sin `id` o sin `url` no hay nada que insertar ni que guardar en un campo.
    // Se cuenta como error en vez de colarse como un hueco silencioso.
    if (!fichero.id || !fichero.url) {
      errores.push(`${fichero.filename}: el servidor no devolvió la imagen guardada`);
      continue;
    }
    subidos.push({
      id: fichero.id,
      url: fichero.url,
      filename: fichero.filename,
      width: fichero.width,
      height: fichero.height,
    });
  }

  return { subidos, errores };
}

/** Solo las imágenes de un portapapeles o de un arrastre. */
export function imagenesDe(datos: DataTransfer | null): File[] {
  if (!datos) return [];
  return Array.from(datos.files).filter((f) => f.type.startsWith("image/"));
}
