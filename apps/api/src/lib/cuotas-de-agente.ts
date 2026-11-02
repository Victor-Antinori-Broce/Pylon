/**
 * Cuotas por agente (fase E)
 * ============================================================================
 *
 * Tres límites por agente, que se configuran en el panel:
 *
 *   rate_limit            peticiones por MINUTO (ya existía: 60 por defecto)
 *   writes_per_day        escrituras por día UTC (POST/PUT/PATCH/DELETE; en
 *                         MCP, las herramientas que escriben). NULL = sin límite
 *   budget_units_per_day  presupuesto en UNIDADES por día UTC: cada operación
 *                         cuesta 1, o lo que declare su `coste` en el SDK de
 *                         kons. NULL = sin límite
 *
 * Al pasarse: 429 problem+json con `retry_after` (segundos hasta que se abre
 * la ventana: el minuto siguiente o la medianoche UTC):
 *
 *   KITSUDEN_E_RATE_LIMITED     el límite por minuto
 *   KITSUDEN_E_QUOTA_EXCEEDED   escrituras o presupuesto del día
 *
 * ── DÓNDE SE CUENTA ────────────────────────────────────────────────────────
 *
 *   1. Valkey (INCR + EXPIRE). Lo normal, y lo único que comparte la cuenta
 *      entre réplicas.
 *   2. Sin Valkey: el minuto en MEMORIA del proceso (es corto y por réplica,
 *      como el limitador global) y el día en POSTGRES (`agent_quota_usage`,
 *      migración 0047), que sobrevive a reinicios.
 *   3. Si tampoco hay base para el día, se deja pasar (fail-open) y se avisa:
 *      una cuota no debe tumbar la API, y el límite por minuto sigue en pie.
 *
 * Se cuenta al ENTRAR (tras autenticar): un intento rechazado por permiso
 * también gasta. Así un agente que insiste contra un 403 se frena igual.
 *
 * …salvo una REPETICIÓN de la idempotencia (fase F, decisión del
 * propietario): si la respuesta sale con `Idempotent-Replayed: true` (la
 * guardada de la primera vez, o el 409 «no repetible»), no se ejecutó nada y
 * se DEVUELVE lo cobrado al entrar (minuto, escritura y unidades). Se cobra
 * al entrar y se devuelve después, en vez de cobrar después de la
 * idempotencia, para no perder lo de arriba: un 403 sigue gastando.
 *
 * Lo llaman el middleware global (`cuotasDeAgente`, para REST) y el servidor
 * MCP por cada `tools/call` (`consumirCuota`). La petición HTTP que transporta
 * el JSON-RPC de MCP solo cuenta para el minuto: lo que gasta es la
 * herramienta, no el sobre.
 */

import { buildProblem, costeDeOperacion, type KitsudenErrorCode } from "@kitsuden/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Context, Next } from "hono";

import { operacionDeRuta } from "../../../../packages/engine/src/operaciones";
import { db } from "../db";
import { agentQuotaUsage } from "../db/schema";

import { CLAVE_IDEMPOTENCIA_VALIDA, huellaDePeticion, repeticionGuardada } from "./idempotencia";
import { almacenesPorDefecto } from "./idempotencia-almacenes";

import { logger } from "./logger";
import { getValkeyClient } from "./valkey";

export interface LimitesDeAgente {
  agentId: string;
  /** Peticiones por minuto (0 o null = sin límite). */
  rateLimit: number | null;
  writesPerDay: number | null;
  budgetUnitsPerDay: number | null;
}

export interface ConsumoPedido {
  /** ¿Cuenta como petición del minuto? */
  peticion: boolean;
  /** ¿Es una escritura? */
  escritura: boolean;
  /** Unidades de presupuesto (0 = no gasta). */
  unidades: number;
}

export type ResultadoDeCuota =
  | {
      permitido: true;
      /**
       * Devuelve lo que se cobró (minuto, escritura y unidades). Fase F,
       * decisión del propietario: una respuesta REPETIDA por la idempotencia
       * (`Idempotent-Replayed: true`) no ejecuta nada y no gasta cuota.
       */
      devolver: () => Promise<void>;
    }
  | {
      permitido: false;
      codigo: Extract<KitsudenErrorCode, "KITSUDEN_E_RATE_LIMITED" | "KITSUDEN_E_QUOTA_EXCEEDED">;
      limite: "requests_per_minute" | "writes_per_day" | "budget_units_per_day";
      maximo: number;
      retryAfter: number;
    };

