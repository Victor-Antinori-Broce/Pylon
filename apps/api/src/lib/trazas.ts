/**
 * Kitsuden — Trazas de peticiones en Postgres: la «caja de cristal» (kitsuden2.md C7)
 * ============================================================================
 *
 * Una fila por petición en `kitsuden_trazas` (migración 0057): request_id,
 * actor (persona, agente, anónimo), kon, operación, duración, tiempo en la
 * base, consultas, filas escritas y BLOQUEOS (una escritura por id que el
 * filtro de dueño o la RLS apartaron; ver engine/src/caja-de-cristal.ts).
 * Se ve en el panel (/traces → Peticiones) y en `GET /api/admin/requests`.
 *
 * Coste: NO es una escritura por petición. Las trazas se juntan en memoria y
 * se escriben en lote (un INSERT de varias filas) cada `TRAZAS_FLUSH_MS` (2 s)
 * o al llegar a 200, con la conexión del sistema y fuera de la transacción de
 * la petición (una petición que se revierte deja su traza igual). Se guardan
 * SIEMPRE las escrituras, los errores (≥400) y los bloqueos; las lecturas
 * correctas, con muestreo (`TRAZAS_MUESTREO_LECTURAS`, 0.1). Si la cola en
 * memoria pasa de 5.000 (la base no da abasto), se descartan las nuevas y se
 * avisa: la traza nunca frena a la API.
 *
 * Retención: particiones por día, `TRAZAS_RETENCION_DIAS` (7). Se rota al
 * arrancar y cada hora.
 *
 * Apagado: `TRAZAS_ENABLED=false`. Apagado por defecto en tests y en pg-mem.
 *
 * OTLP (G2): con `OTEL_EXPORTER_OTLP_ENDPOINT`, cada lote se manda además
 * como spans a ese colector (otlp.ts). Opcional; sin él no sale nada.
 */

import { sql } from "drizzle-orm";
import type { Context, Next } from "hono";

import {
  bloqueosDeLaPeticion,
  medidasDeLaPeticion,
} from "../../../../packages/engine/src/caja-de-cristal";
import { operacionDeRuta } from "../../../../packages/engine/src/operaciones";
import { useRequest } from "../../../../packages/engine/src/request-scope";
import { db, isPgMem } from "../db";

import { enPruebas } from "./entorno";
import { logger } from "./logger";
import { exportarSpansOtlp, otlpConfigurado } from "./otlp";
import { konDeCamino } from "./rutas-de-kons";

export interface Traza {
  creado: Date;
  requestId: string | null;
  traceId: string | null;
  metodo: string;
  ruta: string;
  estado: number;
  actorTipo: "humano" | "agente" | "anonimo";
  actorId: string | null;
  kon: string | null;
  operacion: string | null;
  duracionMs: number;
  tiempoDbMs: number | null;
  consultas: number | null;
  filasAfectadas: number | null;
  bloqueos: number;
  detalleBloqueos: unknown[] | null;
}

function numero(nombre: string, porDefecto: number): number {
  const n = Number(process.env[nombre]);
  return Number.isFinite(n) && n >= 0 ? n : porDefecto;
}

export function trazasEncendidas(): boolean {
  if (process.env.TRAZAS_ENABLED === "false") return false;
  if (process.env.TRAZAS_ENABLED === "true") return !isPgMem;
  return !isPgMem && !enPruebas();
}

const LECTURA = new Set(["GET", "HEAD", "OPTIONS"]);
/** Lo que no aporta nada a la caja de cristal y se pide sin parar. */
const SIN_TRAZA = /^\/(api\/health|health|metrics|api\/metrics|favicon\.ico|media\/)/;

/** La ruta sin ids (como el access-log): agrupa y no guarda identificadores. */
export function rutaNormalizada(c: Context): string {
  const rp = (c.req as unknown as { routePath?: string }).routePath;
  if (rp && rp !== "/*" && rp !== "*") return rp;
  return c.req.path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+(?=\/|$)/g, "/:id")
    .slice(0, 300);
}

