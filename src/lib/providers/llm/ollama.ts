/**
 * Ollama LLM Provider
 *
 * Supports both local instances and Ollama Cloud.
 * - Local: no API key needed, baseUrl defaults to http://localhost:11434
 * - Cloud: requires API key, sent as Authorization: Bearer header
 *   baseUrl defaults to https://ollama.com
 */

import type { LLMProvider, LLMChatParams } from './base.js';

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  private baseUrl: string;
  private model: string;
  private apiKey?: string;

  constructor(model?: string, baseUrl?: string, apiKey?: string) {
    this.model = model ?? 'llama3';
    this.baseUrl = baseUrl ?? 'https://ollama.com';
    this.apiKey = apiKey;
  }

  async chat(params: LLMChatParams): Promise<string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    // Ollama Cloud uses Bearer token auth; local instances don't need it
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers,
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