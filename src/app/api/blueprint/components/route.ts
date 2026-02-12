import { generateText } from 'ai';
import { NextResponse } from 'next/server';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { getComponentsSystemPrompt } from '@/lib/blueprint/prompts/components-system-prompt';
import { ChatRequestError } from '@/lib/chat/errors';
import { logAiPrompt, logAiResponse } from '@/lib/chat/stream-debug';
import type { Blueprint } from '@/lib/blueprint/types';

interface ComponentsRequestBody {
  blueprint: Blueprint;
  provider: string;
  model: string;
}

function extractBlock(text: string, startMarker: string, endMarker: string): string | null {
  const startIdx = text.indexOf(startMarker);
  const endIdx = text.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;
  return text.slice(startIdx + startMarker.length, endIdx).trim();
}

export async function POST(req: Request) {
  let body: ComponentsRequestBody;
  try {
    body = await req.json() as ComponentsRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { blueprint, provider, model } = body;

  if (!blueprint || !provider || !model) {
    return NextResponse.json({ error: 'blueprint, provider, and model are required' }, { status: 400 });
  }

  try {
    const apiKey = await resolveApiKey(provider);
    if (!apiKey) throw new ChatRequestError(`No API key for ${provider}`);

    const providerConfig = PROVIDERS[provider];
    if (!providerConfig) throw new ChatRequestError(`Unknown provider: ${provider}`);

    const systemPrompt = getComponentsSystemPrompt(blueprint);
    const modelInstance = providerConfig.createModel(apiKey, model);
    const userPrompt = `Generate the shared header and footer HTML components for the "${blueprint.siteName}" website.`;

    logAiPrompt({
      scope: 'blueprint-components',
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      model,
      provider,
      maxOutputTokens: 4000,
    });

    const result = await generateText({
      model: modelInstance,
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 4000,
    });

    const responseText = result.text;

    logAiResponse({
      scope: 'blueprint-components',
      response: responseText,
      status: 'complete',
    });

    const headerHtml = extractBlock(responseText, '<!-- HEADER_START -->', '<!-- HEADER_END -->');
    const footerHtml = extractBlock(responseText, '<!-- FOOTER_START -->', '<!-- FOOTER_END -->');

    if (!headerHtml || !footerHtml) {
      return NextResponse.json(
        { error: 'Failed to parse header/footer from AI response' },
        { status: 500 },
      );
    }

    return NextResponse.json({ headerHtml, footerHtml });
  } catch (err: unknown) {
    if (err instanceof ChatRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Components generation failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Components generation failed' },
      { status: 500 },
    );
  }
}