// ── El búfer y su escritura ────────────────────────────────────────────────

const pendientes: Traza[] = [];
const MAX_PENDIENTES = 5000;
let temporizador: ReturnType<typeof setInterval> | null = null;
let rotacion: ReturnType<typeof setInterval> | null = null;
let escribiendo: Promise<void> | null = null;
let avisoDeDescarte = 0;

function encolar(t: Traza): void {
  if (pendientes.length >= MAX_PENDIENTES) {
    if (Date.now() - avisoDeDescarte > 60_000) {
      avisoDeDescarte = Date.now();
      logger.warn("[trazas] la base no da abasto: se descartan trazas nuevas");
    }
    return;
  }
  pendientes.push(t);
  if (pendientes.length >= 200) void volcar();
}

async function insertar(lote: Traza[]): Promise<void> {
  const filas = lote.map(
    (t) => sql`(${t.creado.toISOString()}::timestamptz, ${t.requestId}, ${t.traceId}, ${t.metodo},
      ${t.ruta}, ${t.estado}, ${t.actorTipo}, ${t.actorId}, ${t.kon}, ${t.operacion},
      ${t.duracionMs}, ${t.tiempoDbMs}, ${t.consultas}, ${t.filasAfectadas}, ${t.bloqueos},
      ${t.detalleBloqueos ? JSON.stringify(t.detalleBloqueos) : null}::jsonb)`
  );
  await db.execute(sql`
    INSERT INTO kitsuden_trazas
      (creado, request_id, trace_id, metodo, ruta, estado, actor_tipo, actor_id, kon, operacion,
       duracion_ms, tiempo_db_ms, consultas, filas_afectadas, bloqueos, detalle_bloqueos)
    VALUES ${sql.join(filas, sql`, `)}
  `);
}

/** Escribe lo pendiente (un INSERT por lote). Nunca lanza. */
export async function volcar(): Promise<void> {
  if (escribiendo) return escribiendo;
  if (pendientes.length === 0) return;
  const lote = pendientes.splice(0, 500);
  escribiendo = (async () => {
    try {
      try {
        await insertar(lote);
      } catch {
        // Lo normal: falta la partición del día (medianoche, o una base nueva).
        await rotar();
        await insertar(lote);
      }
      if (otlpConfigurado()) void exportarSpansOtlp(lote);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), perdidas: lote.length },
        "[trazas] no se pudo escribir un lote"
      );
    } finally {
      escribiendo = null;
    }
  })();
  return escribiendo;
}

export async function rotar(): Promise<void> {
  try {
    await db.execute(sql`SELECT kitsuden_trazas_rotar(${numero("TRAZAS_RETENCION_DIAS", 7)})`);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[trazas] rotación fallida");
  }
}

/** Arranca el volcado periódico y la rotación. Idempotente. */
export function arrancarTrazas(): void {
  if (!trazasEncendidas() || temporizador) return;
  temporizador = setInterval(() => void volcar(), numero("TRAZAS_FLUSH_MS", 2000) || 2000);
  temporizador.unref?.();
  rotacion = setInterval(() => void rotar(), 60 * 60_000);
  rotacion.unref?.();
  void rotar();
}

export async function pararTrazas(): Promise<void> {
  if (temporizador) clearInterval(temporizador);
  if (rotacion) clearInterval(rotacion);
  temporizador = rotacion = null;
  await volcar();
}

// ── El middleware ──────────────────────────────────────────────────────────

/** ¿Se guarda esta petición? Escrituras, errores y bloqueos siempre; lecturas, muestreadas. */
export function seGuarda(metodo: string, estado: number, bloqueos: number, azar = Math.random()): boolean {
  if (!LECTURA.has(metodo) || estado >= 400 || bloqueos > 0) return true;
  return azar < numero("TRAZAS_MUESTREO_LECTURAS", 0.1);
}

