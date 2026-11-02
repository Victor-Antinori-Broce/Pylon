/**
 * Todo kon tiene que poder montarse
 * ============================================================================
 *
 * El cargador (`loadKons`) busca, por este orden: `mod.kon` o `mod.default` con
 * forma de kon, cualquier export que sea un router de Hono, o una función
 * `init*`. Si no encuentra ninguna de las tres, imprime
 * `⚠️ <id> → no router or init found` y lo apunta como FALLIDO.
 *
 * Eso es un aviso en un log de arranque, no un error: `kon-ecommerce` vivió así
 * un tiempo —esquema, servicio, policies, migración y manifiesto con tres
 * tablas— siendo en realidad una biblioteca dentro de una carpeta que decía ser
 * un kon. Compilaba, sus pruebas pasaban y no se podía instalar.
 *
 * Esta prueba importa cada kon de verdad y repite la comprobación del cargador.
 * No verifica que las rutas funcionen; verifica que HAY algo que montar.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";
import { HAY_KONS_INSTALADOS } from "./helpers/kons-conocidos";

const RAIZ = join(__dirname, "..", "..");
const KONS = join(RAIZ, "packages", "kons");

/** Carpetas con `kon.json`: lo que el cargador considera un kon instalable. */
function listarKons(): string[] {
  return readdirSync(KONS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(KONS, e.name, "kon.json")))
    .map((e) => e.name);
}

/** Un router de Hono, reconocido por su forma como hace el cargador. */
function esRouterHono(v: unknown): boolean {
  const r = v as { fetch?: unknown; routes?: unknown; request?: unknown } | null;
  return !!r && typeof r.fetch === "function" && Array.isArray(r.routes);
}

/** ¿Tiene forma de definición de kon? (`createRouter` o metadatos de auto-kon) */
function esDefinicion(v: unknown): boolean {
  const d = v as { id?: unknown; createRouter?: unknown; tables?: unknown } | null;
  return !!d && typeof d === "object" && (typeof d.createRouter === "function" || !!d.id);
}

/**
 * `definePolicy is not a function` bajo carga: una carrera del cargador de
 * módulos, no un kon roto.
 *
 * `@kitsuden/engine` está en un ciclo (su índice reexporta código de
 * apps/api, y ese código importa `@kitsuden/engine`), y en ese ciclo está
 * `db`, con un await de nivel superior. El module runner de Vite, cuando
 * alguien pide un módulo que está DENTRO de un ciclo y todavía evaluándose, no
 * espera a que termine: devuelve sus exportaciones tal como estén (vite
 * `ModuleRunner.cachedRequest` → `isCircularImport`). Si en ese momento hay
 * otra importación en vuelo —la del kon anterior, cuyo test agotó su tiempo
 * con la máquina cargada pero cuya importación sigue—, el kon siguiente recibe
 * un engine a medias y su policy llama a `definePolicy` cuando aún es
 * `undefined`.
 *
 * Arreglo sin tocar tiempos: (1) el engine se evalúa ENTERO una vez, antes de
 * cualquier kon, así que nadie puede verlo a medias; (2) las importaciones de
 * kons van en fila: la de un test no empieza hasta que acabó la anterior,
 * aunque esa haya excedido su tiempo.
 */
let fila: Promise<unknown> = Promise.resolve();
function importarEnFila(ruta: string): Promise<Record<string, unknown>> {
  const turno = fila.then(
    () => import(/* @vite-ignore */ ruta) as Promise<Record<string, unknown>>
  );
  fila = turno.catch(() => undefined);
  return turno;
}

describe("los kons se pueden montar", () => {
  const kons = listarKons();

  it.skipIf(!HAY_KONS_INSTALADOS)("hay kons que inspeccionar", () => {
    // Sin esto, un fallo en el descubrimiento dejaría la lista vacía y las
    // comprobaciones de abajo pasarían sin mirar nada.
    expect(kons.length).toBeGreaterThan(20);
  });

  /**
   * Cada kon se importa de verdad, y eso arrastra su grafo de dependencias
   * entero: Hono, Drizzle, zod y lo que use el kon. Medido, un kon grande
   * (`kon-academy-lms`) tarda 4,8 s con la máquina libre y **21,2 s** con la
   * suite entera compitiendo por CPU.
   *
   * El techo global es de 20 s, así que bajo carga este fichero fallaba de forma
   * intermitente — y un fichero que falla según lo ocupada que esté la máquina
   * es un fichero que la gente aprende a ignorar. Ese es el camino por el que un
   * CI deja de mirarse.
   *
   * Se sube AQUÍ y no en la configuración global a propósito: el resto de la
   * suite no importa grafos de dependencias, y sus 20 s son un límite útil para
   * cazar un test colgado. Subirlo para todos taparía eso.
   */
  const TECHO_MS = 60_000;

  beforeAll(async () => {
    await importarEnFila("@kitsuden/engine");
  }, TECHO_MS);

  for (const kon of kons) {
    it(`${kon} exporta algo que el cargador reconoce`, { timeout: TECHO_MS }, async () => {
      const mod = await importarEnFila(join(KONS, kon, "index.ts"));

      const principal = mod.kon ?? mod.default;
      const reconocido =
        esDefinicion(principal) ||
        esRouterHono(principal) ||
        Object.values(mod).some(esRouterHono) ||
        Object.entries(mod).some(([n, v]) => n.startsWith("init") && typeof v === "function");

      expect(
        reconocido,
        `${kon} no exporta ni una definición de kon (\`export const kon = defineKon(...)\`), ` +
          `ni un router de Hono, ni una función \`init*\`. El cargador lo dará por ` +
          `fallido al arrancar: "no router or init found". Exports encontrados: ` +
          `${Object.keys(mod).slice(0, 12).join(", ")}`
      ).toBe(true);
    });
  }
});
