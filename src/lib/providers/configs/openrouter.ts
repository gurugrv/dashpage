import { createOpenAI } from '@ai-sdk/openai';
import type { ProviderConfig } from '@/lib/providers/types';
import type { OpenRouterModelResponse } from '@/lib/providers/types';
import { createReasoningFetch, type ReasoningEffort } from '../openrouter-fetch';

export const openRouterProvider: ProviderConfig = {
  name: 'OpenRouter',
  envKey: 'OPENROUTER_API_KEY',
  createModel: (apiKey, modelId) => {
    const client = createOpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });
    return client.chat(modelId);
  },
  staticModels: [
    { id: 'anthropic/claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'OpenRouter', maxOutputTokens: 128_000 },
    { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'OpenRouter', maxOutputTokens: 64_000 },
    { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenRouter', maxOutputTokens: 16_384 },
    { id: 'google/gemini-3-flash', name: 'Gemini 3 Flash', provider: 'OpenRouter', maxOutputTokens: 65_536 },
    { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'OpenRouter', maxOutputTokens: 8_192 },
  ],
  fetchModels: async (apiKey) => {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`OpenRouter API error: ${res.status}`);

    const data = await res.json() as OpenRouterModelResponse;
    return data.data
      .filter((model) => (model.context_length ?? 0) > 0)
      .map((model) => ({
        id: model.id,
        name: model.name,
        provider: 'OpenRouter',
        maxOutputTokens: model.top_provider?.max_completion_tokens || 64_000,
      }));
  },
};

/** Create an OpenRouter model instance with explicit reasoning effort control. */
export function createOpenRouterModel(apiKey: string, modelId: string, reasoning: ReasoningEffort) {
  const client = createOpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    fetch: createReasoningFetch(reasoning),
  });
  return client.chat(modelId);
}
