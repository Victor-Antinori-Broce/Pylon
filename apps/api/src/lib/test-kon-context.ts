/**
 * Kitsuden — Testable DI: createTestKonContext()
 * ============================================================================
 *
 * Hace que la inyección de dependencias sea TESTEABLE: construye un KonContext
 * completo con defaults in-memory / no-op y permite override selectivo de solo
 * las dependencias que el test necesita. Así puedes testear el `createRouter(ctx)`
 * de un kon en aislamiento, sin base de datos ni Valkey reales.
 *
 * Uso:
 *   const ctx = createTestKonContext({
 *     db: mockDb,                       // solo lo que te importa
 *     config: { siteName: "Test" },
 *   });
 *   const router = miKon.createRouter(ctx);
 *   const res = await router.request("/algo");
 *
 * Las dependencias NO provistas y NO mockeadas por defecto lanzan un error claro
 * ("not mocked") si el código bajo test las toca — falla ruidoso, no silencioso.
 */

import type { KonContext } from "@kitsuden/shared";

function notMocked(dep: string): never {
  throw new Error(
    `[test-kon-context] '${dep}' no fue mockeado. Pásalo en createTestKonContext({ ${dep}: ... }).`
  );
}

/** Cache in-memory funcional (para tests que ejercitan caching). */
function makeMemoryCache() {
  const store = new Map<string, { value: unknown; expires?: number }>();
  return {
    async get<T>(key: string): Promise<T | null> {
      const hit = store.get(key);
      if (!hit) return null;
      if (hit.expires && hit.expires < Date.now()) {
        store.delete(key);
        return null;
      }
      return hit.value as T;
    },
    async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
      store.set(key, { value, expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined });
    },
    async del(key: string): Promise<void> {
      store.delete(key);
    },
    async invalidate(): Promise<void> {
      store.clear();
    },
  };
}

/** Logger que captura líneas para aserciones en tests. */
export function makeCapturingLogger() {
  const lines: { level: string; message: string; meta?: unknown }[] = [];
  const log = (level: string) => (message: string, meta?: Record<string, unknown>) =>
    lines.push({ level, message, meta });
  return {
    logger: { info: log("info"), warn: log("warn"), error: log("error"), debug: log("debug") },
    lines,
  };
}

export type KonContextOverrides = {
  [K in keyof KonContext]?: Partial<KonContext[K]> | KonContext[K];
};

/**
 * Construye un KonContext para tests. Todo lo no provisto usa un default
 * seguro (cache in-memory, logger capturador, config de test) o un stub que
 * lanza "not mocked" para forzar mocks explícitos donde importa.
 */
export function createTestKonContext(overrides: KonContextOverrides = {}): KonContext {
  const { logger } = makeCapturingLogger();

  const base: KonContext = {
    // Dependencias que casi siempre hay que mockear → stub ruidoso por defecto.
    db:
      (overrides.db as KonContext["db"]) ??
      (new Proxy({}, { get: () => notMocked("db") }) as KonContext["db"]),
    events:
      (overrides.events as KonContext["events"]) ??
      ({ emit: () => {}, on: () => {}, off: () => {} } as unknown as KonContext["events"]),
    realtime:
      (overrides.realtime as KonContext["realtime"]) ??
      ({ broadcast: () => {}, publish: () => {} } as unknown as KonContext["realtime"]),
    auth:
      (overrides.auth as KonContext["auth"]) ??
      (new Proxy({}, { get: () => notMocked("auth") }) as KonContext["auth"]),
    storage:
      (overrides.storage as KonContext["storage"]) ??
      (new Proxy({}, { get: () => notMocked("storage") }) as KonContext["storage"]),
    contentPublishing:
      (overrides.contentPublishing as KonContext["contentPublishing"]) ??
      (new Proxy(
        {},
        { get: () => notMocked("contentPublishing") }
      ) as KonContext["contentPublishing"]),

    // Defaults funcionales in-memory / no-op.
    cache:
      (overrides.cache as KonContext["cache"]) ??
      (makeMemoryCache() as unknown as KonContext["cache"]),
    logger: (overrides.logger as KonContext["logger"]) ?? logger,
    config: {
      siteName: "Test Site",
      siteUrl: "http://localhost:3000",
      environment: "test",
      ...(overrides.config as object),
    },

    // El sitio público de los tests: el de desarrollo, sin base de datos
    sitio: (overrides.sitio as KonContext["sitio"]) ?? {
      urlPublica: async () => "http://localhost:4321",
    },

    /**
     * Ajustes por kon (`konSetting`).
     *
     * Falta este reenvío y el override se acepta sin rechistar y se descarta:
     * el kon bajo test lee sus defaults, y quien escribió la prueba cree estar
     * ejercitando la configuración. Pasó con la tarifa de envío de la tienda —
     * el test daba 2500 en vez de 3000 y el motivo no estaba en el kon.
     */
    konConfig: overrides.konConfig as KonContext["konConfig"],
  };

  return base;
}
