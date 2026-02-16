import { createDeepInfra } from '@ai-sdk/deepinfra';
import type { OpenAIModelResponse, ProviderConfig } from '@/lib/providers/types';

export const deepinfraProvider: ProviderConfig = {
  name: 'DeepInfra',
  envKey: 'DEEPINFRA_API_KEY',
  createModel: (apiKey, modelId) => {
    const client = createDeepInfra({ apiKey });
    return client(modelId);
  },
  staticModels: [
    { id: 'meta-llama/Meta-Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B Instruct', provider: 'DeepInfra', maxOutputTokens: 64_000 },
    { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B Instruct', provider: 'DeepInfra', maxOutputTokens: 64_000 },
    { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', provider: 'DeepInfra', maxOutputTokens: 64_000 },
    { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', provider: 'DeepInfra', maxOutputTokens: 64_000 },
    { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B Instruct', provider: 'DeepInfra', maxOutputTokens: 64_000 },
    { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B Instruct', provider: 'DeepInfra', maxOutputTokens: 64_000 },
  ],
  fetchModels: async (apiKey) => {
    const res = await fetch('https://api.deepinfra.com/v1/openai/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`DeepInfra API error: ${res.status}`);

    const data = await res.json() as OpenAIModelResponse;
    return data.data.map((model) => ({
      id: model.id,
      name: model.id,
      provider: 'DeepInfra',
      maxOutputTokens: 64_000,
    }));
  },
};
