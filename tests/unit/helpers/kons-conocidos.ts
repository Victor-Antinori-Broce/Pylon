/**
 * Qué kons hay para las guardias del núcleo (fase C)
 * ============================================================================
 *
 * Los kons viven en el repo kitsuden-kons y se instalan en packages/kons/<kon>/
 * (`kitsuden kon add`). Las guardias de kons del núcleo revisan lo INSTALADO; en
 * un clon limpio no hay nada instalado y las que solo afirman «hay kons que
 * revisar» se saltan (las mismas guardias corren sobre todos los kons en
 * kitsuden-kons, tests/guards).
 *
 * Para comprobar que un NOMBRE de kon existe (grimoires, enlaces del panel) sin
 * tenerlo instalado se mira, si está, el checkout hermano ../kitsuden-kons.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..", "..", "..");

function idsEn(dir: string): Set<string> {
  const ids = new Set<string>();
  if (!existsSync(dir)) return ids;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    for (const f of ["kon.json", "package.json"]) {
      const p = join(dir, e.name, f);
      if (!existsSync(p)) continue;
      try {
        const j = JSON.parse(readFileSync(p, "utf8"));
        const id = f === "kon.json" ? j.id : j.kitsuden?.id;
        if (typeof id === "string") ids.add(id);
        if (f === "kon.json" && typeof id === "string") break;
      } catch {
        // manifiesto ilegible: lo denuncian las guardias del manifiesto
      }
    }
  }
  return ids;
}

/** Kons instalados (copias en packages/kons) y módulos del núcleo (packages/core). */
export const KONS_INSTALADOS = new Set([
  ...idsEn(join(RAIZ, "packages", "kons")),
  ...idsEn(join(RAIZ, "packages", "core")),
]);

/** ¿Hay algún kon instalado aparte de los del núcleo? */
export const HAY_KONS_INSTALADOS = idsEn(join(RAIZ, "packages", "kons")).size > 0;

/** Los kons del checkout hermano de kitsuden-kons, o `null` si no está. */
export const KONS_DEL_REPO_HERMANO: Set<string> | null = existsSync(
  join(RAIZ, "..", "kitsuden-kons", "kons")
)
  ? idsEn(join(RAIZ, "..", "kitsuden-kons", "kons"))
  : null;

/**
 * ¿Este id es un kon que existe? Instalado o del núcleo: sí. Si no, lo dice el
 * repo hermano; sin él no se puede saber y se da por bueno (`desconocido`).
 */
export function estadoDelKon(id: string): "existe" | "no-existe" | "desconocido" {
  if (KONS_INSTALADOS.has(id)) return "existe";
  if (KONS_DEL_REPO_HERMANO) return KONS_DEL_REPO_HERMANO.has(id) ? "existe" : "no-existe";
  return "desconocido";
}
