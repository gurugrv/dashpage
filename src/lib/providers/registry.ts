import { anthropicProvider } from '@/lib/providers/configs/anthropic';
import { cerebrasProvider } from '@/lib/providers/configs/cerebras';
import { deepinfraProvider } from '@/lib/providers/configs/deepinfra';
import { googleProvider } from '@/lib/providers/configs/google';
import { minimaxProvider } from '@/lib/providers/configs/minimax';
import { moonshotProvider } from '@/lib/providers/configs/moonshot';
import { openAIProvider } from '@/lib/providers/configs/openai';
import { openRouterProvider } from '@/lib/providers/configs/openrouter';
import { zaiProvider } from '@/lib/providers/configs/zai';
import type { ProviderConfig } from '@/lib/providers/types';

export type { ModelInfo, ProviderConfig } from '@/lib/providers/types';

// Together.ai — image generation only, no LLM models
const togetherProvider: ProviderConfig = {
  name: 'Together',
  envKey: 'TOGETHER_API_KEY',
  createModel: () => { throw new Error('Together.ai is image-only, no LLM models') as never; },
  staticModels: [],
};

export const PROVIDERS: Record<string, ProviderConfig> = {
  OpenRouter: openRouterProvider,
  Anthropic: anthropicProvider,
  Google: googleProvider,
  OpenAI: openAIProvider,
  Cerebras: cerebrasProvider,
  DeepInfra: deepinfraProvider,
  MiniMax: minimaxProvider,
  Moonshot: moonshotProvider,
  'Z.ai': zaiProvider,
  Together: togetherProvider,
};
