/**
 * La navegación de una página de juego: barra de abajo, desplegables y hub
 * ============================================================================
 *
 * Tres mejoras que el propietario aprobó mirando referencias de diseño
 * (2026-11-06), y lo que cada una puede romper sin que nada falle:
 *
 * **La barra de abajo del móvil** (`BottomNav` de tallao, DESIGNRULES §13.8).
 * Como mucho cinco destinos, solo por debajo de `md`, pintada en el servidor.
 * Lo que se rompe: un destino a una página vacía (las guías de un juego sin
 * entradas, §8.2), una barra que aparece en el escritorio, y el final de la
 * página o el aviso de cookies quedando debajo de ella.
 *
 * **Los desplegables de la barra** (`NavMenu`, §8.16). Icono y una línea por
 * entrada. Lo que se rompe: la línea que cuenta de dónde salen los datos
 * (el renglón del editor dice «de la wiki oficial», §6.6), un panel que vuelve
 * a ensanchar la página cerrado (§13.6), y el cierre al pulsar fuera.
 *
 * **El hub en bento** (§4.5). La sección principal, grande. Lo que se rompe:
 * que la grande no sea la principal, o que el móvil cambie.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ENTRADAS_POR_COLUMNA,
  MAXIMO_DE_DESTINOS,
  descripcionDeHerramienta,
  descripcionDeTabla,
  destinosDeBarraInferior,
  gruposDelMenu,
  seccionPrincipal,
} from "../../packages/starters/kitsuden-blog-template/src/lib/navegacion-de-juego";
import { HERRAMIENTAS, type HerramientaDeJuego } from "../../packages/starters/kitsuden-blog-template/src/lib/game-hub";
import { textos } from "../../packages/starters/kitsuden-blog-template/src/lib/textos";
import * as JUEGO from "../../packages/starters/kitsuden-blog-template/src/lib/textos/juego";

const SITIO = join(__dirname, "..", "..", "packages", "starters", "kitsuden-blog-template", "src");
const lee = (...partes: string[]) => readFileSync(join(SITIO, ...partes), "utf-8");

const h = (id: string, grupo: HerramientaDeJuego["grupo"], etiqueta = id, extra: Partial<HerramientaDeJuego> = {}): HerramientaDeJuego => ({
  id,
  etiqueta,
  icono: "grid",
  href: `/juego/${id}`,
  grupo,
  datasetId: null,
  hijos: [],
  ...extra,
});

const T = { inicio: "Inicio", indice: "Índice", guiasDelJuego: "Guías", wiki: "Wiki", datos: "Datos" };

/** Un gacha completo: índice, tier list, base de datos, cuatro herramientas, guías y wiki */
const GACHA = [
  h("aniidex", "principal", "Aniidex"),
  h("tier-list", "herramientas", "Tier list"),
  h("map", "herramientas", "Mapa"),
  h("calculadora-de-cria", "herramientas", "Calculadora de cría"),
  h("coleccion", "herramientas", "Colección", { clave: "coleccion" }),
  h("database", "base-de-datos", "Base de datos"),
  h("guides", "guias", "Guías", { clave: "guiasDelJuego" }),
  h("wiki", "wiki", "Wiki", { href: "/juego/wiki/" }),
];

