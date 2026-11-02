/**
 * Pegar un enlace de YouTube tiene que funcionar
 * ============================================================================
 *
 * ── EL FALLO, MEDIDO ───────────────────────────────────────────────────────
 *
 * Un enlace normal de YouTube NO se puede meter en un `<iframe>`. Comprobado
 * con `curl` contra YouTube:
 *
 *     GET https://www.youtube.com/watch?v=…   →  X-Frame-Options: SAMEORIGIN
 *     GET https://www.youtube.com/embed/…     →  (sin X-Frame-Options)
 *
 * Y el bloque «Embed» pedía exactamente la forma que no sirve: su marcador de
 * posición decía `https://youtube.com/watch?v=...`.
 *
 * Resultado: pegabas el enlace, el bloque se guardaba sin una queja, y en la
 * página salía un MARCO EN BLANCO. Es el peor modo de fallo posible — todo
 * parece correcto menos el resultado.
 *
 * ── POR QUE SE NORMALIZA AL RENDERIZAR ─────────────────────────────────────
 *
 * Y no en el editor: así los bloques YA GUARDADOS con la URL mala empiezan a
 * funcionar sin tocarlos uno por uno.
 */

import { describe, expect, it } from "vitest";

import { renderizarBloques, urlDeIncrustacion } from "@kitsuden/shared";

const ID = "dQw4w9WgXcQ";

describe("URLs de YouTube que la gente pega de verdad", () => {
  const casos: Array<[string, string]> = [
    // La de la barra del navegador — la que no se puede incrustar.
    [`https://www.youtube.com/watch?v=${ID}`, `https://www.youtube.com/embed/${ID}`],
    // La del botón «Compartir».
    [`https://youtu.be/${ID}`, `https://www.youtube.com/embed/${ID}`],
    // Sin `www`.
    [`https://youtube.com/watch?v=${ID}`, `https://www.youtube.com/embed/${ID}`],
    // Móvil.
    [`https://m.youtube.com/watch?v=${ID}`, `https://www.youtube.com/embed/${ID}`],
    // Shorts.
    [`https://www.youtube.com/shorts/${ID}`, `https://www.youtube.com/embed/${ID}`],
    // Directos.
    [`https://www.youtube.com/live/${ID}`, `https://www.youtube.com/embed/${ID}`],
    // La que ya era correcta: no se toca.
    [`https://www.youtube.com/embed/${ID}`, `https://www.youtube.com/embed/${ID}`],
  ];

  for (const [entrada, esperado] of casos) {
    it(entrada, () => {
      expect(urlDeIncrustacion(entrada)).toBe(esperado);
    });
  }

  it("conserva la marca de tiempo en sus tres formas", () => {
    /**
     * `t=90`, `t=1m30s` y `t=1h2m3s` salen las tres de YouTube según dónde
     * pulses «compartir». Quien pega un enlace con minuto espera que empiece
     * ahí; perderlo por el camino es perder la intención sin avisar.
     */
    expect(urlDeIncrustacion(`https://youtu.be/${ID}?t=90`)).toBe(
      `https://www.youtube.com/embed/${ID}?start=90`
    );
    expect(urlDeIncrustacion(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)).toBe(
      `https://www.youtube.com/embed/${ID}?start=90`
    );
    expect(urlDeIncrustacion(`https://www.youtube.com/watch?v=${ID}&t=1h2m3s`)).toBe(
      `https://www.youtube.com/embed/${ID}?start=3723`
    );
  });

  it("respeta el dominio sin cookies si lo pusiste tú", () => {
    /**
     * Quien escribe `youtube-nocookie` lo hace a propósito —privacidad, avisos
     * de cookies—. Cambiárselo por el dominio normal sería deshacer una
     * decisión suya en silencio.
     */
    expect(urlDeIncrustacion(`https://www.youtube-nocookie.com/embed/${ID}`)).toBe(
      `https://www.youtube-nocookie.com/embed/${ID}`
    );
  });
});

describe("otras plataformas", () => {
  it("Vimeo pasa a su reproductor", () => {
    expect(urlDeIncrustacion("https://vimeo.com/123456789")).toBe(
      "https://player.vimeo.com/video/123456789"
    );
  });

  it("lo que no se reconoce se deja intacto", () => {
    /**
     * Hay servicios que sí admiten su URL normal en un iframe. Adivinar de más
     * rompería los que hoy funcionan.
     */
    expect(urlDeIncrustacion("https://ejemplo.test/algo")).toBe("https://ejemplo.test/algo");
  });

  it("sigue sin dejar pasar un `javascript:`", () => {
    /**
     * La normalización se apoya en `urlSegura`, así que no abre un agujero
     * nuevo por la puerta de atrás.
     */
    expect(urlDeIncrustacion("javascript:alert(1)")).toBe("");
    expect(urlDeIncrustacion("data:text/html,<script>alert(1)</script>")).toBe("");
  });
});

describe("el bloque completo", () => {
  it("un enlace pegado de la barra produce un iframe que sí carga", () => {
    const { html } = renderizarBloques([
      {
        id: "1",
        type: "embed",
        order: 0,
        data: {
          url: `https://www.youtube.com/watch?v=${ID}`,
          caption: "Un vídeo",
          aspectRatio: "16:9",
        },
      },
    ]);

    expect(html).toContain(`src="https://www.youtube.com/embed/${ID}"`);
    expect(
      html,
      "la URL de /watch no puede llegar al iframe: YouTube la rechaza con " +
        "X-Frame-Options y sale un marco en blanco"
    ).not.toContain("watch?v=");
    expect(html).toContain("<figcaption>Un vídeo</figcaption>");
  });
});
