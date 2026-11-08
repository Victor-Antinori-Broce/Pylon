/**
 * Realtime (WebSocket): regresiones de la auditoría de seguridad de 2026-11-04.
 *
 *   F1  — el anónimo es `null` para la puerta: `authenticated` lo deniega.
 *   F2  — fuera del equipo, solo filas publicadas o propias (`publishedOrOwn`).
 *   F15/F82 — la sesión se revalida al suscribirse y cada minuto; el socket se
 *         cierra si se revocó, caducó o cambió el rol.
 *   F76 — el filtro por fila respeta el TTL de la política y editar un dataset
 *         la invalida.
 *   F78 — un frame mal formado no lanza ni deja promesas sin `catch`.
 *
 * Sin base de datos ni Valkey: los dos se sustituyen por dobles.
 */
import { checkReadAccess, type PolicyJson } from "@kitsuden/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../apps/api/src/lib/valkey", () => ({
  subscribe: vi.fn(async () => undefined),
  publish: vi.fn(async () => undefined),
  getValkeyClient: () => Promise.reject(new Error("sin Valkey en esta prueba")),
}));

// La «base de datos»: la política del dataset y la sesión que se consultan.
const estado: {
  politica: PolicyJson | null;
  existeDataset: boolean;
  consultasDePolitica: number;
  sesion: { userId: string; expiresAt: Date; role: string } | null;
  falloDeSesion: boolean;
} = {
  politica: null,
  existeDataset: true,
  consultasDePolitica: 0,
  sesion: null,
  falloDeSesion: false,
};

vi.mock("../../apps/api/src/db", () => {
  const select = (cols: Record<string, unknown>) => {
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      where: () => builder,
      limit: async () => {
        if ("policyJson" in cols) {
          estado.consultasDePolitica++;
          return estado.existeDataset ? [{ policyJson: estado.politica }] : [];
        }
        if (estado.falloDeSesion) throw new Error("DB caída");
        return estado.sesion ? [estado.sesion] : [];
      },
    };
    return builder;
  };
  return { db: { select } };
});

const realtime = await import("../../apps/api/src/lib/realtime");
const wiring = await import("../../apps/api/src/lib/realtime-wiring");
const changes = await import("../../apps/api/src/lib/realtime-changes");
const { events } = await import("../../apps/api/src/lib/events");

const { realtimeManager, decidirSesion, CIERRE_SESION_INVALIDA, REVALIDAR_SESION_MS } = realtime;
const { filterForClient, canSubscribe } = changes;

// ── Dobles ───────────────────────────────────────────────────────────────────

interface SocketFalso {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  data: Record<string, unknown>;
}

const abiertos: string[] = [];
let siguienteId = 0;

function conectar(
  userId: string | null,
  role: string | null,
  sesion: { id: string | null; expiresAt: number | null } = {
    id: userId ? `s-${userId}` : null,
    expiresAt: userId ? Date.now() + 3_600_000 : null,
  }
): { id: string; socket: SocketFalso } {
  const id = `ws_test_${++siguienteId}`;
  const socket: SocketFalso = { send: vi.fn(), close: vi.fn(), data: {} };
  realtimeManager.addClient(id, socket as never, userId, role, sesion);
  abiertos.push(id);
  return { id, socket };
}

/** Mensajes que recibió un socket, ya parseados. */
const recibidos = (s: SocketFalso) =>
  s.send.mock.calls.map((c) => JSON.parse(c[0] as string) as Record<string, unknown>);
const filasRecibidas = (s: SocketFalso) => recibidos(s).filter((m) => m.type === "message");
const errores = (s: SocketFalso) => recibidos(s).filter((m) => m.type === "error");

/** Deja correr promesas y callbacks pendientes. */
const vaciar = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};

const fila = (over: Record<string, unknown> = {}) => ({
  id: "fila-1",
  dataSetId: "ds-1",
  status: "draft",
  ownerId: "bob",
  createdById: "bob",
  data: { titulo: "Borrador de Bob" },
  ...over,
});

const evento = (row: Record<string, unknown>, previous?: Record<string, unknown>) => ({
  type: previous ? "UPDATE" : "INSERT",
  resource: "noticias",
  row,
  ...(previous ? { previous } : {}),
  at: "2026-11-04T00:00:00.000Z",
});

const CANAL = "table:noticias";

beforeEach(() => {
  estado.politica = { readAccess: "public" } as PolicyJson;
  estado.existeDataset = true;
  estado.consultasDePolitica = 0;
  estado.sesion = null;
  estado.falloDeSesion = false;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  wiring.wireRealtimeAuthorization();
  wiring.invalidateRealtimePolicy();
});

