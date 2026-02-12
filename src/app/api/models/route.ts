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
    } catch {
      models = provider.staticModels;
    }
  } else {
    models = provider.staticModels;
  }

  cache.set(providerKey, { models, timestamp: Date.now() });
  return models;
}

export async function GET() {
  const available: { name: string; models: ModelInfo[] }[] = [];

  for (const [key] of Object.entries(PROVIDERS)) {
    const apiKey = await resolveApiKey(key);
    if (apiKey) {
      const models = await getModels(key, apiKey);
      available.push({ name: key, models });
    }
  }

  return NextResponse.json({ providers: available });
}
