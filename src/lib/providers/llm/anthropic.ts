/**
 * Anthropic LLM Provider
 * 
 * Uses the Anthropic Messages API. Default model: claude-3-haiku-20240307.
 */

import type { LLMProvider, LLMChatParams } from './base.js';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model ?? 'claude-3-haiku-20240307';
  }

  async chat(params: LLMChatParams): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: params.maxTokens ?? 500,
        system: params.system,
        messages: params.messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        temperature: params.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      content: { type: string; text: string }[];
    };
    const text = data.content[0]?.text;
    if (!text) {
      throw new Error('Anthropic returned empty response');
    }
    return text;
  }
}