/**
 * Synced State — el primitivo tipo replicant
 * ============================================================================
 *
 * Lo que se fija aquí es el contrato del que depende un overlay en directo:
 * que difunda, que persista agrupando ráfagas, y sobre todo que un mensaje
 * atrasado NUNCA pise un estado más nuevo.
 */

import { afterEach, describe, expect, test } from "vitest";

import {
  createMemoryStateStore,
  defineSyncedState,
  getSyncedState,
  resetSyncedState,
  setStateStore,
  setStateTransport,
  stateChannel,
  type SyncedStateMessage,
} from "../../packages/engine/src/state";

type Score = { a: number; b: number; round?: string };

function fakeTransport() {
  const sent: { channel: string; message: SyncedStateMessage }[] = [];
  return {
    sent,
    broadcast(channel: string, message: unknown) {
      sent.push({ channel, message: message as SyncedStateMessage });
    },
  };
}

afterEach(() => {
  resetSyncedState();
});

describe("declaración", () => {
  test("la misma clave devuelve la MISMA instancia", () => {
    const a = defineSyncedState<Score>("m:1", { default: { a: 0, b: 0 } });
    const b = defineSyncedState<Score>("m:1", { default: { a: 9, b: 9 } });
    // Dos módulos hablando del mismo marcador no pueden acabar con dos copias.
    expect(b).toBe(a);
    expect(b.get()).toEqual({ a: 0, b: 0 });
    expect(getSyncedState<Score>("m:1")).toBe(a);
  });

  test("el canal lleva prefijo para que el autorizador pueda casarlo", () => {
    const s = defineSyncedState<Score>("broadcast:match:42", { default: { a: 0, b: 0 } });
    expect(s.channel).toBe("state:broadcast:match:42");
    expect(stateChannel("broadcast:match:42")).toBe(s.channel);
  });
});

describe("mutación y difusión", () => {
  test("set incrementa la revisión y difunde el valor nuevo", async () => {
    const t = fakeTransport();
    setStateTransport(t);
    const s = defineSyncedState<Score>("m:2", { default: { a: 0, b: 0 }, persist: false });

    expect(s.revision).toBe(0);
    await s.set({ a: 1, b: 0 });

    expect(s.revision).toBe(1);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].channel).toBe("state:m:2");
    expect(t.sent[0].message).toEqual({
      type: "state:sync",
      key: "m:2",
      revision: 1,
      value: { a: 1, b: 0 },
    });
  });

  test("patch mezcla y no pierde las claves que no toca", async () => {
    const s = defineSyncedState<Score>("m:3", {
      default: { a: 0, b: 0, round: "Winners" },
      persist: false,
    });
    await s.patch({ a: 2 });
    expect(s.get()).toEqual({ a: 2, b: 0, round: "Winners" });
  });

  test("los suscriptores reciben cada cambio", async () => {
    const s = defineSyncedState<Score>("m:4", { default: { a: 0, b: 0 }, persist: false });
    const seen: number[] = [];
    const off = s.subscribe((v) => seen.push(v.a));

    await s.set({ a: 1, b: 0 });
    await s.set({ a: 2, b: 0 });
    off();
    await s.set({ a: 3, b: 0 });

    expect(seen).toEqual([1, 2]); // tras desuscribirse ya no llega nada
  });

  test("un suscriptor que revienta no tumba a los demás", async () => {
    const s = defineSyncedState<Score>("m:5", { default: { a: 0, b: 0 }, persist: false });
    s.subscribe(() => {
      throw new Error("panel roto");
    });
    const seen: number[] = [];
    s.subscribe((v) => seen.push(v.a));

    await s.set({ a: 7, b: 0 });
    expect(seen).toEqual([7]);
  });
});

