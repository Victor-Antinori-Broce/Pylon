/**
 * Synced State — estado compartido en vivo entre servidor, panel y gráfico
 * ============================================================================
 *
 * El equivalente al "replicant" de NodeCG, que es el primitivo del que cuelga
 * todo lo demás allí: declaras un estado tipado, lo mutas desde donde sea, y
 * cada cliente suscrito lo ve al instante. Sobrevive a reinicios.
 *
 * Qué añade esto sobre NodeCG, que es justo donde NodeCG es débil:
 *
 *   - **Persistencia real inyectable** — NodeCG escribe un JSON en disco y
 *     asume una máquina. Aquí el store es una dependencia: Postgres, Valkey o
 *     memoria. Multi-proceso y multi-operador dejan de ser un problema.
 *   - **Revisión monotónica** — cada cambio incrementa `revision`. Un mensaje
 *     que llega tarde (reconexión de WebSocket, red mala en un torneo) se
 *     descarta en vez de pisar un estado más nuevo. Es EL bug clásico de los
 *     overlays en directo.
 *   - **Canal con nombre** (`state:<key>`) para que el autorizador de
 *     suscripciones existente decida quién puede escuchar qué. NodeCG no tiene
 *     concepto de permisos.
 *
 * Todo se inyecta y nada lanza: sin transporte sigue funcionando en memoria,
 * sin store simplemente no persiste. Un overlay nunca debe caerse porque
 * Valkey se haya ido.
 *
 *   const scoreboard = defineSyncedState("broadcast:match:42", {
 *     default: { a: 0, b: 0 },
 *   });
 *
 *   await scoreboard.patch({ a: 1 });      // difunde a todos los suscritos
 *   scoreboard.subscribe((v) => render(v));
 */

// ── Contratos inyectables ────────────────────────────────────────────────────

/** Difusión a los clientes conectados. Lo implementa la capa realtime del host. */
export interface StateTransport {
  broadcast(channel: string, message: unknown): void;
}

/** Persistencia. Postgres, Valkey o lo que sea — al primitivo le da igual. */
export interface StateStore {
  read(key: string): Promise<{ value: unknown; revision: number } | null>;
  write(key: string, value: unknown, revision: number): Promise<void>;
}

export interface SyncedStateOptions<T> {
  /** Valor inicial si no hay nada persistido. */
  default: T;
  /**
   * Persistir los cambios. Por defecto `true`.
   * Ponlo a `false` para estado efímero (p. ej. "quién está viendo esto").
   */
  persist?: boolean;
  /**
   * Milisegundos de espera antes de escribir al store. Agrupa ráfagas — pulsar
   * `+` cinco veces seguidas no debe provocar cinco escrituras.
   * Por defecto 250 ms. Con 0 escribe inmediatamente (útil en tests).
   */
  persistDebounceMs?: number;
  /**
   * Validador opcional. Si lanza, el cambio se rechaza y el estado no se toca:
   * es preferible a difundir basura a un overlay que está al aire.
   */
  validate?: (value: unknown) => T;
}

/** Mensaje que viaja por el canal. El cliente aplica solo si `revision` es mayor. */
export interface SyncedStateMessage<T = unknown> {
  type: "state:sync";
  key: string;
  revision: number;
  value: T;
}

export type Unsubscribe = () => void;

// ── Registro global (singleton de proceso) ───────────────────────────────────

let transport: StateTransport | null = null;
let store: StateStore | null = null;
// `unknown` en vez de `any`: el tipo real lo recupera `defineSyncedState`
// con un cast explícito en el punto donde SÍ se conoce.
const registry = new Map<string, SyncedState<unknown>>();

/** Lo llama el host al arrancar. Sin esto, el estado funciona pero no difunde. */
export function setStateTransport(t: StateTransport | null): void {
  transport = t;
}

/** Lo llama el host al arrancar. Sin esto, el estado funciona pero no persiste. */
export function setStateStore(s: StateStore | null): void {
  store = s;
}

/** Limpia el registro entero. Para tests. */
export function resetSyncedState(): void {
  for (const s of registry.values()) s.dispose();
  registry.clear();
  transport = null;
  store = null;
}

/** Nombre de canal de un estado. Público para que el autorizador pueda casarlo. */
export function stateChannel(key: string): string {
  return `state:${key}`;
}

// ── El estado ────────────────────────────────────────────────────────────────

export class SyncedState<T> {
  readonly key: string;
  readonly channel: string;

  private value: T;
  private rev = 0;
  private readonly opts: Required<Omit<SyncedStateOptions<T>, "validate">> &
    Pick<SyncedStateOptions<T>, "validate">;
  private readonly listeners = new Set<(value: T, revision: number) => void>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private hydrated = false;

  constructor(key: string, options: SyncedStateOptions<T>) {
    this.key = key;
    this.channel = stateChannel(key);
    this.value = options.default;
    this.opts = {
      default: options.default,
      persist: options.persist ?? true,
      persistDebounceMs: options.persistDebounceMs ?? 250,
      validate: options.validate,
    };
  }

  /** Valor actual en memoria. Síncrono a propósito: un overlay renderiza en frame. */
  get(): T {
    return this.value;
  }

