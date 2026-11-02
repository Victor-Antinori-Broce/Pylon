/**
 * Direcciones del sitio público: todo en ruta, juegos en /<juego>/
 * ============================================================================
 *
 * Estas funciones las usan kon-games al crear el juego, kon-wiki al crear la
 * wiki y el frontend al servirlos, y por eso viven en `@kitsuden/shared`.
 * Desde el 2026-09-21 no hay subdominios: la wiki es `/<juego>/wiki/` y su
 * slug es solo su nombre en la API.
 */

import { describe, expect, it } from "vitest";

import {
  motivoDeSlugDeJuegoInvalido,
  motivoDeSlugDeWikiInvalido,
  slugDeJuego,
  leerSegmentosReservados,
  nombreDelSitioEfectivo,
  SEGMENTOS_RESERVADOS_DEL_SITIO,
  URL_PUBLICA_POR_DEFECTO,
  urlPublicaEfectiva,
} from "../../packages/shared/src/sitio-publico";
import * as compartido from "../../packages/shared/src/sitio-publico";

describe("el slug de una wiki", () => {
  it("acepta un slug normal", () => {
    expect(motivoDeSlugDeWikiInvalido("throne-and-liberty")).toBeNull();
    expect(motivoDeSlugDeWikiInvalido("d4")).toBeNull();
  });

  it("rechaza lo mal formado y dice por qué", () => {
    expect(motivoDeSlugDeWikiInvalido("")).toMatch(/vacío/);
    expect(motivoDeSlugDeWikiInvalido("-armas")).toMatch(/guion/);
    expect(motivoDeSlugDeWikiInvalido("armas--extra")).toMatch(/guion/);
    expect(motivoDeSlugDeWikiInvalido("Armas")).toMatch(/minúsculas/);
    expect(motivoDeSlugDeWikiInvalido("a.b")).toMatch(/minúsculas/);
    expect(motivoDeSlugDeWikiInvalido("a".repeat(64))).toMatch(/63/);
  });

  it("ya no hay reglas de subdominio: ni reservados ni URL de wiki", () => {
    // Una wiki se llama como quiera: su dirección sale de su JUEGO
    expect(motivoDeSlugDeWikiInvalido("admin")).toBeNull();
    for (const quitada of [
      "urlDeWiki",
      "etiquetaDeWikiDesdeHost",
      "SUBDOMINIOS_RESERVADOS",
      "seccionDesdeHost",
      "urlDeSeccion",
    ]) {
      expect(quitada in compartido, quitada).toBe(false);
    }
  });
});

