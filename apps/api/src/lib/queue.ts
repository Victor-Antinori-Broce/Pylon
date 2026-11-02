/**
 * Kitsuden — La cola de trabajos sobre Postgres (transactional outbox)
 * ============================================================================
 *
 * Implementa la costura del engine (`packages/engine/src/cola.ts`). Sustituye
 * a BullMQ desde el 2026-10-28 (kitsuden2.md, B1): un solo motor, una sola
 * semántica de fallo, y la API se despliega con Postgres y nada más.
 *
 * ── DESPACHAR ──────────────────────────────────────────────────────────────
 *
 * `queue.dispatch()` INSERTA en `kitsuden_outbox` con el ejecutor de la
 * petición (`resolveExecutor`): dentro de una petición, la transacción RLS;
 * ROLLBACK = el trabajo no existe. Antes, BullMQ encolaba aunque la petición
 * se deshiciera, y con Valkey caído el trabajo se perdía con un log.
 * Junto al INSERT va un `pg_notify('kitsuden_cola', cola)`, que Postgres
 * entrega en el COMMIT (y nunca en un ROLLBACK).
 *
 * El rol de la aplicación solo tiene INSERT sobre la tabla (migración 0056);
 * reclamar, cerrar y listar van por funciones SECURITY DEFINER.
 *
 * ── EL WORKER ──────────────────────────────────────────────────────────────
 *
 *   · Pool PROPIO y pequeño (`QUEUE_POOL_MAX`, 3): no compite con las
 *     peticiones por conexiones.
 *   · Se despierta con NOTIFY (escucha-postgres.ts) y, como red, SONDEA cada
 *     `QUEUE_POLL_MS` (2 s). El sondeo no es opcional: una notificación se
 *     puede perder.
 *   · Reclama con `FOR UPDATE SKIP LOCKED` y marca `running` con un ARRIENDO
 *     (`QUEUE_LEASE_SECONDS`, 300 s). Un worker que muere deja el arriendo
 *     vencido; el barrido (cada 30 s) lo devuelve a la cola o, sin intentos,
 *     a `dead`. Entrega al menos una vez: los handlers, idempotentes.
 *   · El ACTOR se relee al ejecutar: persona → su rol de ahora (borrada =
 *     no se ejecuta); agente → activo, clave vigente y scopes de ahora (como
 *     las aprobaciones). El handler corre en una transacción RLS perezosa con
 *     ESE actor (`enTransaccionRls`): un trabajo encolado ayer no corre con
 *     permisos revocados hoy.
 *   · Fallos: espera exponencial (2 s, 4 s, 8 s… hasta 10 min) hasta
 *     `max_attempts`; luego `dead`. `ErrorPermanente` = `dead` al momento.
 *     Los muertos se ven en el panel (`/api/admin/queue`): reintentar o
 *     descartar. Los terminados se borran a los `QUEUE_RETENTION_DAYS` (7).
 *
 * Sin worker en pg-mem (no entiende SKIP LOCKED ni plpgsql). En modo lite
 * (PGlite) corre sobre la misma base y sin LISTEN: solo sondeo.
 */

import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import {
  configurarCola,
  ErrorPermanente,
  manejadoresDeCola,
  queue,
  type ActorDeTrabajo,
  type OpcionesDeDespacho,
  type TrabajoDeCola,
} from "../../../../packages/engine/src/cola";
import { resolveExecutor, useRequest } from "../../../../packages/engine/src/request-scope";
import {
  conTransaccionesPerezosas,
  enTransaccionRls,
  type ConexionTransaccional,
} from "../../../../packages/engine/src/rls-peticion";
import { db, isLiteMode, isPgMem, mergedSchema } from "../db";
import { authUsers } from "../db/schema-core";

import { escuchar } from "./escucha-postgres";
import { logger } from "./logger";

const CANAL = "kitsuden_cola";
export const COLA_DE_CORREO = "kitsuden-email";

function numeroDeEntorno(nombre: string, porDefecto: number, minimo = 1): number {
  const n = Number(process.env[nombre]);
  return Number.isFinite(n) && n >= minimo ? Math.floor(n) : porDefecto;
}

const SONDEO_MS = () => numeroDeEntorno("QUEUE_POLL_MS", 2000, 100);
const ARRIENDO_S = () => numeroDeEntorno("QUEUE_LEASE_SECONDS", 300, 5);
const RETENCION_DIAS = () => numeroDeEntorno("QUEUE_RETENTION_DAYS", 7, 0);
const BARRIDO_MS = 30_000;
const ESPERA_MAX_MS = 10 * 60_000;

