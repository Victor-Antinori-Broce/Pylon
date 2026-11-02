/**
 * El agente bajo prueba: Claude con las herramientas de dominio
 * ============================================================================
 *
 * Bucle manual y no el tool runner del SDK: cada resultado tiene que volver a
 * Claude con `is_error` exactamente como lo devuelve el servidor MCP, y cada
 * llamada tiene que quedar en la traza junto a su resultado. Es lo que se mide.
 *
 * El agente ve lo mismo que en producción: nombre, descripción y esquema de
 * cada herramienta, y lo que devuelve. El prompt de sistema es mínimo a
 * propósito —el de cualquier asistente de programación—: si hubiera que
 * explicarle el dominio ahí para que acierte, el MCP no estaría haciendo su
 * trabajo.
 *
 * ── LA LLAMADA ─────────────────────────────────────────────────────────────
 *
 *   · Pensamiento adaptativo, resumido para que la traza se pueda leer.
 *   · Caché automática: herramientas y sistema no cambian entre turnos.
 *   · Respaldo del servidor (`fallbacks: "default"`) ante un rechazo. Si llega
 *     a usarse, el intento no se puntúa: lo habría resuelto otro modelo.
 *   · Reintentos con espera aleatoria solo ante 429, 529, 5xx y fallos de
 *     conexión, y contados. El cliente se crea con `maxRetries: 0` para que
 *     los reintentos del SDK no se sumen a estos sin dejar rastro.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaFallbackParam,
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam,
  BetaUsage,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";

import { runDomainTool } from "../../../../packages/mcp-server/src/herramientas-de-dominio";
import { HERRAMIENTAS_DEL_AGENTE, type Entorno } from "./entorno";

export type Esfuerzo = "low" | "medium" | "high" | "xhigh" | "max";

/** Un turno de la traza, en la forma que lee el informe de evaluaciones. */
export interface Turno {
  role: "system" | "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  name?: string;
  thinking?: string;
}

