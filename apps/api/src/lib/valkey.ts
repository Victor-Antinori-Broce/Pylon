/**
 * Kitsuden — Valkey Connection Layer (OPCIONAL)
 *
 * Valkey (fork abierto de Redis) ya no es obligatorio (kitsuden2.md, B1b,
 * 2026-10-28). La cola vive en Postgres y, sin `VALKEY_URL`, todo lo demás
 * tiene su sustituto en instancia única:
 *
 *   · caché (consultas, LLM, agente) → memoria del proceso (cache-en-memoria.ts)
 *   · limitador                      → memoria del proceso (rate-limiter.ts).
 *                                      NUNCA una tabla: cada petición
 *                                      escribiría en Postgres.
 *   · Pub/Sub del tiempo real        → el proceso + LISTEN/NOTIFY de Postgres
 *                                      (llega a las demás réplicas, si las hay)
 *   · cuotas e idempotencia          → ya tenían su tabla de respaldo
 *
 * Con varias réplicas, se configura Valkey: es lo que comparte caché y
 * contadores entre ellas. Sin URL no se intenta conectar a nada (antes se
 * probaba `localhost:6379` y cada petición pagaba el intento fallido).
 *
 * ENV: VALKEY_URL > REDIS_URL. Sin ninguna, modo «sin Valkey».
 */

import { createClient, type RedisClientType } from "redis";

import { memoriaGet, memoriaSet } from "./cache-en-memoria";

// ── URL Resolution ─────────────────────────────────────────────
export const VALKEY_URL = process.env.VALKEY_URL || process.env.REDIS_URL || "";

/** ¿Hay un Valkey configurado? Sin él, los sustitutos de instancia única. */
export function valkeyConfigurado(): boolean {
  return Boolean(process.env.VALKEY_URL || process.env.REDIS_URL);
}

// ── Direct Client (for cache, leaderboards) ────────────────────

let _client: RedisClientType | null = null;

/**
 * Returns a connected Valkey client (lazy singleton).
 */
async function connectWithTimeout(client: RedisClientType, timeoutMs: number): Promise<void> {
  await Promise.race([
    client.connect(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Valkey connection timeout")), timeoutMs)
    ),
  ]);
}

/**
 * Con Valkey caído, cada llamada esperaba su propio timeout de conexión (~2 s)
 * y una petición pasa por varias (limitador, caché, sesión…): medido
 * 2026-10-18, `/api/*` tardaba más que el `idleTimeout` de bun y la conexión
 * se cerraba sin respuesta. El limitador fail-closed no servía de nada si la
 * petición no llegaba a contestarse.
 *
 * Tras un fallo, durante `VALKEY_RETRY_AFTER_MS` (5 s) se rechaza al momento
 * sin volver a intentarlo; y los intentos simultáneos comparten una sola
 * conexión en curso en vez de abrir una cada uno.
 */
const ESPERA_TRAS_FALLO_MS = Number(process.env.VALKEY_RETRY_AFTER_MS) || 5000;
let _falloHasta = 0;
let _conectando: Promise<RedisClientType> | null = null;

export async function getValkeyClient(): Promise<RedisClientType> {
  if (!valkeyConfigurado()) {
    throw new Error("Valkey not configured (VALKEY_URL): single-instance mode");
  }
  if (_client?.isReady) return _client;
  // Abierto pero NO listo = Valkey se cayó después de conectar y el cliente
  // está reconectando. Antes se devolvía igual (`isOpen` sigue a true) y cada
  // comando se quedaba en la cola de espera hasta que Valkey volviera: la
  // petición no terminaba nunca (medido 2026-10-19: `/api/version` colgada
  // hasta que bun cerraba la conexión). Se rechaza al momento; el propio
  // cliente se recupera solo cuando Valkey vuelve.
  if (_client?.isOpen) {
    throw new Error("Valkey unavailable (reconnecting)");
  }
  if (Date.now() < _falloHasta) {
    throw new Error("Valkey unavailable (recent connection failure)");
  }
  if (_conectando) return _conectando;

  _conectando = conectar().finally(() => {
    _conectando = null;
  });
  return _conectando;
}

async function conectar(): Promise<RedisClientType> {
  const client = createClient({
    url: VALKEY_URL,
    socket: { connectTimeout: 1000 },
    // Sin cola de espera: un comando con la conexión caída falla al momento en
    // vez de esperar indefinidamente a que vuelva (ver getValkeyClient).
    disableOfflineQueue: true,
  }) as RedisClientType;

  client.on("error", (err: Error) => {
    console.warn(`[Valkey] Connection error: ${err.message}`);
  });

  try {
    await connectWithTimeout(client, 2000);
    _client = client;
    return _client;
  } catch (err) {
    try {
      client.disconnect();
    } catch {
      /* ignore */
    }
    _client = null;
    _falloHasta = Date.now() + ESPERA_TRAS_FALLO_MS;
    throw err;
  }
}

