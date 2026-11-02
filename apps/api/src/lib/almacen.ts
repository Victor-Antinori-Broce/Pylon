/**
 * Almacenamiento de ficheros: guardar, borrar y servir
 * ============================================================================
 *
 * ── POR QUÉ EXISTE ESTE FICHERO ────────────────────────────────────────────
 *
 * Porque subir un fichero no funcionaba. Nunca.
 *
 * El cargador de kons inyectaba un `ctx.storage` que era un esqueleto:
 * `getSignedUploadUrl` devolvía la cadena vacía y `delete` no hacía nada. La
 * ruta de subida pedía esa URL y hacía `fetch("")`, así que toda subida moría
 * con
 *
 *     fetch() URL must not be a blank string.
 *
 * y el endpoint respondía 207 con `success: false` por fichero — un código de
 * "éxito parcial" que no llama la atención de nadie.
 *
 * Las implementaciones de verdad existían en `packages/core/media/
 * storage.adapter.ts`, pero **nadie llamaba a `createStorageAdapter`**: código
 * completo, probado y desconectado.
 *
 * ── LOS DOS MODOS ──────────────────────────────────────────────────────────
 *
 * `DEFAULT_STORAGE_PROVIDER` decide, y por defecto es `local`:
 *
 *   · `local`   — disco del contenedor, bajo `uploads/`. No necesita nada más.
 *                 Los ficheros los sirve la propia API en `/uploads/...`.
 *   · `s3`/`minio` — bucket S3. Requiere `S3_ACCESS_KEY` y `S3_SECRET_KEY`, y
 *                 que el servicio esté levantado. Con docker-compose eso
 *                 significa activar el perfil: `COMPOSE_PROFILES=s3`.
 *
 * El modo local existe para que una instalación funcione sin infraestructura
 * añadida. No es apto para varias réplicas: cada una tendría su propio disco y
 * un fichero subido en una no se vería desde otra.
 */

import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";

/**
 * `./storage` se carga con `await import()`, NO estaticamente.
 *
 * Ese modulo importa el SDK de AWS en su nivel superior, y este fichero lo usa
 * el cargador de kons — asi que un import estatico arrastraba el SDK entero a
 * cualquier cosa que tocara un kon, tests incluidos. Se noto de golpe: siete
 * ficheros de prueba pasaron a agotar el hook de 60 s que antes tardaba
 * segundos.
 *
 * Con disco local el SDK no hace falta para nada, que es justo lo que decia el
 * comentario de `storage.adapter.ts` y aqui se habia perdido.
 */
async function s3() {
  return import("./storage");
}

/** Proveedor efectivo. Se lee una vez: cambiarlo en caliente no tendría sentido. */
const PROVEEDOR = (process.env.DEFAULT_STORAGE_PROVIDER || "local").toLowerCase();

export const usaS3 = ["s3", "minio"].includes(PROVEEDOR);

/**
 * Carpeta base del modo local.
 *
 * La variable se llama `STORAGE_LOCAL_PATH` porque es la que ya estaba en
 * `docker-compose.yml`; inventarse un nombre nuevo habria dejado dos.
 *
 * Apunta a `/app/data` y no a `/app/uploads` para no duplicar el prefijo: las
 * claves ya empiezan por `uploads/`, asi que con base `/app/uploads` los
 * ficheros acababan en `/app/uploads/uploads/...`. El prefijo se conserva
 * porque en S3 es una carpeta del bucket con sentido.
 *
 * Sin `STORAGE_LOCAL_PATH` cae a `data/` relativo al directorio de trabajo, que
 * sirve para desarrollo.
 */
export const DIRECTORIO_LOCAL = resolve(process.env.STORAGE_LOCAL_PATH || "data");

/**
 * Base publica del modo local. La sirve la propia API.
 *
 * Se exporta para que la ruta que sirve los ficheros se derive de aqui en vez
 * de llevar el prefijo escrito a mano: si divergieran, las URLs guardadas en la
 * base apuntarian a una ruta que nadie atiende — y esas URLs quedan escritas en
 * cada fila, asi que el fallo sobrevive a corregir la configuracion.
 */
