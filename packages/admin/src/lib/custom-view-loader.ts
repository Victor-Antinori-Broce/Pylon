/**
 * Cargador de vistas de admin agnósticas al framework
 * ============================================================================
 *
 * Sustituye a `component-loader.ts`, que hacía
 * `import("../../../packages/grimoires/<x>/admin.svelte")`. Aquello tenía tres
 * problemas, y solo uno era el framework:
 *
 *   1. Obligaba a escribir Svelte para extender el admin.
 *   2. Al ser un import dinámico con plantilla, Vite lo resolvía como un glob:
 *      el admin empaquetaba la vista de TODOS los kons aunque nadie las
 *      abriera.
 *   3. El mapa de paquetes estaba escrito a mano en el código del admin, así
 *      que un tercero no podía aportar una vista sin editar el host.
 *
 * Aquí se carga un ARTEFACTO YA COMPILADO por URL, en runtime. El bundler del
 * admin no ve nada ajeno, cada extensión trae su runtime dentro, y el aislamiento
 * lo da el Shadow DOM del custom element.
 *
 * Las dependencias del DOM se inyectan a propósito: así la lógica de
 * deduplicación, errores y ciclo de vida se testea sin navegador.
 */

import { CustomViewError, resolveCustomView, type CustomViewDescriptor } from "@kitsuden/shared";

export interface CustomViewLoaderDeps {
  /** Importa un módulo ESM por URL. En el navegador, `import(url)`. */
  importModule: (url: string) => Promise<unknown>;
  /** ¿Está ya registrado ese custom element? */
  isElementDefined: (name: string) => boolean;
  /**
   * Espera a que el elemento quede registrado. Un bundle puede registrarlo de
   * forma asíncrona (top-level await), así que no basta con mirar justo después
   * del import.
   */
  whenElementDefined: (name: string) => Promise<void>;
  /** Milisegundos antes de darse por vencido esperando el registro. */
  defineTimeoutMs?: number;
}

export interface LoadedCustomView {
  /** Nombre de la etiqueta a instanciar, p. ej. `broadcast-scoreboard`. */
  tag: string;
  url: string;
}

/** Dependencias reales del navegador. */
export function browserDeps(): CustomViewLoaderDeps {
  return {
    importModule: (url) => import(/* @vite-ignore */ url),
    isElementDefined: (name) => Boolean(customElements.get(name)),
    whenElementDefined: (name) => customElements.whenDefined(name).then(() => undefined),
  };
}

export function createCustomViewLoader(deps: CustomViewLoaderDeps) {
  const timeoutMs = deps.defineTimeoutMs ?? 10_000;

  /**
   * Importaciones en vuelo o resueltas, por URL.
   *
   * Se guarda la PROMESA, no el resultado: si dos vistas del mismo bundle se
   * abren a la vez, deben compartir una única descarga. Cachear solo el
   * resultado dejaría pasar dos peticiones en paralelo.
   */
  const modules = new Map<string, Promise<unknown>>();

  function importOnce(url: string): Promise<unknown> {
    const existing = modules.get(url);
    if (existing) return existing;

    const promise = deps.importModule(url).catch((err) => {
      // Los fallos NO se cachean: si el artefacto se arregla y se vuelve a
      // desplegar, el siguiente intento debe poder recuperarse sin recargar
      // la página entera.
      modules.delete(url);
      throw new CustomViewError(
        `No se pudo cargar el artefacto "${url}": ${err instanceof Error ? err.message : String(err)}`,
        "LOAD_FAILED"
      );
    });

    modules.set(url, promise);
    return promise;
  }

  async function waitForDefinition(tag: string): Promise<void> {
    if (deps.isElementDefined(tag)) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new CustomViewError(
              `El artefacto se cargó pero nunca registró <${tag}>. ` +
                `Comprueba que llama a customElements.define("${tag}", …).`,
              "NOT_REGISTERED"
            )
          ),
        timeoutMs
      );
    });

    try {
      await Promise.race([deps.whenElementDefined(tag), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    /**
     * Carga la vista y devuelve la etiqueta lista para instanciar.
     * Idempotente: llamarla dos veces no vuelve a descargar nada.
     */
    async load(descriptor: CustomViewDescriptor, baseUrl = ""): Promise<LoadedCustomView> {
      // Valida ANTES de tocar la red: un descriptor mal formado debe fallar
      // con un mensaje que diga qué arreglar, no con un 404.
      const { url } = resolveCustomView(descriptor, baseUrl);

      // Si el elemento ya está registrado (otra vista del mismo bundle, o una
      // recarga en caliente), no hace falta importar nada.
      if (deps.isElementDefined(descriptor.element)) {
        return { tag: descriptor.element, url };
      }

      await importOnce(url);
      await waitForDefinition(descriptor.element);

      return { tag: descriptor.element, url };
    },

    /** ¿Ya se pidió este artefacto? Para diagnóstico y tests. */
    isLoaded(url: string): boolean {
      return modules.has(url);
    },

    /** Fuerza que el próximo `load` vuelva a descargar. Útil en desarrollo. */
    invalidate(url: string): void {
      modules.delete(url);
    },

    reset(): void {
      modules.clear();
    },

    /** Cuántos artefactos distintos se han pedido. */
    get size(): number {
      return modules.size;
    },
  };
}

export type CustomViewLoader = ReturnType<typeof createCustomViewLoader>;

/** Instancia compartida del admin. */
let shared: CustomViewLoader | null = null;

export function customViewLoader(): CustomViewLoader {
  if (!shared) shared = createCustomViewLoader(browserDeps());
  return shared;
}
