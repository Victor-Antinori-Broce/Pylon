/**
 * Cuánto se cachea cada fichero de `/media`
 * ============================================================================
 *
 * Se servían sin `Cache-Control`: cada visita volvía a descargar cada carta. La
 * caché larga solo es segura donde una clave NUNCA cambia de contenido, y
 * equivocarse al revés —marcar `immutable` algo que sí se sobrescribe— haría
 * que un cambio no se viera nunca en el navegador de quien ya lo tenía.
 */
import { describe, expect, it } from "vitest";

import { cacheDeMedio } from "../../apps/api/src/lib/almacen";

describe("la caché de los medios", () => {
  it("las cartas del espejo son inmutables: su clave es el hash de su origen", () => {
    expect(cacheDeMedio("cartas/ygoprodeck/0a1b2c3d4e5f60718293.webp")).toContain("immutable");
    expect(cacheDeMedio("cartas/ygoprodeck/0a1b2c3d4e5f60718293.webp")).toContain(
      "max-age=31536000"
    );
  });

  it("las imágenes y vídeos de los demás juegos, igual: mismo espejo, misma clave por hash", () => {
    expect(cacheDeMedio("juegos/enka/0a1b2c3d4e5f60718293.webp")).toContain("immutable");
    expect(cacheDeMedio("juegos/aniimo/0a1b2c3d4e5f60718293.mp4")).toContain("immutable");
  });

  it("las subidas del panel también: llevan la hora delante y no se pisan", () => {
    expect(cacheDeMedio("uploads/1789927732748_portada.webp")).toContain("immutable");
  });

  it("lo demás se cachea poco y NUNCA como inmutable", () => {
    expect(cacheDeMedio("_salud/comprobacion.txt")).toBe("public, max-age=3600");
    expect(cacheDeMedio("otra-cosa/fichero.png")).not.toContain("immutable");
  });

  it("un prefijo parecido no cuela", () => {
    // «cartas-viejas/» no es «cartas/»: no tiene la garantía del hash
    expect(cacheDeMedio("cartas-viejas/x.webp")).not.toContain("immutable");
    expect(cacheDeMedio("mis-uploads/x.webp")).not.toContain("immutable");
    expect(cacheDeMedio("juegos-viejos/x.webp")).not.toContain("immutable");
  });
});
