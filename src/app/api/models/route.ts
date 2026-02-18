import { NextResponse } from 'next/server';
import { PROVIDERS, type ModelInfo } from '@/lib/providers/registry';
import { resolveApiKey } from '@/lib/keys/key-manager';

const cache = new Map<string, { models: ModelInfo[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getModels(providerKey: string, apiKey: string): Promise<ModelInfo[]> {
  const cached = cache.get(providerKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.models;
  }

  const provider = PROVIDERS[providerKey];
  let models: ModelInfo[];

  if (provider.fetchModels) {
    try {
      models = await provider.fetchModels(apiKey);
      cache.set(providerKey, { models, timestamp: Date.now() });
    } catch (err) {
      console.warn(`[models] fetchModels failed for ${providerKey}:`, err instanceof Error ? err.message : err);
      models = provider.staticModels;
      // Don't cache failed results – retry on next request
    }
  } else {
    models = provider.staticModels;
    cache.set(providerKey, { models, timestamp: Date.now() });
  }

  return models;
}

export async function GET() {
  const entries = Object.keys(PROVIDERS);

  const results = await Promise.all(
    entries.map(async (key) => {
      const apiKey = await resolveApiKey(key);
      if (!apiKey) return null;
      const models = await getModels(key, apiKey);
      return { name: key, models };
    }),
  );

  const available = results.filter((r): r is NonNullable<typeof r> => r !== null);
  return NextResponse.json({ providers: available });
}
