/**
 * Kitsuden — Leer ficheros igual bajo Bun y bajo Node 22+ (kitsuden2.md G4)
 * ============================================================================
 *
 * La API usaba `Bun.file()` en una veintena de sitios, y eso la ataba a Bun:
 * bajo Node, el primer acceso lanzaba `Bun is not defined`. `fichero()` da la
 * misma forma (lo que se usaba: `exists`, `text`, `json`, `lastModified`):
 * bajo Bun ES `Bun.file` (rápido, sin copia); bajo Node, `node:fs`.
 *
 * Para servir un fichero como cuerpo de una `Response`, `cuerpoDeFichero()`:
 * bajo Bun el `BunFile` (Bun pone el tipo y lo manda sin copiar); bajo Node un
 * `ReadableStream` y el tipo por la extensión.
 */

import { createReadStream, statSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";

export interface Fichero {
  exists(): Promise<boolean>;
  text(): Promise<string>;
  // `any` como `BunFile.json()`: quien llama ya trataba el resultado así.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json<T = any>(): Promise<T>;
  /** Milisegundos desde 1970 (0 si no existe). */
  readonly lastModified: number;
}

type CuerpoDeRespuesta = ConstructorParameters<typeof Response>[0];

const BunGlobal = (globalThis as { Bun?: { file(ruta: string): unknown } }).Bun;

export function fichero(ruta: string): Fichero {
  if (BunGlobal) return BunGlobal.file(ruta) as Fichero;
  return {
    async exists() {
      try {
        return (await stat(ruta)).isFile();
      } catch {
        return false;
      }
    },
    text: () => readFile(ruta, "utf8"),
    async json<T>() {
      return JSON.parse(await readFile(ruta, "utf8")) as T;
    },
    get lastModified() {
      try {
        return statSync(ruta).mtimeMs;
      } catch {
        return 0;
      }
    },
  };
}

const TIPOS: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

/** El cuerpo para `new Response(...)` y, bajo Node, el tipo (Bun lo pone solo). */
export function cuerpoDeFichero(ruta: string): { cuerpo: CuerpoDeRespuesta; tipo: string | null } {
  if (BunGlobal) return { cuerpo: BunGlobal.file(ruta) as CuerpoDeRespuesta, tipo: null };
  return {
    cuerpo: Readable.toWeb(createReadStream(ruta)) as unknown as CuerpoDeRespuesta,
    tipo: TIPOS[extname(ruta).toLowerCase()] ?? "application/octet-stream",
  };
}
