import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { OpenAIModelResponse, ProviderConfig } from '@/lib/providers/types';

const BASE_URL = 'https://api.moonshot.ai/v1';

export const moonshotProvider: ProviderConfig = {
  name: 'Moonshot',
  envKey: 'MOONSHOT_API_KEY',
  createModel: (apiKey, modelId) => {
    // Use openai-compatible (not @ai-sdk/openai) so reasoning_content is
    // preserved in multi-step tool-call history for thinking models.
    const client = createOpenAICompatible({ name: 'moonshot', apiKey, baseURL: BASE_URL });
    return client.chatModel(modelId);
  },
  staticModels: [
    { id: 'kimi-k2.5', name: 'Kimi K2.5', provider: 'Moonshot', maxOutputTokens: 16_384 },
    { id: 'kimi-k2-turbo-preview', name: 'Kimi K2 Turbo', provider: 'Moonshot', maxOutputTokens: 16_384 },
    { id: 'kimi-k2-thinking', name: 'Kimi K2 Thinking', provider: 'Moonshot', maxOutputTokens: 16_384 },
    { id: 'kimi-k2-thinking-turbo', name: 'Kimi K2 Thinking Turbo', provider: 'Moonshot', maxOutputTokens: 16_384 },
    { id: 'kimi-k2-0905-preview', name: 'Kimi K2 0905', provider: 'Moonshot', maxOutputTokens: 16_384 },
    { id: 'kimi-latest', name: 'Kimi Latest', provider: 'Moonshot', maxOutputTokens: 16_384 },
    { id: 'moonshot-v1-128k', name: 'Moonshot V1 128K', provider: 'Moonshot', maxOutputTokens: 16_384 },
  ],
  fetchModels: async (apiKey) => {
    const res = await fetch(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Moonshot API error: ${res.status}`);

    const data = await res.json() as OpenAIModelResponse;
    return data.data.map((model) => ({
      id: model.id,
      name: model.id,
      provider: 'Moonshot',
      maxOutputTokens: 16_384,
    }));
  },
};
