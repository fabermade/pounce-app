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
 * Config value looks like: { "provider": "openai", "model": "gpt-4o-mini", "apiKey": "env:OPENAI_API_KEY" }
 */
export function createLLMProvider(config: {
  provider: string;
  model?: string;
  apiKey: string; // Already resolved from env:KEY
}): LLMProvider {
  switch (config.provider) {
    case 'openai':
      return new (require('./openai.js').OpenAIProvider)(config.apiKey, config.model);
    case 'anthropic':
      return new (require('./anthropic.js').AnthropicProvider)(config.apiKey, config.model);
    case 'ollama':
      return new (require('./ollama.js').OllamaProvider)(config.model);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}