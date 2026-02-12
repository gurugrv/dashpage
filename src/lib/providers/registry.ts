import { anthropicProvider } from '@/lib/providers/configs/anthropic';
import { googleProvider } from '@/lib/providers/configs/google';
import { openAIProvider } from '@/lib/providers/configs/openai';
import { openRouterProvider } from '@/lib/providers/configs/openrouter';
import type { ProviderConfig } from '@/lib/providers/types';

export type { ModelInfo, ProviderConfig } from '@/lib/providers/types';

export const PROVIDERS: Record<string, ProviderConfig> = {
  OpenRouter: openRouterProvider,
  Anthropic: anthropicProvider,
  Google: googleProvider,
  OpenAI: openAIProvider,
};
