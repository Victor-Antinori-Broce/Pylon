/**
 * Lectura del manifiesto de un grimoire — con el respaldo heredado ACOTADO
 * ============================================================================
 *
 * En `packages/grimoires/<id>/` conviven DOS manifiestos que NO son lo mismo:
 *
 *   grimoire.json → el grimoire.  type: "grimoire", id: "grimoire-viggo",
 *                                 kons, optional_kons, konConfig, seed
 *   kitsuden.json → el TEMA.      type: "theme",    id: "kitsuden-viggo",
 *                                 css_entry, theme_type
 *
 * Seis sitios distintos leían el segundo como respaldo del primero, con la
 * forma `grimoire.json || kitsuden.json`. Y el tema encaja lo justo para
 * colarse: tiene `id`, `name` y `version`, así que ninguna validación saltaba.
 * Lo que no tiene es `kons`. El resultado de un `grimoire.json` ausente o
 * ilegible no era un error, era un grimoire registrado con el id del TEMA
 * (`kitsuden-viggo` en vez de `grimoire-viggo`) y con CERO kons montados.
 * Fallo total, silencioso y con toda la apariencia de haber ido bien.
 *
 * El respaldo se conserva —hay grimoires antiguos que solo traen
 * `kitsuden.json`— pero ahora solo se acepta si lo que hay dentro es de
 * verdad un grimoire. Un `type: "theme"` se rechaza.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Los tipos que un manifiesto declara en Kitsuden. */
const TIPOS_CONOCIDOS = new Set(["grimoire", "kon", "module", "theme"]);

export interface ManifiestoGrimoire {
  id: string;
  name?: string;
  version?: string;
  description?: string;
  type?: string;
  kons?: string[];
  optional_kons?: string[];
  bundled_modules?: string[];
  [clave: string]: unknown;
}

/**
 * ¿Este JSON es el manifiesto del tipo que se espera?
 *
 * Un manifiesto SIN `type` se acepta: es la forma heredada y no hay motivo
 * para romperla. Lo que se rechaza es el que declara ser otra cosa.
 */
export function manifiestoEsDeTipo(json: unknown, esperado: "grimoire" | "kon"): boolean {
  if (!json || typeof json !== "object") return false;

  const m = json as ManifiestoGrimoire;
  if (typeof m.id !== "string" || m.id.length === 0) return false;

  const tipo = typeof m.type === "string" ? m.type : null;
  if (tipo === null) return true; // heredado: sin `type` declarado
  if (!TIPOS_CONOCIDOS.has(tipo)) return true; // tipo ajeno: no nos toca juzgarlo

  return esperado === "kon" ? tipo === "kon" || tipo === "module" : tipo === "grimoire";
}

/**
 * Lee el manifiesto del grimoire que hay en `dirGrimoire`.
 *
 * Devuelve `null` si no hay ninguno utilizable. Un JSON roto o un manifiesto
 * que resulta ser el del tema se avisan por consola: son estados que alguien
 * tiene que arreglar, no rutas normales del programa.
 */
export async function leerManifiestoGrimoire(
  dirGrimoire: string
): Promise<ManifiestoGrimoire | null> {
  for (const nombre of ["grimoire.json", "kitsuden.json"]) {
    const ruta = join(dirGrimoire, nombre);

    let crudo: string;
    try {
      crudo = await readFile(ruta, "utf8");
    } catch {
      continue; // no existe: es normal, kitsuden.json es opcional
    }

    let json: unknown;
    try {
      json = JSON.parse(crudo);
    } catch (err) {
      console.warn(`[Grimoire] ${ruta} no es JSON válido: ${(err as Error).message}`);
      continue;
    }

    if (!manifiestoEsDeTipo(json, "grimoire")) {
      // kitsuden.json siendo el tema es lo ESPERADO, no un aviso.
      if (nombre !== "kitsuden.json") {
        console.warn(`[Grimoire] ${ruta} no es un manifiesto de grimoire; se ignora.`);
      }
      continue;
    }

    return json as ManifiestoGrimoire;
  }

  return null;
}

/**
 * Kons que un grimoire trae empaquetados (los obligatorios, no los opcionales).
 */
export async function leerKonsDelGrimoire(dirGrimoire: string): Promise<string[]> {
  const manifiesto = await leerManifiestoGrimoire(dirGrimoire);
  if (!manifiesto) return [];
  return manifiesto.kons || manifiesto.bundled_modules || [];
}

// ═══════════════════════════════════════════════════════════════════════════
// MANIFIESTO DE UN KON
// ═══════════════════════════════════════════════════════════════════════════

export interface ManifiestoKon {
  id: string;
  name: string;
  version?: string;
  [clave: string]: unknown;
}

/**
 * Lee el `kon.json` de un directorio.
 *
 * Vive aquí y no en module-loader por dos motivos. Uno: es la misma operación
 * que la de los grimoires y comparte la comprobación de tipo. Dos, y más
 * importante: module-loader arrastra `../db` y usa `Bun.file`, así que su
 * versión NO se puede ejercitar desde la suite de vitest — y una lectura de
 * manifiesto que nadie puede probar es justo la que se llenó de `catch {}`.
 *
 * "No hay kon.json" es normal y devuelve null callando. "Lo hay pero está
 * roto" o "lo hay pero declara otra cosa" son averías, y avisan.
 */
export async function leerManifiestoKon(dirKon: string): Promise<ManifiestoKon | null> {
  const ruta = join(dirKon, "kon.json");

  let crudo: string;
  try {
    crudo = await readFile(ruta, "utf8");
  } catch {
    return null; // no existe: la mayoría de directorios no son kons
  }

  let json: unknown;
  try {
    json = JSON.parse(crudo);
  } catch (err) {
    console.warn(`  ⚠️  ${ruta} no es JSON válido: ${(err as Error).message}`);
    return null;
  }

  if (!manifiestoEsDeTipo(json, "kon")) {
    console.warn(`  ⚠️  ${ruta} no declara un kon; se ignora.`);
    return null;
  }

  return json as ManifiestoKon;
}
