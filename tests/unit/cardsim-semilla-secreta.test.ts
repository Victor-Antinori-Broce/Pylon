/**
 * cardsim: el azar de una partida no se puede deducir (auditoría 2026-10-25)
 * ============================================================================
 *
 * Antes: semilla de 31 bits, subsemillas `seed + cursor·7919` e `instanceId`
 * en orden de mazo. Un jugador deducía la permutación de su mano, probaba las
 * 2³¹ semillas y conocía su mazo, el del rival y todo el azar futuro.
 *
 * Ahora el servidor pasa una semilla FUNCIÓN (HMAC sobre un secreto de 256
 * bits) y, con ella, los `instanceId` se reparten al azar. Las partidas con
 * semilla numérica (antiguas, solitario) no cambian.
 */
import { describe, expect, it } from "vitest";

import { replay, type GameDefinition } from "../../packages/kons/kon-cardsim/cardsim.engine";
import { semillaDe, subsemillasUsadas } from "../../packages/kons/kon-cardsim/cardsim.semilla";

const juego = {
  id: "prueba",
  name: "Prueba",
  players: { min: 2, max: 2 },
  zones: [
    { id: "deck", name: "Mazo", visibility: "none", ordered: true },
    { id: "hand", name: "Mano", visibility: "owner" },
  ],
  resources: [],
  deckZone: "deck",
  handZone: "hand",
  openingHand: 7,
  phases: ["Main"],
  firstPlayer: "random",
  deckRules: { minSize: 40, maxSize: 40, maxCopies: 40 },
} as unknown as GameDefinition;

const mazo = Array.from({ length: 40 }, (_, i) => `c${String(i).padStart(2, "0")}`);
const mano = (s: ReturnType<typeof replay>, p: number) => s.players[p]!.zones.hand!;

describe("semilla secreta", () => {
  it("con secreto, los instanceId de la mano no dicen la posición en el mazo", () => {
    const sesion = { seed: 1, rngSecreto: "a".repeat(64) };
    const s = replay(juego, [mazo, mazo], semillaDe(sesion), []);
    // En orden de mazo, id = posición + 1 → c00 tendría id 1. Con ids al azar,
    // el id de cada carta no casa con su índice en la lista del mazo.
    const casan = mano(s, 0).filter((c) => c.instanceId === mazo.indexOf(c.cardId) + 1).length;
    expect(casan).toBeLessThan(3);
  });

  it("misma partida, mismo estado (el replay sigue siendo exacto)", () => {
    const sesion = { seed: 1, rngSecreto: "b".repeat(64) };
    const a = replay(juego, [mazo, mazo], semillaDe(sesion), []);
    const b = replay(juego, [mazo, mazo], semillaDe(sesion), []);
    expect(mano(a, 1)).toEqual(mano(b, 1));
  });

  it("la misma semilla numérica con otro secreto da otro reparto", () => {
    const a = replay(juego, [mazo, mazo], semillaDe({ seed: 7, rngSecreto: "c".repeat(64) }), []);
    const b = replay(juego, [mazo, mazo], semillaDe({ seed: 7, rngSecreto: "d".repeat(64) }), []);
    expect(mano(a, 1).map((c) => c.cardId)).not.toEqual(mano(b, 1).map((c) => c.cardId));
  });

  it("sin secreto (partida antigua), la semilla numérica manda como antes", () => {
    const a = replay(juego, [mazo, mazo], semillaDe({ seed: 42, rngSecreto: null }), []);
    const b = replay(juego, [mazo, mazo], 42, []);
    expect(mano(a, 0)).toEqual(mano(b, 0));
  });

  it("con las subsemillas usadas, un cliente reproduce la partida sin el secreto", () => {
    const semilla = semillaDe({ seed: 1, rngSecreto: "e".repeat(64) });
    const s = replay(juego, [mazo, mazo], semilla, []);
    const subs = subsemillasUsadas(semilla, s.rngCursor)!;
    const enCliente = replay(juego, [mazo, mazo], (cursor) => subs[cursor]!, []);
    expect(mano(enCliente, 1)).toEqual(mano(s, 1));
  });
});

import { goldfish, GoldfishError } from "../../packages/kons/kon-cardsim/cardsim.goldfish";

describe("goldfish con presupuesto de trabajo", () => {
  const filtro = { property: "id", op: "eq", value: "c00" };
  it("una consulta normal se simula entera", () => {
    const r = goldfish(juego, mazo, {}, [{ id: "q", cards: 7, require: [{ label: "x", count: 1, filters: [filtro] }] }] as never, {
      iterations: 1000,
    });
    expect(r.iterations).toBe(1000);
  });

  it("una consulta gigante se recorta o se rechaza, nunca se simula entera", () => {
    const enorme = Array.from({ length: 20 }, (_, i) => ({
      id: `q${i}`,
      cards: 40,
      require: Array.from({ length: 8 }, (_, j) => ({ label: `r${j}`, count: 40, filters: Array(8).fill(filtro) })),
    }));
    let iteraciones = Infinity;
    try {
      iteraciones = goldfish(juego, mazo, {}, enorme as never, { iterations: 50_000 }).iterations;
    } catch (err) {
      expect(err).toBeInstanceOf(GoldfishError);
      iteraciones = 0;
    }
    expect(iteraciones).toBeLessThan(50_000);
  });
});
