import { generateText, stepCountIs } from 'ai';
import { NextResponse } from 'next/server';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { getComponentsSystemPrompt } from '@/lib/blueprint/prompts/components-system-prompt';
import { ChatRequestError } from '@/lib/chat/errors';
import { resolveMaxOutputTokens } from '@/lib/chat/constants';
import { createDebugSession } from '@/lib/chat/stream-debug';
import { prisma } from '@/lib/db/prisma';
import { createWebsiteTools } from '@/lib/chat/tools';
import type { Blueprint } from '@/lib/blueprint/types';

interface ComponentsRequestBody {
  blueprint: Blueprint;
  provider: string;
  model: string;
  conversationId?: string;
}


export async function POST(req: Request) {
  let body: ComponentsRequestBody;
  try {
    body = await req.json() as ComponentsRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { blueprint, provider, model, conversationId } = body;

  if (!blueprint || !provider || !model) {
    return NextResponse.json({ error: 'blueprint, provider, and model are required' }, { status: 400 });
  }

  try {
    const apiKey = await resolveApiKey(provider);
    if (!apiKey) throw new ChatRequestError(`No API key for ${provider}`);

    const providerConfig = PROVIDERS[provider];
    if (!providerConfig) throw new ChatRequestError(`Unknown provider: ${provider}`);

    const maxOutputTokens = resolveMaxOutputTokens(providerConfig, model);
    const systemPrompt = getComponentsSystemPrompt(blueprint);
    const modelInstance = providerConfig.createModel(apiKey, model);
    const userPrompt = `Generate the shared header and footer HTML components for the "${blueprint.siteName}" website.`;

    const debugSession = createDebugSession({
      scope: 'blueprint-components',
      model,
      provider,
    });
    debugSession.logPrompt({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxOutputTokens,
    });

    const { tools, workingFiles } = createWebsiteTools({});

    const result = await generateText({
      model: modelInstance,
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens,
      tools,
      stopWhen: stepCountIs(8),
    });

    const responseText = result.steps.map((s) => s.text).filter(Boolean).join('\n');

    debugSession.logResponse({
      response: responseText,
      status: 'complete',
    });

    // Extract from workingFiles — model should have called writeFiles with header.html and footer.html
    const resolvedHeader = workingFiles['header.html'];
    const resolvedFooter = workingFiles['footer.html'];

    if (!resolvedHeader || !resolvedFooter) {
      console.error('Model did not produce header.html and/or footer.html via writeFiles. Available files:', Object.keys(workingFiles), 'Raw response:', responseText.slice(0, 2000));
      return NextResponse.json(
        { error: 'Failed to generate header/footer — model did not call writeFiles' },
        { status: 500 },
      );
    }

    if (conversationId) {
      await prisma.generationState.update({
        where: { conversationId },
        data: {
          phase: 'components-complete',
          componentHtml: { headerHtml: resolvedHeader, footerHtml: resolvedFooter },
        },
      }).catch(() => {});
    }
    return NextResponse.json({ headerHtml: resolvedHeader, footerHtml: resolvedFooter });
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
