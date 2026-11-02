/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LLM Provider Factory — Kitsuden Agents Engine
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Punto de entrada unificado para crear adaptadores LLM según configuración.
 */

import { AnthropicProvider } from "./anthropic-provider";
import { DeepSeekProvider } from "./deepseek-provider";
import { OllamaProvider } from "./ollama-provider";
import { OpenAIProvider } from "./openai-provider";
import type { LLMConfig, LLMProviderAdapter, LLMProviderName } from "./types";

export * from "./types";
export { OpenAIProvider } from "./openai-provider";
export { AnthropicProvider } from "./anthropic-provider";
export { OllamaProvider } from "./ollama-provider";
export { DeepSeekProvider } from "./deepseek-provider";

/**
 * Crea un adaptador LLM a partir de una configuración.
 */
export function createLLMProvider(config: LLMConfig): LLMProviderAdapter {
  switch (config.provider) {
    case "openai":
      return new OpenAIProvider({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        defaultModel: config.model,
      });
    case "anthropic":
      return new AnthropicProvider({
        apiKey: config.apiKey,
        defaultModel: config.model,
      });
    case "deepseek":
      return new DeepSeekProvider({
        apiKey: config.apiKey,
        defaultModel: config.model,
      });
    case "ollama":
      return new OllamaProvider({
        baseUrl: config.baseUrl,
        defaultModel: config.model,
      });
    default:
      throw new Error(`Unsupported LLM provider: ${(config as LLMConfig).provider}`);
  }
}

/**
 * Lista de providers disponibles según variables de entorno configuradas.
 */
export function listAvailableProviders(): LLMProviderName[] {
  const providers: LLMProviderName[] = [];

  if (process.env.OPENAI_API_KEY) providers.push("openai");
  if (process.env.ANTHROPIC_API_KEY) providers.push("anthropic");
  if (process.env.DEEPSEEK_API_KEY) providers.push("deepseek");
  // Ollama siempre está disponible en principio (no requiere key)
  providers.push("ollama");

  return providers;
}

/**
 * Devuelve el provider por defecto según prioridad de configuración.
 * Prioridad: OPENAI > ANTHROPIC > DEEPSEEK > OLLAMA.
 */
export function getDefaultProviderConfig(): LLMConfig | null {
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      apiKey: process.env.OPENAI_API_KEY,
    };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }

  if (process.env.DEEPSEEK_API_KEY) {
    return {
      provider: "deepseek",
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      apiKey: process.env.DEEPSEEK_API_KEY,
    };
  }

  if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL) {
    return {
      provider: "ollama",
      model: process.env.OLLAMA_MODEL || "llama3.2",
      baseUrl: process.env.OLLAMA_BASE_URL,
    };
  }

  return null;
}