export interface UsoDeAgente {
  dia: string;
  peticionesEsteMinuto: number;
  escriturasHoy: number;
  unidadesHoy: number;
  almacen: "valkey" | "postgres" | "memoria";
}

// ── Tiempo ─────────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` en UTC. */
export function diaUtc(ahora = Date.now()): string {
  return new Date(ahora).toISOString().slice(0, 10);
}

export function segundosHastaMedianocheUtc(ahora = Date.now()): number {
  const d = new Date(ahora);
  const manana = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(1, Math.ceil((manana - ahora) / 1000));
}

function minutoActual(ahora = Date.now()): number {
  return Math.floor(ahora / 60_000);
}

function segundosHastaElMinutoSiguiente(ahora = Date.now()): number {
  return Math.max(1, Math.ceil(((minutoActual(ahora) + 1) * 60_000 - ahora) / 1000));
}

// ── Almacenes ──────────────────────────────────────────────────────────────

interface ClienteValkey {
  incr(k: string): Promise<number>;
  incrBy(k: string, n: number): Promise<number>;
  decrBy(k: string, n: number): Promise<number>;
  expire(k: string, s: number): Promise<unknown>;
  get(k: string): Promise<string | null>;
}

/** Inyectable en pruebas: `null` = Valkey no está. */
let obtenerValkey: () => Promise<ClienteValkey | null> = async () => {
  try {
    return (await getValkeyClient()) as unknown as ClienteValkey;
  } catch {
    return null;
  }
};

export function setValkeyDeCuotas(fn: () => Promise<ClienteValkey | null>): void {
  obtenerValkey = fn;
}

const clave = (agentId: string, que: string) => `kitsuden:cuota:${agentId}:${que}`;

// Minuto en memoria (reserva sin Valkey).
const minutosEnMemoria = new Map<string, { minuto: number; n: number }>();
const MAX_AGENTES_EN_MEMORIA = 50_000;

function contarMinutoEnMemoria(agentId: string, ahora: number): number {
  const m = minutoActual(ahora);
  const e = minutosEnMemoria.get(agentId);
  if (!e || e.minuto !== m) {
    if (minutosEnMemoria.size >= MAX_AGENTES_EN_MEMORIA) limpiarMemoriaDeCuotas(ahora);
    minutosEnMemoria.set(agentId, { minuto: m, n: 1 });
    return 1;
  }
  e.n++;
  return e.n;
}

/** Borra las ventanas de minuto ya cerradas (también lo usa el test). */
export function limpiarMemoriaDeCuotas(ahora = Date.now()): void {
  const m = minutoActual(ahora);
  for (const [k, e] of minutosEnMemoria) if (e.minuto !== m) minutosEnMemoria.delete(k);
}

/** Para pruebas. */
export function vaciarMemoriaDeCuotas(): void {
  minutosEnMemoria.clear();
}

async function sumarDiaEnPostgres(
  agentId: string,
  dia: string,
  escrituras: number,
  unidades: number
): Promise<{ writes: number; units: number }> {
  const [fila] = await db
    .insert(agentQuotaUsage)
    .values({ agentId, day: dia, writes: escrituras, units: unidades })
    .onConflictDoUpdate({
      target: [agentQuotaUsage.agentId, agentQuotaUsage.day],
      set: {
        writes: sql`${agentQuotaUsage.writes} + ${escrituras}`,
        units: sql`${agentQuotaUsage.units} + ${unidades}`,
        updatedAt: new Date(),
      },
    })
    .returning({ writes: agentQuotaUsage.writes, units: agentQuotaUsage.units });
  return { writes: fila?.writes ?? escrituras, units: fila?.units ?? unidades };
}

async function restarDiaEnPostgres(agentId: string, dia: string, escrituras: number, unidades: number) {
  await db
    .update(agentQuotaUsage)
    .set({
      writes: sql`greatest(0, ${agentQuotaUsage.writes} - ${escrituras})`,
      units: sql`greatest(0, ${agentQuotaUsage.units} - ${unidades})`,
    })
    .where(and(eq(agentQuotaUsage.agentId, agentId), eq(agentQuotaUsage.day, dia)));
}

