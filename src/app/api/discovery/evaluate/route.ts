import { NextResponse } from 'next/server';
import { evaluateCompleteness } from '@/lib/discovery/evaluate-completeness';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import type { BusinessProfileData } from '@/lib/discovery/types';

export async function POST(req: Request) {
  const { prompt, provider, model, collectedData, questionsAskedSoFar } = await req.json() as {
    prompt: string;
    provider: string;
    model: string;
    collectedData: BusinessProfileData;
    questionsAskedSoFar: number;
  };

  const providerConfig = PROVIDERS[provider as keyof typeof PROVIDERS];
  if (!providerConfig) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  const apiKey = await resolveApiKey(provider);
  if (!apiKey) {
    return NextResponse.json({ error: 'No API key' }, { status: 400 });
  }

  const modelInstance = providerConfig.createModel(apiKey, model);
  const result = await evaluateCompleteness(modelInstance, prompt, collectedData, questionsAskedSoFar, { provider, modelId: model });

  return NextResponse.json(result);
}