describe("la barra de abajo: como mucho cinco destinos que llevan a algo", () => {
  it("inicio, el índice, la tier list, las guías y la wiki, en el orden de la barra de arriba", () => {
    const d = destinosDeBarraInferior({ inicio: "/juego/", herramientas: GACHA, hayGuias: true, t: T });
    expect(d).toHaveLength(MAXIMO_DE_DESTINOS);
    expect(d.map((x) => x.label)).toEqual(["Inicio", "Aniidex", "Tier list", "Guías", "Wiki"]);
    expect(d[0]).toMatchObject({ id: "", href: "/juego/", icono: "inicio" });
  });

  it("sin entradas publicadas, «Guías» no entra (§8.2) y el hueco lo ocupa la base de datos", () => {
    const d = destinosDeBarraInferior({ inicio: "/juego/", herramientas: GACHA, hayGuias: false, t: T });
    expect(d.map((x) => x.id)).not.toContain("guides");
    expect(d.map((x) => x.label)).toEqual(["Inicio", "Aniidex", "Datos", "Tier list", "Wiki"]);
  });

  it("sin índice, la base de datos hace de índice con su rótulo corto", () => {
    const d = destinosDeBarraInferior({
      inicio: "/j/",
      herramientas: [h("database", "base-de-datos", "Base de datos"), h("map", "herramientas", "Mapa")],
      hayGuias: false,
      t: T,
    });
    expect(d.map((x) => x.label)).toEqual(["Inicio", "Datos", "Mapa"]);
  });

  it("de relleno, solo herramientas cuyo nombre cabe sin recortarse, y nunca la colección", () => {
    const d = destinosDeBarraInferior({
      inicio: "/j/",
      herramientas: [h("calculadora-de-cria", "herramientas", "Calculadora de cría"), h("coleccion", "herramientas", "Colección", { clave: "coleccion" })],
      hayGuias: false,
      t: T,
    });
    expect(d.map((x) => x.label)).toEqual(["Inicio"]);
  });

  it("un índice con nombre largo se llama «Índice» en la barra: no cabe en 75 px", () => {
    const d = destinosDeBarraInferior({
      inicio: "/j/",
      herramientas: [h("aventureros", "principal", "Aventureros y Compañeros")],
      hayGuias: false,
      t: T,
    });
    expect(d.map((x) => x.label)).toEqual(["Inicio", "Índice"]);
    expect(d[1].href).toBe("/juego/aventureros");
  });

  it("cada destino es una dirección real del juego, sin repetir", () => {
    const d = destinosDeBarraInferior({ inicio: "/juego/", herramientas: GACHA, hayGuias: true, t: T });
    expect(new Set(d.map((x) => x.href)).size).toBe(d.length);
    expect(d.every((x) => x.href.startsWith("/juego/"))).toBe(true);
  });
});