export const BASE_URL_LOCAL = (process.env.STORAGE_LOCAL_URL || "/media").replace(/\/$/, "");
const URL_LOCAL = BASE_URL_LOCAL;

/**
 * Convierte una clave en ruta de disco, sin permitir salir del directorio.
 *
 * La clave viene de un nombre de fichero que sube el usuario. Sin esta
 * comprobación, una clave con `..` escribiría donde quisiera dentro del
 * contenedor: `uploads/../../etc/algo` es una ruta perfectamente válida para
 * `join`, y el resultado no tendría nada que ver con `uploads/`.
 */
export function rutaLocalDe(clave: string): string {
  const destino = resolve(join(DIRECTORIO_LOCAL, normalize(clave)));

  if (destino !== DIRECTORIO_LOCAL && !destino.startsWith(DIRECTORIO_LOCAL + sep)) {
    throw new Error(`Clave de almacenamiento fuera del directorio permitido: ${clave}`);
  }
  return destino;
}

/**
 * Cuánto puede guardarse en caché un fichero servido desde `/media`.
 *
 * Hasta ahora, ninguno: salían sin `Cache-Control`, así que el navegador los
 * volvía a pedir en cada visita. Una rejilla de cien cartas eran cien descargas
 * completas a la API por página vista, y un CDN delante no habría ayudado —
 * sin la cabecera tampoco sabe que puede guardarlas.
 *
 * Solo dos prefijos se marcan `immutable`, porque solo en ellos una clave NUNCA
 * cambia de contenido:
 *
 *   · `cartas/` y `juegos/` — el espejo las nombra por hash de su origen; una
 *     ilustración nueva es una clave nueva.
 *   · `uploads/` — el panel les pone la hora delante (`uploads/<ms>_<nombre>`):
 *     reemplazar una imagen sube OTRO fichero, no pisa el anterior.
 *
 * Lo demás (la prueba de salud, lo que se añada sin esa garantía) se cachea
 * una hora: lo bastante para aliviar la API y poco para que un cambio tarde en
 * verse.
 */
export function cacheDeMedio(clave: string): string {
  return /^(cartas|juegos|uploads)\//.test(clave)
    ? "public, max-age=31536000, immutable"
    : "public, max-age=3600";
}

export interface ObjetoGuardado {
  clave: string;
  url: string;
  bytes: number;
}

/**
 * Guarda un objeto y devuelve dónde quedó.
 *
 * Sustituye al baile de "pedir URL firmada y hacer PUT", que solo tiene sentido
 * cuando el cliente sube directamente al bucket. Aquí el fichero ya está en el
 * proceso: pedirse una URL a sí mismo para reenviárselo era una vuelta de más
 * que además no existía en modo local.
 */
export async function guardarObjeto(
  clave: string,
  contenido: Buffer,
  tipoMime: string
): Promise<ObjetoGuardado> {
  if (usaS3) {
    const { uploadBuffer } = await s3();
    const r = await uploadBuffer(contenido, clave, tipoMime);
    return { clave: r.s3Key, url: r.url, bytes: r.size };
  }

  const destino = rutaLocalDe(clave);
  await mkdir(dirname(destino), { recursive: true });
  await writeFile(destino, contenido);

  return {
    clave,
    url: `${URL_LOCAL.replace(/\/$/, "")}/${clave.replace(/^\/+/, "")}`,
    bytes: contenido.length,
  };
}

/**
 * Borra un objeto. Que no exista NO es un error.
 *
 * Borrar es lo que se hace al eliminar una ficha de medios, y esa operación no
 * puede fallar porque el fichero ya no esté: dejaría la fila en la base y el
 * usuario reintentando para siempre.
 */
