import { createOpenAI } from '@ai-sdk/openai';
import type { OpenAIModelResponse, ProviderConfig } from '@/lib/providers/types';

const BASE_URL = 'https://api.minimax.io/v1';

export const minimaxProvider: ProviderConfig = {
  name: 'MiniMax',
  envKey: 'MINIMAX_API_KEY',
  createModel: (apiKey, modelId) => {
    const client = createOpenAI({ apiKey, baseURL: BASE_URL });
    return client.chat(modelId);
  },
  staticModels: [
    { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', provider: 'MiniMax', maxOutputTokens: 16_384 },
    { id: 'MiniMax-M2.5-highspeed', name: 'MiniMax M2.5 Highspeed', provider: 'MiniMax', maxOutputTokens: 16_384 },
    { id: 'MiniMax-M2.1', name: 'MiniMax M2.1', provider: 'MiniMax', maxOutputTokens: 16_384 },
    { id: 'MiniMax-M2.1-lightning', name: 'MiniMax M2.1 Lightning', provider: 'MiniMax', maxOutputTokens: 16_384 },
    { id: 'MiniMax-M2', name: 'MiniMax M2', provider: 'MiniMax', maxOutputTokens: 16_384 },
  ],
  fetchModels: async (apiKey) => {
    const res = await fetch(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`MiniMax API error: ${res.status}`);

    const data = await res.json() as OpenAIModelResponse;
    return data.data.map((model) => ({
      id: model.id,
      name: model.id,
      provider: 'MiniMax',
      maxOutputTokens: 16_384,
    }));
  },
};