export interface Uso {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface Ejecucion {
  transcript: Turno[];
  model: string | null;
  usage: Uso;
  stop_reason: string;
  tool_calls: number;
  tool_errors: number;
  turnos: number;
  reintentos: number;
  /** Alguna respuesta la sirvió el modelo de respaldo tras un rechazo. */
  respaldo: boolean;
}

export const SISTEMA =
  "Eres el asistente de programación de alguien que construye una app de gaming sobre un backend Kitsuden, y tienes sus herramientas MCP. Haz lo que te pide usando esas herramientas. Cuando termines, resume en una o dos frases qué has hecho, o qué no se pudo hacer y por qué.";

/** Techo de turnos por caso: un bucle que no converge no debe gastar sin fin. */
export const MAX_TURNOS = 40;

const PERMITIDAS = new Set(HERRAMIENTAS_DEL_AGENTE.map((d) => d.name));

const TOOLS: BetaTool[] = HERRAMIENTAS_DEL_AGENTE.map((d) => ({
  name: d.name,
  description: d.description,
  input_schema: d.inputSchema,
}));

// El SDK 0.111 solo tipa `fallbacks` como lista de modelos. "default" —el
// recomendado— elige el respaldo según la categoría del rechazo; hasta que el
// tipo lo recoja, se fuerza aquí.
const RESPALDO_POR_DEFECTO = "default" as unknown as BetaFallbackParam[];

export const usoVacio = (): Uso => ({
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
});

function sumarUso(total: Uso, uso: BetaUsage) {
  total.input_tokens += uso.input_tokens;
  total.output_tokens += uso.output_tokens;
  total.cache_read_input_tokens += uso.cache_read_input_tokens ?? 0;
  total.cache_creation_input_tokens += uso.cache_creation_input_tokens ?? 0;
}

function esTransitorio(error: unknown): boolean {
  if (error instanceof Anthropic.APIConnectionError) return true;
  if (error instanceof Anthropic.APIError) {
    const estado = error.status ?? 0;
    return estado === 429 || estado === 529 || estado >= 500;
  }
  return false;
}

async function conReintentos<T>(
  llamada: () => Promise<T>,
  cuenta: { n: number },
  limite: number
): Promise<T> {
  for (let intento = 0; ; intento++) {
    // Antes de CADA llamada: pasado el techo del caso, un bucle abandonado no
    // debe seguir llamando al modelo.
    if (Date.now() >= limite) {
      throw Object.assign(new Error("se agotó el tiempo del caso antes de llamar al modelo"), {
        failure_class: "timeout",
      });
    }
    try {
      return await llamada();
    } catch (error) {
      if (!esTransitorio(error) || intento >= 4) throw error;
      const espera = Math.min(60_000, 1000 * 2 ** intento) * (0.5 + Math.random());
      if (Date.now() + espera >= limite) throw error;
      cuenta.n++;
      await new Promise((r) => setTimeout(r, espera));
    }
  }
}

function anotarEnTraza(traza: Turno[], bloques: BetaContentBlock[]) {
  let pensamiento: string | undefined;
  const conPensamiento = () => (pensamiento ? { thinking: pensamiento } : {});

  for (const b of bloques) {
    if (b.type === "thinking") {
      pensamiento = [pensamiento, b.thinking].filter(Boolean).join("\n\n") || undefined;
    } else if (b.type === "text") {
      traza.push({ role: "assistant", content: b.text, ...conPensamiento() });
      pensamiento = undefined;
    } else if (b.type === "tool_use") {
      traza.push({
        role: "tool_call",
        name: b.name,
        content: JSON.stringify(b.input, null, 2),
        ...conPensamiento(),
      });
      pensamiento = undefined;
    } else if (b.type === "fallback") {
      traza.push({
        role: "assistant",
        content: "[a partir de aquí responde el modelo de respaldo]",
      });
    }
  }
}

export async function ejecutarConClaude(
  prompt: string,
  entorno: Entorno,
  opciones: { cliente: Anthropic; modelo: string; esfuerzo: Esfuerzo; limite: number }
): Promise<Ejecucion> {
  const messages: BetaMessageParam[] = [{ role: "user", content: prompt }];
  const transcript: Turno[] = [
    { role: "system", content: SISTEMA },
    { role: "user", content: prompt },
  ];
  const usage = usoVacio();
  const reintentos = { n: 0 };
  let model: string | null = null;
  let stop_reason = "";
  let tool_calls = 0;
  let tool_errors = 0;
  let turnos = 0;
  let respaldo = false;

  try {
    while (turnos < MAX_TURNOS) {
      turnos++;
      const res = await conReintentos(
        () =>
          opciones.cliente.beta.messages.create({
            model: opciones.modelo,
            max_tokens: 16000,
            system: SISTEMA,
            tools: TOOLS,
            messages,
            thinking: { type: "adaptive", display: "summarized" },
            output_config: { effort: opciones.esfuerzo },
            cache_control: { type: "ephemeral" },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: RESPALDO_POR_DEFECTO,
          }),
        reintentos,
        opciones.limite
      );

      model = res.model;
      sumarUso(usage, res.usage);
      if (res.usage.iterations?.some((it) => it.type === "fallback_message")) respaldo = true;
      stop_reason = res.stop_reason ?? "";

      // El turno entero, pensamiento incluido: se devuelve sin tocar.
      messages.push({ role: "assistant", content: res.content });
      anotarEnTraza(transcript, res.content);

      if (res.stop_reason === "pause_turn") continue;
      if (res.stop_reason !== "tool_use") break;

      // Un resultado por llamada, todos en el MISMO mensaje: repartirlos enseña
      // al modelo a dejar de hacer llamadas en paralelo.
      const resultados: BetaToolResultBlockParam[] = [];
      for (const bloque of res.content) {
        if (bloque.type !== "tool_use") continue;
        tool_calls++;
        const r = PERMITIDAS.has(bloque.name)
          ? await runDomainTool(
              bloque.name,
              (bloque.input ?? {}) as Record<string, unknown>,
              entorno.api
            )
          : null;
        const texto = r ? r.content[0].text : `La herramienta «${bloque.name}» no está disponible.`;
        const esError = !r || r.isError === true;
        if (esError) tool_errors++;
        resultados.push({
          type: "tool_result",
          tool_use_id: bloque.id,
          content: texto,
          ...(esError ? { is_error: true } : {}),
        });
        transcript.push({ role: "tool_result", name: bloque.name, content: texto });
      }
      messages.push({ role: "user", content: resultados });
    }
  } catch (error) {
    // Lo gastado hasta el fallo también cuenta: viaja con el error al registro.
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      failure_class:
        (error as { failure_class?: string }).failure_class ??
        (error instanceof Anthropic.APIError ? "api_error" : "harness_error"),
      usage,
      model,
      retries: reintentos.n,
    });
  }

  if (turnos >= MAX_TURNOS && stop_reason === "tool_use") stop_reason = "max_turns";

  return {
    transcript,
    model,
    usage,
    stop_reason,
    tool_calls,
    tool_errors,
    turnos,
    reintentos: reintentos.n,
    respaldo,
  };
}
