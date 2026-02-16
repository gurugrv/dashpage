import type { ProviderConfig } from '@/lib/providers/types';

export const MAX_OUTPUT_SAFETY_CEILING = 200_000;

const DEFAULT_MAX_OUTPUT = 64_000;

/**
 * Resolve maxOutputTokens for a model from the provider's static model list.
 * Tries exact match first, then prefix match (e.g. "gemini-3-flash" matches
 * "gemini-3-flash-001"), then falls back to DEFAULT_MAX_OUTPUT.
 * Used as a server-side fallback when the client doesn't provide a value.
 */
export function resolveMaxOutputTokens(
  providerConfig: ProviderConfig,
  modelId: string,
  clientMaxTokens?: number,
): number {
  // Look up server-side known limit from static models
  const serverLimit = resolveServerMaxOutputTokens(providerConfig, modelId);

  // Use the higher of client and server values to prevent stale client cache from
  // underreporting a model's true capacity
  const clientLimit = clientMaxTokens && clientMaxTokens > 0 ? clientMaxTokens : 0;

  return Math.min(Math.max(clientLimit, serverLimit), MAX_OUTPUT_SAFETY_CEILING);
}

function resolveServerMaxOutputTokens(
  providerConfig: ProviderConfig,
  modelId: string,
): number {
  // Exact match on static models
  const exact = providerConfig.staticModels.find((m) => m.id === modelId);
  if (exact) return exact.maxOutputTokens;

  // Prefix match: dynamic IDs often have version suffixes (e.g. gemini-3-flash-001)
  // Require a separator after the prefix to avoid false positives (gpt-4o matching gpt-4o-mini)
  const prefixMatch = providerConfig.staticModels.find((m) => {
    if (modelId.length > m.id.length) {
      return modelId.startsWith(m.id) && /^[-.:@]/.test(modelId.slice(m.id.length));
    }
    if (m.id.length > modelId.length) {
      return m.id.startsWith(modelId) && /^[-.:@]/.test(m.id.slice(modelId.length));
    }
    return false;
  });
  if (prefixMatch) return prefixMatch.maxOutputTokens;

  return DEFAULT_MAX_OUTPUT;
}
