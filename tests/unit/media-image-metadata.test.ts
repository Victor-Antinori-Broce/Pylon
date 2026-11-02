/**
 * Medir una imagen al subirla
 * ============================================================================
 *
 * `width` y `height` se quedaban en `null` para siempre: el endpoint de subida
 * llevaba un «For now, we'll skip dimensions» y nadie volvió.
 *
 * No es cosmético: `validateWhatsAppImage` (kon-blog) comprueba que la imagen
 * de Open Graph llegue a 400×400 —por debajo, WhatsApp no enseña la vista
 * previa del enlace— y sus avisos restan puntos de SEO. Recibía `width` y
 * `height` desde la fila de `media`, donde eran NULL, así que esas dos
 * comprobaciones no podían decir nada.
 *
 * Se prueba con imágenes GENERADAS, no con ficheros de ejemplo: así el test no
 * arrastra binarios al repo y la orientación EXIF —que es el caso interesante—
 * se puede construir a propósito.
 */

import sharp from "sharp";
import { describe, expect, test } from "vitest";

import { medirImagen } from "../../packages/core/media/image-metadata";

/** Un PNG liso de las medidas que se pidan. */
const png = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();

describe("medir una imagen", () => {
  test("devuelve el tamaño real", async () => {
    expect(await medirImagen(await png(800, 450), "image/png")).toEqual({
      width: 800,
      height: 450,
    });
  });

  test("funciona con JPEG y con WebP, no solo con PNG", async () => {
    const jpeg = await sharp(await png(200, 100))
      .jpeg()
      .toBuffer();
    const webp = await sharp(await png(120, 240))
      .webp()
      .toBuffer();

    expect(await medirImagen(jpeg, "image/jpeg")).toEqual({ width: 200, height: 100 });
    expect(await medirImagen(webp, "image/webp")).toEqual({ width: 120, height: 240 });
  });

  test("LA ORIENTACIÓN EXIF manda: una foto vertical se declara vertical", async () => {
    // Es el caso que de verdad importa. Una foto de móvil en vertical se
    // GUARDA apaisada con una etiqueta que dice «gírala 90°». Sin mirarla, se
    // declara horizontal y el hueco que se le reserva en la página sale con la
    // forma equivocada — peor que no reservar ninguno.
    const apaisadaConEtiqueta = await sharp(await png(400, 300))
      .withMetadata({ orientation: 6 }) // 6 = girar 90° a la derecha
      .jpeg()
      .toBuffer();

    expect(await medirImagen(apaisadaConEtiqueta, "image/jpeg")).toEqual({
      width: 300,
      height: 400,
    });
  });

  test("una orientación que NO gira no toca las medidas", async () => {
    // 1..4 son volteos y rotaciones de 180°: el ancho sigue siendo el ancho.
    const volteada = await sharp(await png(400, 300))
      .withMetadata({ orientation: 2 })
      .jpeg()
      .toBuffer();

    expect(await medirImagen(volteada, "image/jpeg")).toEqual({ width: 400, height: 300 });
  });
});

describe("lo que NO se mide", () => {
  test("un SVG no tiene tamaño en píxeles que signifique nada", async () => {
    // Es vectorial: su tamaño depende del `viewBox` y de cómo lo escale el CSS.
    // Un número aquí sería una mentira que no le sirve a nadie.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    expect(await medirImagen(svg, "image/svg+xml")).toBeNull();
  });

  test("un PDF o un vídeo se descartan sin abrirlos", async () => {
    expect(await medirImagen(Buffer.from("%PDF-1.4"), "application/pdf")).toBeNull();
    expect(await medirImagen(Buffer.from("ftypmp42"), "video/mp4")).toBeNull();
  });
});

describe("cuando falla, NO se lleva por delante la subida", () => {
  test("un fichero corrupto devuelve null en vez de lanzar", async () => {
    // Se llama DESPUÉS de guardar: el fichero ya está a salvo. Que la medición
    // reventara aquí convertiría una subida buena en un 500.
    expect(await medirImagen(Buffer.from("esto no es una imagen"), "image/png")).toBeNull();
  });

  test("un buffer vacío tampoco lanza", async () => {
    expect(await medirImagen(Buffer.alloc(0), "image/jpeg")).toBeNull();
  });

  test("una imagen corrupta NO desactiva la medición de las siguientes", async () => {
    // El módulo recuerda si `sharp` no está disponible para no reintentar el
    // import en cada fichero; eso NO puede confundirse con un fichero malo.
    await medirImagen(Buffer.from("basura"), "image/png");
    expect(await medirImagen(await png(64, 64), "image/png")).toEqual({ width: 64, height: 64 });
  });
});