describe("juegos en /<juego>/", () => {
  it("un juego no puede llamarse como una ruta del sitio", () => {
    /**
     * Las rutas fijas ganan: un juego `blog` no daría error, simplemente nadie
     * llegaría a él nunca.
     */
    for (const ruta of ["blog", "games", "api", "data", "wiki", "img", "media", "legal"]) {
      expect(motivoDeSlugDeJuegoInvalido(ruta)).toMatch(/ruta del sitio/);
    }
  });

  it("las rutas propias de UN sitio no están en el núcleo: se pasan (KITSUDEN_SEGMENTOS_RESERVADOS)", () => {
    // Antes la lista común llevaba las secciones de las webs del propietario
    // (todogachas, tcg, gremio…): en cualquier otra instalación eran slugs
    // prohibidos sin motivo.
    for (const propia of [
      "todogachas",
      "gachas",
      "tcg",
      "cardback",
      "gremio",
      "esports",
      "torneos",
    ]) {
      expect(SEGMENTOS_RESERVADOS_DEL_SITIO.has(propia), propia).toBe(false);
      expect(motivoDeSlugDeJuegoInvalido(propia)).toBeNull();
    }
    const propios = leerSegmentosReservados(" Torneos, tienda ,,");
    expect([...propios]).toEqual(["torneos", "tienda"]);
    expect(motivoDeSlugDeJuegoInvalido("torneos", propios)).toMatch(/ruta del sitio/);
    expect(motivoDeSlugDeJuegoInvalido("throne-and-liberty", propios)).toBeNull();
    expect(leerSegmentosReservados(undefined).size).toBe(0);
  });

  it("las rutas internas de los subdominios ya no están reservadas: ya no existen", () => {
    expect(SEGMENTOS_RESERVADOS_DEL_SITIO.has("wiki-host")).toBe(false);
    expect(SEGMENTOS_RESERVADOS_DEL_SITIO.has("esports-host")).toBe(false);
  });

  it("acepta un slug normal y rechaza los mal formados", () => {
    expect(motivoDeSlugDeJuegoInvalido("throne-and-liberty")).toBeNull();
    expect(motivoDeSlugDeJuegoInvalido("-throne")).toMatch(/guiones/);
    expect(motivoDeSlugDeJuegoInvalido("throne--liberty")).toMatch(/guiones/);
    expect(motivoDeSlugDeJuegoInvalido("Throne")).toMatch(/minúsculas/);
  });

  it("el slug automático no deja guiones sueltos ni borra las tildes", () => {
    // El anterior daba `-pok-mon-` para «¡Pokémon!»
    expect(slugDeJuego("¡Pokémon!")).toBe("pokemon");
    expect(slugDeJuego("Baldur's Gate 3")).toBe("baldurs-gate-3");
    expect(motivoDeSlugDeJuegoInvalido(slugDeJuego("  Throne and Liberty  "))).toBeNull();
  });
});

describe("qué URL pública manda: panel, entorno o desarrollo", () => {
  it("el panel manda cuando alguien la escribió", () => {
    expect(urlPublicaEfectiva("https://kitsuden.gg", "https://otro.gg")).toBe(
      "https://kitsuden.gg"
    );
  });

  it("el valor por defecto de la columna NO cuenta como elegido", () => {
    /**
     * La columna nace con localhost:4321 en todas las bases. Si ganara, un
     * despliegue con SITE_URL bien puesto anunciaría el sitio en localhost.
     */
    expect(urlPublicaEfectiva(URL_PUBLICA_POR_DEFECTO, "https://kitsuden.gg")).toBe(
      "https://kitsuden.gg"
    );
  });

  it("un panel vacío o mal escrito cae al entorno", () => {
    expect(urlPublicaEfectiva("", "https://kitsuden.gg")).toBe("https://kitsuden.gg");
    expect(urlPublicaEfectiva("kitsuden punto gg", "https://kitsuden.gg")).toBe(
      "https://kitsuden.gg"
    );
    expect(urlPublicaEfectiva("javascript:alert(1)", "https://kitsuden.gg")).toBe(
      "https://kitsuden.gg"
    );
  });

  it("sin nada útil en ningún lado, la de desarrollo", () => {
    expect(urlPublicaEfectiva(null, undefined)).toBe(URL_PUBLICA_POR_DEFECTO);
  });

  it("quita la barra final para no generar `//blog`", () => {
    expect(urlPublicaEfectiva("https://kitsuden.gg/", null)).toBe("https://kitsuden.gg");
  });
});

describe("nombre del sitio público", () => {
  it("el del panel manda cuando alguien lo escribió", () => {
    expect(nombreDelSitioEfectivo("Mi sitio", "Otro")).toBe("Mi sitio");
  });

  it("el nombre del CMS no cuenta como elegido", () => {
    // Un sitio recién instalado no puede presentarse como «Kitsuden»
    expect(nombreDelSitioEfectivo("Kitsuden", "Mi sitio")).toBe("Mi sitio");
    expect(nombreDelSitioEfectivo("Kitsuden CMS", "Mi sitio")).toBe("Mi sitio");
  });

  it("vacío o solo espacios cae al del despliegue", () => {
    expect(nombreDelSitioEfectivo("   ", "Mi sitio")).toBe("Mi sitio");
    expect(nombreDelSitioEfectivo(null, undefined)).toBe("Kitsuden");
  });
});
