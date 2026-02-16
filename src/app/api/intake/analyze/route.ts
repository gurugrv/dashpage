import { NextResponse } from 'next/server';
import { analyzePromptForIntake } from '@/lib/intake/analyze-prompt';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { isPlacesConfigured } from '@/lib/places/google-places';

export async function POST(req: Request) {
  const { prompt, provider, model } = await req.json();

  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  }

  const providerConfig = PROVIDERS[provider as keyof typeof PROVIDERS];
  if (!providerConfig) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  const apiKey = await resolveApiKey(provider);
  if (!apiKey) {
    return NextResponse.json({ error: 'No API key for provider' }, { status: 400 });
  }

  const modelInstance = providerConfig.createModel(apiKey, model);
  const analysis = await analyzePromptForIntake(modelInstance, prompt);

  // If Google Places not configured, downgrade address_autocomplete to text
  if (!isPlacesConfigured()) {
    for (const q of analysis.questions) {
      if (q.type === 'address_autocomplete') {
        q.type = 'text';
      }
    }
  }

  return NextResponse.json({
    ...analysis,
    placesConfigured: isPlacesConfigured(),
  });
}
