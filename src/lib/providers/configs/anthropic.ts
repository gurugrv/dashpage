import { createAnthropic } from '@ai-sdk/anthropic';
import { fetchOpenRouterMetadata } from '@/lib/providers/openrouter-metadata';
import type { AnthropicModelResponse, ProviderConfig } from '@/lib/providers/types';

export const anthropicProvider: ProviderConfig = {
  name: 'Anthropic',
  envKey: 'ANTHROPIC_API_KEY',
  createModel: (apiKey, modelId) => {
    const client = createAnthropic({ apiKey });
    return client(modelId);
  },
  staticModels: [
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', provider: 'Anthropic', maxOutputTokens: 64_000 },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'Anthropic', maxOutputTokens: 64_000 },
  ],
  fetchModels: async (apiKey) => {
    const [res, tokenMap] = await Promise.all([
      fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      }),
      fetchOpenRouterMetadata().catch(() => new Map<string, number>()),
    ]);
    if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);

    const data = await res.json() as AnthropicModelResponse;
    return data.data.map((model) => ({
      id: model.id,
      name: model.display_name || model.id,
      provider: 'Anthropic',
      maxOutputTokens: tokenMap.get(model.id) ?? tokenMap.get(`anthropic/${model.id}`) ?? 16_384,
    }));
  },
};
