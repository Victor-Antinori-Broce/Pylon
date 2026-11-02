/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Anthropic Provider Adapter
 * ═══════════════════════════════════════════════════════════════════════════
 */

// El SDK se importa la primera vez que se usa (kitsuden2.md D1): es una
// dependencia OPCIONAL del paquete publicado; sin él, solo falla este proveedor.
import type Anthropic from "@anthropic-ai/sdk";

import type {
  EmbeddingOptions,
  LLMMessage,
  LLMProviderAdapter,
  LLMProviderName,
  LLMRequestOptions,
  LLMResponse,
} from "./types";

export interface AnthropicProviderConfig {
  apiKey?: string;
  defaultModel?: string;
}

export class AnthropicProvider implements LLMProviderAdapter {
  readonly name: LLMProviderName = "anthropic";
  readonly defaultModel = "claude-3-5-sonnet-20241022";

  private clientePromesa: Promise<Anthropic> | null = null;
  private readonly opciones: ConstructorParameters<typeof Anthropic>[0];
  private model: string;

  constructor(config: AnthropicProviderConfig = {}) {
    this.model = config.defaultModel || this.defaultModel;
    this.opciones = { apiKey: config.apiKey };
  }

  private cliente(): Promise<Anthropic> {
    this.clientePromesa ??= import("@anthropic-ai/sdk").then((m) => new m.default(this.opciones));
    return this.clientePromesa;
  }

  isConfigured(): boolean {
    return !!(this.opciones?.apiKey ?? process.env.ANTHROPIC_API_KEY);
  }

  async complete(options: LLMRequestOptions): Promise<LLMResponse> {
    const model = options.model || this.model;
    const timeoutMs = options.timeoutMs ?? 60000;

    const { system, messages } = this.buildMessages(options);

    const abortController = new AbortController();
    const externalSignal = options.signal;
    const externalAbortHandler = () => abortController.abort();
    externalSignal?.addEventListener("abort", externalAbortHandler, { once: true });

    const timeoutId = setTimeout(() => {
      abortController.abort(new Error(`Anthropic request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      const response = await (await this.cliente()).messages.create(
        {
          model,
          max_tokens: options.maxTokens || 4096,
          temperature: options.temperature ?? 0.7,
          top_p: options.topP,
          system: system || undefined,
          messages: messages as Anthropic.Messages.MessageParam[],
          tools: options.tools?.map((t) => ({
            name: t.function.name,
            description: t.function.description,
            input_schema: t.function.parameters as Anthropic.Messages.Tool.InputSchema,
          })),
        },
        { signal: abortController.signal }
      );

      const content = response.content
        .filter((c) => c.type === "text")
        .map((c) => (c as Anthropic.TextBlock).text)
        .join("\n");

      const toolCalls = response.content
        .filter((c) => c.type === "tool_use")
        .map((c) => {
          const tool = c as Anthropic.ToolUseBlock;
          return {
            id: tool.id,
            type: "function" as const,
            function: {
              name: tool.name,
              arguments: JSON.stringify(tool.input),
            },
          };
        });

      return {
        content,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        model: response.model,
        provider: this.name,
        finishReason: response.stop_reason,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", externalAbortHandler);
    }
  }

  // Anthropic no provee embeddings nativos. Lanzamos error controlado.
  async embed(_text: string, _options?: EmbeddingOptions): Promise<number[]> {
    throw new Error("Anthropic does not provide embeddings. Use OpenAI or Ollama for embeddings.");
  }

  private buildMessages(options: LLMRequestOptions): {
    system: string | null;
    messages: LLMMessage[];
  } {
    let system = options.system || null;
    const messages: LLMMessage[] = [];

    for (const msg of options.messages) {
      if (msg.role === "system") {
        // Anthropic usa un campo system separado; acumulamos system prompts
        system = system ? `${system}\n\n${msg.content}` : msg.content;
      } else {
        messages.push(msg);
      }
    }

    return { system, messages };
  }
}
