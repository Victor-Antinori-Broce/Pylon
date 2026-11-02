/**
 * Dependency resolution and the lockfile (`kitsuden.kons.lock`)
 * ============================================================================
 *
 * RESOLUTION. Requests are `{id: range}`; every chosen version adds its own
 * `dependencies.kons` ranges. Each kon gets the highest version that
 *   · satisfies EVERY range that applies to it,
 *   · is not yanked (a yanked version stays installable only when the lockfile
 *     already pins it — Cargo's rule — and that prints a warning),
 *   · is not revoked by an advisory (never, lockfile or not),
 *   · declares a `kitsuden` range this core satisfies and an `sdk` it provides.
 * A locked version that still fits is kept (`update` lifts the lock). The loop
 * re-derives the ranges from the current choice until nothing changes; a
 * conflict is reported with who asked for what. Core kons (kon-media…) and
 * kons installed from a source folder (`kon add --from`) satisfy dependencies
 * without coming from the registry, if their version fits.
 *
 * LOCKFILE. Exact version, tarball URL, SHA-256, content hash, signing key and
 * the normalized manifest (the baseline for the next permission diff) of every
 * registry kon. Commit it: `kon sync` installs exactly what it says, verifying
 * each package again.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { avisosDe, estaRevocada, versionesDe, type Indice, type VersionPublicada } from "./indice.js";
import { KONS_DEL_NUCLEO, compatibleConElNucleo, type ManifiestoNormalizado } from "./manifiesto.js";
import { satisfies } from "./semver.js";

export const FICHERO_DE_BLOQUEO = "kitsuden.kons.lock";

export interface EntradaDeBloqueo {
  version: string;
  registry: string;
  tarball: string;
  sha256: string;
  contentHash: string;
  keyId: string | null;
  /** The publisher's public key (minisign base64), for offline `kon verify`. */
  publicKey?: string;
  signed: boolean;
  license: string | null;
  /** The range asked for on the command line (only for kons asked directly). */
  requested?: string;
  dependencies: Record<string, string>;
  manifest: ManifiestoNormalizado;
}

export interface Bloqueo {
  $comment?: string;
  lockfileVersion: 1;
  registries: Record<string, { url: string; keyId: string | null; serial: number }>;
  kons: Record<string, EntradaDeBloqueo>;
}

const COMENTARIO =
  "Exact kons installed from a registry, with their hashes and signing keys. Written by " +
  "`kitsuden kon add|update|remove`; `kitsuden kon sync` installs exactly this. Commit it.";

export function leerBloqueo(raiz: string): Bloqueo {
  const ruta = join(raiz, FICHERO_DE_BLOQUEO);
  if (!existsSync(ruta)) return { lockfileVersion: 1, registries: {}, kons: {} };
  const j = JSON.parse(readFileSync(ruta, "utf8")) as Bloqueo;
  if (j.lockfileVersion !== 1) throw new Error(`${FICHERO_DE_BLOQUEO}: lockfileVersion ${j.lockfileVersion} is not supported`);
  return { lockfileVersion: 1, registries: j.registries ?? {}, kons: j.kons ?? {} };
}

export function escribirBloqueo(raiz: string, b: Bloqueo): void {
  const kons = Object.fromEntries(Object.entries(b.kons).sort(([x], [y]) => x.localeCompare(y)));
  writeFileSync(
    join(raiz, FICHERO_DE_BLOQUEO),
    JSON.stringify({ $comment: COMENTARIO, lockfileVersion: 1, registries: b.registries, kons }, null, 2) + "\n"
  );
}

export class ErrorDeResolucion extends Error {}

export interface Eleccion {
  id: string;
  version: string;
  entrada: VersionPublicada;
  directo: boolean;
  bloqueada: boolean;
}

export interface OpcionesDeResolucion {
  indice: Indice;
  pedidos: Record<string, string>;
  bloqueo?: Bloqueo;
  /** Kons whose lock is lifted (`update`); "all" lifts every lock. */
  actualizar?: Set<string> | "all";
  versionDelNucleo: string | null;
  sdkDelNucleo: number | null;
  /** Kons installed outside the registry (source copies, links): id → version. */
  instaladosFuera?: Record<string, string | undefined>;
}

export interface Resolucion {
  plan: Eleccion[];
  avisos: string[];
}