export async function borrarObjeto(clave: string): Promise<void> {
  if (usaS3) {
    const { deleteFile } = await s3();
    await deleteFile(clave);
    return;
  }

  try {
    await unlink(rutaLocalDe(clave));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/**
 * Lee un objeto entero. `null` si no existe (no es un error: quien pregunta
 * suele querer saber justo eso, p. ej. si una transformación ya está hecha).
 *
 * Existe porque la única forma de leer era `getSignedDownloadUrl` + `fetch`, y
 * en modo local esa URL es una ruta relativa (`/media/...`) que no se puede
 * pedir desde el servidor ni dice si el fichero existe.
 */
export async function leerObjeto(clave: string): Promise<Buffer | null> {
  if (usaS3) {
    const { getFileBuffer } = await s3();
    return getFileBuffer(clave);
  }
  try {
    return await readFile(rutaLocalDe(clave));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Claves de todos los objetos que empiezan por `prefijo`.
 *
 * En local el prefijo se trata como carpeta (`transforms/<id>/`), que es como
 * lo usan las claves de la API; se recorre entera y se devuelven las claves
 * con `/`, igual que en S3. Una carpeta que no existe es una lista vacía. El
 * prefijo pasa por `rutaLocalDe`: con `..` lanza en vez de listar fuera.
 */
export async function listarObjetos(prefijo: string): Promise<string[]> {
  if (usaS3) {
    const { listKeys } = await s3();
    return listKeys(prefijo);
  }

  const base = rutaLocalDe(prefijo);
  const claves: string[] = [];
  const recorrer = async (dir: string): Promise<void> => {
    let entradas;
    try {
      entradas = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    for (const e of entradas) {
      const ruta = join(dir, e.name);
      if (e.isDirectory()) await recorrer(ruta);
      else if (e.isFile()) claves.push(relative(DIRECTORIO_LOCAL, ruta).split(sep).join("/"));
    }
  };
  await recorrer(base);
  return claves.sort();
}

/**
 * URL publica de un objeto ya guardado.
 *
 * Es SINCRONA, asi que no puede esperar al import perezoso del SDK: las dos
 * constantes se leen del entorno, que es de donde las saca `storage.ts`. Los
 * valores por defecto se repiten a proposito para que coincidan con los de alli.
 */
export function urlPublicaDe(clave: string): string {
  const limpia = clave.replace(/^\/+/, "");
  if (!usaS3) return `${URL_LOCAL}/${limpia}`;

  const publica = (process.env.S3_PUBLIC_URL || "http://localhost:9000").replace(/\/$/, "");
  const bucket = process.env.S3_BUCKET || "kitsuden-media";
  return `${publica}/${bucket}/${limpia}`;
}

export interface EstadoAlmacen {
  proveedor: string;
  ok: boolean;
  detalle: string;
}

/**
 * Comprueba que el almacenamiento responde. Para el healthcheck profundo.
 *
 * No lo comprobaba nadie, y ese es justo el fallo que se cuela: el contenedor
 * se declara sano mientras cada subida falla. Escribe y borra un objeto de
 * prueba, que es la única forma de saber que funciona de verdad — que el bucket
 * exista no dice si podemos escribir en él.
 */
export async function comprobarAlmacen(): Promise<EstadoAlmacen> {
  const clave = "_salud/comprobacion.txt";
  try {
    await guardarObjeto(clave, Buffer.from("ok"), "text/plain");
    await borrarObjeto(clave);
    return {
      proveedor: PROVEEDOR,
      ok: true,
      detalle: usaS3 ? `bucket ${process.env.S3_BUCKET || "kitsuden-media"}` : DIRECTORIO_LOCAL,
    };
  } catch (err) {
    return {
      proveedor: PROVEEDOR,
      ok: false,
      detalle: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Cabecera CSP para todo lo que sale de `/media`: sin scripts, sin
 * formularios, en un origen opaco (`sandbox`). Las imágenes y vídeos
 * incrustados desde las webs no se ven afectados.
 */
export const CSP_DE_MEDIOS =
  "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox";
