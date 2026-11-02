/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Ollama Provider Adapter
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Para ejecución local de modelos. Soporta chat completions y embeddings.
 */

// El SDK se importa la primera vez que se usa (kitsuden2.md D1): es una
// dependencia OPCIONAL del paquete publicado; sin él, solo falla este proveedor.
import type { Ollama } from "ollama";

import type {
  EmbeddingOptions,
  LLMMessage,
  LLMProviderAdapter,
  LLMProviderName,
  LLMRequestOptions,
  LLMResponse,
} from "./types";

export interface OllamaProviderConfig {
  baseUrl?: string;
  defaultModel?: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      reject(new Error(message));
    }, ms);
    // Limpiar timeout si la promesa original gana para evitar leaks
    promise.then(() => clearTimeout(id)).catch(() => clearTimeout(id));
  });
  return Promise.race([promise, timeoutPromise]);
}

export class OllamaProvider implements LLMProviderAdapter {
  readonly name: LLMProviderName = "ollama";
  readonly defaultModel = "llama3.2";

  private clientePromesa: Promise<Ollama> | null = null;
  private readonly host: string;
  private model: string;

  constructor(config: OllamaProviderConfig = {}) {
    this.model = config.defaultModel || this.defaultModel;
    this.host = config.baseUrl || "http://localhost:11434";
  }

  private cliente(): Promise<Ollama> {
    this.clientePromesa ??= import("ollama").then((m) => new m.Ollama({ host: this.host }));
    return this.clientePromesa;
  }

  isConfigured(): boolean {
    // Ollama no requiere API key, solo una URL accesible.
    return true;
  }

  async complete(options: LLMRequestOptions): Promise<LLMResponse> {
    const model = options.model || this.model;
    const timeoutMs = options.timeoutMs ?? 120000;

    const messages = this.buildMessages(options);

    const chatPromise = (await this.cliente()).chat({
      model,
      messages: messages.map((m) => ({
        role: m.role === "tool" ? "assistant" : m.role,
        content: m.content,
      })),
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens,
        top_p: options.topP,
      },
    });

    const response = await withTimeout(
      chatPromise,
      timeoutMs,
      `Ollama request timed out after ${timeoutMs}ms`
    );

    return {
      content: response.message.content || "",
      usage: {
        promptTokens: response.prompt_eval_count || 0,
        completionTokens: response.eval_count || 0,
        totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
      },
      model,
      provider: this.name,
      finishReason: response.done ? "stop" : null,
    };
  }

  async embed(text: string, options?: EmbeddingOptions): Promise<number[]> {
    const model = options?.model || "nomic-embed-text";
    const response = await (await this.cliente()).embeddings({
      model,
      prompt: text,
    });

    if (!response.embedding) {
      throw new Error("Ollama returned empty embedding");
    }
    return response.embedding;
  }

  private buildMessages(options: LLMRequestOptions): LLMMessage[] {
    const messages: LLMMessage[] = [];

    if (options.system) {
      messages.push({ role: "system", content: options.system });
    }

    for (const msg of options.messages) {
      messages.push(msg);
    }

    return messages;
  }
}