describe("la barra de abajo en el marco del juego", () => {
  const marco = lee("layouts", "GameLayout.astro");
  const barra = lee("components", "game", "BarraInferiorDeJuego.svelte");
  const css = lee("styles", "global.css");

  it("se pinta en el servidor, en los dos marcos, y solo si hay adónde ir", () => {
    const usos = marco.match(/<BarraInferiorDeJuego[\s\S]*?\/>/g) ?? [];
    expect(usos).toHaveLength(2);
    for (const u of usos) expect(u).not.toMatch(/client:/);
    expect(marco).toContain("const conBarraInferior = destinosDeAbajo.length > 1;");
    expect(marco.match(/conBarraInferior=\{conBarraInferior\}/g)).toHaveLength(2);
    expect(marco).toContain("hayGuias: contexto.entradas.length > 0");
  });

  it("solo por debajo de md, y sin espaciador: aparta la página el <body>", () => {
    expect(barra).toContain("hideAbove={767}");
    expect(barra).toContain("spacer={false}");
    // La de juego o la global de la web (§13.8): cualquiera de las dos aparta el final de la página
    expect(lee("layouts", "BaseLayout.astro")).toContain('data-barra-inferior={conBarraInferior || conBarraGlobal ? "" : undefined}');
    // Dentro del bloque de móvil, y contando el borde de 1 px de la barra
    expect(css).toMatch(
      /@media \(max-width: 767px\) \{\s*(\/\*[^*]*\*\/\s*)?body\[data-barra-inferior\] \{\s*padding-bottom: calc\(var\(--ta-bottom-nav-height, 3\.75rem\) \+ env\(safe-area-inset-bottom, 0px\) \+ 1px\);/
    );
  });

  it("el aviso de cookies sube por encima de ella", () => {
    expect(css).toMatch(/body\[data-barra-inferior\] \[data-aviso-cookies\] \{\s*bottom: calc\(var\(--ta-bottom-nav-height/);
    expect(lee("components", "comun", "AvisoDeCookies.astro")).toContain("data-aviso-cookies");
  });

  it("queda por debajo de los paneles de arriba y del cajón de gachas", () => {
    expect(css).toMatch(/nav\.ta-bottom-nav\.barra-inferior-juego \{\s*z-index: 30;/);
    expect(lee("components", "game", "GameNav.astro")).toContain('class="sticky top-0 z-40');
  });
});

describe("los desplegables: icono y una línea que dice QUÉ es", () => {
  it("toda herramienta tiene su línea en los tres idiomas", () => {
    for (const { clave } of HERRAMIENTAS) {
      for (const idioma of ["es", "en", "pt"] as const) {
        const linea = descripcionDeHerramienta({ clave }, textos(idioma).menuDeJuego);
        expect(linea, `${clave} en ${idioma}`).toBeTruthy();
      }
      expect((JUEGO.en.menuDeJuego as Record<string, string>)[clave], `${clave} sin inglés`).toBeTruthy();
      expect((JUEGO.pt.menuDeJuego as Record<string, string>)[clave], `${clave} sin portugués`).toBeTruthy();
    }
  });

  it("ninguna línea nuestra explica cómo se calcula, se ordena o de dónde sale (§6.6)", () => {
    const LEYENDA = /se calcula|ordenad|por vistas|de la fuente|oficial|official|sorted|source|fonte|datos de|data from|wiki/i;
    for (const idioma of ["es", "en", "pt"] as const) {
      for (const [clave, linea] of Object.entries(textos(idioma).menuDeJuego)) {
        expect(LEYENDA.test(linea), `${idioma}.menuDeJuego.${clave}: «${linea}»`).toBe(false);
      }
    }
  });

  it("del renglón del editor queda solo lo que dice qué hay, sin la procedencia", () => {
    const es = { idioma: "es" as const, traducido: true };
    expect(descripcionDeTabla("Todas las formas de Aniimo de la wiki oficial: elementos, roles, estadísticas base.", "R", es)).toBe(
      "Todas las formas de Aniimo"
    );
    expect(descripcionDeTabla("Las 249 armas del juego con su ATQ base al nivel 90, su estadística secundaria.", "R", es)).toBe(
      "Las 249 armas del juego"
    );
    expect(descripcionDeTabla("Requisitos mínimos y recomendados de la ficha de Steam.", "R", es)).toBe("Requisitos mínimos y recomendados");
    expect(descripcionDeTabla("Anuncios y actualizaciones del archivo interno.", "R", es)).toBe("Anuncios y actualizaciones");
    expect(descripcionDeTabla("Cada talento (ataque normal, habilidad elemental) y cada constelación, con su texto.", "R", es)).toBe(
      "Cada talento y cada constelación"
    );
    expect(descripcionDeTabla("Los 1757 objetos de Palworld 1.0: armas, armaduras.", "R", es)).toBe("Los 1757 objetos de Palworld 1.0");
  });

  it("si suena a leyenda, es larga, falta o no está traducida, la línea es la nuestra", () => {
    const es = { idioma: "es" as const, traducido: true };
    expect(descripcionDeTabla("Los nueve elementos, su color e icono oficiales.", "R", es)).toBe("Los nueve elementos");
    expect(descripcionDeTabla("Iconos oficiales de cada rol.", "R", es)).toBe("R");
    expect(descripcionDeTabla("Las 588 tecnologías del árbol ordenadas por nivel.", "R", es)).toBe("R");
    expect(descripcionDeTabla("", "R", es)).toBe("R");
    expect(descripcionDeTabla("Una descripción larguísima que no cabe de ninguna manera en una línea del menú", "R", es)).toBe("R");
    expect(descripcionDeTabla("Los 120 personajes", "R", { idioma: "en", traducido: false })).toBe("R");
    expect(descripcionDeTabla("The 120 characters", "R", { idioma: "en", traducido: true })).toBe("The 120 characters");
  });

  it(`con más de ${ENTRADAS_POR_COLUMNA} entradas, dos columnas (NavMenu reparte GRUPOS, no entradas)`, () => {
    const n = (k: number) => Array.from({ length: k }, (_, i) => ({ label: `E${i}` }));
    expect(gruposDelMenu(n(ENTRADAS_POR_COLUMNA))).toMatchObject({ columns: 1, groups: [{ items: n(ENTRADAS_POR_COLUMNA) }] });
    const dos = gruposDelMenu(n(19));
    expect(dos.columns).toBe(2);
    expect(dos.groups.map((g) => g.items.length)).toEqual([10, 9]);
    expect(dos.groups.flatMap((g) => g.items)).toEqual(n(19));
  });
});

describe("los desplegables en la barra del juego", () => {
  const nav = lee("components", "game", "GameNav.astro");
  const menu = lee("components", "game", "MenuDeJuego.svelte");

  it("son el NavMenu de tallao, pintado en el servidor, y ya no hay <details> a mano", () => {
    expect(menu).toContain('import { NavMenu } from "tallao";');
    expect(menu).toContain("{#snippet icon(item)}");
    const usos = nav.match(/<MenuDeJuego[\s\S]*?\/>/g) ?? [];
    expect(usos.length).toBe(3);
    for (const u of usos) expect(u).not.toMatch(/client:/);
    expect(nav).not.toMatch(/<details\s+class=/);
    expect(nav).toContain("soonLabel: t.juego.proximamente");
    expect(nav).toContain('"data-menu-juego": ""');
  });

  it("siguen cerrándose al pulsar fuera y con Escape, y uno abierto a la vez", () => {
    expect(nav).toContain('closest("[data-menu-juego]")');
    expect(nav).toContain('evento.key !== "Escape"');
    expect(nav).toContain('name: "menu-juego"');
  });

  it("cerrado, el panel no ocupa sitio (§13.6), y por debajo de lg cuelga de la barra, no de la tira", () => {
    expect(nav).toMatch(/\.menu-juego:not\(\[open\]\) \.ta-navmenu-panel \{\s*display: none;/);
    const tableta = nav.slice(nav.indexOf("@media (max-width: 1023px)"));
    expect(tableta).toMatch(/\.menu-juego\.ta-navmenu \{\s*position: static;/);
    expect(tableta).toMatch(/left: 0\.5rem;\s*right: 0\.5rem;/);
  });

  it("las secciones anunciadas van como «próximamente», sin enlace", () => {
    expect(nav).toContain('proximas(grupo).map((p) => ({ label: p.etiqueta, soon: true, icono: "soon" }))');
  });
});

describe("el hub en bento: la sección principal, grande", () => {
  it("la principal es la tier list; si no hay, el índice; si no, la base de datos", () => {
    expect(seccionPrincipal(GACHA)?.id).toBe("tier-list");
    expect(seccionPrincipal(GACHA.filter((x) => x.id !== "tier-list"))?.id).toBe("aniidex");
    expect(seccionPrincipal([h("database", "base-de-datos"), h("map", "herramientas")])?.id).toBe("database");
    expect(seccionPrincipal([h("map", "herramientas")])).toBeNull();
  });

  it("va la primera de su grupo, dos columnas desde md y nada cambia en el móvil", () => {
    const atajos = lee("components", "gachas", "AtajosDeJuego.astro");
    expect(atajos).toContain("seccionPrincipal(herramientas)");
    expect(atajos).toContain("[grande, ...g.atajos.filter((_, j) => j !== i)]");
    // El reparto de imágenes va DESPUÉS de colocar la grande (y sigue siendo uno: §4.3)
    expect(atajos.indexOf("atajos: [grande")).toBeLessThan(atajos.indexOf("repartirImagenes("));
    expect(atajos.match(/repartirImagenes\(/g)).toHaveLength(1);
    const desdeMd = atajos.slice(atajos.indexOf("@media (min-width: 768px)"));
    expect(desdeMd).toMatch(/\.atajo-principal \{\s*grid-column: span 2;/);
    // Solo en el CSS: el `sizes` de una imagen también dice «max-width: 767px»
    const estilos = atajos.slice(atajos.indexOf("<style"));
    expect(estilos).not.toMatch(/max-width: 767px[\s\S]*atajo-principal/);
  });
});