// ── Consumir ───────────────────────────────────────────────────────────────

const conLimite = (n: number | null | undefined): n is number => typeof n === "number" && n > 0;

/**
 * Lo mismo que los pasos de `consumirCuota` con Valkey, en UN script (una ida
 * y vuelta, y atómico):
 *
 *   1. minuto (si cuenta y hay límite): INCR, EXPIRE 120 la primera vez; si
 *      se pasa, devuelve sin tocar el día.
 *   2. día (si hay escritura o unidades): INCR/GET de escrituras, INCRBY/GET
 *      de unidades, EXPIRE 2 días de lo que se sumó.
 *
 * Devuelve `{minuto, escrituras, unidades, paso}`: `paso` 0 = se pasó del
 * minuto (y no se tocó el día), 1 = no hay nada del día que contar, 2 = se
 * contó el día.
 */
const SCRIPT_CUOTA = `
local n = 0
if ARGV[1] == '1' then
  n = redis.call('INCR', KEYS[1])
  if n == 1 then redis.call('EXPIRE', KEYS[1], 120) end
  if n > tonumber(ARGV[2]) then return {n, 0, 0, 0} end
end
local w = tonumber(ARGV[3])
local u = tonumber(ARGV[4])
if w == 0 and u == 0 then return {n, 0, 0, 1} end
local writes
if w > 0 then
  writes = redis.call('INCR', KEYS[2])
  redis.call('EXPIRE', KEYS[2], 172800)
else
  writes = tonumber(redis.call('GET', KEYS[2]) or '0')
end
local units
if u > 0 then
  units = redis.call('INCRBY', KEYS[3], u)
  redis.call('EXPIRE', KEYS[3], 172800)
else
  units = tonumber(redis.call('GET', KEYS[3]) or '0')
end
return {n, writes, units, 2}`;

/** `false` tras un fallo de EVAL que no es de conexión: pasos sueltos desde entonces. */
let scriptDeCuotaDisponible = true;

/**
 * `consumirCuota` con el script. `null` si este cliente no puede ejecutarlo o
 * falla (entonces se repite con los pasos sueltos, que deciden igual que antes
 * qué hacer sin Valkey). Mismas decisiones y mismas devoluciones que esos pasos.
 */
async function consumirConScript(
  valkey: ClienteValkey,
  limites: LimitesDeAgente,
  pedido: ConsumoPedido,
  ahora: number
): Promise<ResultadoDeCuota | null> {
  const evaluar = (valkey as { eval?: unknown }).eval;
  if (!scriptDeCuotaDisponible || typeof evaluar !== "function") return null;
  const { agentId } = limites;
  const cuentaMinuto = pedido.peticion && conLimite(limites.rateLimit);
  const escrituras = pedido.escritura ? 1 : 0;
  const unidades = Math.max(0, Math.floor(pedido.unidades));
  const dia = diaUtc(ahora);
  const km = clave(agentId, `min:${minutoActual(ahora)}`);
  const kw = clave(agentId, `w:${dia}`);
  const ku = clave(agentId, `u:${dia}`);

  let r: unknown;
  try {
    r = await (evaluar as (s: string, o: { keys: string[]; arguments: string[] }) => Promise<unknown>).call(
      valkey,
      SCRIPT_CUOTA,
      {
        keys: [km, kw, ku],
        arguments: [cuentaMinuto ? "1" : "0", String(limites.rateLimit ?? 0), String(escrituras), String(unidades)],
      }
    );
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    if (/unknown command|NOSCRIPT|ERR.*script|not allowed|disabled/i.test(mensaje)) scriptDeCuotaDisponible = false;
    return null;
  }
  if (!Array.isArray(r) || r.length !== 4) return null;
  const [, writes, units, paso] = r.map(Number) as [number, number, number, number];

  const devolverMinuto = async () => {
    if (cuentaMinuto) await valkey.decrBy(km, 1);
  };
  if (paso === 0) {
    return {
      permitido: false,
      codigo: "KITSUDEN_E_RATE_LIMITED",
      limite: "requests_per_minute",
      maximo: limites.rateLimit as number,
      retryAfter: segundosHastaElMinutoSiguiente(ahora),
    };
  }
  if (paso === 1) return { permitido: true, devolver: devolverMinuto };

  const devolverDia = async () => {
    if (escrituras) await valkey.decrBy(kw, escrituras);
    if (unidades) await valkey.decrBy(ku, unidades);
  };
  const cuentaEscrituras = escrituras > 0 && conLimite(limites.writesPerDay);
  const cuentaUnidades = unidades > 0 && conLimite(limites.budgetUnitsPerDay);
  const pasaEscrituras = cuentaEscrituras && writes > (limites.writesPerDay as number);
  const pasaUnidades = cuentaUnidades && units > (limites.budgetUnitsPerDay as number);
  if (pasaEscrituras || pasaUnidades) {
    await devolverDia().catch(() => undefined);
    return {
      permitido: false,
      codigo: "KITSUDEN_E_QUOTA_EXCEEDED",
      limite: pasaEscrituras ? "writes_per_day" : "budget_units_per_day",
      maximo: (pasaEscrituras ? limites.writesPerDay : limites.budgetUnitsPerDay) as number,
      retryAfter: segundosHastaMedianocheUtc(ahora),
    };
  }
  return {
    permitido: true,
    devolver: async () => {
      await devolverMinuto().catch(() => undefined);
      await devolverDia().catch(() => undefined);
    },
  };
}

