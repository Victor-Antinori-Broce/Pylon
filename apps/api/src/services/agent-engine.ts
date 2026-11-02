/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Agent Engine — Kitsuden Agents Engine
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Orquestador unificado para ejecutar agentes con LLMs reales.
 *
 * Responsabilidades:
 *   1. Seleccionar provider LLM según configuración.
 *   2. Construir contexto: system prompt + memoria + historial + conocimiento.
 *   3. Tool calling con herramientas MCP dinámicas y hardcodeadas.
 *   4. Caché de prompts en Valkey.
 *   5. Llamar al LLM y registrar traces/steps.
 *   6. Persistir memoria de conversación con embeddings.
 */

import { createHash } from "node:crypto";

import { messageOf } from "@kitsuden/engine";
import { and, desc, eq, gte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  agentIdentities,
  agentMemory,
  agentTraces,
  agentTraceSteps,
  brainNotes,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import { cacheGet, cacheSet, isValkeyAvailable, valkeyConfigurado } from "@/lib/valkey";

// @ts-ignore - Relative import resolved at runtime
import { getAgentTools, executeAgentTool } from "./agent-tools";
import { generateEmbedding } from "./embeddings";
// @ts-ignore - Relative import resolved at runtime
import {
  createLLMProvider,
  getDefaultProviderConfig,
  type LLMMessage,
  type LLMProviderAdapter,
  type LLMTool,
} from "./llm";
import { getLlmCache } from "./llm-cache";
// @ts-ignore - Relative import resolved at runtime

export interface AgentEngineOptions {
  agentId: string;
  message: string;
  sessionId?: string;
  history?: Array<{ role: string; content: string }>;
  traceId?: string;
  userId?: string;
  enableMemory?: boolean;
  enableBrainSearch?: boolean;
}

export interface AgentEngineResult {
  response: string;
  traceId: string;
  sessionId: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  cached: boolean;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown>; result: string }>;
}

interface RelevantMemory {
  id: string;
  content: string;
  summary?: string | null;
  memoryType: string;
  importance: number;
}

interface RelevantBrainNote {
  id: string;
  title: string;
  content: string;
  score: number;
}

const CACHE_TTL_SECONDS = 60 * 60; // 1 hora
const MAX_HISTORY_MESSAGES = 20;
const MAX_MEMORY_ITEMS = 5;
const MAX_BRAIN_NOTES = 3;
const MAX_TOOL_ITERATIONS = 5;

/**
 * Ejecuta un mensaje a través del Agent Engine.
 */