afterEach(() => {
  for (const id of abiertos.splice(0)) realtimeManager.removeClient(id);
  realtime.setSessionValidator(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── F1 ───────────────────────────────────────────────────────────────────────

describe("F1: el anónimo no pasa `readAccess: authenticated`", () => {
  it("checkReadAccess exige un id, no un objeto cualquiera", () => {
    const politica = { readAccess: "authenticated" } as PolicyJson;
    expect(checkReadAccess(politica, null)).toBe(false);
    expect(checkReadAccess(politica, { id: undefined } as never)).toBe(false);
    expect(checkReadAccess(politica, { id: "alice", role: "user" })).toBe(true);
  });

  it("el cableado pasa `null` por el anónimo", () => {
    expect(wiring.comoUsuarioRls({ id: null, role: null })).toBeNull();
    expect(wiring.comoUsuarioRls({ id: "alice", role: "user" })).toEqual({ id: "alice", role: "user" });
  });

  it("un socket anónimo no se suscribe a un dataset `authenticated`", async () => {
    estado.politica = { readAccess: "authenticated" } as PolicyJson;
    const anon = conectar(null, null);
    await realtimeManager.subscribeToChannel(anon.id, CANAL);
    expect(recibidos(anon.socket).some((m) => m.type === "subscribed")).toBe(false);
    expect(errores(anon.socket)[0]?.message).toMatch(/Not authorized/);

    const alice = conectar("alice", "user");
    estado.sesion = { userId: "alice", role: "user", expiresAt: new Date(Date.now() + 3_600_000) };
    await realtimeManager.subscribeToChannel(alice.id, CANAL);
    expect(recibidos(alice.socket).some((m) => m.type === "subscribed")).toBe(true);
  });

  it("el filtro por fila tampoco entrega al anónimo bajo `authenticated`", () => {
    const politica = { policyJson: { readAccess: "authenticated" } as PolicyJson };
    const publicada = evento(fila({ status: "published" })) as never;
    expect(filterForClient(publicada, wiring.comoUsuarioRls({ id: null, role: null }), politica)).toBeNull();
  });
});

// ── F2 ───────────────────────────────────────────────────────────────────────

describe("F2: borradores ajenos fuera del socket (publishedOrOwn)", () => {
  const publica = { policyJson: { readAccess: "public" } as PolicyJson };
  const alice = { id: "alice", role: "user" };

  it("el borrador de otro no se entrega; el publicado sí", () => {
    expect(filterForClient(evento(fila()) as never, alice, publica)).toBeNull();
    expect(filterForClient(evento(fila()) as never, null, publica)).toBeNull();
    expect(filterForClient(evento(fila({ status: "published" })) as never, alice, publica)).not.toBeNull();
    expect(filterForClient(evento(fila({ status: "published" })) as never, null, publica)).not.toBeNull();
  });

  it("el borrador propio sí llega, por dueño o por autor", () => {
    expect(filterForClient(evento(fila({ ownerId: "alice" })) as never, alice, publica)).not.toBeNull();
    expect(filterForClient(evento(fila({ createdById: "alice" })) as never, alice, publica)).not.toBeNull();
  });

  it("el equipo (admin y editor) ve los borradores, como en REST", () => {
    for (const role of ["admin", "editor"]) {
      expect(filterForClient(evento(fila()) as never, { id: "staff", role }, publica)).not.toBeNull();
    }
    // y el editor se suscribe a un dataset solo-admin, igual que lo lee por REST
    const soloAdmin = { policyJson: { readAccess: "admin" } as PolicyJson };
    expect(canSubscribe(CANAL, { id: "ed", role: "editor" }, soloAdmin)).toBe(true);
    expect(canSubscribe(CANAL, alice, soloAdmin)).toBe(false);
  });

  it("al publicar, la versión previa (borrador ajeno) no viaja en el evento", () => {
    const e = evento(fila({ status: "published" }), fila()) as never;
    const entregado = filterForClient(e, alice, publica);
    expect(entregado).not.toBeNull();
    expect(entregado).not.toHaveProperty("previous");
  });

  it("de punta a punta: un suscriptor no recibe el borrador de otro", async () => {
    const alice = conectar("alice", "user");
    estado.sesion = { userId: "alice", role: "user", expiresAt: new Date(Date.now() + 3_600_000) };
    await realtimeManager.subscribeToChannel(alice.id, CANAL);

    realtimeManager.broadcast(CANAL, evento(fila()));
    realtimeManager.broadcast(CANAL, evento(fila({ id: "fila-2", status: "published" })));
    await vaciar();

    const filas = filasRecibidas(alice.socket);
    expect(filas).toHaveLength(1);
    expect((filas[0]!.data as { row: { id: string } }).row.id).toBe("fila-2");
  });
});

// ── F76 ──────────────────────────────────────────────────────────────────────

describe("F76: la política del filtro caduca y se invalida", () => {
  async function aliceSuscrita() {
    const alice = conectar("alice", "user");
    estado.sesion = { userId: "alice", role: "user", expiresAt: new Date(Date.now() + 3_600_000) };
    await realtimeManager.subscribeToChannel(alice.id, CANAL);
    expect(recibidos(alice.socket).some((m) => m.type === "subscribed")).toBe(true);
    return alice;
  }
  const publicada = () => evento(fila({ status: "published" }));

  it("pasado el TTL, el reparto vuelve a leer la política y deja de entregar", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const alice = await aliceSuscrita();

    realtimeManager.broadcast(CANAL, publicada());
    await vaciar();
    expect(filasRecibidas(alice.socket)).toHaveLength(1);

    // Se restringe el dataset; sin invalidación, solo pasa el tiempo.
    estado.politica = { readAccess: "admin" } as PolicyJson;
    estado.sesion = { userId: "alice", role: "user", expiresAt: new Date(Date.now() + 7_200_000) };
    vi.setSystemTime(Date.now() + wiring.POLICY_TTL_MS + 1);
    const antes = estado.consultasDePolitica;

    realtimeManager.broadcast(CANAL, publicada());
    await vaciar();
    expect(estado.consultasDePolitica).toBe(antes + 1);
    expect(filasRecibidas(alice.socket)).toHaveLength(1); // nada nuevo
  });

  it("una política caducada no vale en el filtro aunque siga en caché", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await aliceSuscrita();
    expect(wiring.cachedPolicy("noticias")).not.toBeNull();
    vi.setSystemTime(Date.now() + wiring.POLICY_TTL_MS + 1);
    expect(wiring.cachedPolicy("noticias")).toBeNull();
  });

  it("editar el dataset invalida la política al momento, sin esperar al TTL", async () => {
    const alice = await aliceSuscrita();
    estado.politica = { readAccess: "admin" } as PolicyJson;
    events.emit("dataset:updated", { id: "ds-1", slug: "noticias" });
    expect(wiring.cachedPolicy("noticias")).toBeNull();

    realtimeManager.broadcast(CANAL, publicada());
    await vaciar();
    expect(filasRecibidas(alice.socket)).toHaveLength(0);
  });

  it("borrar el dataset también la invalida", async () => {
    const alice = await aliceSuscrita();
    estado.existeDataset = false;
    events.emit("dataset:deleted", { id: "ds-1" });

    realtimeManager.broadcast(CANAL, publicada());
    await vaciar();
    expect(filasRecibidas(alice.socket)).toHaveLength(0);
  });
});

// ── F78 ──────────────────────────────────────────────────────────────────────

describe("F78: frames mal formados", () => {
  it("no lanzan y responden con un error", async () => {
    const anon = conectar(null, null);
    const frames = [
      "null",
      "123",
      '"texto"',
      "[]",
      "{no es json",
      "{}",
      '{"type":5}',
      '{"type":"subscribe","channel":123}',
      '{"type":"subscribe","channel":null}',
      '{"type":"subscribe","channel":{"x":1}}',
      '{"type":"unsubscribe","channel":[]}',
      '{"type":"presence:join","room":1}',
      '{"type":"presence:leave","room":true}',
      JSON.stringify({ type: "subscribe", channel: `table:${"a".repeat(10_000)}` }),
      JSON.stringify({ type: "x".repeat(10_000) }),
    ];
    for (const f of frames) {
      expect(() => realtimeManager.handleMessage(anon.id, f), f).not.toThrow();
    }
    await vaciar();
    expect(errores(anon.socket)).toHaveLength(frames.length);
    // El mensaje de error no devuelve lo que mandó el cliente.
    for (const e of errores(anon.socket)) expect(String(e.message).length).toBeLessThan(100);
  });

  it("un autorizador que falla no deja una promesa rechazada sin atender", async () => {
    realtime.setSubscriptionAuthorizer(() => Promise.reject(new Error("boom")));
    try {
      const alice = conectar("alice", "user");
      estado.sesion = { userId: "alice", role: "user", expiresAt: new Date(Date.now() + 3_600_000) };
      realtimeManager.handleMessage(alice.id, JSON.stringify({ type: "subscribe", channel: CANAL }));
      await vaciar();
      expect(errores(alice.socket).map((e) => e.message)).toContain("Subscription failed");
    } finally {
      wiring.wireRealtimeAuthorization();
    }
  });
});

// ── F15 / F82 ────────────────────────────────────────────────────────────────

describe("F15/F82: revalidación de la sesión del socket", () => {
  const ahora = 1_800_000_000_000;
  const socketAdmin = { userId: "ana", userRole: "admin", sessionId: "s-ana" };

  describe("decidirSesion (pura)", () => {
    it("mantiene una sesión vigente con el mismo rol y guarda su caducidad", () => {
      expect(decidirSesion(socketAdmin, { userId: "ana", role: "admin", expiresAt: ahora + 1 }, ahora)).toEqual({
        mantener: true,
        expiresAt: ahora + 1,
      });
    });

    it("cierra si se revocó, caducó, cambió el rol o el usuario", () => {
      const motivo = (actual: Parameters<typeof decidirSesion>[1]) => {
        const d = decidirSesion(socketAdmin, actual, ahora);
        return d.mantener ? "mantener" : d.motivo;
      };
      expect(motivo(null)).toBe("revocada");
      expect(motivo({ userId: "ana", role: "admin", expiresAt: ahora })).toBe("caducada");
      expect(motivo({ userId: "ana", role: "user", expiresAt: ahora + 1 })).toBe("rol-cambiado");
      expect(motivo({ userId: "otra", role: "admin", expiresAt: ahora + 1 })).toBe("otro-usuario");
    });

    it("el anónimo no tiene nada que revalidar; con usuario y sin sesión, se cierra", () => {
      expect(decidirSesion({ userId: null, userRole: null, sessionId: null }, null, ahora).mantener).toBe(true);
      expect(decidirSesion({ ...socketAdmin, sessionId: null }, null, ahora).mantener).toBe(false);
    });
  });

  it("un admin degradado se cierra al suscribirse, sin llegar a suscribirse", async () => {
    const ana = conectar("ana", "admin");
    estado.sesion = { userId: "ana", role: "user", expiresAt: new Date(Date.now() + 3_600_000) };
    await realtimeManager.subscribeToChannel(ana.id, "entry:fila-1");
    expect(recibidos(ana.socket).some((m) => m.type === "subscribed")).toBe(false);
    expect(ana.socket.close).toHaveBeenCalledWith(CIERRE_SESION_INVALIDA, expect.any(String));
    expect(realtimeManager.getStats().connections).toBe(0);
  });

  it("el barrido periódico cierra el socket cuya sesión se revocó", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const ana = conectar("ana", "admin");
    const anon = conectar(null, null);
    estado.sesion = { userId: "ana", role: "admin", expiresAt: new Date(Date.now() + 3_600_000) };

    await vi.advanceTimersByTimeAsync(REVALIDAR_SESION_MS);
    await vaciar();
    expect(ana.socket.close).not.toHaveBeenCalled();

    estado.sesion = null; // logout / revocación / degradación que borra sesiones
    await vi.advanceTimersByTimeAsync(REVALIDAR_SESION_MS);
    await vaciar();
    expect(ana.socket.close).toHaveBeenCalledWith(CIERRE_SESION_INVALIDA, expect.any(String));
    expect(anon.socket.close).not.toHaveBeenCalled(); // el anónimo sigue

    // Sin clientes, el temporizador se apaga.
    realtimeManager.removeClient(anon.id);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("si la sesión no se puede comprobar, se cierra (falla cerrado)", async () => {
    const ana = conectar("ana", "admin");
    estado.falloDeSesion = true;
    expect(await realtimeManager.revalidateClient(ana.id)).toBe(false);
    expect(ana.socket.close).toHaveBeenCalled();
  });

  it("una sesión que caduca entre barridos no recibe más eventos", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const alice = conectar("alice", "user", { id: "s-alice", expiresAt: Date.now() + 1_000 });
    estado.sesion = { userId: "alice", role: "user", expiresAt: new Date(Date.now() + 1_000) };
    await realtimeManager.subscribeToChannel(alice.id, CANAL);
    expect(recibidos(alice.socket).some((m) => m.type === "subscribed")).toBe(true);

    vi.setSystemTime(Date.now() + 2_000);
    realtimeManager.broadcast(CANAL, evento(fila({ status: "published" })));
    await vaciar();
    expect(filasRecibidas(alice.socket)).toHaveLength(0);
    expect(alice.socket.close).toHaveBeenCalledWith(CIERRE_SESION_INVALIDA, expect.any(String));
  });
});
