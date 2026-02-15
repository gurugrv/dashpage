import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { GoogleModelResponse, ProviderConfig } from '@/lib/providers/types';

export const googleProvider: ProviderConfig = {
  name: 'Google',
  envKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
  createModel: (apiKey, modelId) => {
    const client = createGoogleGenerativeAI({ apiKey });
    return client(modelId);
  },
  staticModels: [
    { id: 'gemini-3-pro', name: 'Gemini 3 Pro', provider: 'Google', maxOutputTokens: 65_536 },
    { id: 'gemini-3-flash', name: 'Gemini 3 Flash', provider: 'Google', maxOutputTokens: 65_536 },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google', maxOutputTokens: 8_192 },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'Google', maxOutputTokens: 8_192 },
  ],
  fetchModels: async (apiKey) => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) throw new Error(`Google API error: ${res.status}`);

    const data = await res.json() as GoogleModelResponse;
    return data.models
      .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
      .map((model) => ({
        id: model.name.replace('models/', ''),
        name: model.displayName,
        provider: 'Google',
        maxOutputTokens: model.outputTokenLimit || 8_192,
      }));
  },
};