export async function runAgent(options: AgentEngineOptions): Promise<AgentEngineResult> {
  const startTime = Date.now();
  const sessionId = options.sessionId || crypto.randomUUID();

  // 1. Cargar agente
  const [agent] = await db
    .select()
    .from(agentIdentities)
    .where(eq(agentIdentities.id, options.agentId))
    .limit(1);

  if (!agent) {
    throw new Error(`Agent not found: ${options.agentId}`);
  }

  if (!agent.isActive) {
    throw new Error(`Agent is inactive: ${options.agentId}`);
  }

  // 2. Seleccionar provider LLM
  const provider = getLLMProvider();

  // 3. Crear o reutilizar trace
  const trace = await createOrUpdateTrace(options, agent.id, sessionId);

  // 4. Registrar input del usuario
  await db.insert(agentTraceSteps).values({
    traceId: trace.id,
    stepOrder: 0,
    stepType: "user_input",
    content: options.message,
    createdAt: new Date(),
  });

  // 5. Determinar tools disponibles
  const allowedTools = (agent.allowedTools as string[] | undefined) || [];
  const tools = getAgentTools(allowedTools.length > 0 ? allowedTools : undefined);

  // 6. Construir mensajes para el LLM
  const messages = await buildMessages(
    agent.id,
    agent.systemPrompt,
    options.message,
    sessionId,
    options,
    tools
  );

  // 7. Verificar caché
  //
  // Dos vías: la SEMÁNTICA acierta con reformulaciones ("¿cómo hago un
  // kon?" vs "cómo creo un kon") usando el ÚLTIMO MENSAJE del usuario
  // como señal — el prompt completo no sirve, un system prompt largo diluye
  // el significado. La exacta queda como red de seguridad sin embeddings.
  const cacheKey = buildCacheKey(provider, messages, tools);
  const cacheScope = `${agent.id}:${provider.name}`;
  const semanticCache = await getLlmCache();

  const semanticHit = await semanticCache.lookup(cacheScope, options.message);
  const cached = semanticHit ?? (await getCachedResponse(cacheKey));

  if (cached) {
    await finalizeTrace(
      trace.id,
      cached.content,
      cached.tokensIn,
      cached.tokensOut,
      provider,
      true,
      startTime
    );
    return {
      response: cached.content,
      traceId: trace.id,
      sessionId,
      provider: provider.name,
      model: cached.model,
      tokensIn: cached.tokensIn,
      tokensOut: cached.tokensOut,
      durationMs: Date.now() - startTime,
      cached: true,
    };
  }

  // 8. Tool calling loop
  let iteration = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  const executedToolCalls: AgentEngineResult["toolCalls"] = [];

  while (iteration < MAX_TOOL_ITERATIONS) {
    iteration++;

    const response = await provider.complete({
      model: provider.defaultModel,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      temperature: 0.7,
      maxTokens: 2048,
    });

    totalTokensIn += response.usage.promptTokens;
    totalTokensOut += response.usage.completionTokens;

    // Si no hay tool calls, es la respuesta final
    if (!response.toolCalls || response.toolCalls.length === 0) {
      await setCachedResponse(cacheKey, response);
      // También en la caché semántica, para acertar en reformulaciones.
      await semanticCache.store_(cacheScope, options.message, {
        content: response.content,
        model: provider.defaultModel,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
      });
      await finalizeTrace(
        trace.id,
        response.content,
        totalTokensIn,
        totalTokensOut,
        provider,
        false,
        startTime,
        response.model
      );

      if (options.enableMemory !== false) {
        await saveConversationMemory(agent.id, sessionId, options.message, response.content);
      }

      return {
        response: response.content,
        traceId: trace.id,
        sessionId,
        provider: provider.name,
        model: response.model,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
        durationMs: Date.now() - startTime,
        cached: false,
        toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
      };
    }

    // Registrar el mensaje del assistant con las tool calls solicitadas
    messages.push({
      role: "assistant",
      content: "",
      toolCalls: response.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
    });

    // Ejecutar cada tool call
    for (let i = 0; i < response.toolCalls.length; i++) {
      const toolCall = response.toolCalls[i];
      const toolStartTime = Date.now();
      let toolResultText: string;

      let toolArguments: Record<string, unknown>;
      try {
        toolArguments = JSON.parse(toolCall.function.arguments);
      } catch (err: unknown) {
        toolResultText = `Error parsing arguments for tool ${toolCall.function.name}: ${messageOf(err)}`;
        logger.warn(
          { error: err, toolName: toolCall.function.name },
          "Agent tool arguments parse failed"
        );
        continue;
      }

      try {
        toolResultText = await executeAgentTool(toolCall.function.name, toolArguments, {
          agentId: agent.id,
          agentName: agent.name,
          scopes: (agent.scopes as string[] | undefined) || [],
          traceId: trace.id,
          allowedTools,
        });
      } catch (err: unknown) {
        toolResultText = `Error executing tool ${toolCall.function.name}: ${messageOf(err)}`;
        logger.warn(
          { error: err, toolName: toolCall.function.name },
          "Agent tool execution failed"
        );
      }

      executedToolCalls.push({
        name: toolCall.function.name,
        arguments: toolArguments,
        result: toolResultText,
      });

      await db.insert(agentTraceSteps).values({
        traceId: trace.id,
        stepOrder: iteration * 10 + i,
        stepType: "tool_call",
        toolName: toolCall.function.name,
        toolInput: toolArguments,
        content: toolResultText,
        durationMs: Date.now() - toolStartTime,
        createdAt: new Date(),
      });

      // Agregar resultado de tool al contexto para rellamada
      messages.push({
        role: "tool",
        content: toolResultText,
        toolCallId: toolCall.id,
      });
    }
  }

  // Se alcanzó el máximo de iteraciones
  const fallbackResponse =
    "I reached the maximum number of tool interactions without a final answer. Please refine your request.";
  await finalizeTrace(
    trace.id,
    fallbackResponse,
    totalTokensIn,
    totalTokensOut,
    provider,
    false,
    startTime
  );
  return {
    response: fallbackResponse,
    traceId: trace.id,
    sessionId,
    provider: provider.name,
    model: provider.defaultModel,
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
    durationMs: Date.now() - startTime,
    cached: false,
    toolCalls: executedToolCalls,
  };
}

/**
 * Devuelve el provider LLM a usar.
 */
