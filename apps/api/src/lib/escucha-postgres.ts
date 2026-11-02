/**
 * Kitsuden — LISTEN de Postgres: una conexión dedicada para todo el proceso
 * ============================================================================
 *
 * La usan la cola (canal `kitsuden_cola`: «hay trabajo») y el bus de tiempo
 * real cuando no hay Valkey (canal `kitsuden_bus`).
 *
 * ── POR QUÉ UNA CONEXIÓN APARTE ────────────────────────────────────────────
 *
 * LISTEN es estado de SESIÓN: necesita una conexión de larga vida que nadie
 * más use. Por eso:
 *   · NO sale del pool de las peticiones (una conexión del pool sirve a
 *     cualquiera y vuelve al pool; el LISTEN se perdería o, peor, se lo
 *     llevaría otra petición).
 *   · NO puede pasar por PgBouncer en modo transaction: ahí cada sentencia
 *     puede ir a un servidor distinto y el LISTEN no llega a nada. Si la API
 *     va detrás de PgBouncer, `DATABASE_LISTEN_URL` apunta DIRECTO a Postgres
 *     (docs/install/pgbouncer.md).
 *
 * NOTIFY se entrega en el COMMIT: un trabajo despachado en una petición que
 * acaba en ROLLBACK no avisa a nadie, que es justo lo que pide el outbox. Y
 * como una notificación se puede perder (reconexión, un corte), la cola NO
 * depende de ella: sondea igualmente cada pocos segundos. Esto solo adelanta.
 *
 * Fallo: se reconecta con espera creciente (hasta 30 s), sin tumbar nada.
 */

import pg from "pg";

import { logger } from "./logger";

type Oyente = (payload: string) => void;

const oyentes = new Map<string, Set<Oyente>>();
let cliente: pg.Client | null = null;
let conectando: Promise<void> | null = null;
let intentos = 0;
let reintento: ReturnType<typeof setTimeout> | null = null;
let cerrado = false;

const CANAL_VALIDO = /^[a-z_][a-z0-9_]{0,62}$/;

/** La URL de la conexión de escucha: directa a Postgres si hay PgBouncer delante. */
export function urlDeEscucha(): string | null {
  const url = process.env.DATABASE_LISTEN_URL || process.env.DATABASE_URL || "";
  if (!url || url === "lite") return null;
  return url;
}

async function conectar(): Promise<void> {
  const url = urlDeEscucha();
  if (!url || cerrado) return;
  const nuevo = new pg.Client({ connectionString: url, application_name: "kitsuden-listen" });
  nuevo.on("notification", (msg) => {
    for (const fn of oyentes.get(msg.channel) ?? []) {
      try {
        fn(msg.payload ?? "");
      } catch (err) {
        logger.warn({ err, canal: msg.channel }, "[listen] un oyente falló");
      }
    }
  });
  nuevo.on("error", (err) => {
    logger.warn({ err: err.message }, "[listen] la conexión de escucha falló; se reconecta");
    perder(nuevo);
  });
  nuevo.on("end", () => perder(nuevo));
  await nuevo.connect();
  for (const canal of oyentes.keys()) await nuevo.query(`LISTEN ${canal}`);
  cliente = nuevo;
  intentos = 0;
}

function perder(viejo: pg.Client): void {
  if (cliente !== viejo) return;
  cliente = null;
  viejo.end().catch(() => {});
  programarReconexion();
}

function programarReconexion(): void {
  if (cerrado || reintento) return;
  intentos++;
  const espera = Math.min(30_000, 500 * 2 ** Math.min(intentos, 6));
  reintento = setTimeout(() => {
    reintento = null;
    void asegurar();
  }, espera);
  reintento.unref?.();
}

async function asegurar(): Promise<void> {
  if (cliente || cerrado) return;
  conectando ??= conectar()
    .catch((err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[listen] no se pudo abrir la conexión de escucha; se reintenta"
      );
      programarReconexion();
    })
    .finally(() => {
      conectando = null;
    });
  await conectando;
}

/**
 * Escucha un canal. Devuelve la función para dejar de escuchar. Sin URL de
 * Postgres (modo lite, pg-mem) no hace nada: quien escucha debe tener su
 * propio plan B (la cola sondea; el bus entrega en el proceso).
 */
export async function escuchar(canal: string, fn: Oyente): Promise<() => Promise<void>> {
  if (!CANAL_VALIDO.test(canal)) throw new TypeError(`Canal de LISTEN inválido: ${canal}`);
  cerrado = false;
  let conjunto = oyentes.get(canal);
  const nuevoCanal = !conjunto;
  if (!conjunto) {
    conjunto = new Set();
    oyentes.set(canal, conjunto);
  }
  conjunto.add(fn);
  await asegurar();
  if (nuevoCanal && cliente) await cliente.query(`LISTEN ${canal}`).catch(() => {});
  return async () => {
    conjunto.delete(fn);
    if (conjunto.size === 0) {
      oyentes.delete(canal);
      await cliente?.query(`UNLISTEN ${canal}`).catch(() => {});
    }
  };
}

/** ¿Hay una conexión de escucha viva ahora mismo? */
export function escuchaActiva(): boolean {
  return cliente !== null;
}

/** Cierra la conexión (apagado ordenado). */
export async function cerrarEscucha(): Promise<void> {
  cerrado = true;
  if (reintento) clearTimeout(reintento);
  reintento = null;
  const c = cliente;
  cliente = null;
  oyentes.clear();
  await c?.end().catch(() => {});
}
