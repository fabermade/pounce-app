/**
 * GET /api/admin/providers/models — Return available models for a given LLM provider.
 *
 * Query params:
 *   provider — "openai" | "anthropic" | "ollama"
 *
 * For OpenAI and Anthropic, returns a static list of recommended models.
 * For Ollama, attempts to hit the Ollama API to list locally available models,
 * falling back to a sensible default list.
 */

import type { APIRoute } from 'astro';

const OPENAI_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
];

const ANTHROPIC_MODELS = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
  { id: 'claude-3.5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  { id: 'claude-3.5-haiku-20241022', name: 'Claude 3.5 Haiku' },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
];

const OLLAMA_DEFAULT_MODELS = [
  { id: 'llama3.1', name: 'Llama 3.1' },
  { id: 'llama3', name: 'Llama 3' },
  { id: 'mistral', name: 'Mistral' },
  { id: 'mixtral', name: 'Mixtral' },
  { id: 'codellama', name: 'Code Llama' },
  { id: 'phi3', name: 'Phi-3' },
  { id: 'gemma2', name: 'Gemma 2' },
];

export const GET: APIRoute = async ({ url }) => {
  const provider = url.searchParams.get('provider');

  if (!provider || !['openai', 'anthropic', 'ollama'].includes(provider)) {
    return new Response(JSON.stringify({ error: 'Invalid or missing provider parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (provider === 'openai') {
    return new Response(JSON.stringify(OPENAI_MODELS), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (provider === 'anthropic') {
    return new Response(JSON.stringify(ANTHROPIC_MODELS), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Ollama — try to fetch from the local API, fall back to defaults
  const baseUrl = url.searchParams.get('baseUrl') || 'http://localhost:11434';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data.models && Array.isArray(data.models)) {
        const models = data.models.map((m: { name: string; model?: string }) => ({
          id: m.name || m.model,
          name: m.name || m.model,
        }));
        return new Response(JSON.stringify(models), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
  } catch {
    // Ollama not reachable — fall back to defaults
  }

  return new Response(JSON.stringify(OLLAMA_DEFAULT_MODELS), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};