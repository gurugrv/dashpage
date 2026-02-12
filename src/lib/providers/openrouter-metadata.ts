import type { OpenRouterModelResponse } from '@/lib/providers/types';

let openRouterMetadataCache: { data: Map<string, number>; timestamp: number } | null = null;
const METADATA_CACHE_TTL = 10 * 60 * 1000;

export async function fetchOpenRouterMetadata(): Promise<Map<string, number>> {
  if (openRouterMetadataCache && Date.now() - openRouterMetadataCache.timestamp < METADATA_CACHE_TTL) {
    return openRouterMetadataCache.data;
  }

  const res = await fetch('https://openrouter.ai/api/v1/models');
  if (!res.ok) throw new Error(`OpenRouter metadata API error: ${res.status}`);
  const json = await res.json() as OpenRouterModelResponse;

  const map = new Map<string, number>();
  for (const model of json.data) {
    const tokens = model.top_provider?.max_completion_tokens;
    if (!tokens) continue;

    map.set(model.id, tokens);
    const bare = model.id.includes('/') ? model.id.split('/').slice(1).join('/') : model.id;
    if (!map.has(bare)) map.set(bare, tokens);
  }

  openRouterMetadataCache = { data: map, timestamp: Date.now() };
  return map;
}
