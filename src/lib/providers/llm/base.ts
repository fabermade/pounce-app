/**
 * LLM Provider Interface
 * 
 * All LLM providers implement this interface. No direct instantiation
 * of provider SDKs in route handlers — always go through this interface.
 */

export interface LLMChatParams {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  temperature?: number;
  maxTokens?: number;
}

export interface LLMProvider {
  /** Unique identifier for this provider */
  readonly name: string;

  /**
   * Send a chat completion request to the LLM.
   * Returns the assistant's response text.
   */
  chat(params: LLMChatParams): Promise<string>;
}

/**
 * Factory: create an LLM provider from business config.
 * Uses dynamic import() for ESM compatibility (Astro/Vite).
 */
export async function createLLMProvider(config: {
  provider: string;
  model?: string;
  apiKey: string;
  baseUrl?: string;
}): Promise<LLMProvider> {
  switch (config.provider) {
    case 'openai': {
      const { OpenAIProvider } = await import('./openai.js');
      return new OpenAIProvider(config.apiKey, config.model);
    }
    case 'anthropic': {
      const { AnthropicProvider } = await import('./anthropic.js');
      return new AnthropicProvider(config.apiKey, config.model);
    }
    case 'ollama': {
      const { OllamaProvider } = await import('./ollama.js');
      return new OllamaProvider(config.model, config.baseUrl, config.apiKey);
    }
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}