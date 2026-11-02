/**
 * useSyncedState — el estado en vivo del servidor, en React
 * ============================================================================
 *
 * Cierra el círculo con el primitivo que mueve el overlay de OBS: el mismo
 * canal, el mismo mensaje, la misma defensa contra mensajes atrasados — pero
 * consumido desde un componente.
 *
 * Se apoya en `useSyncExternalStore`, que es la API que React 18+ provee
 * exactamente para esto. Hacerlo con `useState` + `useEffect` produce tearing
 * en modo concurrente: dos componentes suscritos al mismo canal pueden pintar
 * valores distintos en el mismo frame.
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

/** Mensaje que viaja por el canal. Igual que el del servidor. */
export interface SyncedStateMessage<T = unknown> {
  type: "state:sync";
  key: string;
  revision: number;
  value: T;
}

export interface SyncedStateOptions<T> {
  /** Valor mientras no ha llegado nada. */
  initial?: T | null;
  /** URL del WebSocket. Por defecto, el mismo host. */
  socketUrl?: string;
  /** Snapshot inicial, para no arrancar en blanco. */
  fetchSnapshot?: () => Promise<{ value: T; revision: number } | null>;
  /** Reconexión automática. Por defecto `true`. */
  reconnect?: boolean;
}

export interface SyncedStateResult<T> {
  value: T | null;
  revision: number;
  connected: boolean;
  error: Error | null;
}

/** Un store por clave: varios componentes con el mismo canal comparten socket. */
interface Store<T> {
  value: T | null;
  revision: number;
  connected: boolean;
  error: Error | null;
  listeners: Set<() => void>;
  socket: WebSocket | null;
  refCount: number;
  retry: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** Snapshot inmutable para `useSyncExternalStore`. */
  snapshot: SyncedStateResult<T>;
}

const stores = new Map<string, Store<unknown>>();

function emit<T>(store: Store<T>) {
  // Snapshot NUEVO en cada cambio: `useSyncExternalStore` compara por
  // identidad, y mutar el mismo objeto haría que React no repintara nunca.
  store.snapshot = {
    value: store.value,
    revision: store.revision,
    connected: store.connected,
    error: store.error,
  };
  for (const listener of store.listeners) listener();
}

function defaultSocketUrl(channel: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws?channel=${encodeURIComponent(channel)}`;
}

function connect<T>(key: string, store: Store<T>, options: SyncedStateOptions<T>) {
  if (typeof window === "undefined") return; // SSR: no hay WebSocket
  if (store.socket) return;

  const channel = `state:${key}`;
  let socket: WebSocket;
  try {
    socket = new WebSocket(options.socketUrl ?? defaultSocketUrl(channel));
  } catch (err) {
    store.error = err instanceof Error ? err : new Error(String(err));
    emit(store);
    return scheduleReconnect(key, store, options);
  }

  store.socket = socket;

  socket.addEventListener("open", () => {
    store.retry = 0;
    store.connected = true;
    store.error = null;
    socket.send(JSON.stringify({ type: "subscribe", channel }));
    emit(store);

    // Al (re)conectar se perdió lo ocurrido mientras tanto.
    void options.fetchSnapshot?.().then((snap) => {
      if (!snap) return;
      // El snapshot puede ser MÁS VIEJO que lo que ya llegó por el socket.
      if (snap.revision <= store.revision) return;
      store.value = snap.value;
      store.revision = snap.revision;
      emit(store);
    });
  });

  socket.addEventListener("message", (event) => {
    try {
      const raw = JSON.parse(event.data as string);
      const message = (raw?.message ?? raw) as SyncedStateMessage<T>;
      if (message?.type !== "state:sync" || message.key !== key) return;

      // La defensa que importa: un mensaje atrasado tras una reconexión NO
      // puede pisar un estado más nuevo.
      if (typeof message.revision === "number" && message.revision <= store.revision) return;

      store.value = message.value;
      store.revision = message.revision;
      emit(store);
    } catch {
      // Un mensaje ilegible no puede tumbar la suscripción.
    }
  });

  socket.addEventListener("close", () => {
    store.socket = null;
    store.connected = false;
    emit(store);
    if (options.reconnect !== false && store.refCount > 0) {
      scheduleReconnect(key, store, options);
    }
  });

  socket.addEventListener("error", () => {
    try {
      socket.close();
    } catch {
      /* el close ya dispara la reconexión */
    }
  });
}

/** Backoff exponencial con techo, y solo si queda alguien suscrito. */
function scheduleReconnect<T>(key: string, store: Store<T>, options: SyncedStateOptions<T>) {
  if (store.timer || store.refCount === 0) return;
  const delay = Math.min(500 * 2 ** store.retry++, 10_000);
  store.timer = setTimeout(() => {
    store.timer = null;
    if (store.refCount > 0) connect(key, store, options);
  }, delay);
}

/**
 * Se suscribe al estado sincronizado de una clave.
 *
 *   const { value, connected } = useSyncedState<Overlay>("broadcast:match:42", {
 *     fetchSnapshot: async () => {
 *       const r = await fetch("/api/broadcast/overlay/42").then((r) => r.json());
 *       return { value: r.data, revision: r.revision };
 *     },
 *   });
 *
 * Varios componentes con la misma clave **comparten un solo socket**: sin eso,
 * una lista de diez marcadores abriría diez conexiones.
 */
export function useSyncedState<T = unknown>(
  key: string,
  options: SyncedStateOptions<T> = {}
): SyncedStateResult<T> {
  // Las opciones se leen por ref: pasarlas como objeto literal (lo normal)
  // cambiaría la identidad en cada render y reconectaría sin parar.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const store = useMemo(() => {
    let existing = stores.get(key) as Store<T> | undefined;
    if (!existing) {
      const initial = optionsRef.current.initial ?? null;
      existing = {
        value: initial,
        revision: -1,
        connected: false,
        error: null,
        listeners: new Set(),
        socket: null,
        refCount: 0,
        retry: 0,
        timer: null,
        snapshot: { value: initial, revision: -1, connected: false, error: null },
      };
      stores.set(key, existing as Store<unknown>);
    }
    return existing;
  }, [key]);

  const subscribe = useCallback(
    (listener: () => void) => {
      store.listeners.add(listener);
      store.refCount++;
      if (store.refCount === 1) connect(key, store, optionsRef.current);

      return () => {
        store.listeners.delete(listener);
        store.refCount--;
        // Se cierra solo cuando NADIE queda suscrito. Cerrar al desmontar el
        // primer componente cortaría el canal a los demás.
        if (store.refCount === 0) {
          if (store.timer) {
            clearTimeout(store.timer);
            store.timer = null;
          }
          store.socket?.close();
          store.socket = null;
        }
      };
    },
    [key, store]
  );

  const getSnapshot = useCallback(() => store.snapshot, [store]);

  // En servidor no hay socket: se devuelve el snapshot inicial para que el
  // render de SSR/RSC no falle ni desincronice la hidratación.
  const getServerSnapshot = useCallback(
    () => ({
      value: optionsRef.current.initial ?? null,
      revision: -1,
      connected: false,
      error: null,
    }),
    []
  );

  useEffect(() => {
    // Reintenta si la pestaña vuelve a primer plano con el socket caído.
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && !store.socket && store.refCount > 0) {
        connect(key, store, optionsRef.current);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [key, store]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Olvida los stores. Solo para tests. */
export function resetSyncedStateStores(): void {
  for (const store of stores.values()) {
    if (store.timer) clearTimeout(store.timer);
    store.socket?.close();
  }
  stores.clear();
}
