import { generateText, Output, stepCountIs } from 'ai';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@/generated/prisma/client';
import { blueprintSchema } from '@/lib/blueprint/types';
import { resolveBlueprintExecution } from '@/lib/blueprint/resolve-blueprint-execution';
import { ChatRequestError } from '@/lib/chat/errors';
import { createDebugSession } from '@/lib/chat/stream-debug';
import { createColorTools } from '@/lib/chat/tools/color-tools';
import { createImageTools } from '@/lib/chat/tools/image-tools';

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

    const debugSession = createDebugSession({
      scope: 'blueprint-generate',
      model,
      provider,
      conversationId,
    });
    debugSession.logPrompt({
      systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      maxOutputTokens: 16384,
    });

    const result = await generateText({
      model: modelInstance,
      system: systemPrompt,
      output: Output.object({ schema: blueprintSchema }),
      tools: { ...createColorTools(), ...createImageTools() },
      stopWhen: stepCountIs(6),
      prepareStep: async ({ stepNumber }) => {
        // Step 0: force a tool call (prompt directs model to generateColorPalette)
        if (stepNumber === 0) {
          return { toolChoice: 'required' as const };
        }
        // Step 3+: disable tools so model must produce structured output
        if (stepNumber >= 3) {
          return { activeTools: [] as const };
        }
        // Steps 1-2: normal behavior (optional searchImages etc.)
        return {};
      },
      prompt,
      maxOutputTokens: 16384,
    });

    debugSession.logResponse({
      response: result.text,
      status: 'complete',
    });
    debugSession.finish('complete');

    const blueprint = result.output;
    if (!blueprint) {
      throw new Error('Model did not produce a valid blueprint object');
    }
    debugSession.logFullResponse(result.finishReason);

    const dbBlueprint = await prisma.blueprint.upsert({
      where: { conversationId },
      create: { conversationId, data: blueprint },
      update: { data: blueprint },
    });

    // Create generation state for resume tracking
    await prisma.generationState.upsert({
      where: { conversationId },
      create: {
        conversationId,
        mode: 'blueprint',
        phase: 'awaiting-approval',
        blueprintId: dbBlueprint.id,
      },
      update: {
        mode: 'blueprint',
        phase: 'awaiting-approval',
        blueprintId: dbBlueprint.id,
        componentHtml: Prisma.DbNull,
        sharedStyles: Prisma.DbNull,
        completedPages: Prisma.DbNull,
        pageStatuses: Prisma.DbNull,
      },
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
