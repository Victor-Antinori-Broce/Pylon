/**
 * Cargador de vistas custom — deduplicación, pereza y errores
 * ============================================================================
 *
 * Las dependencias del DOM van inyectadas, así que esto corre en Node sin
 * navegador. Lo que se fija aquí es el comportamiento que hace usable el punto
 * de extensión: que no se descargue dos veces, que no se descargue si nadie
 * abre la vista, y que un fallo diga QUÉ arreglar.
 */

import { describe, expect, test, vi } from "vitest";

import { createCustomViewLoader } from "../../packages/admin/src/lib/custom-view-loader";

const BROADCAST = {
  konId: "kon-broadcast",
  element: "broadcast-scoreboard",
  src: "./admin/scoreboard.js",
};

/** Simula el navegador: un registro de elementos y un importador controlable. */
function harness(
  options: {
    /** Qué hace el import: registra el elemento, falla, o no registra nada. */
    onImport?: (url: string, define: (tag: string) => void) => Promise<void>;
  } = {}
) {
  const defined = new Set<string>();
  const waiters = new Map<string, (() => void)[]>();
  const imports: string[] = [];

  const define = (tag: string) => {
    defined.add(tag);
    for (const resolve of waiters.get(tag) ?? []) resolve();
    waiters.delete(tag);
  };

  const onImport = options.onImport ?? (async (_url, def) => def(BROADCAST.element)); // por defecto: registra

  const loader = createCustomViewLoader({
    importModule: async (url) => {
      imports.push(url);
      await onImport(url, define);
      return {};
    },
    isElementDefined: (name) => defined.has(name),
    whenElementDefined: (name) =>
      defined.has(name)
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            waiters.set(name, [...(waiters.get(name) ?? []), resolve]);
          }),
    defineTimeoutMs: 50,
  });

  return { loader, imports, defined, define };
}

// ── Camino feliz ─────────────────────────────────────────────────────────────

describe("carga", () => {
  test("importa el artefacto y devuelve la etiqueta a instanciar", async () => {
    const { loader, imports } = harness();

    const result = await loader.load(BROADCAST);

    expect(result.tag).toBe("broadcast-scoreboard");
    expect(result.url).toBe("/api/kons/kon-broadcast/admin-asset/admin/scoreboard.js");
    expect(imports).toEqual(["/api/kons/kon-broadcast/admin-asset/admin/scoreboard.js"]);
  });

  test("es perezosa: no descarga nada hasta que se pide la vista", () => {
    const { loader, imports } = harness();
    // Construir el loader no debe tocar la red — si el usuario nunca abre la
    // vista, su bundle no debe pesar en la carga del admin.
    expect(imports).toEqual([]);
    expect(loader.size).toBe(0);
  });

  test("espera al registro asíncrono del elemento", async () => {
    // Un bundle puede registrar el elemento tras un await: mirar justo después
    // del import daría un falso negativo.
    const { loader } = harness({
      onImport: async (_url, define) => {
        setTimeout(() => define(BROADCAST.element), 5);
      },
    });

    const result = await loader.load(BROADCAST);
    expect(result.tag).toBe("broadcast-scoreboard");
  });
});

// ── Deduplicación ────────────────────────────────────────────────────────────

describe("deduplicación", () => {
  test("dos cargas del mismo artefacto solo descargan una vez", async () => {
    const { loader, imports } = harness();

    await loader.load(BROADCAST);
    await loader.load(BROADCAST);

    expect(imports).toHaveLength(1);
  });

  test("cargas CONCURRENTES comparten una única descarga", async () => {
    // Cachear solo el resultado dejaría pasar dos peticiones en paralelo:
    // por eso se cachea la promesa en vuelo.
    const { loader, imports } = harness({
      onImport: async (_url, define) => {
        await new Promise((r) => setTimeout(r, 10));
        define(BROADCAST.element);
      },
    });

    await Promise.all([loader.load(BROADCAST), loader.load(BROADCAST), loader.load(BROADCAST)]);

    expect(imports).toHaveLength(1);
  });

  test("si el elemento ya está registrado, ni siquiera importa", async () => {
    const { loader, imports, define } = harness();
    define(BROADCAST.element); // p. ej. otra vista del mismo bundle ya lo cargó

    await loader.load(BROADCAST);

    expect(imports).toEqual([]);
  });

  test("invalidate fuerza una nueva descarga", async () => {
    const { loader, imports } = harness();
    const { url } = await loader.load(BROADCAST);

    loader.invalidate(url);
    // El elemento sigue registrado, así que para observar la descarga hace
    // falta un loader limpio; lo que se comprueba es el estado del caché.
    expect(loader.isLoaded(url)).toBe(false);
    expect(imports).toHaveLength(1);
  });
});

// ── Errores ──────────────────────────────────────────────────────────────────

describe("errores", () => {
  test("un descriptor inválido falla ANTES de tocar la red", async () => {
    const { loader, imports } = harness();

    await expect(loader.load({ ...BROADCAST, src: "../../../etc/passwd" })).rejects.toThrow(
      /no es una ruta de artefacto válida/
    );
    // Ni una petición: el error es de configuración, no de red.
    expect(imports).toEqual([]);
  });

  test("un elemento sin guion se rechaza con un mensaje que dice cómo arreglarlo", async () => {
    const { loader } = harness();
    await expect(loader.load({ ...BROADCAST, element: "scoreboard" })).rejects.toThrow(
      /debe ir en minúsculas y contener un guion/i
    );
  });

  test("un artefacto que no existe da LOAD_FAILED con la URL", async () => {
    const { loader } = harness({
      onImport: async () => {
        throw new Error("404");
      },
    });

    await expect(loader.load(BROADCAST)).rejects.toThrow(/No se pudo cargar el artefacto/);
  });

  test("un fallo NO se cachea: un despliegue arreglado se recupera solo", async () => {
    let attempt = 0;
    const { loader, imports } = harness({
      onImport: async (_url, define) => {
        attempt++;
        if (attempt === 1) throw new Error("404");
        define(BROADCAST.element);
      },
    });

    await expect(loader.load(BROADCAST)).rejects.toThrow();
    // Segundo intento tras corregir el artefacto: debe funcionar sin recargar
    // la página entera.
    const result = await loader.load(BROADCAST);

    expect(result.tag).toBe("broadcast-scoreboard");
    expect(imports).toHaveLength(2);
  });

  test("un bundle que carga pero no registra el elemento lo dice explícitamente", async () => {
    const { loader } = harness({
      onImport: async () => {
        // Carga bien, pero se olvida del customElements.define.
      },
    });

    await expect(loader.load(BROADCAST)).rejects.toThrow(/nunca registró <broadcast-scoreboard>/);
  });

  test("el error de no-registro no deja temporizadores colgando", async () => {
    vi.useFakeTimers();
    try {
      const { loader } = harness({ onImport: async () => {} });
      const promise = loader.load(BROADCAST).catch((e) => e);
      await vi.advanceTimersByTimeAsync(60);
      const err = await promise;
      expect(String(err)).toMatch(/nunca registró/);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
