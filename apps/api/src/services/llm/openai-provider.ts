/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OpenAI Provider Adapter
 * ═══════════════════════════════════════════════════════════════════════════
 */

// El SDK se importa la primera vez que se usa (kitsuden2.md D1): es una
// dependencia OPCIONAL del paquete publicado; sin él, solo falla este proveedor.
import type OpenAI from "openai";

import type {
  EmbeddingOptions,
  LLMProviderAdapter,
  LLMProviderName,
  LLMRequestOptions,
  LLMResponse,
} from "./types";

export interface OpenAIProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export class OpenAIProvider implements LLMProviderAdapter {
  readonly name: LLMProviderName = "openai";
  readonly defaultModel: string = "gpt-4o-mini";

  private clientePromesa: Promise<OpenAI> | null = null;
  private readonly opciones: ConstructorParameters<typeof OpenAI>[0];
  private model: string;

  constructor(config: OpenAIProviderConfig = {}) {
    this.model = config.defaultModel || this.defaultModel;
    this.opciones = { apiKey: config.apiKey, baseURL: config.baseUrl };
  }

  private cliente(): Promise<OpenAI> {
    this.clientePromesa ??= import("openai").then((m) => new m.default(this.opciones));
    return this.clientePromesa;
  }

  isConfigured(): boolean {
    return !!(this.opciones?.apiKey ?? process.env.OPENAI_API_KEY);
  }

  async complete(options: LLMRequestOptions): Promise<LLMResponse> {
    const model = options.model || this.model;
    const timeoutMs = options.timeoutMs ?? 60000;

    const messages = this.buildMessages(options);

    const abortController = new AbortController();
    const externalSignal = options.signal;
    const externalAbortHandler = () => abortController.abort();
    externalSignal?.addEventListener("abort", externalAbortHandler, { once: true });

    const timeoutId = setTimeout(() => {
      abortController.abort(new Error(`OpenAI request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      const response = await (await this.cliente()).chat.completions.create(
        {
          model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens,
          top_p: options.topP,
          tools: options.tools?.map((t) => ({
            type: "function",
            function: {
              name: t.function.name,
              description: t.function.description,
              parameters: t.function.parameters as unknown as Record<string, unknown>,
            },
          })),
        },
        { signal: abortController.signal }
      );

      const choice = response.choices[0];
      const message = choice?.message;

      return {
        content: message?.content || "",
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
        model: response.model,
        provider: this.name,
        finishReason: choice?.finish_reason || null,
        toolCalls: message?.tool_calls
          ?.filter((tc) => tc.type === "function")
          .map((tc) => {
            const toolCall = tc as OpenAI.Chat.ChatCompletionMessageFunctionToolCall;
            return {
              id: toolCall.id,
              type: "function" as const,
              function: {
                name: toolCall.function.name,
                arguments: toolCall.function.arguments,
              },
            };
          }),
      };
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", externalAbortHandler);
    }
  }

  async embed(text: string, options?: EmbeddingOptions): Promise<number[]> {
    const model = options?.model || "text-embedding-3-small";
    const response = await (await this.cliente()).embeddings.create({
      model,
      input: text,
      dimensions: options?.dimensions,
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error("OpenAI returned empty embedding");
    }
    return embedding;
  }

  private buildMessages(options: LLMRequestOptions): OpenAI.Chat.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (options.system) {
      messages.push({ role: "system", content: options.system });
    }

    for (const msg of options.messages) {
      if (msg.role === "tool") {
        messages.push({
          role: "tool",
          content: msg.content,
          tool_call_id: msg.toolCallId || "",
        });
      } else if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        });
      } else {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    return messages;
  }
}
