import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from 'ai';
import { NextResponse } from 'next/server';
import { designBriefSchema, type DesignBrief } from '@/lib/design-brief/types';
import { getDesignBriefSystemPrompt } from '@/lib/design-brief/prompts';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { buildTemporalContext, resolvePreferredTimeZone } from '@/lib/prompts/temporal-context';
import { ChatRequestError } from '@/lib/chat/errors';
import { createDebugSession } from '@/lib/chat/stream-debug';
import { repairAndParseJson } from '@/lib/blueprint/repair-json';

interface DesignBriefRequestBody {
  prompt: string;
  provider: string;
  model: string;
  savedTimeZone?: string | null;
  browserTimeZone?: string;
}

export async function POST(req: Request) {
  let body: DesignBriefRequestBody;
  try {
    body = await req.json() as DesignBriefRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { prompt, provider, model, savedTimeZone, browserTimeZone } = body;

  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  }

  try {
    const apiKey = await resolveApiKey(provider);
    if (!apiKey) {
      throw new ChatRequestError(`No API key for ${provider}`);
    }

    const providerConfig = PROVIDERS[provider];
    if (!providerConfig) {
      throw new ChatRequestError(`Unknown provider: ${provider}`);
    }

    const preferredTimeZone = resolvePreferredTimeZone(savedTimeZone, browserTimeZone);
    const temporalContext = buildTemporalContext(preferredTimeZone);
    const systemPrompt = getDesignBriefSystemPrompt(temporalContext);
    const modelInstance = providerConfig.createModel(apiKey, model);

    const debugSession = createDebugSession({
      scope: 'design-brief',
      model,
      provider,
    });
    debugSession.logPrompt({
      systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      maxOutputTokens: 4096,
    });

    // Inject curated palettes into the prompt
    const { CURATED_PALETTES } = await import('@/lib/colors/palettes');
    const isDark = /\b(dark\s*(mode|theme)?|night|midnight)\b/i.test(prompt);
    const scheme = isDark ? 'dark' : 'light';
    const palettes = CURATED_PALETTES
      .filter(p => p.scheme === scheme)
      .map(p => ({ name: p.name, roles: p.roles }));
    const paletteContext = `\n\nAvailable color palettes (choose the best fit and use its hex values):\n${JSON.stringify(palettes)}`;

    let brief: DesignBrief;
    let rawText: string | undefined;

    try {
      const result = await generateText({
        model: modelInstance,
        system: systemPrompt,
        output: Output.object({ schema: designBriefSchema }),
        prompt: prompt + paletteContext,
        maxOutputTokens: 4096,
      });

      rawText = result.text;

      // result.output getter throws NoOutputGeneratedError when parsing failed internally
      let parsed: DesignBrief | undefined;
      try {
        parsed = result.output;
      } catch {
        // fall through to repair
      }

      if (parsed) {
        brief = parsed;
      } else if (rawText) {
        // Model returned text but it couldn't be parsed — attempt repair
        console.warn('Design brief output missing, attempting repair from raw text...');
        const repaired = repairAndParseJson(rawText, designBriefSchema);
        if (repaired) {
          console.info('Design brief JSON repair succeeded');
          brief = repaired;
        } else {
          throw new Error('Model did not produce a valid design brief');
        }
      } else {
        throw new Error('Model did not produce a valid design brief');
      }
    } catch (parseErr) {
      if (NoObjectGeneratedError.isInstance(parseErr) && parseErr.text) {
        console.warn('Design brief JSON parse failed, attempting repair...');
        rawText = parseErr.text;
        const repaired = repairAndParseJson(parseErr.text, designBriefSchema);
        if (repaired) {
          console.info('Design brief JSON repair succeeded');
          brief = repaired;
        } else {
          throw parseErr;
        }
      } else if (NoOutputGeneratedError.isInstance(parseErr)) {
        // generateText threw before we could capture rawText
        throw new Error('Model did not produce any output for design brief');
      } else {
        throw parseErr;
      }
    }

    debugSession.logResponse({ response: rawText ?? '', status: 'complete' });
    debugSession.finish('complete');

    return NextResponse.json({ brief });
  } catch (err: unknown) {
    if (err instanceof ChatRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Design brief generation failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Design brief generation failed' },
      { status: 500 },
    );
  }
}