/** Algo que ejecuta SQL de Drizzle y devuelve filas (node-postgres o PGlite). */
interface Ejecutor {
  execute(consulta: unknown): Promise<unknown>;
}

function filas(resultado: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(resultado)) return resultado as Array<Record<string, unknown>>;
  const rows = (resultado as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

// ═══════════════════════════════════════════════════════════════════════════
// DESPACHAR
// ═══════════════════════════════════════════════════════════════════════════

/** El actor que se guarda: quien pregunta en la petición en curso. */
function actorDeLaPeticion(): {
  userId: string | null;
  userRole: string | null;
  agentId: string | null;
  keyId: string | null;
} {
  const u = useRequest()?.user;
  if (!u?.id) return { userId: null, userRole: null, agentId: null, keyId: null };
  if (u.role === "agent") {
    return { userId: null, userRole: "agent", agentId: u.id, keyId: u.keyId ?? null };
  }
  return { userId: u.id, userRole: u.role ?? "user", agentId: null, keyId: null };
}

async function despachar(
  cola: string,
  nombre: string,
  payload: unknown,
  opciones: OpcionesDeDespacho
): Promise<{ id: string }> {
  const id = randomUUID();
  const actor = actorDeLaPeticion();
  const retraso = Math.max(0, Math.floor(opciones.retrasoMs ?? 0));
  const json = JSON.stringify(payload ?? {});
  // La clave del agente viaja dentro de request_id para no ampliar la tabla:
  // `<requestId>|key:<keyId>`. Solo la lee el worker al releer al actor.
  const requestId = useRequest()?.requestId ?? null;
  const referencia = actor.keyId ? `${requestId ?? ""}|key:${actor.keyId}` : requestId;

  const ejecutor = resolveExecutor(db) as unknown as Ejecutor;
  // Sin RETURNING: el rol de la aplicación solo tiene INSERT (no SELECT).
  // `run_at` con el reloj de Postgres, el mismo que usa el reclamo.
  const cuando = retraso > 0 ? sql`now() + (${retraso} * interval '1 millisecond')` : sql`now()`;
  await ejecutor.execute(sql`
    INSERT INTO kitsuden_outbox
      (id, queue, name, payload, user_id, user_role, agent_id, request_id, max_attempts, run_at)
    VALUES
      (${id}, ${cola}, ${nombre}, ${json}::jsonb, ${actor.userId}, ${actor.userRole},
       ${actor.agentId}, ${referencia}, ${opciones.intentos ?? 3}, ${cuando})
  `);
  // pg-mem no tiene pg_notify, y en lite nadie escucha.
  if (!isPgMem && !isLiteMode) {
    await ejecutor.execute(sql`SELECT pg_notify(${CANAL}, ${cola})`);
  }
  // Fuera de una petición ya está confirmado: despertar al worker local
  // sin esperar al sondeo (en una petición, lo hará el NOTIFY al confirmar).
  if (!useRequest()?.tx) setImmediate(() => trabajador?.despertar());
  return { id };
}

configurarCola({
  despachar,
  alRegistrar: () => trabajador?.despertar(),
});

// ═══════════════════════════════════════════════════════════════════════════
// RELEER AL ACTOR
// ═══════════════════════════════════════════════════════════════════════════

export type ActorReleido =
  | { ok: true; actor: ActorDeTrabajo | null }
  | { ok: false; motivo: string };

interface FilaDeTrabajo {
  id: string;
  queue: string;
  name: string;
  payload: unknown;
  user_id: string | null;
  user_role: string | null;
  agent_id: string | null;
  request_id: string | null;
  attempts: number;
  max_attempts: number;
}

function claveDeAgente(referencia: string | null): string | null {
  const m = referencia?.match(/\|key:(.+)$/);
  return m?.[1] ?? null;
}

async function releerActorPorDefecto(fila: FilaDeTrabajo): Promise<ActorReleido> {
  if (fila.agent_id) {
    // Import diferido: agent-auth arrastra media API y aquí solo hace falta
    // cuando de verdad hay un trabajo de un agente.
    const { contextoDeAgenteParaAprobacion } = await import("../services/agent-auth");
    const r = await contextoDeAgenteParaAprobacion(fila.agent_id, claveDeAgente(fila.request_id));
    if (!r.ok) return { ok: false, motivo: r.motivo };
    return { ok: true, actor: { id: r.context.agentId, role: "agent", scopes: r.context.scopes } };
  }
  if (fila.user_id) {
    const [u] = await db
      .select({ role: authUsers.role })
      .from(authUsers)
      .where(eq(authUsers.id, fila.user_id))
      .limit(1);
    if (!u) return { ok: false, motivo: "user_not_found" };
    return { ok: true, actor: { id: fila.user_id, role: u.role ?? "user" } };
  }
  return { ok: true, actor: null };
}

let releerActor = releerActorPorDefecto;

/** Solo para pruebas: sustituye cómo se relee al actor. */
export function setReleerActor(fn: typeof releerActorPorDefecto | null): void {
  releerActor = fn ?? releerActorPorDefecto;
}

// ═══════════════════════════════════════════════════════════════════════════
// EL WORKER
// ═══════════════════════════════════════════════════════════════════════════

function esperaDeReintento(intento: number): number {
  return Math.min(ESPERA_MAX_MS, 2000 * 2 ** Math.max(0, intento - 1));
}

function textoDeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

class Trabajador {
  readonly id = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  private enCurso = new Map<string, number>();
  private temporizador: ReturnType<typeof setInterval> | null = null;
  private barrido: ReturnType<typeof setInterval> | null = null;
  private bombeando = false;
  private otraVuelta = false;
  private parado = false;
  /** Pruebas: sin despertares automáticos (solo `unaVuelta`). */
  pausado = false;
  private activos = new Set<Promise<void>>();
  private dejarDeEscuchar: (() => Promise<void>) | null = null;

  constructor(
    private readonly base: Ejecutor,
    private readonly paraTransacciones: ConexionTransaccional,
    private readonly cerrarPool: () => Promise<void>
  ) {}

  async arrancar(): Promise<void> {
    this.temporizador = setInterval(() => this.despertar(), SONDEO_MS());
    this.temporizador.unref?.();
    this.barrido = setInterval(() => void this.barrer(), BARRIDO_MS);
    this.barrido.unref?.();
    if (!isLiteMode) {
      this.dejarDeEscuchar = await escuchar(CANAL, () => this.despertar()).catch(() => null);
    }
    await this.barrer();
    this.despertar();
  }

  /** Pide una vuelta de reclamo (se fusionan las que lleguen a la vez). */
  despertar(): void {
    if (this.parado || this.pausado) return;
    if (this.bombeando) {
      this.otraVuelta = true;
      return;
    }
    this.bombeando = true;
    void this.bombear().finally(() => {
      this.bombeando = false;
      if (this.otraVuelta) {
        this.otraVuelta = false;
        this.despertar();
      }
    });
  }

  private async bombear(): Promise<void> {
    for (const [cola, { concurrencia }] of manejadoresDeCola()) {
      if (this.parado) return;
      const libres = concurrencia - (this.enCurso.get(cola) ?? 0);
      if (libres <= 0) continue;
      let reclamados: FilaDeTrabajo[];
      try {
        reclamados = filas(
          await this.base.execute(
            sql`SELECT * FROM kitsuden_cola_reclamar(ARRAY[${cola}]::text[], ${libres}, ${ARRIENDO_S()}, ${this.id})`
          )
        ) as unknown as FilaDeTrabajo[];
      } catch (err) {
        logger.warn({ err: textoDeError(err), cola }, "[cola] no se pudo reclamar trabajo");
        continue;
      }
      for (const fila of reclamados) this.lanzar(cola, fila);
    }
  }

  private lanzar(cola: string, fila: FilaDeTrabajo): void {
    this.enCurso.set(cola, (this.enCurso.get(cola) ?? 0) + 1);
    const tarea = this.ejecutar(cola, fila).finally(() => {
      this.enCurso.set(cola, (this.enCurso.get(cola) ?? 1) - 1);
      this.activos.delete(tarea);
      this.despertar();
    });
    this.activos.add(tarea);
  }

  private async ejecutar(cola: string, fila: FilaDeTrabajo): Promise<void> {
    const manejador = manejadoresDeCola().get(cola);
    const inicio = Date.now();
    try {
      if (!manejador) throw new Error(`Sin manejador para la cola ${cola}`);
      const releido = await releerActor(fila);
      if (!releido.ok) {
        throw new ErrorPermanente(`actor_revoked: ${releido.motivo}`);
      }
      const trabajo: TrabajoDeCola = {
        id: fila.id,
        cola,
        nombre: fila.name,
        payload: fila.payload,
        intento: fila.attempts,
        maxIntentos: fila.max_attempts,
        actor: releido.actor,
        requestId: fila.request_id?.replace(/\|key:.+$/, "") || null,
      };
      await enTransaccionRls(
        this.paraTransacciones,
        releido.actor,
        () => manejador.fn(trabajo),
        { requestId: `job:${fila.id}` }
      );
      await this.base.execute(sql`SELECT kitsuden_cola_completar(${fila.id}::uuid, ${this.id})`);
      logger.info(
        { cola, jobId: fila.id, jobName: fila.name, intento: fila.attempts, ms: Date.now() - inicio },
        "job completado"
      );
    } catch (err) {
      const definitivo = err instanceof ErrorPermanente;
      const espera = Math.ceil(esperaDeReintento(fila.attempts) / 1000);
      let estado: unknown = null;
      try {
        const [r] = filas(
          await this.base.execute(
            sql`SELECT kitsuden_cola_fallar(${fila.id}::uuid, ${this.id}, ${textoDeError(err)}, ${espera}, ${definitivo}) AS estado`
          )
        );
        estado = r?.estado ?? null;
      } catch (errAlCerrar) {
        logger.error(
          { err: textoDeError(errAlCerrar), jobId: fila.id },
          "[cola] no se pudo anotar el fallo; el barrido lo recuperará"
        );
      }
      const nivel = estado === "dead" ? "error" : "warn";
      logger[nivel](
        { cola, jobId: fila.id, jobName: fila.name, intento: fila.attempts, estado, err: textoDeError(err) },
        estado === "dead" ? "job muerto (dead letter)" : "job fallido; se reintentará"
      );
    }
  }

  /** Una vuelta de reclamo, esperando a que acabe lo reclamado (pruebas). */
  async unaVuelta(): Promise<void> {
    await this.bombear();
    await Promise.allSettled([...this.activos]);
  }

  async barrer(): Promise<void> {
    try {
      const [r] = filas(
        await this.base.execute(sql`SELECT kitsuden_cola_barrer(${RETENCION_DIAS()}) AS n`)
      );
      const n = Number(r?.n ?? 0);
      if (n > 0) {
        logger.warn({ huerfanos: n }, "[cola] trabajos con el arriendo vencido recuperados");
        this.despertar();
      }
    } catch (err) {
      logger.warn({ err: textoDeError(err) }, "[cola] el barrido falló");
    }
  }

  async parar(esperaMs = 10_000): Promise<void> {
    this.parado = true;
    if (this.temporizador) clearInterval(this.temporizador);
    if (this.barrido) clearInterval(this.barrido);
    await this.dejarDeEscuchar?.().catch(() => {});
    // Lo que esté en marcha tiene un rato para acabar; lo que no, lo
    // recuperará el barrido de otro proceso cuando venza el arriendo.
    await Promise.race([
      Promise.allSettled([...this.activos]),
      new Promise((r) => setTimeout(r, esperaMs).unref?.()),
    ]);
    await this.cerrarPool();
  }
}

let trabajador: Trabajador | null = null;

// ═══════════════════════════════════════════════════════════════════════════
// LA COLA DE CORREO (compatibilidad con el nombre de antes)
// ═══════════════════════════════════════════════════════════════════════════

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Lo que antes era la cola de BullMQ. `add` ya no descarta nada en silencio:
 * o queda en la base (y en la transacción de la petición) o lanza.
 */
export const emailQueue = {
  async add(name: string, data: Record<string, unknown>) {
    return queue.dispatch(COLA_DE_CORREO, name, data);
  },

  async getWaitingCount() {
    const estado = await estadoDeLaCola();
    return estado.porCola[COLA_DE_CORREO]?.pending ?? 0;
  },

  async getActiveCount() {
    const estado = await estadoDeLaCola();
    return estado.porCola[COLA_DE_CORREO]?.running ?? 0;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// PANEL Y SALUD
// ═══════════════════════════════════════════════════════════════════════════

export interface EstadoDeLaCola {
  worker: "running" | "stopped" | "disabled";
  escucha: boolean;
  porCola: Record<string, Record<string, number>>;
  totales: Record<string, number>;
}

export async function estadoDeLaCola(): Promise<EstadoDeLaCola> {
  const { escuchaActiva } = await import("./escucha-postgres");
  const porCola: Record<string, Record<string, number>> = {};
  const totales: Record<string, number> = {};
  if (!isPgMem) {
    const r = filas(await db.execute(sql`SELECT * FROM kitsuden_cola_estado()`));
    for (const f of r) {
      const cola = String(f.queue);
      const estado = String(f.status);
      const n = Number(f.total ?? 0);
      (porCola[cola] ??= {})[estado] = n;
      totales[estado] = (totales[estado] ?? 0) + n;
    }
  }
  return {
    worker: isPgMem ? "disabled" : trabajador ? "running" : "stopped",
    escucha: escuchaActiva(),
    porCola,
    totales,
  };
}

export async function trabajosMuertos(limite = 50): Promise<Array<Record<string, unknown>>> {
  return filas(await db.execute(sql`SELECT * FROM kitsuden_cola_muertos(${limite})`));
}

export async function reintentarTrabajo(id: string): Promise<boolean> {
  const [r] = filas(await db.execute(sql`SELECT kitsuden_cola_reintentar(${id}::uuid) AS ok`));
  trabajador?.despertar();
  return r?.ok === true;
}

export async function descartarTrabajo(id: string): Promise<boolean> {
  const [r] = filas(await db.execute(sql`SELECT kitsuden_cola_descartar(${id}::uuid) AS ok`));
  return r?.ok === true;
}

// ═══════════════════════════════════════════════════════════════════════════
// ARRANQUE Y APAGADO
// ═══════════════════════════════════════════════════════════════════════════

let workersInitialized = false;

/** Arranca el worker de la cola (una vez por proceso). */
export async function setupWorkers(): Promise<void> {
  if (workersInitialized) return;
  workersInitialized = true;

  if (isPgMem) {
    logger.info("[cola] pg-mem: sin worker (no entiende SKIP LOCKED); los trabajos solo se guardan");
    return;
  }
  if (process.env.QUEUE_WORKER === "false") {
    logger.info("[cola] QUEUE_WORKER=false: este proceso solo encola");
    return;
  }

  // eslint-disable-next-line import/no-cycle -- lazy a propósito: rompe el ciclo queue↔email en carga estática
  const { registerEmailWorker } = await import("../jobs/email");
  registerEmailWorker();
  // Webhooks firmados a los agentes cuando se resuelve su propuesta (B3).
  const { registrarEntregaDeAvisos } = await import("./avisos-de-propuestas");
  registrarEntregaDeAvisos();
  // Embeddings de los modelos con búsqueda semántica (D5).
  const { registrarEmbeddingsDeModelos } = await import("./embeddings-de-modelos");
  registrarEmbeddingsDeModelos();
  // Segunda opinión sobre las propuestas: clasificador de inyección (D5).
  const { registrarClasificador } = await import("./clasificador-de-inyeccion");
  registrarClasificador();

  if (isLiteMode) {
    // PGlite: una sola conexión; el worker usa la misma base.
    const base = db as unknown as Ejecutor & ConexionTransaccional;
    trabajador = new Trabajador(base, base, async () => {});
  } else {
    const pool = conTransaccionesPerezosas(
      new pg.Pool({
        connectionString: process.env.QUEUE_DATABASE_URL || process.env.DATABASE_URL,
        max: numeroDeEntorno("QUEUE_POOL_MAX", 3),
        idleTimeoutMillis: 30_000,
        application_name: "kitsuden-queue",
      })
    );
    pool.on("error", (err) => logger.warn({ err: err.message }, "[cola] error en el pool de la cola"));
    const dbCola = drizzle(pool, { schema: mergedSchema as Record<string, unknown> });
    trabajador = new Trabajador(
      dbCola as unknown as Ejecutor,
      dbCola as unknown as ConexionTransaccional,
      () => pool.end()
    );
  }
  await trabajador.arrancar();
  logger.info(
    { worker: trabajador.id, colas: [...manejadoresDeCola().keys()] },
    "[cola] worker de Postgres en marcha"
  );
}

export async function shutdownQueues(): Promise<void> {
  const t = trabajador;
  trabajador = null;
  // Se puede volver a arrancar (las pruebas de un mismo proceso lo hacen).
  workersInitialized = false;
  await t?.parar();
  const { cerrarEscucha } = await import("./escucha-postgres");
  await cerrarEscucha();
}

/** Solo para pruebas: el worker deja de despertarse solo (NOTIFY, sondeo, al despachar). */
export function pausarTrabajador(pausado: boolean): void {
  if (trabajador) trabajador.pausado = pausado;
}

/** Solo para pruebas: una vuelta de reclamo, esperando a lo reclamado. */
export async function procesarPendientes(): Promise<void> {
  await trabajador?.unaVuelta();
}

/** Solo para pruebas: fuerza un barrido. */
export async function barrerAhora(): Promise<void> {
  await trabajador?.barrer();
}