function getLLMProvider(): LLMProviderAdapter {
  const explicitProvider = process.env.KITSUDEN_LLM_PROVIDER as any;
  const explicitModel = process.env.KITSUDEN_LLM_MODEL;

  if (explicitProvider) {
    return createLLMProvider({
      provider: explicitProvider,
      model: explicitModel,
      apiKey: getApiKeyForProvider(explicitProvider),
      baseUrl: getBaseUrlForProvider(explicitProvider),
    });
  }

  const defaultConfig = getDefaultProviderConfig();
  if (defaultConfig) {
    return createLLMProvider(defaultConfig);
  }

  throw new Error(
    "No LLM provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY, or OLLAMA_BASE_URL."
  );
}

function getApiKeyForProvider(provider: string): string | undefined {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "deepseek":
      return process.env.DEEPSEEK_API_KEY;
    default:
      return undefined;
  }
}

function getBaseUrlForProvider(provider: string): string | undefined {
  if (provider === "ollama") {
    return process.env.OLLAMA_BASE_URL;
  }
  return undefined;
}

/**
 * Crea un nuevo trace o actualiza uno existente.
 */
async function createOrUpdateTrace(
  options: AgentEngineOptions,
  agentId: string,
  sessionId: string
): Promise<{ id: string }> {
  if (options.traceId) {
    const [trace] = await db
      .select()
      .from(agentTraces)
      .where(eq(agentTraces.id, options.traceId))
      .limit(1);
    if (trace) {
      return { id: trace.id };
    }
  }

  const [trace] = await db
    .insert(agentTraces)
    .values({
      agentId,
      sessionId,
      name: `Chat: ${options.message.slice(0, 50)}...`,
      input: { message: options.message, sessionId, history: options.history },
      status: "running",
      startedAt: new Date(),
    })
    .returning({ id: agentTraces.id });

  return trace;
}

/**
 * Construye el historial de mensajes para el LLM.
 */
async function buildMessages(
  agentId: string,
  systemPrompt: string | null,
  message: string,
  sessionId: string,
  options: AgentEngineOptions,
  tools: LLMTool[]
): Promise<LLMMessage[]> {
  const messages: LLMMessage[] = [];

  // System prompt enriquecido
  const enrichedSystem = await buildSystemPrompt(agentId, systemPrompt, options, tools);
  messages.push({ role: "system", content: enrichedSystem });

  // Historial de la sesión
  const sessionHistory = await loadSessionHistory(sessionId);
  messages.push(...sessionHistory.slice(-MAX_HISTORY_MESSAGES));

  // Mensaje actual
  messages.push({ role: "user", content: message });

  return messages;
}

/**
 * Construye el system prompt con contexto de memoria, conocimiento y tools.
 */
async function buildSystemPrompt(
  agentId: string,
  basePrompt: string | null,
  options: AgentEngineOptions,
  tools: LLMTool[]
): Promise<string> {
  const sections: string[] = [];

  if (basePrompt) {
    sections.push(basePrompt);
  } else {
    sections.push("You are a helpful AI assistant.");
  }

  // Memoria relevante del agente
  if (options.enableMemory !== false) {
    const memories = await getRelevantMemories(agentId, options.message);
    if (memories.length > 0) {
      sections.push(
        "\n=== RELEVANT MEMORIES ===\n" +
          memories.map((m) => `- ${m.summary || m.content}`).join("\n")
      );
    }
  }

  // Conocimiento del proyecto (KITSUDEN Brain)
  if (options.enableBrainSearch !== false) {
    const notes = await getRelevantBrainNotes(options.message);
    if (notes.length > 0) {
      sections.push(
        "\n=== PROJECT KNOWLEDGE ===\n" +
          notes.map((n) => `- ${n.title}:\n${n.content.slice(0, 500)}`).join("\n\n")
      );
    }
  }

  // Tools disponibles
  if (tools.length > 0) {
    sections.push(
      "\n=== AVAILABLE TOOLS ===\n" +
        "You can call one or more tools to help answer the user. " +
        "When you need a tool, respond with a tool call. " +
        "After receiving tool results, synthesize a final answer for the user.\n\n" +
        tools.map((t) => `- ${t.function.name}: ${t.function.description}`).join("\n")
    );
  }

  sections.push(
    "\n=== INSTRUCTIONS ===\n" +
      "Answer concisely and accurately. If you don't know something, say so. " +
      "Use the provided memories, project knowledge and tools when relevant."
  );

  return sections.join("\n");
}

/**
 * Carga el historial de una sesión desde agentTraces/agentTraceSteps.
 */
