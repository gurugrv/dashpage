import { createOpenAI } from '@ai-sdk/openai';
import type { ProviderConfig } from '@/lib/providers/types';

export const cerebrasProvider: ProviderConfig = {
  name: 'Cerebras',
  envKey: 'CEREBRAS_API_KEY',
  supportsStructuredOutput: false,
  createModel: (apiKey, modelId) => {
    const client = createOpenAI({ apiKey, baseURL: 'https://api.cerebras.ai/v1' });
    return client.chat(modelId);
  },
  staticModels: [
    { id: 'zai-glm-4.7', name: 'Z.ai GLM 4.7', provider: 'Cerebras', maxOutputTokens: 40_960 },
    { id: 'gpt-oss-120b', name: 'OpenAI GPT OSS', provider: 'Cerebras', maxOutputTokens: 40_960 },
    { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', provider: 'Cerebras', maxOutputTokens: 65_536 },
    { id: 'qwen-3-235b-a22b-instruct-2507', name: 'Qwen 3 235B Instruct', provider: 'Cerebras', maxOutputTokens: 40_960 },
    { id: 'qwen-3-32b', name: 'Qwen 3 32B', provider: 'Cerebras', maxOutputTokens: 8_192 },
    { id: 'llama3.1-8b', name: 'Llama 3.1 8B', provider: 'Cerebras', maxOutputTokens: 8_192 },
  ],
  fetchModels: async (apiKey) => {
    const res = await fetch('https://api.cerebras.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Cerebras API error: ${res.status}`);

    const data = (await res.json()) as {
      data: Array<{
        id: string;
        name?: string;
        limits?: { max_completion_tokens?: number };
      }>;
    };
    return data.data.map((model) => ({
      id: model.id,
      name: model.name || model.id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      provider: 'Cerebras',
      maxOutputTokens: model.limits?.max_completion_tokens || 16_384,
    }));
  },
};
