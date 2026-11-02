/**
 * Qué posts se ven, y quién puede verlos
 * ============================================================================
 *
 * Tres fallos que se veían igual desde fuera —«la lista no enseña lo que
 * debería»— y tenían tres causas distintas en tres capas distintas.
 *
 * ── 1. LOS BORRADORES ERAN PÚBLICOS ────────────────────────────────────────
 *
 * `GET /api/blog` aceptaba `?status=` sin mirar quién preguntaba. Comprobado
 * contra la instalación real, sin ninguna cookie:
 *
 *     GET /api/blog?status=draft
 *     → {"docs":[{"title":"post de prueba","content":"hola\nesto es…
 *
 * Cualquiera en internet leía todos los borradores enteros —título, cuerpo,
 * autor— cambiando una palabra en la URL. No hacía falta romper nada: el valor
 * por defecto era `published`, así que la ruta parecía correcta mientras nadie
 * escribiera otro. **Un defecto seguro no es un permiso.**
 *
 * ── 2. «SCHEDULED» ENSEÑABA LOS BORRADORES ─────────────────────────────────
 *
 * `defaultFilter` viene del `kon.json` y `generateExplorerConfig` no lo
 * copiaba. Las dos vistas —Borradores y Programados— apuntan a `blog_posts`,
 * así que sin filtro las dos pedían la tabla entera y enseñaban lo mismo.
 *
 * ── 3. «ALL POSTS» NO ENSEÑABA NINGUNO ─────────────────────────────────────
 *
 * La pantalla pide a `/api/blog`, que por defecto devuelve solo lo publicado.
 * Con un borrador y nada publicado, salía vacía — y «vacío» se lee como «no
 * hay posts», que es justo lo contrario de lo que pasaba.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sinComentarios } from "./helpers/comentarios";

const RAIZ = join(__dirname, "..", "..");
const RUTAS = join(RAIZ, "packages", "kons", "kon-blog", "src", "routes.ts");
const CARGADOR = join(RAIZ, "packages", "admin", "src", "lib", "grimoire-loader.ts");
const EXPLORADOR = join(
  RAIZ,
  "packages",
  "admin",
  "src",
  "lib",
  "components",
  "admin",
  "DataExplorer.svelte"
);
const VISTA_POSTS = join(RAIZ, "packages", "admin", "src", "views", "content", "PostsView.svelte");

describe("quién puede ver los posts sin publicar", () => {
  const rutas = sinComentarios(readFileSync(RUTAS, "utf-8"));
  // El blog es un kon del SDK: `GET /` es la operación `listar-entradas`, y
  // `acceso: "opcional"` es lo que monta `optionalAuth`.
  const listado = rutas.slice(
    rutas.indexOf('id: "listar-entradas"'),
    rutas.indexOf('id: "obtener-por-slug"')
  );

  it("el listado consulta quién pregunta", () => {
    expect(listado.length, "no se encontró el manejador GET /").toBeGreaterThan(0);

    expect(
      listado.includes('acceso: "opcional"') || listado.includes("auth.optionalAuth"),
      "`GET /api/blog` tiene que pasar por `optionalAuth`. Sin eso no hay forma " +
        "de saber si quien pregunta puede ver borradores, y la ruta acaba " +
        "sirviéndoselos a cualquiera."
    ).toBe(true);
  });

  it("el estado pedido NO se usa tal cual", () => {
    /**
     * El fallo original cabía en una línea:
     *
     *     const status = (c.req.query("status") || "published") as …
     *
     * El `as` es la parte peligrosa: convence al compilador de que la cadena
     * que venga de la URL es uno de los cuatro estados válidos. TypeScript deja
     * de mirar justo donde hacía falta mirar.
     */
    expect(
      /const status = \(c\.req\.query\("status"\)/.test(listado),
      "el `status` de la URL no puede ir directo a la consulta: hay que " +
        "comprobar antes que quien pregunta tiene derecho a ese estado."
    ).toBe(false);

    expect(
      listado.includes("puedeVerloTodo"),
      "tiene que distinguirse a quién se le permite pedir estados distintos de " + "`published`."
    ).toBe(true);
  });

  it("la caché separa lo público de lo privado", () => {
    /**
     * Sin separar, la fuga vuelve por otra puerta y sin dejar rastro en la
     * ruta: si un editor abre «All Posts» antes que nadie, la respuesta con
     * borradores queda cacheada bajo la misma clave y se le sirve al mundo.
     */
    const clave = listado.slice(listado.indexOf("const cacheKey"), listado.indexOf("const cached"));

    expect(
      /priv|pub|puedeVerloTodo/.test(clave),
      "la clave de caché tiene que incluir el privilegio de quien pregunta. Si " +
        "no, la primera respuesta cacheada se sirve a todos por igual y los " +
        "borradores se escapan por la caché."
    ).toBe(true);
  });

  it("un estado desconocido no revienta la consulta", () => {
    /**
     * Con el código anterior, `?status=all` llegaba tal cual a
     * `eq(blogPosts.status, "all")`. `status` es un ENUM en Postgres, así que
     * la consulta moría con «invalid input value for enum blog_status» y la
     * API respondía **500**. Verificado contra la instalación real.
     */
    expect(
      listado.includes("ESTADOS.includes"),
      "el estado pedido tiene que validarse contra la lista antes de llegar a " +
        "la consulta: la columna es un enum y un valor desconocido no da una " +
        "lista vacía, da un 500."
    ).toBe(true);
  });
});

