/**
 * Tipo REAL de un fichero subido, por su contenido
 * ============================================================================
 *
 * La subida guardaba el `Content-Type` que mandaba el cliente y el nombre que
 * él elegía (`foto.html`, `logo.svg`). Ninguno de los dos dice qué hay dentro:
 * los decide quien sube. `/media/*` sirve cada fichero con el tipo de su
 * EXTENSIÓN, así que un HTML o un SVG con `<script>` subido como «imagen» se
 * abría como página en el origen de la API.
 *
 * Aquí se mira la firma de los primeros bytes («magic bytes») y solo se
 * aceptan formatos de imagen, vídeo y PDF que no ejecutan nada. La extensión
 * con la que se guarda sale de lo DETECTADO, no del nombre original.
 *
 * SVG no se acepta: es XML y puede llevar `<script>`, `<foreignObject>` y
 * manejadores `on*`. El espejo de imágenes ya los rasteriza por lo mismo (ver
 * memoria imagenes-en-casa). Si algún día hace falta, que se rasterice al subir.
 */

export interface TipoDetectado {
  mime: string;
  extension: string;
}

const empieza = (b: Uint8Array, firma: number[], desde = 0): boolean =>
  b.length >= desde + firma.length && firma.every((x, i) => b[desde + i] === x);

const ascii = (b: Uint8Array, desde: number, largo: number): string =>
  String.fromCharCode(...b.subarray(desde, desde + largo));

/** Formatos aceptados, detectados por contenido. `null` si no es ninguno. */
export function detectarTipoReal(contenido: Uint8Array): TipoDetectado | null {
  const b = contenido;
  if (empieza(b, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", extension: "jpg" };
  if (empieza(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: "image/png", extension: "png" };
  }
  if (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a") {
    return { mime: "image/gif", extension: "gif" };
  }
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") {
    return { mime: "image/webp", extension: "webp" };
  }
  // ISO-BMFF: `....ftyp<marca>`. AVIF es imagen; el resto de marcas, vídeo MP4.
  if (b.length >= 12 && ascii(b, 4, 4) === "ftyp") {
    const marca = ascii(b, 8, 4);
    if (marca === "avif" || marca === "avis") return { mime: "image/avif", extension: "avif" };
    if (/^(isom|iso[2-9]|mp41|mp42|avc1|M4V |M4A |dash|f4v )$/.test(marca)) {
      return { mime: "video/mp4", extension: "mp4" };
    }
    return null;
  }
  if (empieza(b, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: "video/webm", extension: "webm" };
  if (ascii(b, 0, 5) === "%PDF-") return { mime: "application/pdf", extension: "pdf" };
  return null;
}

/**
 * Nombre que se GUARDA: sin rutas, sin caracteres raros y con la extensión del
 * tipo detectado. Normaliza unicode (NFKC) antes de filtrar, para que un
 * `．．／` de ancho completo no sobreviva como algo parecido a `../`.
 */
export function nombreSeguro(original: string, tipo: TipoDetectado): string {
  const base = String(original ?? "")
    .normalize("NFKC")
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[^.]*$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, 80);
  return `${base || "fichero"}.${tipo.extension}`;
}
