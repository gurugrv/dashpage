import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { blueprintSchema } from '@/lib/blueprint/types';
import { resolveBlueprintExecution } from '@/lib/blueprint/resolve-blueprint-execution';
import { ChatRequestError } from '@/lib/chat/errors';
import { isDebugEnabled, logAiPrompt, logAiResponse } from '@/lib/chat/stream-debug';

interface BlueprintRequestBody {
  prompt: string;
  conversationId: string;
  provider: string;
  model: string;
  savedTimeZone?: string | null;
  browserTimeZone?: string;
}

export async function POST(req: Request) {
  let body: BlueprintRequestBody;
  try {
    body = await req.json() as BlueprintRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { prompt, conversationId, provider, model, savedTimeZone, browserTimeZone } = body;

  if (!prompt?.trim() || !conversationId) {
    return NextResponse.json({ error: 'prompt and conversationId are required' }, { status: 400 });
  }

  try {
    const { modelInstance, systemPrompt } = await resolveBlueprintExecution({
      provider,
      model,
      savedTimeZone,
      browserTimeZone,
    });

    if (isDebugEnabled()) {
      logAiPrompt({
        scope: 'blueprint-generate',
        systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        model,
        provider,
        maxOutputTokens: 8000,
        conversationId,
      });
    }

    const result = await generateObject({
      model: modelInstance,
      system: systemPrompt,
      schema: blueprintSchema,
      prompt,
      maxOutputTokens: 8000,
    });

    const blueprint = result.object;

    if (isDebugEnabled()) {
      logAiResponse({
        scope: 'blueprint-generate',
        response: JSON.stringify(blueprint, null, 2),
        status: 'complete',
      });
    }

    const dbBlueprint = await prisma.blueprint.upsert({
      where: { conversationId },
      create: { conversationId, data: blueprint },
      update: { data: blueprint },
    });

    return NextResponse.json({ blueprint, id: dbBlueprint.id });
  } catch (err: unknown) {
    if (err instanceof ChatRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Blueprint generation failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Blueprint generation failed' },
      { status: 500 },
    );
  }
}
