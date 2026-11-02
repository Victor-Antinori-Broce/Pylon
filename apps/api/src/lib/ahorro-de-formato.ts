/**
 * Ahorro del formato `auto` por agente y día (lo que enseña el panel)
 * ============================================================================
 *
 * Cada llamada MCP de un agente (y cada petición REST suya que pida `auto`)
 * mide cuánto ocupaba su JSON compacto y cuánto se mandó de verdad
 * (lib/medida-de-formato.ts). Aquí se SUMA por agente, día UTC y canal en
 * memoria y se vuelca a `agent_format_savings` (migración 0052) cada
 * `VOLCADO_MS`, con un UPSERT por fila acumulada: una tool call no añade una
 * escritura a la base.
 *
 * Solo contadores: ni argumentos, ni respuestas, ni usuarios. Un fallo al
 * volcar se registra y se descarta (es una estadística, no una cuota).
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "../db";
import { agentFormatSavings } from "../db/schema";

import { logger } from "./logger";
import { fijarOyenteDeAhorro, type MedidaDeFormato } from "./medida-de-formato";

export type CanalDeAhorro = "mcp" | "rest";

const VOLCADO_MS = 15_000;

interface Acumulado extends MedidaDeFormato {
  agentId: string;
  day: string;
  channel: CanalDeAhorro;
}

const pendientes = new Map<string, Acumulado>();
let temporizador: ReturnType<typeof setInterval> | null = null;

const hoy = () => new Date().toISOString().slice(0, 10);

/** Suma una medida a lo pendiente del agente (no espera a la base). */
export function registrarAhorro(agentId: string | null | undefined, channel: CanalDeAhorro, m: MedidaDeFormato): void {
  if (!agentId || agentId.startsWith("machine-") || m.respuestas === 0) return;
  const day = hoy();
  const clave = `${agentId}|${day}|${channel}`;
  const a = pendientes.get(clave) ?? {
    agentId,
    day,
    channel,
    respuestas: 0,
    compactadas: 0,
    bytesJson: 0,
    bytesEnviados: 0,
    tokensJson: 0,
    tokensEnviados: 0,
  };
  a.respuestas += m.respuestas;
  a.compactadas += m.compactadas;
  a.bytesJson += m.bytesJson;
  a.bytesEnviados += m.bytesEnviados;
  a.tokensJson += m.tokensJson;
  a.tokensEnviados += m.tokensEnviados;
  pendientes.set(clave, a);
  if (!temporizador) {
    temporizador = setInterval(() => void volcarAhorro(), VOLCADO_MS);
    (temporizador as { unref?: () => void }).unref?.();
  }
}

/** Escribe lo pendiente en la base. Lo usan el temporizador y los tests. */
export async function volcarAhorro(): Promise<void> {
  if (pendientes.size === 0) return;
  const lote = [...pendientes.values()];
  pendientes.clear();
  for (const a of lote) {
    const fila = {
      responses: a.respuestas,
      compacted: a.compactadas,
      jsonBytes: a.bytesJson,
      sentBytes: a.bytesEnviados,
      jsonTokensEst: Math.round(a.tokensJson),
      sentTokensEst: Math.round(a.tokensEnviados),
    };
    try {
      await db
        .insert(agentFormatSavings)
        .values({ agentId: a.agentId, day: a.day, channel: a.channel, ...fila })
        .onConflictDoUpdate({
          target: [agentFormatSavings.agentId, agentFormatSavings.day, agentFormatSavings.channel],
          set: {
            responses: sql`${agentFormatSavings.responses} + ${fila.responses}`,
            compacted: sql`${agentFormatSavings.compacted} + ${fila.compacted}`,
            jsonBytes: sql`${agentFormatSavings.jsonBytes} + ${fila.jsonBytes}`,
            sentBytes: sql`${agentFormatSavings.sentBytes} + ${fila.sentBytes}`,
            jsonTokensEst: sql`${agentFormatSavings.jsonTokensEst} + ${fila.jsonTokensEst}`,
            sentTokensEst: sql`${agentFormatSavings.sentTokensEst} + ${fila.sentTokensEst}`,
            updatedAt: new Date(),
          },
        });
    } catch (err) {
      // Agente borrado entre la llamada y el volcado (FK), base caída…: se pierde la estadística.
      logger.warn({ err, agentId: a.agentId }, "[ahorro-de-formato] no se pudo volcar");
    }
  }
}

export interface ResumenDeAhorro {
  responses: number;
  compacted: number;
  jsonBytes: number;
  sentBytes: number;
  savedBytes: number;
  jsonTokensEst: number;
  sentTokensEst: number;
  savedTokensEst: number;
  /** Ahorro en tokens estimados, 0–100 (1 decimal). */
  savedPercent: number;
}

function resumir(filas: { responses: number; compacted: number; jsonBytes: number; sentBytes: number; jsonTokensEst: number; sentTokensEst: number }[]): ResumenDeAhorro {
  const t = filas.reduce(
    (acc, f) => ({
      responses: acc.responses + Number(f.responses),
      compacted: acc.compacted + Number(f.compacted),
      jsonBytes: acc.jsonBytes + Number(f.jsonBytes),
      sentBytes: acc.sentBytes + Number(f.sentBytes),
      jsonTokensEst: acc.jsonTokensEst + Number(f.jsonTokensEst),
      sentTokensEst: acc.sentTokensEst + Number(f.sentTokensEst),
    }),
    { responses: 0, compacted: 0, jsonBytes: 0, sentBytes: 0, jsonTokensEst: 0, sentTokensEst: 0 }
  );
  const savedTokensEst = t.jsonTokensEst - t.sentTokensEst;
  return {
    ...t,
    savedBytes: t.jsonBytes - t.sentBytes,
    savedTokensEst,
    savedPercent: t.jsonTokensEst > 0 ? Math.round((savedTokensEst / t.jsonTokensEst) * 1000) / 10 : 0,
  };
}

/**
 * Lo ahorrado por un agente: hoy, los últimos `dias` (hoy incluido) y el
 * detalle por día. Vuelca antes lo pendiente para que el panel vea lo último.
 */
export async function ahorroDeAgente(agentId: string, dias = 30) {
  await volcarAhorro();
  const desde = new Date(Date.now() - (dias - 1) * 86_400_000).toISOString().slice(0, 10);
  const filas = await db
    .select()
    .from(agentFormatSavings)
    .where(and(eq(agentFormatSavings.agentId, agentId), gte(agentFormatSavings.day, desde)))
    .orderBy(desc(agentFormatSavings.day));
  const dia = hoy();
  const porDia = new Map<string, typeof filas>();
  for (const f of filas) porDia.set(f.day, [...(porDia.get(f.day) ?? []), f]);
  return {
    day: dia,
    today: resumir(filas.filter((f) => f.day === dia)),
    period: { days: dias, ...resumir(filas) },
    daily: [...porDia.entries()].map(([day, fs]) => ({ day, ...resumir(fs) })),
    estimate: "o200k_base characters per token from docs/agents/benchmarks.md (JSON 3.06, TOON 3.10, TRON 2.81)",
  };
}

// Al cargarse, recibe las medidas del middleware REST (lib/toon.ts) y de MCP.
fijarOyenteDeAhorro(registrarAhorro);