// ── Availability Check ─────────────────────────────────────────

let _available: boolean | null = null;
let _lastCheck = 0;
const CHECK_INTERVAL = 30_000;

export async function isValkeyAvailable(): Promise<boolean> {
  if (!valkeyConfigurado()) return false;
  const now = Date.now();
  if (_available !== null && now - _lastCheck < CHECK_INTERVAL) {
    return _available;
  }

  try {
    const client = await getValkeyClient();
    await client.ping();
    _available = true;
  } catch {
    _available = false;
  }
  _lastCheck = Date.now();
  return _available ?? false;
}

// ═══════════════════════════════════════════════════════════════
// PUB/SUB — Real-time Layer
// ═══════════════════════════════════════════════════════════════

let _pubClient: RedisClientType | null = null;
let _subClient: RedisClientType | null = null;

/**
 * Get dedicated PUBLISH client.
 * Separate from main client because pub/sub requires dedicated connections.
 */
export async function getPublisher(): Promise<RedisClientType> {
  if (_pubClient && _pubClient.isOpen) return _pubClient;

  _pubClient = createClient({ url: VALKEY_URL }) as RedisClientType;
  _pubClient.on("error", (err: Error) => {
    console.warn(`[Valkey:PUB] Error: ${err.message}`);
  });
  await _pubClient.connect();
  return _pubClient;
}

/**
 * Get dedicated SUBSCRIBE client.
 */
export async function getSubscriber(): Promise<RedisClientType> {
  if (_subClient && _subClient.isOpen) return _subClient;

  _subClient = createClient({ url: VALKEY_URL }) as RedisClientType;
  _subClient.on("error", (err: Error) => {
    console.warn(`[Valkey:SUB] Error: ${err.message}`);
  });
  await _subClient.connect();
  return _subClient;
}

/**
 * Publish a message to a channel.
 * Used by the data layer to broadcast mutations.
 *
 * Sin Valkey: se entrega a los suscriptores de ESTE proceso y, por
 * `pg_notify('kitsuden_bus', …)`, a los de las demás réplicas (ver
 * `busSinValkey`). Un mensaje que no cabe en un NOTIFY (8.000 bytes) solo
 * llega a este proceso, y se avisa.
 *
 * @param channel Channel name (e.g., "table:matches", "entry:abc123")
 * @param message JSON-serializable payload
 */
export async function publish(channel: string, message: unknown): Promise<void> {
  if (!valkeyConfigurado()) {
    await busSinValkey.publicar(channel, JSON.stringify(message));
    return;
  }
  try {
    const pub = await getPublisher();
    await pub.publish(channel, JSON.stringify(message));
  } catch (err: unknown) {
    const message_err = err instanceof Error ? err.message : String(err);
    console.warn(`[Valkey:PUB] Failed to publish to ${channel}: ${message_err}`);
  }
}

/**
 * Subscribe to a channel pattern.
 * Returns an unsubscribe function.
 *
 * @param pattern Channel pattern (supports wildcards: "table:*")
 * @param callback Function to call when message received
 */
export async function subscribe(
  pattern: string,
  callback: (channel: string, message: string) => void
): Promise<() => Promise<void>> {
  if (!valkeyConfigurado()) return busSinValkey.suscribir(pattern, callback);

  const sub = await getSubscriber();

  if (pattern.includes("*")) {
    await sub.pSubscribe(pattern, (message: string, channel: string) => {
      callback(channel, message);
    });
    return async () => {
      await sub.pUnsubscribe(pattern);
    };
  } else {
    await sub.subscribe(pattern, (message: string, channel: string) => {
      callback(channel, message);
    });
    return async () => {
      await sub.unsubscribe(pattern);
    };
  }
}

// ── El bus sin Valkey: el proceso + LISTEN/NOTIFY ──────────────

type Suscriptor = { re: RegExp; fn: (channel: string, message: string) => void };

const CANAL_BUS = "kitsuden_bus";
/** Lo que cabe de verdad en un NOTIFY (el límite es 8000 bytes con el canal). */
const MAX_NOTIFY_BYTES = 7900;

/** Un patrón de Valkey (`*`, `?`) como expresión regular anclada. */
function patronARegex(patron: string): RegExp {
  const escapado = patron
    .split("")
    .map((ch) => {
      if (ch === "*") return ".*";
      if (ch === "?") return ".";
      return /[A-Za-z0-9_:\-]/.test(ch) ? ch : `\\${ch}`;
    })
    .join("");
  return new RegExp(`^${escapado}$`);
}

