/**
 * Bindings de React — contrato y garantías
 * ============================================================================
 *
 * La suite unitaria corre en Node sin DOM, así que aquí se fija lo que se puede
 * comprobar sin renderizar: que el core sigue agnóstico, que los hooks son
 * hooks de verdad, y que están las tres defensas que separan un binding usable
 * de uno que produce bugs.
 *
 * Renderizar componentes de verdad es trabajo de la suite de admin, que sí
 * tiene entorno DOM.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, test } from "vitest";

const ROOT = resolve(__dirname, "../..");
const REACT_PKG = join(ROOT, "packages/sdk-react");
const INDEX = readFileSync(join(REACT_PKG, "src/index.ts"), "utf8");
const SYNCED = readFileSync(join(REACT_PKG, "src/synced-state.ts"), "utf8");
const PKG = JSON.parse(readFileSync(join(REACT_PKG, "package.json"), "utf8"));
const SDK_PKG = JSON.parse(readFileSync(join(ROOT, "packages/sdk/package.json"), "utf8"));

// ── El core sigue agnóstico ──────────────────────────────────────────────────

describe("agnosticismo del core", () => {
  test("el SDK core NO depende de React", () => {
    // Es la propiedad que hace que Vue, Svelte o vanilla no paguen nada.
    const deps = { ...SDK_PKG.dependencies, ...SDK_PKG.peerDependencies };
    expect(Object.keys(deps)).not.toContain("react");
  });

  test("React es peerDependency del binding, no dependency", () => {
    // Como dependency, npm instalaría una segunda copia de React y romperían
    // los hooks con "invalid hook call".
    expect(PKG.peerDependencies.react).toBeDefined();
    expect(PKG.dependencies?.react).toBeUndefined();
  });

  test("acepta React 18 y 19: los hooks usados existen en ambas", () => {
    expect(PKG.peerDependencies.react).toMatch(/>=\s*18/);
  });
});

// ── Son hooks de verdad ──────────────────────────────────────────────────────

describe("hooks reales, no fábricas disfrazadas", () => {
  test("useKitsudenQuery tiene estado", () => {
    // Lo anterior se llamaba useXxx y devolvía { url, fetcher }: ni estado ni
    // suscripción. Peor que no usar el prefijo, porque rules-of-hooks lo trata
    // como hook y el dev espera estado.
    expect(INDEX).toMatch(/export function useKitsudenQuery/);
    // El nombre de Usagibase se queda como alias del MISMO hook: quitarlo
    // rompería a quien ya lo importa, y un envoltorio podría perder el estado.
    expect(INDEX).toMatch(/export const useUsagiQuery = useKitsudenQuery/);
    expect(INDEX).toMatch(/useState/);
    expect(INDEX).toMatch(/useEffect/);
  });

  test("expone loading y refreshing por separado", () => {
    // Recargar con datos ya presentes no debe parpadear la interfaz.
    expect(INDEX).toMatch(/refreshing/);
    expect(INDEX).toMatch(/hadData/);
  });

  test("useUsagiMutation DEVUELVE la promesa además de guardar estado", () => {
    // Sin esto no se puede encadenar (crear y navegar) ni capturar el error
    // donde se llama.
    expect(INDEX).toMatch(/mutate: \(\.\.\.args: TArgs\) => Promise<TResult>/);
    expect(INDEX).toMatch(/throw normalized/);
  });
});

// ── Las tres defensas ────────────────────────────────────────────────────────

describe("defensas contra bugs clásicos de React", () => {
  test("no actualiza tras desmontar", () => {
    // Cambiar de página con una petición en vuelo avisaría por consola, y con
    // StrictMode dos veces.
    expect(INDEX).toMatch(/mounted\.current/);
    expect(INDEX).toMatch(/mounted\.current = false/);
  });

  test("descarta respuestas obsoletas por nº de petición", () => {
    // El bug del buscador: dos peticiones fuera de orden y gana la última en
    // LLEGAR en vez de la última PEDIDA.
    expect(INDEX).toMatch(/requestId/);
    expect(INDEX).toMatch(/id !== requestId\.current/);
  });

  test("las deps se pasan explícitas, no se infieren de la función", () => {
    // Una función anónima cambia en cada render: compararla daría un bucle
    // infinito de peticiones.
    expect(INDEX).toMatch(/deps: readonly unknown\[\]/);
    expect(INDEX).toMatch(/\.\.\.deps\]/);
  });
});

// ── useSyncedState ───────────────────────────────────────────────────────────

describe("useSyncedState", () => {
  test("usa useSyncExternalStore y no useState", () => {
    // Con useState+useEffect hay tearing en modo concurrente: dos componentes
    // del mismo canal pueden pintar valores distintos en el mismo frame.
    expect(SYNCED).toMatch(/useSyncExternalStore/);
  });

  test("descarta mensajes atrasados, igual que el overlay", () => {
    // La misma defensa que impide que el marcador retroceda en directo.
    expect(SYNCED).toMatch(/message\.revision <= store\.revision/);
  });

  test("el snapshot viejo tampoco pisa lo que ya llegó por socket", () => {
    expect(SYNCED).toMatch(/snap\.revision <= store\.revision/);
  });

  test("varios componentes con la misma clave COMPARTEN socket", () => {
    // Una lista de diez marcadores abriría diez conexiones sin esto.
    expect(SYNCED).toMatch(/refCount\+\+/);
    expect(SYNCED).toMatch(/store\.refCount === 1\) connect/);
  });

  test("solo cierra cuando nadie queda suscrito", () => {
    // Cerrar al desmontar el primer componente cortaría el canal a los demás.
    expect(SYNCED).toMatch(/store\.refCount === 0/);
  });

  test("emite un snapshot NUEVO en cada cambio", () => {
    // useSyncExternalStore compara por identidad: mutar el mismo objeto haría
    // que React no repintara nunca.
    expect(SYNCED).toMatch(/store\.snapshot = \{/);
  });

  test("funciona en SSR y RSC sin romper la hidratación", () => {
    // En servidor no hay WebSocket; sin getServerSnapshot, React lanza.
    expect(SYNCED).toMatch(/getServerSnapshot/);
    expect(SYNCED).toMatch(/typeof window === "undefined"/);
  });

  test("reconecta con backoff acotado y solo si queda alguien", () => {
    expect(SYNCED).toMatch(/Math\.min\(500 \* 2 \*\* store\.retry\+\+, 10_000\)/);
    expect(SYNCED).toMatch(/store\.refCount === 0\) return/);
  });

  test("las opciones se leen por ref", () => {
    // Pasarlas como objeto literal es lo normal, y cambiaría de identidad en
    // cada render: sin la ref, reconectaría sin parar.
    expect(SYNCED).toMatch(/optionsRef\.current = options/);
  });
});
