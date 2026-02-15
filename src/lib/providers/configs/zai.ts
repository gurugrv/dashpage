import { createOpenAI } from '@ai-sdk/openai';
import type { OpenAIModelResponse, ProviderConfig } from '@/lib/providers/types';

const BASE_URL = 'https://api.z.ai/api/paas/v4';

export const zaiProvider: ProviderConfig = {
  name: 'Z.ai',
  envKey: 'ZAI_API_KEY',
  createModel: (apiKey, modelId) => {
    const client = createOpenAI({ apiKey, baseURL: BASE_URL });
    return client.chat(modelId);
  },
  staticModels: [
    { id: 'glm-5', name: 'GLM 5', provider: 'Z.ai', maxOutputTokens: 128_000 },
    { id: 'glm-4.7', name: 'GLM 4.7', provider: 'Z.ai', maxOutputTokens: 16_384 },
    { id: 'glm-4.7-flash', name: 'GLM 4.7 Flash', provider: 'Z.ai', maxOutputTokens: 16_384 },
    { id: 'glm-4.6', name: 'GLM 4.6', provider: 'Z.ai', maxOutputTokens: 16_384 },
    { id: 'glm-4.5', name: 'GLM 4.5', provider: 'Z.ai', maxOutputTokens: 16_384 },
    { id: 'glm-4.5-flash', name: 'GLM 4.5 Flash (Free)', provider: 'Z.ai', maxOutputTokens: 16_384 },
  ],
  fetchModels: async (apiKey) => {
    const res = await fetch(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Z.ai API error: ${res.status}`);

    const data = await res.json() as OpenAIModelResponse;
    return data.data.map((model) => ({
      id: model.id,
      name: model.id,
      provider: 'Z.ai',
      maxOutputTokens: 16_384,
    }));
  },
};
