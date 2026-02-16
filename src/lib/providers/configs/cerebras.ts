import { createOpenAI } from '@ai-sdk/openai';
import type { ProviderConfig } from '@/lib/providers/types';

export const cerebrasProvider: ProviderConfig = {
  name: 'Cerebras',
  envKey: 'CEREBRAS_API_KEY',
  createModel: (apiKey, modelId) => {
    const client = createOpenAI({ apiKey, baseURL: 'https://api.cerebras.ai/v1' });
    return client.chat(modelId);
  },
  staticModels: [
    { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', provider: 'Cerebras', maxOutputTokens: 16_384 },
    { id: 'llama3.1-8b', name: 'Llama 3.1 8B', provider: 'Cerebras', maxOutputTokens: 8_192 },
    { id: 'qwen-3-32b', name: 'Qwen 3 32B', provider: 'Cerebras', maxOutputTokens: 16_384 },
  ],
  fetchModels: async (apiKey) => {
    const res = await fetch('https://api.cerebras.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Cerebras API error: ${res.status}`);

    const data = (await res.json()) as { data: Array<{ id: string }> };
    return data.data.map((model) => ({
      id: model.id,
      name: model.id
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      provider: 'Cerebras',
      maxOutputTokens: 16_384,
    }));
  },
};
