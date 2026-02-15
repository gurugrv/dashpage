import { anthropicProvider } from '@/lib/providers/configs/anthropic';
import { deepinfraProvider } from '@/lib/providers/configs/deepinfra';
import { googleProvider } from '@/lib/providers/configs/google';
import { minimaxProvider } from '@/lib/providers/configs/minimax';
import { moonshotProvider } from '@/lib/providers/configs/moonshot';
import { openAIProvider } from '@/lib/providers/configs/openai';
import { openRouterProvider } from '@/lib/providers/configs/openrouter';
import { zaiProvider } from '@/lib/providers/configs/zai';
import type { ProviderConfig } from '@/lib/providers/types';

export type { ModelInfo, ProviderConfig } from '@/lib/providers/types';

export const PROVIDERS: Record<string, ProviderConfig> = {
  OpenRouter: openRouterProvider,
  Anthropic: anthropicProvider,
  Google: googleProvider,
  OpenAI: openAIProvider,
  DeepInfra: deepinfraProvider,
  MiniMax: minimaxProvider,
  Moonshot: moonshotProvider,
  'Z.ai': zaiProvider,
};
