// @ts-nocheck
/**
 * GremiusCMS — Central Configuration (Auto-Discovery Edition)
 * 
 * Este config se auto-genera escaneando packages/grimoires/ automáticamente.
 * Los grimoires detectados en filesystem se añaden a 'features' con enabled: false.
 * 
 * Para forzar un grimoire como core, añádelo manualmente a CORE_GRIMOIRES.
 * Para excluir un grimoire, añádelo a EXCLUDED_GRIMOIRES.
 */

import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

// ═══════════════════════════════════════════════════════════════
// CONFIGURACIÓN MANUAL (Override)
// ═══════════════════════════════════════════════════════════════

/** Grimoires excluidos de la detección automática */
const EXCLUDED_GRIMOIRES = [
  // "grimoire-legacy", // Ejemplo: grimoire que no quieres que aparezca
];

/** Grimoires CORE - Siempre se cargan primero (si están habilitados) */
const CORE_GRIMOIRES = [
  {
    id: "grimoire-datasets",
    enabled: true,
    core: true,
    priority: 0,
  },
  {
    id: "grimoire-media",
    enabled: true,
    core: true,
    priority: 1,
  },
];

/** 
 * Grimoires FEATURES - Configuración base.
 * Se mergea con la detección automática de filesystem.
 */
const BASE_FEATURE_GRIMOIRES = [
  { id: "grimoire-blocks", enabled: true },
  { id: "grimoire-blog", enabled: true },
  { id: "grimoire-academy-lms", enabled: true },
  { id: "grimoire-booking", enabled: true },
  { id: "grimoire-directory", enabled: false },
  { id: "grimoire-dms", enabled: false },
  { id: "grimoire-crm", enabled: true },
  { id: "grimoire-conta", enabled: false },
  // NOTA: Los gaming grimoires se detectan automáticamente abajo
];

// ═══════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════

export interface GrimoireRef {
  id: string;
  enabled: boolean;
  core?: boolean;
  priority?: number;
}

export interface GremiusConfig {
  core: GrimoireRef[];
  features: GrimoireRef[];
  realm?: string[];
  grimoires?: string[];
  modules?: string[];
}

// ═══════════════════════════════════════════════════════════════
// AUTO-DISCOVERY
// ═══════════════════════════════════════════════════════════════

async function getPackagesRoot(): Promise<string> {
  const cwdCheck = join(process.cwd(), "packages", "grimoires");
  const altCheck = join(process.cwd(), "..", "..", "packages", "grimoires");
  
  if (existsSync(cwdCheck)) return join(process.cwd(), "packages");
  if (existsSync(altCheck)) return join(process.cwd(), "..", "..", "packages");
  
  return join(process.cwd(), "packages");
}

async function readGrimoireManifest(dirPath: string): Promise<{ id: string; core?: boolean } | null> {
  try {
    const grimoireJsonPath = join(dirPath, "grimoire.json");
    const gremiusJsonPath = join(dirPath, "gremius.json");
    
    let manifest = null;
    
    if (existsSync(grimoireJsonPath)) {
      const content = await import(grimoireJsonPath, { assert: { type: "json" } });
      manifest = content.default || content;
    } else if (existsSync(gremiusJsonPath)) {
      const content = await import(gremiusJsonPath, { assert: { type: "json" } });
      manifest = content.default || content;
    }
    
    if (manifest && manifest.id) {
      return {
        id: manifest.id,
        core: manifest.core || manifest.type === "grimoire-core" || false,
      };
    }
  } catch {
    // Ignore errors
  }
  return null;
}

async function discoverGrimoires(): Promise<GrimoireRef[]> {
  const packagesRoot = await getPackagesRoot();
  const grimoiresDir = join(packagesRoot, "grimoires");
  const discovered: GrimoireRef[] = [];
  
  if (!existsSync(grimoiresDir)) {
    console.warn("[Config] Grimoires directory not found:", grimoiresDir);
    return discovered;
  }
  
  try {
    const entries = await readdir(grimoiresDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith("grimoire-")) continue;
      if (EXCLUDED_GRIMOIRES.includes(entry.name)) continue;
      
      const manifest = await readGrimoireManifest(join(grimoiresDir, entry.name));
      
      if (manifest) {
        discovered.push({
          id: manifest.id,
          enabled: false, // Por defecto deshabilitado, se habilita explícitamente
          core: manifest.core,
        });
      }
    }
  } catch (err) {
    console.error("[Config] Error scanning grimoires:", err);
  }
  
  return discovered.sort((a, b) => a.id.localeCompare(b.id));
}

// ═══════════════════════════════════════════════════════════════
// MERGE LOGIC
// ═══════════════════════════════════════════════════════════════

async function buildConfig(): Promise<GremiusConfig> {
  const discovered = await discoverGrimoires();
  
  // Crear mapas para merge eficiente
  const baseFeaturesMap = new Map(BASE_FEATURE_GRIMOIRES.map(g => [g.id, g]));
  const discoveredMap = new Map(discovered.map(g => [g.id, g]));
  const coreIds = new Set(CORE_GRIMOIRES.map(g => g.id));
  
  // Merge features: base config tiene prioridad, pero añadimos los descubiertos que no están
  const mergedFeatures = new Map(baseFeaturesMap);
  
  for (const [id, grimoire] of discoveredMap) {
    if (!coreIds.has(id) && !mergedFeatures.has(id)) {
      // Grimoire detectado pero no en config base -> añadir como disabled
      mergedFeatures.set(id, grimoire);
      console.log(`[Config] Auto-discovered grimoire: ${id}`);
    }
  }
  
  // Convertir a array y ordenar
  const features = Array.from(mergedFeatures.values()).sort((a, b) => 
    a.id.localeCompare(b.id)
  );
  
  // Construir lista legacy de grimoires habilitados
  const allEnabled = [
    ...CORE_GRIMOIRES.filter(g => g.enabled).map(g => g.id),
    ...features.filter(g => g.enabled).map(g => g.id),
  ];
  
  return {
    core: CORE_GRIMOIRES,
    features,
    realm: [],
    // Backward compatibility
    grimoires: allEnabled,
    modules: allEnabled,
  };
}

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════

let cachedConfig: GremiusConfig | null = null;

export async function getConfig(): Promise<GremiusConfig> {
  if (!cachedConfig) {
    cachedConfig = await buildConfig();
  }
  return cachedConfig;
}

// Config estática para compatibilidad síncrona (sin auto-discovery)
export const staticConfig: GremiusConfig = {
  core: CORE_GRIMOIRES,
  features: BASE_FEATURE_GRIMOIRES,
  realm: [],
  grimoires: [
    ...CORE_GRIMOIRES.filter(g => g.enabled).map(g => g.id),
    ...BASE_FEATURE_GRIMOIRES.filter(g => g.enabled).map(g => g.id),
  ],
  modules: [
    ...CORE_GRIMOIRES.filter(g => g.enabled).map(g => g.id),
    ...BASE_FEATURE_GRIMOIRES.filter(g => g.enabled).map(g => g.id),
  ],
};

// Export default: intenta usar config dinámica, fallback a estática
const config = await buildConfig().catch(() => staticConfig);

export function isGrimoireEnabled(id: string): boolean {
  const core = config.core.find(g => g.id === id);
  if (core) return core.enabled;
  
  const feature = config.features.find(g => g.id === id);
  if (feature) return feature.enabled;
  
  return config.realm?.includes(id) || false;
}

export function getGrimoireConfig(id: string): GrimoireRef | undefined {
  return config.core.find(g => g.id === id) ||
         config.features.find(g => g.id === id);
}

export default config;