describe("mensajes remotos — la defensa contra el reordenamiento", () => {
  test("aplica un mensaje más nuevo", () => {
    const s = defineSyncedState<Score>("m:6", { default: { a: 0, b: 0 }, persist: false });
    const applied = s.applyRemote({
      type: "state:sync",
      key: "m:6",
      revision: 5,
      value: { a: 3, b: 1 },
    });
    expect(applied).toBe(true);
    expect(s.get()).toEqual({ a: 3, b: 1 });
    expect(s.revision).toBe(5);
  });

  test("DESCARTA un mensaje atrasado en vez de pisar el estado", async () => {
    const s = defineSyncedState<Score>("m:7", { default: { a: 0, b: 0 }, persist: false });
    await s.set({ a: 5, b: 5 }); // revisión 1

    // Llega tarde un mensaje de una revisión anterior: reconexión de WS, red
    // mala en el torneo. Aplicarlo devolvería el marcador atrás EN DIRECTO.
    const applied = s.applyRemote({
      type: "state:sync",
      key: "m:7",
      revision: 1,
      value: { a: 0, b: 0 },
    });

    expect(applied).toBe(false);
    expect(s.get()).toEqual({ a: 5, b: 5 });
  });

  test("ignora mensajes de otra clave", () => {
    const s = defineSyncedState<Score>("m:8", { default: { a: 0, b: 0 }, persist: false });
    expect(
      s.applyRemote({ type: "state:sync", key: "otra", revision: 99, value: { a: 1, b: 1 } })
    ).toBe(false);
    expect(s.get()).toEqual({ a: 0, b: 0 });
  });

  test("un payload que no valida se rechaza y conserva el valor bueno", async () => {
    const s = defineSyncedState<Score>("m:9", {
      default: { a: 0, b: 0 },
      persist: false,
      validate: (v: any) => {
        if (typeof v?.a !== "number") throw new Error("inválido");
        return v as Score;
      },
    });
    await s.set({ a: 4, b: 2 });

    const applied = s.applyRemote({
      type: "state:sync",
      key: "m:9",
      revision: 99,
      value: { a: "no soy un número" },
    });

    expect(applied).toBe(false);
    expect(s.get()).toEqual({ a: 4, b: 2 });
  });
});

describe("persistencia", () => {
  test("hidrata desde el store y respeta su revisión", async () => {
    const store = createMemoryStateStore();
    await store.write("m:10", { a: 3, b: 1 }, 12);
    setStateStore(store);

    const s = defineSyncedState<Score>("m:10", { default: { a: 0, b: 0 } });
    await s.hydrate();

    expect(s.get()).toEqual({ a: 3, b: 1 });
    expect(s.revision).toBe(12);
  });

  test("escribe al store al mutar", async () => {
    const store = createMemoryStateStore();
    setStateStore(store);
    const s = defineSyncedState<Score>("m:11", {
      default: { a: 0, b: 0 },
      persistDebounceMs: 0,
    });

    await s.set({ a: 1, b: 0 });
    await s.flush();

    expect(await store.read("m:11")).toEqual({ value: { a: 1, b: 0 }, revision: 1 });
  });

  test("agrupa una ráfaga en UNA sola escritura", async () => {
    let writes = 0;
    setStateStore({
      async read() {
        return null;
      },
      async write() {
        writes++;
      },
    });
    const s = defineSyncedState<Score>("m:12", { default: { a: 0, b: 0 }, persistDebounceMs: 50 });

    // Cinco pulsaciones seguidas de `+` no pueden ser cinco escrituras.
    for (let i = 1; i <= 5; i++) await s.set({ a: i, b: 0 });
    await s.flush();

    expect(writes).toBe(1);
    expect(s.get()).toEqual({ a: 5, b: 0 });
  });

  test("persist:false no toca el store", async () => {
    const store = createMemoryStateStore();
    setStateStore(store);
    const s = defineSyncedState<Score>("m:13", {
      default: { a: 0, b: 0 },
      persist: false,
      persistDebounceMs: 0,
    });
    await s.set({ a: 1, b: 1 });
    await s.flush();
    expect(await store.read("m:13")).toBeNull();
  });
});

describe("degradación — un overlay nunca se cae por la infraestructura", () => {
  test("sin transporte ni store sigue funcionando en memoria", async () => {
    const s = defineSyncedState<Score>("m:14", { default: { a: 0, b: 0 } });
    await s.set({ a: 2, b: 2 });
    expect(s.get()).toEqual({ a: 2, b: 2 });
    expect(s.revision).toBe(1);
  });

  test("un transporte que lanza no rompe la mutación", async () => {
    setStateTransport({
      broadcast() {
        throw new Error("valkey caído");
      },
    });
    const s = defineSyncedState<Score>("m:15", { default: { a: 0, b: 0 }, persist: false });
    await s.set({ a: 1, b: 1 });
    expect(s.get()).toEqual({ a: 1, b: 1 });
  });

  test("un store que lanza al hidratar deja el default", async () => {
    setStateStore({
      async read() {
        throw new Error("postgres caído");
      },
      async write() {},
    });
    const s = defineSyncedState<Score>("m:16", { default: { a: 0, b: 0 } });
    await s.hydrate();
    expect(s.get()).toEqual({ a: 0, b: 0 });
  });

  test("toMessage da el snapshot para un cliente que acaba de conectar", async () => {
    const s = defineSyncedState<Score>("m:17", { default: { a: 0, b: 0 }, persist: false });
    await s.set({ a: 3, b: 2 });
    expect(s.toMessage()).toEqual({
      type: "state:sync",
      key: "m:17",
      revision: 1,
      value: { a: 3, b: 2 },
    });
  });
});