describe("las pestañas del kon enseñan cosas distintas", () => {
  const cargador = readFileSync(CARGADOR, "utf-8");
  const explorador = readFileSync(EXPLORADOR, "utf-8");

  it("`defaultFilter` sobrevive al paso por el generador de config", () => {
    const desde = cargador.indexOf("      default:");
    const grid = cargador.slice(desde, cargador.indexOf("    }", desde));

    expect(
      grid.includes("defaultFilter"),
      "la rama `grid` de `generateExplorerConfig` tiene que copiar " +
        "`defaultFilter`. Sin él, dos vistas sobre la misma tabla piden lo " +
        "mismo y enseñan lo mismo — «Programados» con los borradores dentro."
    ).toBe(true);
  });

  it("el filtro de la vista se aplica y gana al del usuario", () => {
    expect(explorador).toContain("filtroDeLaVista");

    const carga = explorador.slice(explorador.indexOf("async function loadData"));
    const iUsuario = carga.indexOf("Object.entries(activeFilters)");
    const iVista = carga.indexOf("Object.entries(filtroDeLaVista)");

    expect(iVista, "el filtro de la vista no se aplica en la consulta").toBeGreaterThan(-1);
    expect(
      iVista > iUsuario,
      "el filtro de la vista va DESPUÉS del de quien mira: la API solo admite " +
        "un filtro por petición, así que el orden es la precedencia. Antes, " +
        "cualquier filtro escrito a mano convertiría «Borradores» en «todos»."
    ).toBe(true);
  });

  it("cambiar de pestaña recarga aunque la tabla no cambie", () => {
    /**
     * El efecto de recarga depende de `tablaActiva`. Borradores y Programados
     * comparten tabla, así que al saltar de una a otra no se disparaba y la
     * rejilla se quedaba con las filas de la anterior — ahora con el filtro
     * puesto, eso sería enseñar borradores bajo el título «Programados».
     */
    expect(
      explorador.includes("vistaYaCargada"),
      "tiene que haber una recarga ligada a `activeViewId`, no solo a la tabla."
    ).toBe(true);
  });
});

describe("los nombres de las pestañas dicen lo que enseñan", () => {
  const kon = JSON.parse(
    readFileSync(join(RAIZ, "packages", "kons", "kon-blog", "kon.json"), "utf-8")
  ) as {
    postStatuses: string[];
    admin: { views: Array<{ id: string; title: string; defaultFilter?: { status?: string } }> };
  };

  it("cada estado declarado tiene su pestaña", () => {
    /**
     * Antes había tres pestañas —All Posts, Drafts, Scheduled— para cuatro
     * estados: `published` y `archived` no tenían ninguna. Y como «All Posts»
     * traía solo los publicados, el resultado era que un borrador salía en dos
     * sitios y un archivado en ninguno.
     */
    const conPestaña = new Set(
      kon.admin.views.map((v) => v.defaultFilter?.status).filter(Boolean) as string[]
    );
    const sinPestaña = kon.postStatuses.filter((e) => !conPestaña.has(e));

    expect(
      sinPestaña,
      "Estos estados no tienen pestaña propia: " +
        sinPestaña.join(", ") +
        ". Un post en ese estado solo se encuentra en «Todos», y desde fuera se " +
        "lee como que no existe."
    ).toEqual([]);
  });

  it("ninguna pestaña filtrada promete enseñarlo todo", () => {
    /**
     * El nombre es la promesa. «All Posts» trayendo solo publicados era la
     * causa de que la pantalla saliera vacía y pareciera que no había posts:
     * el título decía una cosa y el filtro hacía otra.
     */
    for (const v of kon.admin.views) {
      const filtra = !!v.defaultFilter?.status;
      const prometeTodo = /^(todos|all)\b/i.test(v.title);

      expect(
        filtra && prometeTodo,
        "La vista «" +
          v.title +
          "» filtra por " +
          String(v.defaultFilter?.status) +
          " pero su nombre promete todos los posts."
      ).toBe(false);
    }
  });
});

describe("«All Posts» enseña todos los posts", () => {
  const vista = readFileSync(VISTA_POSTS, "utf-8");

  it("pide explícitamente todos los estados", () => {
    expect(
      vista.includes('queryParams={{ status: "all" }}'),
      "`/api/blog` devuelve solo lo publicado por defecto. Una pantalla que se " +
        "llama «All Posts» tiene que pedir el resto, o miente en el título."
    ).toBe(true);
  });
});