  /** Revisión actual. Monotónica dentro del proceso. */
  get revision(): number {
    return this.rev;
  }

  /**
   * Carga el valor persistido. Idempotente: solo la primera llamada lee.
   * Si el store falla, se queda con el default — un overlay debe abrir igual.
   */
  async hydrate(): Promise<T> {
    if (this.hydrated || !this.opts.persist || !store) {
      this.hydrated = true;
      return this.value;
    }
    this.hydrated = true;
    try {
      const row = await store.read(this.key);
      if (row) {
        this.value = this.opts.validate ? this.opts.validate(row.value) : (row.value as T);
        this.rev = row.revision;
      }
    } catch {
      // Store caído: seguimos con el default en memoria.
    }
    return this.value;
  }

  /** Reemplaza el valor entero. */
  async set(next: T): Promise<T> {
    const validated = this.opts.validate ? this.opts.validate(next) : next;
    this.value = validated;
    this.bump();
    return this.value;
  }

  /**
   * Mezcla superficial sobre el valor actual — el protocolo PATCH de un panel
   * de operador. Tocar el sponsor no puede borrar el marcador.
   */
  async patch(partial: Partial<T>): Promise<T> {
    if (typeof this.value !== "object" || this.value === null || Array.isArray(this.value)) {
      throw new Error(`[synced-state] patch() requiere un objeto; "${this.key}" no lo es`);
    }
    const merged = { ...(this.value as object), ...(partial as object) } as T;
    return this.set(merged);
  }

  /**
   * Aplica un mensaje recibido de otro proceso. Descarta lo viejo: esta es la
   * defensa contra el reordenamiento de mensajes tras una reconexión.
   * Devuelve `true` si se aplicó.
   */
  applyRemote(message: SyncedStateMessage): boolean {
    if (message.key !== this.key) return false;
    if (message.revision <= this.rev) return false; // llegó tarde
    try {
      this.value = this.opts.validate ? this.opts.validate(message.value) : (message.value as T);
    } catch {
      return false; // payload inválido: mejor quedarse con lo que había
    }
    this.rev = message.revision;
    this.emit();
    return true;
  }

  /** Escucha cambios locales y remotos. Devuelve la función para desuscribirse. */
  subscribe(fn: (value: T, revision: number) => void): Unsubscribe {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Mensaje listo para enviar a un cliente que acaba de conectarse. */
  toMessage(): SyncedStateMessage<T> {
    return { type: "state:sync", key: this.key, revision: this.rev, value: this.value };
  }

  /** Cancela la escritura pendiente. Lo llama `resetSyncedState`. */
  dispose(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.listeners.clear();
  }

  /** Fuerza la escritura pendiente ya. Útil al apagar el proceso y en tests. */
  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    await this.writeNow();
  }

  // ── interno ──

  private bump(): void {
    this.rev++;
    this.emit();
    this.broadcast();
    this.schedulePersist();
  }

  private emit(): void {
    for (const fn of this.listeners) {
      try {
        fn(this.value, this.rev);
      } catch {
        // Un suscriptor que revienta no puede tumbar a los demás.
      }
    }
  }

  private broadcast(): void {
    if (!transport) return;
    try {
      transport.broadcast(this.channel, this.toMessage());
    } catch {
      // Transporte caído: el estado en memoria sigue siendo correcto.
    }
  }

  private schedulePersist(): void {
    if (!this.opts.persist || !store) return;
    if (this.opts.persistDebounceMs <= 0) {
      void this.writeNow();
      return;
    }
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.writeNow();
    }, this.opts.persistDebounceMs);
  }

  private async writeNow(): Promise<void> {
    if (!this.opts.persist || !store) return;
    try {
      await store.write(this.key, this.value, this.rev);
    } catch {
      // Persistencia caída: no perdemos el directo por esto.
    }
  }
}

// ── Fábrica ──────────────────────────────────────────────────────────────────

/**
 * Declara (o recupera) un estado sincronizado. Llamarlo dos veces con la misma
 * clave devuelve LA MISMA instancia — igual que `nodecg.Replicant`, para que
 * dos módulos que hablan del mismo marcador no acaben con dos copias.
 */
export function defineSyncedState<T>(key: string, options: SyncedStateOptions<T>): SyncedState<T> {
  const existing = registry.get(key);
  if (existing) return existing as unknown as SyncedState<T>;
  const created = new SyncedState<T>(key, options);
  registry.set(key, created as unknown as SyncedState<unknown>);
  return created;
}

/** Estado ya declarado, o `null`. */
export function getSyncedState<T>(key: string): SyncedState<T> | null {
  return (registry.get(key) as unknown as SyncedState<T>) ?? null;
}

/** Claves declaradas. Para diagnóstico/admin. */
export function listSyncedStateKeys(): string[] {
  return [...registry.keys()];
}

// ── Store en memoria (default de tests y del modo lite sin Valkey) ───────────

export function createMemoryStateStore(): StateStore & { dump(): Map<string, unknown> } {
  const data = new Map<string, { value: unknown; revision: number }>();
  return {
    async read(key) {
      return data.get(key) ?? null;
    },
    async write(key, value, revision) {
      data.set(key, { value, revision });
    },
    dump() {
      return new Map([...data].map(([k, v]) => [k, v.value]));
    },
  };
}