export const busSinValkey = (() => {
  const suscriptores = new Set<Suscriptor>();
  const instancia = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  let escuchando: Promise<unknown> | null = null;
  let avisoDeTamano = false;

  function entregar(channel: string, message: string): void {
    for (const s of suscriptores) {
      if (!s.re.test(channel)) continue;
      try {
        s.fn(channel, message);
      } catch (err) {
        console.warn(`[bus] un suscriptor de ${channel} falló: ${String(err)}`);
      }
    }
  }

  async function escucharOtrasReplicas(): Promise<void> {
    const { escuchar } = await import("./escucha-postgres");
    await escuchar(CANAL_BUS, (payload) => {
      try {
        const m = JSON.parse(payload) as { o?: string; c?: string; m?: string };
        if (m.o === instancia || typeof m.c !== "string" || typeof m.m !== "string") return;
        entregar(m.c, m.m);
      } catch {
        /* una notificación ajena o rota: se ignora */
      }
    });
  }

  return {
    async publicar(channel: string, message: string): Promise<void> {
      entregar(channel, message);
      const sobre = JSON.stringify({ o: instancia, c: channel, m: message });
      if (Buffer.byteLength(sobre) > MAX_NOTIFY_BYTES) {
        if (!avisoDeTamano) {
          avisoDeTamano = true;
          console.warn(
            `[bus] mensaje de ${channel} demasiado grande para NOTIFY: solo llega a este proceso (configura Valkey si hay varias réplicas)`
          );
        }
        return;
      }
      try {
        const { db, isPgMem, isLiteMode } = await import("../db");
        if (isPgMem || isLiteMode) return;
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`SELECT pg_notify(${CANAL_BUS}, ${sobre})`);
      } catch (err) {
        console.warn(`[bus] NOTIFY falló (${channel}): ${String(err)}`);
      }
    },

    async suscribir(
      pattern: string,
      fn: (channel: string, message: string) => void
    ): Promise<() => Promise<void>> {
      const s: Suscriptor = { re: patronARegex(pattern), fn };
      suscriptores.add(s);
      escuchando ??= escucharOtrasReplicas().catch((err: unknown) => {
        escuchando = null;
        console.warn(`[bus] sin LISTEN de Postgres: solo este proceso (${String(err)})`);
      });
      return async () => {
        suscriptores.delete(s);
      };
    },
  };
})();

// ═══════════════════════════════════════════════════════════════
// Leaderboard Helpers (Sorted Sets)
// ═══════════════════════════════════════════════════════════════

export async function updateLeaderboardScore(
  leaderboard: string,
  userId: string,
  score: number
): Promise<void> {
  const client = await getValkeyClient();
  await client.zAdd(leaderboard, [{ score, value: userId }], { GT: true });
}

export async function getLeaderboardTop(
  leaderboard: string,
  count = 10
): Promise<Array<{ userId: string; score: number; rank: number }>> {
  const client = await getValkeyClient();
  const results = await client.zRangeWithScores(leaderboard, 0, count - 1, {
    REV: true,
  });

  return results.map((entry, idx) => ({
    userId: entry.value,
    score: entry.score,
    rank: idx + 1,
  }));
}

export async function getLeaderboardRank(
  leaderboard: string,
  userId: string
): Promise<{ rank: number; score: number } | null> {
  const client = await getValkeyClient();
  const rank = await client.zRevRank(leaderboard, userId);
  if (rank === null) return null;

  const score = await client.zScore(leaderboard, userId);
  return { rank: (rank as number) + 1, score: score ?? 0 };
}

// ── Cache Helpers ──────────────────────────────────────────────

export async function cacheGet(key: string): Promise<string | null> {
  if (!valkeyConfigurado()) return memoriaGet(key);
  const client = await getValkeyClient();
  const value = await client.get(key);
  return value as string | null;
}

export async function cacheSet(key: string, value: string, ttlSeconds = 300): Promise<void> {
  if (!valkeyConfigurado()) {
    memoriaSet(key, value, ttlSeconds);
    return;
  }
  const client = await getValkeyClient();
  await client.set(key, value, { EX: ttlSeconds });
}

// ── Shutdown ───────────────────────────────────────────────────

export async function closeValkey(): Promise<void> {
  const closes: Promise<void>[] = [];

  if (_client?.isOpen)
    closes.push(
      _client.quit().then(() => {
        _client = null;
      })
    );
  if (_pubClient?.isOpen)
    closes.push(
      _pubClient.quit().then(() => {
        _pubClient = null;
      })
    );
  if (_subClient?.isOpen)
    closes.push(
      _subClient.quit().then(() => {
        _subClient = null;
      })
    );

  await Promise.all(closes);
}
