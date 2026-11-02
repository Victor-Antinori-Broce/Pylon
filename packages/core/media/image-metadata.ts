/**
 * Dimensiones de una imagen al subirla
 * ============================================================================
 *
 * `width` y `height` se quedaban en `null` para SIEMPRE. En el endpoint de
 * subida había un `// For now, we'll skip dimensions` y nadie volvió.
 *
 * Para qué sirven, en concreto:
 *
 *   · **Validar la imagen de Open Graph.** `validateWhatsAppImage` (kon-blog)
 *     comprueba que llegue al mínimo de 400×400 —por debajo, WhatsApp no
 *     enseña la vista previa del enlace— y recomienda 1200×630. Sus avisos
 *     restan puntos en la puntuación de SEO del post. Recibía `width` y
 *     `height` desde la fila de `media`, donde eran NULL, así que esas dos
 *     comprobaciones no podían decir nada.
 *   · **Reservarle sitio en la página publicada.** Un `<img>` sin `width` ni
 *     `height` hace que el navegador recoloque el contenido al terminar de
 *     cargar la imagen (*layout shift*). Esto es cierto de la web en general;
 *     Kitsuden NO lo mide hoy en su puntuación.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ `sharp` SE CARGA A LA DEMANDA
 *
 * `sharp` es un módulo NATIVO: se compila al instalar y falla de verdad en
 * algunas plataformas y en algunos contenedores. Declararlo como dependencia
 * dura de `@kitsuden/core` significaría que una instalación de Kitsuden pueda
 * romperse entera por no poder medir un PNG.
 *
 * Así que se importa dentro de un `try` y, si no está, las dimensiones se
 * quedan como estaban: nulas. Subir la imagen es lo importante; medirla es una
 * mejora. Degradar es la respuesta correcta.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

/** Se recuerda el fallo para no reintentar el import en cada fichero. */
let sharpNoDisponible = false;

/**
 * Mide una imagen. `null` si no se puede — nunca lanza.
 *
 * Que esto falle no puede tumbar una subida: el fichero ya está guardado
 * cuando se llama.
 */
export async function medirImagen(
  buffer: Buffer,
  mimeType: string
): Promise<ImageDimensions | null> {
  // Un PDF o un vídeo no tienen "dimensiones" que sirvan para reservar sitio,
  // y `sharp` con un MP4 delante solo gasta tiempo antes de fallar.
  if (!mimeType.startsWith("image/")) return null;

  // Los SVG no se miden: son vectoriales. Su `width` depende del `viewBox` y de
  // cómo los escale el CSS, así que un número aquí sería mentira útil para
  // nadie.
  if (mimeType === "image/svg+xml") return null;

  if (sharpNoDisponible) return null;

  try {
    const { default: sharp } = await import("sharp");
    const metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height) return null;

    /**
     * La ORIENTACIÓN EXIF manda.
     *
     * Una foto de móvil tomada en vertical se guarda apaisada con una etiqueta
     * que dice "gírala 90°". `sharp` devuelve el tamaño del píxel guardado, así
     * que sin esto una foto vertical se declara horizontal — y el hueco que se
     * le reserva en la página sale con la forma equivocada, que es peor que no
     * reservar ninguno.
     */
    const rotada = metadata.orientation !== undefined && metadata.orientation >= 5;

    return rotada
      ? { width: metadata.height, height: metadata.width }
      : { width: metadata.width, height: metadata.height };
  } catch (err) {
    // Solo se marca como no disponible si el fallo es del propio módulo. Una
    // imagen corrupta no puede desactivar la medición del resto.
    if (err instanceof Error && /Cannot find module|ERR_MODULE_NOT_FOUND/i.test(err.message)) {
      sharpNoDisponible = true;
    }
    return null;
  }
}