/**
 * Cuenta el consumo y dice si cabe. Si NO cabe, lo que se sumó del día se
 * devuelve (no se cobra lo que se rechaza por cuota); el minuto sí cuenta.
 */
export async function consumirCuota(
  limites: LimitesDeAgente,
  pedido: ConsumoPedido,
  ahora = Date.now()
): Promise<ResultadoDeCuota> {
  const { agentId } = limites;
  const valkey = await obtenerValkey();

  // Con Valkey: TODO en una ida y vuelta (antes, hasta seis llamadas seguidas).
  if (valkey) {
    const r = await consumirConScript(valkey, limites, pedido, ahora);
    if (r) return r;
  }

  // 1. Por minuto
  let devolverMinuto: () => Promise<void> = async () => undefined;
  if (pedido.peticion && conLimite(limites.rateLimit)) {
    let n: number;
    const k = clave(agentId, `min:${minutoActual(ahora)}`);
    const enMemoria = () => {
      const m = minutoActual(ahora);
      devolverMinuto = async () => {
        const e = minutosEnMemoria.get(agentId);
        if (e && e.minuto === m && e.n > 0) e.n--;
      };
      return contarMinutoEnMemoria(agentId, ahora);
    };
    if (valkey) {
      try {
        n = await valkey.incr(k);
        if (n === 1) await valkey.expire(k, 120);
        devolverMinuto = async () => {
          await valkey.decrBy(k, 1);
        };
      } catch {
        n = enMemoria();
      }
    } else {
      n = enMemoria();
    }
    if (n > limites.rateLimit) {
      return {
        permitido: false,
        codigo: "KITSUDEN_E_RATE_LIMITED",
        limite: "requests_per_minute",
        maximo: limites.rateLimit,
        retryAfter: segundosHastaElMinutoSiguiente(ahora),
      };
    }
  }

  // 2. Por día (escrituras y unidades)
  const escrituras = pedido.escritura ? 1 : 0;
  const unidades = Math.max(0, Math.floor(pedido.unidades));
  const cuentaEscrituras = escrituras > 0 && conLimite(limites.writesPerDay);
  const cuentaUnidades = unidades > 0 && conLimite(limites.budgetUnitsPerDay);
  // Se cuenta aunque no haya límite (el panel enseña el consumo), salvo que no
  // haya nada que sumar.
  if (escrituras === 0 && unidades === 0) return { permitido: true, devolver: devolverMinuto };
  // Sin Valkey y sin límite diario no se escribe en Postgres en cada petición:
  // la reserva es para hacer cumplir una cuota, no para llevar estadística.
  if (!valkey && !cuentaEscrituras && !cuentaUnidades) return { permitido: true, devolver: devolverMinuto };

  const dia = diaUtc(ahora);
  let total: { writes: number; units: number };
  let devolver: () => Promise<void>;
  try {
    if (valkey) {
      const kw = clave(agentId, `w:${dia}`);
      const ku = clave(agentId, `u:${dia}`);
      const writes = escrituras ? await valkey.incr(kw) : Number((await valkey.get(kw)) ?? 0);
      const units = unidades ? await valkey.incrBy(ku, unidades) : Number((await valkey.get(ku)) ?? 0);
      // 2 días: el contador de hoy tiene que seguir ahí hasta medianoche.
      if (escrituras) await valkey.expire(kw, 2 * 86_400);
      if (unidades) await valkey.expire(ku, 2 * 86_400);
      total = { writes, units };
      devolver = async () => {
        if (escrituras) await valkey.decrBy(kw, escrituras);
        if (unidades) await valkey.decrBy(ku, unidades);
      };
    } else {
      total = await sumarDiaEnPostgres(agentId, dia, escrituras, unidades);
      devolver = () => restarDiaEnPostgres(agentId, dia, escrituras, unidades);
    }
  } catch (err) {
    // Sin límite diario no hay nada que hacer cumplir: pasa. CON límite, falla
    // en CERRADO: antes un Postgres o un Valkey caído quitaba la cuota a todos
    // los agentes (auditoría 2026-10-25).
    if (!cuentaEscrituras && !cuentaUnidades) {
      logger.warn({ err, agentId }, "[cuotas] no se pudo contar el día (sin límite): pasa");
      return { permitido: true, devolver: devolverMinuto };
    }
    logger.warn({ err, agentId }, "[cuotas] no se pudo contar el día: se rechaza");
    await devolverMinuto().catch(() => undefined);
    return {
      permitido: false,
      codigo: "KITSUDEN_E_QUOTA_EXCEEDED",
      limite: cuentaEscrituras ? "writes_per_day" : "budget_units_per_day",
      maximo: (cuentaEscrituras ? limites.writesPerDay : limites.budgetUnitsPerDay) as number,
      retryAfter: 60,
    };
  }

  const pasaEscrituras = cuentaEscrituras && total.writes > (limites.writesPerDay as number);
  const pasaUnidades = cuentaUnidades && total.units > (limites.budgetUnitsPerDay as number);
  if (pasaEscrituras || pasaUnidades) {
    await devolver().catch(() => undefined);
    return {
      permitido: false,
      codigo: "KITSUDEN_E_QUOTA_EXCEEDED",
      limite: pasaEscrituras ? "writes_per_day" : "budget_units_per_day",
      maximo: (pasaEscrituras ? limites.writesPerDay : limites.budgetUnitsPerDay) as number,
      retryAfter: segundosHastaMedianocheUtc(ahora),
    };
  }
  return {
    permitido: true,
    devolver: async () => {
      await devolverMinuto().catch(() => undefined);
      await devolver().catch(() => undefined);
    },
  };
}

