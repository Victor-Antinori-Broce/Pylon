/**
 * What an install or an update asks for — the permission diff
 * ============================================================================
 *
 * Same idea as the capability diff of code promotion (docs/agents/promotion.md
 * → "Declared capabilities"): compare what the new version DECLARES with what
 * the installed one declared, and make the human say yes to anything wider.
 *
 *   scopesAdded      scopes not covered by the old list (wildcards count:
 *                    `datasets:*:read` covers `datasets:clients:read`)
 *   denialsRemoved   `!deny` entries the new version drops (that widens too)
 *   hostsAdded       outbound hosts not covered (`*.a.com` covers `b.a.com`)
 *   sensitiveAdded   new sensitive operations
 *   tablesAdded, migrationsAdded, licenseChanged, keyChanged — shown, and the
 *   last two also require confirmation.
 */

import type { ManifiestoNormalizado, PermisosDeclarados } from "./manifiesto.js";

export interface DiffDePermisos {
  id: string;
  desde: string | null;
  hasta: string;
  nuevo: boolean;
  scopesAdded: string[];
  denialsRemoved: string[];
  hostsAdded: string[];
  sensitiveAdded: string[];
  tablesAdded: string[];
  migrationsAdded: string[];
  licenseChanged: { from: string | null; to: string | null } | null;
  keyChanged: { from: string; to: string } | null;
}

function patron(scope: string): RegExp {
  return new RegExp(
    "^" + scope.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^:]*") + "$"
  );
}

/** Does one of `lista` cover `scope`? `*` matches within one segment; a trailing `:*` or bare `*` matches the rest. */
export function scopeCubierto(scope: string, lista: string[]): boolean {
  return lista.some((s) => {
    if (s.startsWith("!")) return false;
    if (s === "*" || s === "admin") return true;
    if (s === scope) return true;
    if (s.endsWith(":*") && scope.startsWith(s.slice(0, -1))) return true;
    return patron(s).test(scope);
  });
}

export function hostCubierto(host: string, lista: string[]): boolean {
  return lista.some((h) => h === host || (h.startsWith("*.") && host.endsWith(h.slice(1)) && host.length > h.length - 1));
}

const vacio: PermisosDeclarados = { scopes: [], hosts: [], sensitive: [] };

export function diffDePermisos(
  antes: { manifiesto: ManifiestoNormalizado | null; keyId?: string | null } | null,
  despues: { manifiesto: ManifiestoNormalizado; keyId?: string | null }
): DiffDePermisos {
  const a = antes?.manifiesto?.permissions ?? vacio;
  const d = despues.manifiesto.permissions ?? vacio;
  const otorgados = a.scopes.filter((s) => !s.startsWith("!"));
  const negadosAntes = a.scopes.filter((s) => s.startsWith("!"));
  const negadosDespues = new Set(d.scopes.filter((s) => s.startsWith("!")));
  const licA = antes?.manifiesto?.license ?? null;
  const licD = despues.manifiesto.license ?? null;
  return {
    id: despues.manifiesto.id,
    desde: antes?.manifiesto?.version ?? null,
    hasta: despues.manifiesto.version,
    nuevo: !antes?.manifiesto,
    scopesAdded: d.scopes.filter((s) => !s.startsWith("!") && !scopeCubierto(s, otorgados)),
    denialsRemoved: negadosAntes.filter((s) => !negadosDespues.has(s)),
    hostsAdded: d.hosts.filter((h) => !hostCubierto(h, a.hosts)),
    sensitiveAdded: d.sensitive.filter((s) => !a.sensitive.includes(s)),
    tablesAdded: despues.manifiesto.tables.filter((t) => !(antes?.manifiesto?.tables ?? []).includes(t)),
    migrationsAdded: despues.manifiesto.migrations.filter((m) => !(antes?.manifiesto?.migrations ?? []).includes(m)),
    licenseChanged: antes?.manifiesto && licA !== licD ? { from: licA, to: licD } : null,
    keyChanged:
      antes?.keyId && despues.keyId && antes.keyId !== despues.keyId ? { from: antes.keyId, to: despues.keyId } : null,
  };
}

/** Wider than before: needs an explicit yes (on update, more than --yes). */
export function amplia(d: DiffDePermisos): boolean {
  return (
    d.scopesAdded.length > 0 ||
    d.denialsRemoved.length > 0 ||
    d.hostsAdded.length > 0 ||
    d.sensitiveAdded.length > 0 ||
    d.keyChanged !== null
  );
}

export function textoDelDiff(d: DiffDePermisos, m: ManifiestoNormalizado): string[] {
  const l: string[] = [];
  const titulo = d.nuevo ? `${d.id}@${d.hasta} (new)` : `${d.id} ${d.desde} → ${d.hasta}`;
  l.push(titulo);
  l.push(`    license     ${m.license ?? "(none)"}${d.licenseChanged ? `  (was ${d.licenseChanged.from ?? "none"})` : ""}`);
  if (m.author) l.push(`    author      ${m.author.name}`);
  if (m.repository) l.push(`    repository  ${m.repository.url}`);
  const p = m.permissions ?? vacio;
  const marcar = (x: string, nuevos: string[]) => (nuevos.includes(x) ? `+ ${x}` : `  ${x}`);
  l.push(`    scopes      ${p.scopes.length ? p.scopes.map((s) => marcar(s, d.scopesAdded)).join(", ") : "(none)"}`);
  if (d.denialsRemoved.length) l.push(`    denials removed: ${d.denialsRemoved.join(", ")}`);
  l.push(`    hosts       ${p.hosts.length ? p.hosts.map((h) => marcar(h, d.hostsAdded)).join(", ") : "(none: no outbound network)"}`);
  l.push(`    sensitive   ${p.sensitive.length ? p.sensitive.map((s) => marcar(s, d.sensitiveAdded)).join(", ") : "(none)"}`);
  l.push(`    tables      ${m.tables.length ? m.tables.map((t) => marcar(t, d.tablesAdded)).join(", ") : "(none)"}`);
  l.push(`    migrations  ${m.migrations.length ? m.migrations.map((x) => marcar(x, d.migrationsAdded)).join(", ") : "(none)"}`);
  if (d.keyChanged) l.push(`    ! signing key changed: ${d.keyChanged.from} → ${d.keyChanged.to}`);
  return l;
}
