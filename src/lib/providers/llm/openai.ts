/**
 * OpenAI LLM Provider
 * 
 * Uses the OpenAI chat completions API. Default model: gpt-4o-mini.
 */

import OpenAI from 'openai';
import type { LLMProvider, LLMChatParams } from './base.js';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model ?? 'gpt-4o-mini';
  }

  async chat(params: LLMChatParams): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: params.system },
        ...params.messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty response');
    }
    return content;
  }
}