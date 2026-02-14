import { generateText, stepCountIs } from 'ai';
import { NextResponse } from 'next/server';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { getComponentsSystemPrompt } from '@/lib/blueprint/prompts/components-system-prompt';
import { ChatRequestError } from '@/lib/chat/errors';
import { createDebugSession } from '@/lib/chat/stream-debug';
import { prisma } from '@/lib/db/prisma';
import { createIconTools } from '@/lib/chat/tools/icon-tools';
import type { Blueprint } from '@/lib/blueprint/types';

interface ComponentsRequestBody {
  blueprint: Blueprint;
  provider: string;
  model: string;
  conversationId?: string;
}

function extractBlock(text: string, startMarker: string, endMarker: string): string | null {
  // Try exact match first
  const startIdx = text.indexOf(startMarker);
  const endIdx = text.indexOf(endMarker);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return text.slice(startIdx + startMarker.length, endIdx).trim();
  }

  // Flexible regex: allow whitespace variations and case-insensitive comment markers
  const tagName = startMarker.replace('<!-- ', '').replace(' -->', '');
  const endTagName = endMarker.replace('<!-- ', '').replace(' -->', '');
  const regex = new RegExp(
    `<!--\\s*${tagName}\\s*-->([\\s\\S]*?)<!--\\s*${endTagName}\\s*-->`,
    'i',
  );
  const match = text.match(regex);
  if (match) return match[1].trim();

  return null;
}

/** Last-resort: extract <header>...</header> or <footer>...</footer> directly */
function extractTagBlock(text: string, tag: 'header' | 'footer'): string | null {
  const regex = new RegExp(`(<${tag}[\\s\\S]*?</${tag}>)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : null;
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
      maxOutputTokens: 16000,
    });

    const result = await generateText({
      model: modelInstance,
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 16000,
      tools: { ...createIconTools() },
      stopWhen: stepCountIs(3),
    });

    const responseText = result.text;

    debugSession.logResponse({
      response: responseText,
      status: 'complete',
    });

    const headerHtml = extractBlock(responseText, '<!-- HEADER_START -->', '<!-- HEADER_END -->');
    const footerHtml = extractBlock(responseText, '<!-- FOOTER_START -->', '<!-- FOOTER_END -->');

    if (!headerHtml || !footerHtml) {
      // Strip markdown fences and retry — models often wrap output in ```html blocks
      const stripped = responseText.replace(/```(?:html)?\s*/gi, '').replace(/```\s*/g, '');
      let resolvedHeader = headerHtml || extractBlock(stripped, '<!-- HEADER_START -->', '<!-- HEADER_END -->');
      let resolvedFooter = footerHtml || extractBlock(stripped, '<!-- FOOTER_START -->', '<!-- FOOTER_END -->');

      // Last resort: extract raw <header> and <footer> tags directly
      if (!resolvedHeader || !resolvedFooter) {
        const source = stripped || responseText;
        resolvedHeader = resolvedHeader || extractTagBlock(source, 'header');
        resolvedFooter = resolvedFooter || extractTagBlock(source, 'footer');
      }

      if (resolvedHeader && resolvedFooter) {
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
      }

      console.error('Failed to parse header/footer. Raw AI response:\n', responseText.slice(0, 2000));
      return NextResponse.json(
        { error: 'Failed to parse header/footer from AI response' },
        { status: 500 },
      );
    }

    if (conversationId) {
      await prisma.generationState.update({
        where: { conversationId },
        data: {
          phase: 'components-complete',
          componentHtml: { headerHtml, footerHtml },
        },
      }).catch(() => {});
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
