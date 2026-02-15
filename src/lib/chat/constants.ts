import type { ProviderConfig } from '@/lib/providers/types';

export const MAX_OUTPUT_CAP = 64_000;

const DEFAULT_MAX_OUTPUT = 16_384;

/**
 * Resolve maxOutputTokens for a model from the provider's static model list,
 * capped at MAX_OUTPUT_CAP.
 */
export function resolveMaxOutputTokens(
  providerConfig: ProviderConfig,
  modelId: string,
): number {
  const modelConfig = providerConfig.staticModels.find((m) => m.id === modelId);
  const raw = modelConfig?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT;
  return Math.min(raw, MAX_OUTPUT_CAP);
}