export function resolver(o: OpcionesDeResolucion): Resolucion {
  const { indice } = o;
  const avisos = new Set<string>();
  const elegidos = new Map<string, string>();
  const liberado = (id: string) => o.actualizar === "all" || (o.actualizar?.has(id) ?? false);

  const elegir = (id: string, rangos: { rango: string; por: string }[]): string => {
    const bloqueada = o.bloqueo?.kons[id]?.version;
    const motivos: string[] = [];
    const candidatas = versionesDe(indice, id).filter((v) => {
      const e = indice.kons[id]!.versions[v]!;
      const revocada = estaRevocada(indice, id, v);
      if (revocada) {
        motivos.push(`${v}: revoked (${revocada.id}: ${revocada.summary})`);
        return false;
      }
      if (e.yanked && !(v === bloqueada && !liberado(id))) {
        motivos.push(`${v}: yanked${e.yankReason ? ` (${e.yankReason})` : ""}`);
        return false;
      }
      if (!compatibleConElNucleo(e.manifest.kitsuden, o.versionDelNucleo)) {
        motivos.push(`${v}: needs kitsuden ${e.manifest.kitsuden}, this core is ${o.versionDelNucleo}`);
        return false;
      }
      if (o.sdkDelNucleo !== null && e.manifest.sdk !== null && e.manifest.sdk > o.sdkDelNucleo) {
        motivos.push(`${v}: needs kon SDK v${e.manifest.sdk}, this core provides v${o.sdkDelNucleo}`);
        return false;
      }
      const falla = rangos.find((r) => !satisfies(v, r.rango));
      if (falla) {
        motivos.push(`${v}: does not satisfy ${falla.rango} (from ${falla.por})`);
        return false;
      }
      return true;
    });
    if (!candidatas.length) {
      throw new ErrorDeResolucion(
        `no version of ${id} fits: ` +
          rangos.map((r) => `${r.rango} (from ${r.por})`).join(", ") +
          (motivos.length ? `\n  ${motivos.join("\n  ")}` : "\n  (it has no published versions)")
      );
    }
    const elegida = bloqueada && !liberado(id) && candidatas.includes(bloqueada) ? bloqueada : candidatas[0]!;
    const e = indice.kons[id]!.versions[elegida]!;
    if (e.yanked) avisos.add(`${id}@${elegida} is yanked; kept because the lockfile pins it. Run \`kon update ${id}\`.`);
    for (const a of avisosDe(indice, id, elegida)) {
      if (!a.revoked) avisos.add(`${id}@${elegida}: advisory ${a.id} (${a.severity}): ${a.summary}`);
    }
    return elegida;
  };

  for (let vuelta = 0; vuelta < 100; vuelta++) {
    const rangos = new Map<string, { rango: string; por: string }[]>();
    const sumar = (id: string, rango: string, por: string) => {
      if (!rangos.has(id)) rangos.set(id, []);
      rangos.get(id)!.push({ rango, por });
    };
    for (const [id, rango] of Object.entries(o.pedidos)) sumar(id, rango, "your request");
    for (const [id, v] of elegidos) {
      for (const [dep, rango] of Object.entries(indice.kons[id]!.versions[v]!.manifest.dependencies)) {
        sumar(dep, rango, `${id}@${v}`);
      }
    }
    let cambio = false;
    for (const [id, lista] of rangos) {
      if (KONS_DEL_NUCLEO.has(id)) continue;
      const fuera = o.instaladosFuera?.[id];
      if (o.instaladosFuera && id in o.instaladosFuera && !(id in o.pedidos)) {
        const falla = lista.find((r) => !fuera || !satisfies(fuera, r.rango));
        if (falla) {
          throw new ErrorDeResolucion(
            `${id} is installed from a source folder (version ${fuera ?? "unknown"}) and ${falla.por} needs ${falla.rango}. ` +
              `Remove it, or install it from the registry: kon add ${id}@"${falla.rango}"`
          );
        }
        continue;
      }
      if (!indice.kons[id]) {
        const por = lista.map((r) => r.por).join(", ");
        throw new ErrorDeResolucion(`${id} (needed by ${por}) is not in the registry`);
      }
      const v = elegir(id, lista);
      if (elegidos.get(id) !== v) {
        elegidos.set(id, v);
        cambio = true;
      }
    }
    for (const id of [...elegidos.keys()]) {
      if (!rangos.has(id)) {
        elegidos.delete(id);
        cambio = true;
      }
    }
    if (!cambio) {
      const plan: Eleccion[] = [...elegidos].map(([id, version]) => ({
        id,
        version,
        entrada: indice.kons[id]!.versions[version]!,
        directo: id in o.pedidos,
        bloqueada: o.bloqueo?.kons[id]?.version === version,
      }));
      // Dependencies first: install order.
      const orden: Eleccion[] = [];
      const visitar = (e: Eleccion, pila: Set<string>) => {
        if (orden.includes(e)) return;
        if (pila.has(e.id)) throw new ErrorDeResolucion(`dependency cycle: ${[...pila, e.id].join(" → ")}`);
        pila.add(e.id);
        for (const dep of Object.keys(e.entrada.manifest.dependencies)) {
          const d = plan.find((p) => p.id === dep);
          if (d) visitar(d, pila);
        }
        pila.delete(e.id);
        orden.push(e);
      };
      for (const e of plan.sort((a, b) => a.id.localeCompare(b.id))) visitar(e, new Set());
      return { plan: orden, avisos: [...avisos] };
    }
  }
  throw new ErrorDeResolucion("dependency resolution did not converge (conflicting ranges)");
}

/** `blog@^1.2`, `kon-blog@1.0.0`, `blog` → {id, range}. */
export function leerPedido(texto: string, idDeKon: (n: string) => string): { id: string; rango: string } {
  const t = texto.trim();
  const at = t.lastIndexOf("@");
  if (at > 0) return { id: idDeKon(t.slice(0, at)), rango: t.slice(at + 1).trim() || "*" };
  return { id: idDeKon(t), rango: "*" };
}