/**
 * Anonymous 404s kept per minute, across all paths. Every error is kept, and an
 * unmatched path gets a fresh limiter bucket per spelling (`/api/x1`, `/api/x2`),
 * so without this cap anyone turned requests into INSERTs into the main database.
 */
let ventanaDe404 = { minuto: 0, cuantos: 0 };

export function cabeOtro404Anonimo(ahora = Date.now()): boolean {
  const minuto = Math.floor(ahora / 60_000);
  if (ventanaDe404.minuto !== minuto) ventanaDe404 = { minuto, cuantos: 0 };
  ventanaDe404.cuantos++;
  return ventanaDe404.cuantos <= numero("TRAZAS_MAX_404_ANONIMOS_POR_MINUTO", 60);
}

export function trazasDePeticion() {
  return async (c: Context, next: Next): Promise<void> => {
    if (!trazasEncendidas() || SIN_TRAZA.test(c.req.path)) {
      await next();
      return;
    }
    const inicio = performance.now();
    try {
      await next();
    } finally {
      try {
        const estado = c.res?.status ?? 500;
        const bloqueos = bloqueosDeLaPeticion();
        const get = c.get as (k: string) => unknown;
        const agente = get("agent") as { agentId?: string } | undefined;
        const usuario = get("user") as { id?: string } | null | undefined;
        const anonimo404 = estado === 404 && !agente?.agentId && !usuario?.id;
        if (seGuarda(c.req.method, estado, bloqueos.length) && (!anonimo404 || cabeOtro404Anonimo())) {
          const medidas = medidasDeLaPeticion();
          const op = operacionDeRuta(c.req.method, c.req.path);
          encolar({
            creado: new Date(),
            requestId: (get("requestId") as string | undefined) ?? useRequest()?.requestId ?? null,
            traceId: (get("traceId") as string | undefined) ?? useRequest()?.traceId ?? null,
            metodo: c.req.method,
            ruta: rutaNormalizada(c),
            estado,
            actorTipo: agente?.agentId ? "agente" : usuario?.id ? "humano" : "anonimo",
            actorId: agente?.agentId ?? usuario?.id ?? null,
            kon: op?.konId ?? konDeCamino(c.req.path),
            operacion: op?.op.id ?? null,
            duracionMs: Math.round(performance.now() - inicio),
            tiempoDbMs: medidas && medidas.consultas > 0 ? Math.round(medidas.ms) : null,
            consultas: medidas ? medidas.consultas : null,
            filasAfectadas: medidas ? medidas.filas : null,
            bloqueos: bloqueos.length,
            detalleBloqueos: bloqueos.length ? bloqueos : null,
          });
        }
      } catch {
        // La traza es un extra: nunca rompe la respuesta.
      }
    }
  };
}

// ── Lectura (panel) ────────────────────────────────────────────────────────

function filas(r: unknown): Array<Record<string, unknown>> {
  return ((r as { rows?: unknown[] }).rows ?? []) as Array<Record<string, unknown>>;
}

export async function listarTrazas(o: {
  desde: Date;
  limite: number;
  soloBloqueos: boolean;
  soloErrores: boolean;
  actor: string | null;
}): Promise<Array<Record<string, unknown>>> {
  await volcar();
  return filas(
    await db.execute(
      sql`SELECT * FROM kitsuden_trazas_listar(${o.desde.toISOString()}::timestamptz, ${o.limite}, ${o.soloBloqueos}, ${o.actor}, ${o.soloErrores})`
    )
  );
}

export async function resumenDeTrazas(desde: Date): Promise<Array<Record<string, unknown>>> {
  await volcar();
  return filas(
    await db.execute(sql`SELECT * FROM kitsuden_trazas_resumen(${desde.toISOString()}::timestamptz)`)
  );
}