/** El problem+json de un rechazo (lo comparten REST y MCP). */
export function problemaDeCuota(
  r: Extract<ResultadoDeCuota, { permitido: false }>,
  instance?: string
) {
  const que =
    r.limite === "requests_per_minute"
      ? `${r.maximo} requests per minute`
      : r.limite === "writes_per_day"
        ? `${r.maximo} writes per day (UTC)`
        : `${r.maximo} budget units per day (UTC)`;
  return buildProblem({
    code: r.codigo,
    status: 429,
    detail: `Agent quota exceeded: ${que}.`,
    retryAfter: r.retryAfter,
    instance,
    extensions: { quota: r.limite, limit: r.maximo },
  });
}

/** Lo que lleva gastado hoy (para el panel). */
export async function usoDeAgente(agentId: string, ahora = Date.now()): Promise<UsoDeAgente> {
  const dia = diaUtc(ahora);
  const valkey = await obtenerValkey();
  if (valkey) {
    try {
      const [min, w, u] = await Promise.all([
        valkey.get(clave(agentId, `min:${minutoActual(ahora)}`)),
        valkey.get(clave(agentId, `w:${dia}`)),
        valkey.get(clave(agentId, `u:${dia}`)),
      ]);
      return {
        dia,
        peticionesEsteMinuto: Number(min ?? 0),
        escriturasHoy: Number(w ?? 0),
        unidadesHoy: Number(u ?? 0),
        almacen: "valkey",
      };
    } catch {
      /* cae a la reserva */
    }
  }
  const enMemoria = minutosEnMemoria.get(agentId);
  const [fila] = await db
    .select({ writes: agentQuotaUsage.writes, units: agentQuotaUsage.units })
    .from(agentQuotaUsage)
    .where(and(eq(agentQuotaUsage.agentId, agentId), eq(agentQuotaUsage.day, dia)))
    .limit(1);
  return {
    dia,
    peticionesEsteMinuto: enMemoria?.minuto === minutoActual(ahora) ? enMemoria.n : 0,
    escriturasHoy: fila?.writes ?? 0,
    unidadesHoy: fila?.units ?? 0,
    almacen: "postgres",
  };
}

