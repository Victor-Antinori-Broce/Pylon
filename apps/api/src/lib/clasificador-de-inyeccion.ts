/**
 * Clasificador de inyección de instrucciones: una SEGUNDA opinión (kitsuden2.md D5)
 * ============================================================================
 *
 * La defensa contra un agente manipulado es la aprobación humana de lo
 * sensible. Esto la complementa, no la sustituye: con
 * `INJECTION_CLASSIFIER_URL`, cada propuesta nueva se manda en segundo plano
 * (cola `kitsuden-clasificador`) a un clasificador local de texto y su
 * veredicto se guarda en `agent_proposals.injection_check`, para que quien
 * revisa lo vea junto al diff. Nunca aprueba ni rechaza: un clasificador tiene
 * falsos negativos, y uno que decidiera solo sería un punto único de fallo.
 *
 * El servicio: un modelo utilitario pequeño en tu red (p. ej. un DeBERTa de
 * detección de inyección servido por text-embeddings-inference o un servidor
 * propio). Contrato: `POST {url}` con `{ "inputs": "<texto>" }` y respuesta
 * `{ label, score }` o `[{ label, score }, …]` (el formato de clasificación de
 * Hugging Face). Se toma la etiqueta de mayor puntuación.
 */

import { eq } from "drizzle-orm";

import { ErrorPermanente, queue, type TrabajoDeCola } from "../../../../packages/engine/src/cola";
import { db } from "../db";
import { agentProposals } from "../db/schema-core";

import { logger } from "./logger";

export const COLA_DEL_CLASIFICADOR = "kitsuden-clasificador";
const MAX_TEXTO = 20_000;

export function clasificadorConfigurado(): boolean {
  return Boolean(process.env.INJECTION_CLASSIFIER_URL);
}

/** Encola la clasificación de una propuesta nueva (si hay clasificador). */
export async function encolarClasificacion(propuestaId: string): Promise<void> {
  if (!clasificadorConfigurado()) return;
  try {
    await queue.dispatch(COLA_DEL_CLASIFICADOR, "proposal", { proposalId: propuestaId }, { intentos: 4 });
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), propuestaId }, "[clasificador] no se pudo encolar");
  }
}

/** Todo el texto que un modelo podría haber metido en la petición. */
export function textoDe(valor: unknown, salida: string[] = [], profundidad = 0): string[] {
  if (profundidad > 12 || salida.join(" ").length > MAX_TEXTO) return salida;
  if (typeof valor === "string") salida.push(valor);
  else if (Array.isArray(valor)) for (const v of valor) textoDe(v, salida, profundidad + 1);
  else if (valor && typeof valor === "object") {
    for (const v of Object.values(valor as Record<string, unknown>)) textoDe(v, salida, profundidad + 1);
  }
  return salida;
}

/** La etiqueta de mayor puntuación de una respuesta de clasificación. */
export function veredictoDe(respuesta: unknown): { label: string; score: number } | null {
  const lista = (Array.isArray(respuesta) ? respuesta.flat() : [respuesta]) as Array<{ label?: unknown; score?: unknown }>;
  const validos = lista.filter((x) => typeof x?.label === "string" && typeof x?.score === "number") as Array<{
    label: string;
    score: number;
  }>;
  if (!validos.length) return null;
  return validos.reduce((a, b) => (b.score > a.score ? b : a));
}

export async function clasificarPropuesta(trabajo: TrabajoDeCola): Promise<void> {
  const id = (trabajo.payload as { proposalId?: string })?.proposalId;
  if (!id) throw new ErrorPermanente("trabajo sin propuesta");
  const [p] = await db
    .select({ body: agentProposals.body, path: agentProposals.path, tool: agentProposals.tool })
    .from(agentProposals)
    .where(eq(agentProposals.id, id))
    .limit(1);
  if (!p) return;
  const texto = textoDe(p.body).join("\n").slice(0, MAX_TEXTO).trim();
  if (!texto) return;
  const res = await fetch(process.env.INJECTION_CLASSIFIER_URL!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inputs: texto }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`el clasificador respondió ${res.status}`);
  const v = veredictoDe(await res.json());
  if (!v) throw new ErrorPermanente("el clasificador no devolvió { label, score }");
  await db
    .update(agentProposals)
    .set({ injectionCheck: { label: v.label, score: v.score, checkedAt: new Date().toISOString() } })
    .where(eq(agentProposals.id, id));
}

export function registrarClasificador(): void {
  queue.handle(COLA_DEL_CLASIFICADOR, clasificarPropuesta, { concurrencia: 2 });
}
