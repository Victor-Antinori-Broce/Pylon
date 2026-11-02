/**
 * Kitsuden — Compatibilidad de versiones kon ↔ core (estrategia de versioning)
 *
 * El PRODUCTO (root, api, admin, sdk, cli, shared, engine) versiona en
 * lockstep (0.9.0-beta juntos). Los KONS y GRIMOIRES versionan de forma
 * INDEPENDIENTE (semver propio, como plugins de WordPress/VS Code) y
 * declaran compatibilidad con el core en su manifest:
 *
 *   kon.json:
 *     "kitsuden": ">=0.9.0"          ← rango (recomendado)
 *     "minKitsudenVersion": "0.9.0"  ← mínimo (campo legacy, también soportado)
 *
 * El loader valida al resolver y emite un WARNING si no satisface —
 * nunca bloquea (decisión beta: visibilidad sin romper cargas existentes).
 *
 * Rangos soportados (sin dependencia de semver npm — subset pragmático):
 *   "*"          cualquier versión
 *   ">=x.y.z"    / ">x.y.z" / "<=x.y.z" / "<x.y.z"
 *   "^x.y.z"     misma major (para 0.y.z: misma minor, convención semver)
 *   "~x.y.z"     misma major.minor
 *   "x.y.z"      exacta
 *   Combinación AND separada por espacios: ">=0.9.0 <2.0.0"
 *
 * NOTA prerelease: la comparación usa solo la base x.y.z (se ignora
 * "-beta"), así "0.9.0-beta" satisface ">=0.9.0". Es intencional: en beta
 * los kons declaran compatibilidad contra la línea 0.9, no contra el tag.
 */

export type SemverTriple = [number, number, number];

/** Parsea "x.y.z(-pre)" → [x,y,z]; null si no es parseable */
export function parseSemverBase(version: string): SemverTriple | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compare(a: SemverTriple, b: SemverTriple): number {
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]! ? -1 : 1;
  }
  return 0;
}

function satisfiesClause(current: SemverTriple, clause: string): boolean {
  const c = clause.trim();
  if (c === "" || c === "*" || c === "x") return true;

  const m = /^(>=|<=|>|<|\^|~)?\s*v?(\d+)\.(\d+)\.(\d+)/.exec(c);
  if (!m) return true; // rango no parseable → no bloquear (tolerante)

  const op = m[1] ?? "";
  const target: SemverTriple = [Number(m[2]), Number(m[3]), Number(m[4])];
  const cmp = compare(current, target);

  switch (op) {
    case ">=":
      return cmp >= 0;
    case ">":
      return cmp > 0;
    case "<=":
      return cmp <= 0;
    case "<":
      return cmp < 0;
    case "^":
      // Misma major; para 0.y.z la convención semver fija también la minor
      if (target[0] === 0) {
        return current[0] === 0 && current[1] === target[1] && cmp >= 0;
      }
      return current[0] === target[0] && cmp >= 0;
    case "~":
      return current[0] === target[0] && current[1] === target[1] && cmp >= 0;
    default:
      return cmp === 0; // exacta
  }
}

/**
 * ¿`currentVersion` satisface `range`? (AND de cláusulas separadas por espacio)
 * Tolerante: versiones/rangos no parseables devuelven true (warning ≠ bloqueo).
 */
export function satisfiesKitsudenRange(currentVersion: string, range: string): boolean {
  const current = parseSemverBase(currentVersion);
  if (!current) return true;
  return range
    .split(/\s+/)
    .filter(Boolean)
    .every((clause) => satisfiesClause(current, clause));
}

/**
 * Valida el manifest de un kon contra la versión del core.
 * Devuelve null si es compatible (o no declara nada), o el mensaje de warning.
 * Soporta `kitsuden` (rango) y el legacy `minKitsudenVersion` (equivale a ">=x.y.z").
 */
export function checkKonCompatibility(
  coreVersion: string,
  manifest: { id?: string; kitsuden?: string; minKitsudenVersion?: string } | null | undefined
): string | null {
  if (!manifest) return null;

  const range =
    manifest.kitsuden ?? (manifest.minKitsudenVersion ? `>=${manifest.minKitsudenVersion}` : null);
  if (!range) return null;

  if (satisfiesKitsudenRange(coreVersion, range)) return null;

  return (
    `Kon '${manifest.id ?? "unknown"}' declara compatibilidad "${range}" ` +
    `pero el core es v${coreVersion}. Se carga igualmente (warning, no bloqueo) — ` +
    `puede fallar en runtime. Actualiza el kon o el campo "kitsuden" de su kon.json.`
  );
}
