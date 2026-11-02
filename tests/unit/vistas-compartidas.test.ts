/**
 * Un componente registrado para varias vistas tiene que saber cuál se pulsó
 * ============================================================================
 *
 * ── EL FALLO ───────────────────────────────────────────────────────────────
 *
 * `GamesView.svelte` está registrado para DOS vistas del kon —«All Games» y
 * «Collections»— y tiene sus propias pestañas dentro. `GrimoirePage` lo montaba
 * así:
 *
 *     <CustomComponent />
 *
 * Sin pasarle nada. El componente abría siempre en su pestaña «games», así que
 * pulsar «Collections» marcaba la pestaña de arriba y enseñaba la lista de
 * juegos. No fallaba nada: enseñaba lo que no era.
 *
 * Es exactamente la misma forma que «Programados» enseñando borradores, y que
 * «All Posts» sin traer todos los posts. La pestaña dice una cosa y el
 * contenido es otro, sin un solo error por medio.
 *
 * ── QUÉ VIGILA ─────────────────────────────────────────────────────────────
 *
 * 1. Que el montaje pase `viewId`.
 * 2. Que todo componente registrado para MÁS DE UNA vista lo declare como prop.
 *    Este es el que importa: registrar el mismo componente para dos vistas es
 *    una decisión que se toma en una línea del registro, lejos del componente,
 *    y nada obliga a comprobar si sabe distinguirlas.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const ADMIN = join(RAIZ, "packages", "admin", "src");
const CARGADOR = join(ADMIN, "lib", "grimoire-loader.ts");
const PAGINA = join(ADMIN, "lib", "components", "admin", "GrimoirePage.svelte");
const KONS = join(RAIZ, "packages", "kons");

describe("vistas personalizadas", () => {
  const cargador = readFileSync(CARGADOR, "utf-8");
  const pagina = readFileSync(PAGINA, "utf-8");

  it("el montaje le dice al componente qué vista se ha pulsado", () => {
    expect(
      /<CustomComponent\s+viewId=\{activeViewId\}/.test(pagina),
      "`GrimoirePage` tiene que montar la vista personalizada con `viewId`. " +
        "Sin eso, un componente registrado para varias vistas no puede saber " +
        "cuál se pulsó y abre siempre en la misma."
    ).toBe(true);
  });

  it("todo componente usado por varias vistas declara `viewId`", () => {
    /**
     * ── POR QUE SE LEEN LOS MANIFIESTOS Y NO SOLO EL REGISTRO ───────────────
     *
     * La primera versión de esta prueba agrupaba por componente contando las
     * CLAVES del registro, y señalaba siete componentes correctos.
     *
     * El motivo: cada kon aparece con dos formas de clave —la del kon a secas
     * (`kon-blog`, que es el respaldo y resuelve a su vista por defecto) y una
     * por vista (`kon-blog-posts`)—. Contarlas como dos vistas distintas
     * convierte lo normal en un fallo.
     *
     * Y un guardián que grita sobre lo correcto es peor que no tenerlo: se
     * aprende a ignorarlo, y el día que señala algo de verdad también se
     * ignora.
     *
     * La pregunta correcta es: **de las vistas que este kon DECLARA, ¿cuántas
     * acaban en el mismo componente?** Eso está en su `kon.json`, así que se lee
     * de ahí.
     */
    const entradas = new Map<string, string>();
    for (const m of cargador.matchAll(/"([^"]+)":\s*\(\)\s*=>\s*import\("(\$[^"]+)"\)/g)) {
      entradas.set(m[1], m[2]);
    }
    expect(entradas.size, "no se encontró el registro de vistas").toBeGreaterThan(5);

    const problemas: string[] = [];

    for (const dir of readdirSync(KONS)) {
      const manifiesto = join(KONS, dir, "kon.json");
      if (!existsSync(manifiesto)) continue;

      let kon: {
        id?: string;
        admin?: { views?: Array<{ id: string; type?: string; title?: string }> };
      };
      try {
        kon = JSON.parse(readFileSync(manifiesto, "utf-8"));
      } catch {
        continue;
      }

      const konId = kon.id || dir;
      // Solo las vistas `custom`: las demás las pinta el explorador, que ya
      // recibe su propia configuración por vista.
      const vistas = (kon.admin?.views ?? []).filter((v) => v.type === "custom");
      if (vistas.length < 2) continue;

      /** Igual que resuelve el panel: primero la clave por vista, luego la del kon. */
      const componenteDe = (viewId: string) =>
        entradas.get(`${konId}-${viewId}`) ?? entradas.get(konId);

      const porComponente = new Map<string, string[]>();
      for (const v of vistas) {
        const comp = componenteDe(v.id);
        if (!comp) continue;
        porComponente.set(comp, [...(porComponente.get(comp) ?? []), v.id]);
      }

      for (const [modulo, ids] of porComponente) {
        if (ids.length < 2) continue;

        const ruta = join(ADMIN, modulo.replace(/^\$views/, "views").replace(/^\$lib/, "lib"));
        if (!existsSync(ruta)) continue;

        if (!readFileSync(ruta, "utf-8").includes("viewId")) {
          problemas.push(
            `${konId}: las vistas ${ids.join(" y ")} se pintan las dos con ` +
              `${modulo}, y ese componente no declara \`viewId\`. Abrirá siempre ` +
              `en la misma, así que una de las dos enseñará contenido que no ` +
              `corresponde a su nombre — sin dar ningún error.`
          );
        }
      }
    }

    expect(problemas, problemas.join("\n\n")).toEqual([]);
  });

  it("GamesView traduce la vista a su pestaña interna", () => {
    const games = readFileSync(join(ADMIN, "views", "games", "GamesView.svelte"), "utf-8");

    expect(games).toContain("function pestanaDe");

    /**
     * Y reacciona a los cambios, no solo al montaje: el router del panel
     * REUTILIZA el componente al navegar entre vistas del mismo kon. Un valor
     * calculado una vez se queda con el primero — el mismo fallo que dejó las
     * pestañas del explorador de datos sin recargar.
     */
    expect(
      games.includes("ultimaVistaAplicada"),
      "el cambio de vista tiene que reflejarse aunque el componente no se " + "vuelva a montar."
    ).toBe(true);
  });
});
