// @ts-nocheck
/**
 * Kitsuden — Central Configuration
 *
 * ── QUÉ DECIDE ESTE FICHERO (y qué no) ─────────────────────────────────────
 *
 * Los kons ya no son parte del núcleo: viven en el repo `kitsuden-kons` y se
 * INSTALAN con `kitsuden kon add <nombre>`, que los declara en
 * `kitsuden.kons.json` (raíz del proyecto). `KITSUDEN_KONS` en el entorno suma
 * más (ver `src/lib/kons-instalados.ts`). Este fichero NO recorre ninguna
 * carpeta: lo que no está instalado no existe para la API.
 *
 * Lo que sí decide es la SEMILLA: qué kons instalados vienen encendidos de
 * fábrica la primera vez que la tabla `modules` oye hablar de ellos
 * (`lib/sembrar-modulos.ts`). Después manda el panel.
 *
 * Orden de la semilla de un kon instalado:
 *   1. `enabled` de su entrada en kitsuden.kons.json (`kitsuden kon add --enable`)
 *   2. la tabla de abajo (BASE_FEATURE_KONS)
 *   3. `defaultEnabled` de su manifiesto
 *   4. apagado
 */

import { konsInstalados } from "./src/lib/kons-instalados";

// ═══════════════════════════════════════════════════════════════
// CONFIGURACIÓN MANUAL (Override)
// ═══════════════════════════════════════════════════════════════

/** Módulos del núcleo que se cargan siempre primero (si están habilitados). */
const CORE_KONS = [
  {
    id: "kon-datasets",
    enabled: true,
    core: true,
    priority: 0,
  },
  {
    id: "kon-media",
    enabled: true,
    core: true,
    priority: 1,
  },
];

/**
 * Semilla de fábrica por TIER — solo para los kons que estén INSTALADOS.
 * ═══════════════════════════════════════════════════════════════
 *
 * El criterio es: ¿esto le sirve a cualquiera que instale el kon sin saber
 * nada de tu caso de uso? NO "¿es lo que estoy construyendo hoy?".
 *
 * - essential  → activo. Sirve a casi cualquier proyecto.
 * - common     → activo. No universal, pero lo quiere la mayoría de
 *                negocios reales (ventas, envíos, cobros).
 * - specialized → APAGADO. Vertical específico; se activa a propósito,
 *                nunca por sorpresa en el primer arranque.
 *
 * Un kon de esta lista que no esté instalado no se siembra.
 */
const BASE_FEATURE_KONS = [
  { id: "kon-blocks", enabled: true }, // Bloques de contenido (núcleo) — los usa el blog y cualquier página compuesta.
  // ── essential (ON) ──
  { id: "kon-blog", enabled: true }, // Contenido + SEO/GEO. Casi todo producto quiere una capa de contenido.
  { id: "kon-members", enabled: true }, // Identidad de lector/cliente sin cuenta de CMS. Base para cualquier paywall o audiencia.
  // ── common (ON) ──
  { id: "kon-newsletter", enabled: true }, // En cuanto hay audiencia, hay envíos. Compone con members.
  { id: "kon-crm", enabled: true }, // Contactos y ventas — necesidad de negocio muy extendida.
  { id: "kon-payments", enabled: true }, // Monetización. Compone con members para membresías de pago.
  { id: "kon-analytics", enabled: true }, // Vistas por sujeto y día, sin cookies: quién lee qué.
  // ── specialized (OFF) ──
  { id: "kon-booking", enabled: false },
  { id: "kon-academy-lms", enabled: false },
  { id: "kon-agile", enabled: false },
  { id: "kon-conta", enabled: false },
  { id: "kon-dms", enabled: false },
  { id: "kon-directory", enabled: false },
  { id: "kon-vekstudio", enabled: false },
  { id: "kon-ocr-training", enabled: false },
  { id: "kon-games", enabled: false },
  { id: "kon-streamers", enabled: false },
  { id: "kon-esports", enabled: false },
  { id: "kon-broadcast", enabled: false },
  { id: "kon-formulas", enabled: false },
  { id: "kon-character-builder", enabled: false },
  { id: "kon-wiki", enabled: false },
  { id: "kon-maps", enabled: false },
  { id: "kon-cardsim", enabled: false },
  { id: "kon-tierlist", enabled: false },
  { id: "kon-handlab", enabled: false },
  { id: "kon-deckshow", enabled: false },
  { id: "kon-autobattler", enabled: false },
];

// ═══════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════

export interface KonRef {
  id: string;
  enabled: boolean;
  core?: boolean;
  priority?: number;
}

export interface KitsudenConfig {
  core: KonRef[];
  features: KonRef[];
  grimoire?: string[];
  kons?: string[];
  modules?: string[];
}

// ═══════════════════════════════════════════════════════════════
// LO INSTALADO → CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════

function buildConfig(): KitsudenConfig {
  const base = new Map(BASE_FEATURE_KONS.map((k) => [k.id, k.enabled]));
  const coreIds = new Set(CORE_KONS.map((k) => k.id));

  const features: KonRef[] = [];
  for (const kon of konsInstalados()) {
    if (coreIds.has(kon.id)) continue;
    // Declarado pero no encontrado en disco: no se siembra (el cargador ya
    // avisa con la orden que lo arregla).
    if (!kon.ruta) continue;
    const enabled =
      kon.declarado.enabled ??
      base.get(kon.id) ??
      (kon.manifiesto?.defaultEnabled === true ? true : false);
    features.push({ id: kon.id, enabled });
  }
  // El orden de la tabla primero (es el orden en que se mezclan los esquemas,
  // y el que había antes), luego el resto alfabético.
  const orden = BASE_FEATURE_KONS.map((k) => k.id);
  const posicion = (id: string) => (orden.includes(id) ? orden.indexOf(id) : orden.length);
  features.sort((a, b) => posicion(a.id) - posicion(b.id) || a.id.localeCompare(b.id));

  const allEnabled = [
    ...CORE_KONS.filter((g) => g.enabled).map((g) => g.id),
    ...features.filter((g) => g.enabled).map((g) => g.id),
  ];

  return {
    core: CORE_KONS,
    features,
    grimoire: [],
    // Backward compatibility
    kons: allEnabled,
    modules: allEnabled,
  };
}

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════

let cachedConfig: KitsudenConfig | null = null;

export async function getConfig(): Promise<KitsudenConfig> {
  if (!cachedConfig) {
    cachedConfig = buildConfig();
  }
  return cachedConfig;
}

/**
 * La misma configuración, síncrona. Ya no hay diferencia entre las dos: antes
 * esta era una lista escrita a mano y `getConfig()` la mezclaba con lo que
 * hubiera en disco; ahora las dos salen de lo instalado.
 */
export const staticConfig: KitsudenConfig = buildConfig();

const config = staticConfig;

export function isKonEnabled(id: string): boolean {
  const core = config.core.find((g) => g.id === id);
  if (core) return core.enabled;

  const feature = config.features.find((g) => g.id === id);
  if (feature) return feature.enabled;

  return config.grimoire?.includes(id) || false;
}

export function getKonConfig(id: string): KonRef | undefined {
  return config.core.find((g) => g.id === id) || config.features.find((g) => g.id === id);
}

/** La tabla de semillas, para quien quiera mostrarla (CLI, docs). */
export const SEMILLAS_DE_FABRICA = BASE_FEATURE_KONS;

export default config;
