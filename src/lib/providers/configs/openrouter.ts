import { createOpenAI } from '@ai-sdk/openai';
import type { ProviderConfig } from '@/lib/providers/types';
import type { OpenRouterModelResponse } from '@/lib/providers/types';

export const openRouterProvider: ProviderConfig = {
  name: 'OpenRouter',
  envKey: 'OPENROUTER_API_KEY',
  createModel: (apiKey, modelId) => {
    const client = createOpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });
    return client.chat(modelId);
  },
  staticModels: [
    { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'OpenRouter', maxOutputTokens: 64_000 },
    { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenRouter', maxOutputTokens: 16_384 },
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
        maxOutputTokens: model.top_provider?.max_completion_tokens || 16_384,
      }));
  },
};
