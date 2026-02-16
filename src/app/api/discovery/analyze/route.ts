import { NextResponse } from 'next/server';
import { analyzePromptForDiscovery } from '@/lib/discovery/analyze-prompt';
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

  let analysis;
  try {
    analysis = await analyzePromptForDiscovery(modelInstance, prompt, { provider, modelId: model });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    // Log the cause chain for schema validation failures
    const cause = error instanceof Error && 'cause' in error ? (error.cause as Error)?.message : undefined;
    console.error('[discovery/analyze] AI call failed:', msg, cause ? `\n  Cause: ${cause}` : '');
    return NextResponse.json({ error: 'Analysis failed. Try a different model.' }, { status: 502 });
  }

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
