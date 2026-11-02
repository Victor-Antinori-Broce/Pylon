/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LLM Provider Types — Kitsuden Agents Engine
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Contrato unificado para adaptadores de LLM. Cualquier provider
 * (OpenAI, Anthropic, Ollama, DeepSeek) debe implementar LLMProviderAdapter.
 */

export type LLMProviderName = "openai" | "anthropic" | "deepseek" | "ollama";

export type LLMMessageRole = "system" | "user" | "assistant" | "tool";

export interface LLMMessage {
  role: LLMMessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface LLMToolParameter {
  type?: string;
  description?: string;
  enum?: (string | number | boolean)[];
  properties?: Record<string, LLMToolParameter>;
  required?: string[];
  items?: LLMToolParameter;
  default?: unknown;
  [key: string]: unknown;
}

export interface LLMTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: LLMToolParameter;
  };
}

export interface LLMRequestOptions {
  model?: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  tools?: LLMTool[];
  system?: string;
  /**
   * Timeout en milisegundos. Si no se proporciona, se usa un default del provider.
   */
  timeoutMs?: number;
  /**
   * AbortSignal externo para cancelar la request.
   */
  signal?: AbortSignal;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  content: string;
  usage: LLMUsage;
  model: string;
  provider: LLMProviderName;
  finishReason: string | null;
  /**
   * Si el LLM solicitó llamar a tools, se devuelven aquí.
   * El Agent Engine las ejecuta y vuelve a llamar al provider.
   */
  toolCalls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface EmbeddingOptions {
  model?: string;
  dimensions?: number;
}

export interface LLMProviderAdapter {
  readonly name: LLMProviderName;
  readonly defaultModel: string;

  /**
   * Envía un completion al LLM y retorna la respuesta.
   */
  complete(options: LLMRequestOptions): Promise<LLMResponse>;

  /**
   * Genera un embedding para el texto dado.
   * Si el provider no soporta embeddings, debe lanzar error.
   */
  embed(text: string, options?: EmbeddingOptions): Promise<number[]>;

  /**
   * Verifica si el adapter está correctamente configurado (tiene API key, URL, etc.)
   */
  isConfigured(): boolean;
}

export interface LLMConfig {
  provider: LLMProviderName;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}
