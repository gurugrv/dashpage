import type { ProviderConfig } from '@/lib/providers/types';

export const MAX_OUTPUT_SAFETY_CEILING = 200_000;

const DEFAULT_MAX_OUTPUT = 16_384;

/**
 * Resolve maxOutputTokens for a model from the provider's static model list.
 * Used as a fallback when the client doesn't provide a value from fetchModels().
 */
export function resolveMaxOutputTokens(
  providerConfig: ProviderConfig,
  modelId: string,
): number {
  const modelConfig = providerConfig.staticModels.find((m) => m.id === modelId);
  return modelConfig?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT;
}
