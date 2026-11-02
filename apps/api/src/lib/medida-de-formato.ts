/**
 * Medida del ahorro del formato `auto` dentro de UNA llamada (sin base de datos)
 * ============================================================================
 *
 * `codificarRespuesta` (lib/formatos.ts) anota aquí cada respuesta que
 * codifica: cuántos caracteres y bytes tenía su JSON compacto y cuántos se
 * mandaron. Quien quiere saberlo (la ruta MCP por llamada, el middleware REST
 * por petición) abre una medida con `medirFormato` y la lee al final; fuera
 * de una medida, anotar no hace nada. Separado de lib/ahorro-de-formato.ts
 * (que guarda en la base) para que formatos.ts no importe la base: lo usan
 * tests unitarios y el SDK.
 *
 * Tokens: ESTIMADOS con los caracteres por token `o200k_base` medidos en
 * docs/agents/benchmarks.md §1 sobre 24 respuestas reales (JSON compacto 3,06;
 * TOON 3,10; TRON 2,81). No es el tokenizador de Claude (no hay uno offline):
 * sirve para comparar, no para facturar.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type FormatoMedido = "json" | "toon" | "tron";

export const CARACTERES_POR_TOKEN: Record<FormatoMedido, number> = { json: 3.06, toon: 3.1, tron: 2.81 };

export interface MedidaDeFormato {
  respuestas: number;
  /** Respuestas en las que salió algo que no era JSON. */
  compactadas: number;
  bytesJson: number;
  bytesEnviados: number;
  tokensJson: number;
  tokensEnviados: number;
}

export const medidaVacia = (): MedidaDeFormato => ({
  respuestas: 0,
  compactadas: 0,
  bytesJson: 0,
  bytesEnviados: 0,
  tokensJson: 0,
  tokensEnviados: 0,
});

const almacen = new AsyncLocalStorage<MedidaDeFormato>();

const bytes = (s: string) => Buffer.byteLength(s, "utf8");

/** Anota una respuesta codificada (no hace nada fuera de `medirFormato`). */
export function anotarSalida(json: string, texto: string, formato: FormatoMedido): void {
  const m = almacen.getStore();
  if (!m) return;
  m.respuestas++;
  if (formato !== "json") m.compactadas++;
  const bj = bytes(json);
  m.bytesJson += bj;
  m.bytesEnviados += formato === "json" && texto === json ? bj : bytes(texto);
  m.tokensJson += json.length / CARACTERES_POR_TOKEN.json;
  m.tokensEnviados += texto.length / CARACTERES_POR_TOKEN[formato];
}

/** Ejecuta `fn` midiendo lo que codifique. */
export async function medirFormato<T>(fn: () => Promise<T>): Promise<{ valor: T; medida: MedidaDeFormato }> {
  const medida = medidaVacia();
  const valor = await almacen.run(medida, fn);
  return { valor, medida };
}

/** Abre una medida para el resto de esta ejecución asíncrona (middleware). */
export function medidaActual(): MedidaDeFormato | undefined {
  return almacen.getStore();
}

/** Como `medirFormato`, para código síncrono (el middleware REST). */
export function medirFormatoSincrono<T>(fn: () => T): { valor: T; medida: MedidaDeFormato } {
  const medida = medidaVacia();
  const valor = almacen.run(medida, fn);
  return { valor, medida };
}

/**
 * Quién guarda las medidas (lib/ahorro-de-formato.ts se apunta al cargarse).
 * Así el middleware REST avisa sin importar la base.
 */
type Oyente = (agentId: string, canal: "mcp" | "rest", medida: MedidaDeFormato) => void;
let oyente: Oyente | null = null;

export function fijarOyenteDeAhorro(fn: Oyente | null): void {
  oyente = fn;
}

export function avisarAhorro(agentId: string | null | undefined, canal: "mcp" | "rest", medida: MedidaDeFormato): void {
  if (!agentId || !oyente) return;
  try {
    oyente(agentId, canal, medida);
  } catch {
    // una estadística nunca rompe una respuesta
  }
}