async function loadSessionHistory(sessionId: string): Promise<LLMMessage[]> {
  const traces = await db
    .select()
    .from(agentTraces)
    .where(eq(agentTraces.sessionId, sessionId))
    .orderBy(agentTraces.createdAt);

  const messages: LLMMessage[] = [];

  for (const trace of traces) {
    const steps = await db
      .select()
      .from(agentTraceSteps)
      .where(eq(agentTraceSteps.traceId, trace.id))
      .orderBy(agentTraceSteps.stepOrder);

    for (const step of steps) {
      if (step.stepType === "user_input" && step.content) {
        messages.push({ role: "user", content: step.content });
      } else if (step.stepType === "llm_call" && step.content) {
        messages.push({ role: "assistant", content: step.content });
      }
    }
  }

  return messages;
}

/**
 * Recupera memorias relevantes del agente.
 * Intenta búsqueda semántica si pgvector está disponible; fallback a importancia/tipo.
 */
async function getRelevantMemories(agentId: string, query?: string): Promise<RelevantMemory[]> {
  try {
    if (query) {
      const semantic = await searchSemanticMemories(agentId, query);
      if (semantic.length > 0) return semantic;
    }
  } catch (error) {
    logger.debug({ error }, "Semantic memory search failed, falling back");
  }

  const memories = await db
    .select({
      id: agentMemory.id,
      content: agentMemory.content,
      summary: agentMemory.summary,
      memoryType: agentMemory.memoryType,
      importance: agentMemory.importance,
    })
    .from(agentMemory)
    .where(
      and(
        eq(agentMemory.agentId, agentId),
        or(eq(agentMemory.memoryType, "long_term"), eq(agentMemory.memoryType, "conversation")),
        or(isNull(agentMemory.validUntil), gte(agentMemory.validUntil, sql`NOW()`))
      )
    )
    .orderBy(desc(agentMemory.importance), desc(agentMemory.createdAt))
    .limit(MAX_MEMORY_ITEMS);

  return memories.map((m: any) => ({
    id: m.id,
    content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    summary: m.summary,
    memoryType: m.memoryType,
    importance: m.importance ?? 0,
  }));
}

/**
 * Normaliza un embedding al número objetivo de dimensiones (trunca o rellena con 0).
 */
function normalizeEmbedding(embedding: number[], targetDimensions = 1536): number[] {
  if (embedding.length === targetDimensions) return embedding;
  if (embedding.length > targetDimensions) return embedding.slice(0, targetDimensions);
  return [...embedding, ...new Array(targetDimensions - embedding.length).fill(0)];
}

/**
 * Búsqueda semántica de memorias usando pgvector.
 */
async function searchSemanticMemories(agentId: string, query: string): Promise<RelevantMemory[]> {
  const rawEmbedding = await generateEmbedding(query, { dimensions: 1536 });
  const embedding = normalizeEmbedding(rawEmbedding, 1536);
  const embeddingLiteral = `[${embedding.join(",")}]`;

  const rows = await db.execute<{
    id: string;
    content: unknown;
    summary: string | null;
    memory_type: string;
    importance: number;
    similarity: number;
  }>(sql`
    SELECT
      id,
      content,
      summary,
      memory_type,
      importance,
      1 - (embedding <=> ${sql.raw(embeddingLiteral)}::vector) AS similarity
    FROM agent_memory
    WHERE agent_id = ${agentId} AND embedding IS NOT NULL
    ORDER BY embedding <=> ${sql.raw(embeddingLiteral)}::vector
    LIMIT ${MAX_MEMORY_ITEMS}
  `);

  return rows.rows.map((r: any) => ({
    id: r.id,
    content: typeof r.content === "string" ? r.content : JSON.stringify(r.content),
    summary: r.summary,
    memoryType: r.memory_type,
    importance: r.importance,
  }));
}

/**
 * Recupera notas relevantes de KITSUDEN Brain usando full-text search.
 */
async function getRelevantBrainNotes(query: string): Promise<RelevantBrainNote[]> {
  try {
    const results = await db
      .select({
        id: brainNotes.id,
        title: brainNotes.title,
        content: brainNotes.content,
      })
      .from(brainNotes)
      .where(
        or(
          sql`${brainNotes.title} ILIKE ${`%${query}%`}`,
          sql`${brainNotes.content} ILIKE ${`%${query}%`}`
        )
      )
      .orderBy(desc(brainNotes.importance), desc(brainNotes.createdAt))
      .limit(MAX_BRAIN_NOTES);

    return results.map((r: any) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      score: 1,
    }));
  } catch (error) {
    logger.warn({ error }, "Failed to search brain notes");
    return [];
  }
}

