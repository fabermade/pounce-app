/**
 * Ollama LLM Provider
 * 
 * For self-hosted LLM inference. Default model: llama3.
 * Connects to local Ollama instance at http://localhost:11434.
 */

import type { LLMProvider, LLMChatParams } from './base.js';

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  private baseUrl: string;
  private model: string;

  constructor(model?: string, baseUrl?: string) {
    this.model = model ?? 'llama3';
    this.baseUrl = baseUrl ?? 'http://localhost:11434';
  }

  async chat(params: LLMChatParams): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: params.system },
          ...params.messages,
        ],
        stream: false,
        options: {
          temperature: params.temperature ?? 0.7,
          num_predict: params.maxTokens ?? 500,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      message: { content: string };
    };
    const content = data.message?.content;
    if (!content) {
      throw new Error('Ollama returned empty response');
    }
    return content;
  }
}