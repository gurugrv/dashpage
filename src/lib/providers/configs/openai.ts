import { createOpenAI } from '@ai-sdk/openai';
import { fetchOpenRouterMetadata } from '@/lib/providers/openrouter-metadata';
import type { OpenAIModelResponse, ProviderConfig } from '@/lib/providers/types';

export const openAIProvider: ProviderConfig = {
  name: 'OpenAI',
  envKey: 'OPENAI_API_KEY',
  createModel: (apiKey, modelId) => {
    const client = createOpenAI({ apiKey });
    return client.chat(modelId);
  },
  staticModels: [
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', maxOutputTokens: 16_384 },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', maxOutputTokens: 16_384 },
  ],
  fetchModels: async (apiKey) => {
    const [res, tokenMap] = await Promise.all([
      fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
      fetchOpenRouterMetadata().catch(() => new Map<string, number>()),
    ]);
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);

    const data = await res.json() as OpenAIModelResponse;
    const chatPrefixes = ['gpt-', 'o1-', 'o3-', 'o4-', 'chatgpt-'];
    return data.data
      .filter((model) => chatPrefixes.some((prefix) => model.id.startsWith(prefix)))
      .map((model) => ({
        id: model.id,
        name: model.id,
        provider: 'OpenAI',
        maxOutputTokens: tokenMap.get(model.id) ?? tokenMap.get(`openai/${model.id}`) ?? 16_384,
      }));
  },
};