/**
 * Guarda la conversación como memoria del agente, con embedding vectorial.
 */
async function saveConversationMemory(
  agentId: string,
  sessionId: string,
  userMessage: string,
  assistantMessage: string
): Promise<void> {
  try {
    const content = {
      sessionId,
      userMessage,
      assistantMessage,
    };

    const summary = `User asked: ${userMessage.slice(0, 100)}. Assistant responded: ${assistantMessage.slice(0, 100)}`;

    let embedding: number[] | undefined;
    try {
      const rawEmbedding = await generateEmbedding(summary, { dimensions: 1536 });
      embedding = normalizeEmbedding(rawEmbedding, 1536);
    } catch (err) {
      logger.debug({ err }, "Failed to generate memory embedding");
    }

    await db.insert(agentMemory).values({
      agentId,
      memoryType: "conversation",
      category: "conversation",
      content,
      summary,
      ...(embedding ? { embedding } : {}),
      importance: 50,
      confidence: 90,
      source: "agent",
      tags: ["auto", "conversation"],
    });
  } catch (error) {
    logger.warn({ error, agentId }, "Failed to save conversation memory");
  }
}

/**
 * Finaliza un trace con la respuesta del LLM.
 */
async function finalizeTrace(
  traceId: string,
  response: string,
  tokensIn: number,
  tokensOut: number,
  provider: LLMProviderAdapter,
  cached: boolean,
  startTime: number,
  model?: string
): Promise<void> {
  const durationMs = Date.now() - startTime;

  await db.insert(agentTraceSteps).values({
    traceId,
    stepOrder: 99,
    stepType: cached ? "memory_read" : "llm_call",
    content: response,
    durationMs,
    tokensIn,
    tokensOut,
    metadata: { provider: provider.name, model: model || provider.defaultModel, cached },
    createdAt: new Date(),
  });

  await db
    .update(agentTraces)
    .set({
      output: { response, cached },
      status: "success",
      totalDurationMs: durationMs,
      tokensIn,
      tokensOut,
      estimatedCost: estimateCost(provider.name, tokensIn, tokensOut),
      completedAt: new Date(),
    })
    .where(eq(agentTraces.id, traceId));
}

/**
 * Estimación simple de costo en USD.
 */
function estimateCost(provider: string, tokensIn: number, tokensOut: number): number {
  const rates: Record<string, { in: number; out: number }> = {
    openai: { in: 0.000_000_15, out: 0.000_000_6 }, // gpt-4o-mini
    anthropic: { in: 0.000_003, out: 0.000_015 }, // claude-3-sonnet aprox
    deepseek: { in: 0.000_000_14, out: 0.000_000_28 },
    ollama: { in: 0, out: 0 },
  };

  const rate = rates[provider] || rates.openai;
  return tokensIn * rate.in + tokensOut * rate.out;
}

/**
 * Construye una clave de caché determinista y resistente a colisiones.
 */
function buildCacheKey(
  provider: LLMProviderAdapter,
  messages: LLMMessage[],
  tools: LLMTool[]
): string {
  const data = JSON.stringify({
    provider: provider.name,
    model: provider.defaultModel,
    messages,
    tools: tools.map((t) => t.function.name),
  });

  const hash = createHash("sha256").update(data).digest("hex");
  return `kitsuden:agent:cache:${hash}`;
}

async function getCachedResponse(cacheKey: string): Promise<{
  content: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
} | null> {
  try {
    // Sin VALKEY_URL, `cacheGet` usa la memoria del proceso.
    if (valkeyConfigurado() && !(await isValkeyAvailable())) return null;

    const cached = await cacheGet(cacheKey);
    if (!cached) return null;

    return JSON.parse(cached);
  } catch (error) {
    logger.debug({ error }, "Failed to read agent cache");
    return null;
  }
}

async function setCachedResponse(
  cacheKey: string,
  response: {
    content: string;
    usage: { promptTokens: number; completionTokens: number };
    model: string;
  }
): Promise<void> {
  try {
    if (valkeyConfigurado() && !(await isValkeyAvailable())) return;

    await cacheSet(
      cacheKey,
      JSON.stringify({
        content: response.content,
        tokensIn: response.usage.promptTokens,
        tokensOut: response.usage.completionTokens,
        model: response.model,
      }),
      CACHE_TTL_SECONDS
    );
  } catch (error) {
    logger.debug({ error }, "Failed to write agent cache");
  }
}

// Helper para compatibilidad con Drizzle
function isNull(column: any) {
  return sql`${column} IS NULL`;
}
