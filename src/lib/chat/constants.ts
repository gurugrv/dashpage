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
  // Client-provided value (from fetchModels) is authoritative when available
  if (clientMaxTokens && clientMaxTokens > 0) {
    return Math.min(clientMaxTokens, MAX_OUTPUT_SAFETY_CEILING);
  }

  // Exact match on static models
  const exact = providerConfig.staticModels.find((m) => m.id === modelId);
  if (exact) return exact.maxOutputTokens;

  // Prefix match: dynamic IDs often have version suffixes (e.g. gemini-3-flash-001)
  // Require a separator after the prefix to avoid false positives (gpt-4o matching gpt-4o-mini)
  const prefixMatch = providerConfig.staticModels.find((m) => {
    if (modelId.length > m.id.length) {
      // Dynamic ID is longer: check if static ID is a prefix followed by a separator
      return modelId.startsWith(m.id) && /^[-.:@]/.test(modelId.slice(m.id.length));
    }
    if (m.id.length > modelId.length) {
      // Static ID is longer: check if dynamic ID is a prefix followed by a separator
      return m.id.startsWith(modelId) && /^[-.:@]/.test(m.id.slice(modelId.length));
    }
    return false;
  });
  if (prefixMatch) return prefixMatch.maxOutputTokens;

  return DEFAULT_MAX_OUTPUT;
}