// ── Middleware REST ────────────────────────────────────────────────────────

const ESCRITURA = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** El consumo de una petición REST: su operación del SDK si la hay (y su coste). */
export function consumoDePeticion(metodo: string, camino: string): ConsumoPedido {
  const m = metodo.toUpperCase();
  if (m === "OPTIONS") return { peticion: false, escritura: false, unidades: 0 };
  // El sobre JSON-RPC de MCP: solo el minuto. Cada herramienta paga lo suyo.
  if (camino === "/api/mcp" || camino.startsWith("/api/mcp/")) {
    return { peticion: true, escritura: false, unidades: 0 };
  }
  const deRuta = operacionDeRuta(m, camino);
  return {
    peticion: true,
    escritura: ESCRITURA.has(m),
    unidades: deRuta ? costeDeOperacion(deRuta.op) : 1,
  };
}

interface AgenteConCuotas {
  agentId: string;
  rateLimit?: number | null;
  writesPerDay?: number | null;
  budgetUnitsPerDay?: number | null;
}

/**
 * Tras la autenticación global: si quien llama es un agente, cuenta y, si se
 * pasa, 429. Deja las cabeceras `X-RateLimit-*` del minuto.
 */
/**
 * ¿Esta petición REST es la repetición de una ya hecha (misma Idempotency-Key,
 * misma huella, respuesta guardada)? Entonces el middleware de idempotencia la
 * va a repetir sin ejecutar nada, y no se cobra (fase F). Solo mira el almacén
 * si la petición trae la cabecera.
 */
async function esRepeticion(c: Context, agentId: string): Promise<boolean> {
  const clave = c.req.header("idempotency-key");
  if (!clave || !CLAVE_IDEMPOTENCIA_VALIDA.test(clave) || !ESCRITURA.has(c.req.method.toUpperCase())) {
    return false;
  }
  const camino = c.req.path;
  if (!camino.startsWith("/api/") || camino.startsWith("/api/auth") || camino.startsWith("/api/mcp")) return false;
  try {
    const cuerpo = new Uint8Array(await c.req.raw.clone().arrayBuffer());
    const huella = huellaDePeticion({
      metodo: c.req.method,
      camino,
      query: new URL(c.req.url).search,
      tipo: c.req.header("content-type") ?? "",
      cuerpo,
    });
    return await repeticionGuardada(almacenesDeIdempotencia(), `agent:${agentId}`, clave, huella);
  } catch {
    return false;
  }
}

/** Inyectable en pruebas. */
let almacenesDeIdempotencia = almacenesPorDefecto;
export function setAlmacenesDeIdempotenciaDeCuotas(fn: typeof almacenesPorDefecto): void {
  almacenesDeIdempotencia = fn;
}

export function cuotasDeAgente() {
  return async (c: Context, next: Next) => {
    const agente = (c.get as (k: string) => unknown)("agent") as AgenteConCuotas | undefined;
    if (!agente?.agentId) return next();
    // Una repetición de la idempotencia no ejecuta nada: no gasta (fase F).
    if (await esRepeticion(c, agente.agentId)) return next();
    const r = await consumirCuota(
      {
        agentId: agente.agentId,
        rateLimit: agente.rateLimit ?? null,
        writesPerDay: agente.writesPerDay ?? null,
        budgetUnitsPerDay: agente.budgetUnitsPerDay ?? null,
      },
      consumoDePeticion(c.req.method, c.req.path)
    );
    if (!r.permitido) {
      c.header("Retry-After", String(r.retryAfter));
      return c.body(JSON.stringify(problemaDeCuota(r, c.req.path)), 429, {
        "Content-Type": "application/problem+json",
      });
    }
    await next();
    // Una repetición de la idempotencia no ejecutó nada: no gasta.
    if (c.res?.headers.get("idempotent-replayed") === "true") await r.devolver();
  };
}
