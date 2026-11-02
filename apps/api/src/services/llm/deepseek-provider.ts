/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DeepSeek Provider Adapter
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DeepSeek expone una API compatible con OpenAI. Reutilizamos el cliente
 * de OpenAI apuntando a la base URL de DeepSeek.
 */

import { OpenAIProvider } from "./openai-provider";
import type { LLMProviderName } from "./types";

export interface DeepSeekProviderConfig {
  apiKey?: string;
  defaultModel?: string;
}

export class DeepSeekProvider extends OpenAIProvider {
  readonly name: LLMProviderName = "deepseek";
  readonly defaultModel = "deepseek-chat";

  constructor(config: DeepSeekProviderConfig = {}) {
    super({
      apiKey: config.apiKey,
      baseUrl: "https://api.deepseek.com/v1",
      defaultModel: config.defaultModel || "deepseek-chat",
    });
  }
}
