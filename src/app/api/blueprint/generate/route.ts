import { generateText, NoObjectGeneratedError, Output, stepCountIs } from 'ai';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@/generated/prisma/client';
import { blueprintSchema, type Blueprint } from '@/lib/blueprint/types';
import { resolveBlueprintExecution } from '@/lib/blueprint/resolve-blueprint-execution';
import { ChatRequestError } from '@/lib/chat/errors';
import { createDebugSession } from '@/lib/chat/stream-debug';
import { createColorTools } from '@/lib/chat/tools/color-tools';
import { repairAndParseJson } from '@/lib/blueprint/repair-json';

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

    let blueprint: Blueprint;
    let rawText: string | undefined;
    let finishReason: string | undefined;

    // Gemini doesn't support forced function calling (ANY mode) with JSON response
    // mime type. Split into two calls: first get color palette, then generate blueprint.
    const isGoogleProvider = provider === 'Google';

    try {
      if (isGoogleProvider) {
        // Step 1: Get color palette via tool call
        const paletteResult = await generateText({
          model: modelInstance,
          system: systemPrompt,
          tools: { ...createColorTools() },
          toolChoice: 'required',
          stopWhen: stepCountIs(2),
          prompt,
          maxOutputTokens: 1024,
        });

        // Extract palette from tool results
        const paletteToolResult = paletteResult.steps
          .flatMap(s => s.toolResults)
          .find(r => r.toolName === 'selectColorPalette');

        // Step 2: Generate blueprint with structured output (no tools)
        let blueprintPrompt = prompt;
        if (paletteToolResult) {
          const input = paletteToolResult.input as { mood: string[]; industry?: string; scheme: string };
          blueprintPrompt = `${prompt}\n\nColor palettes selected for mood [${input.mood.join(', ')}]${input.industry ? `, industry: ${input.industry}` : ''}, scheme: ${input.scheme}:\n${JSON.stringify(paletteToolResult.output)}`;
        }

        const result = await generateText({
          model: modelInstance,
          system: systemPrompt,
          output: Output.object({ schema: blueprintSchema }),
          prompt: blueprintPrompt,
          maxOutputTokens: 16384,
        });

        rawText = result.text;
        finishReason = result.finishReason;

        if (!result.output) {
          throw new Error('Model did not produce a valid blueprint object');
        }
        blueprint = result.output;
      } else {
        // Non-Gemini: use combined tools + structured output in one call
        const result = await generateText({
          model: modelInstance,
          system: systemPrompt,
          output: Output.object({ schema: blueprintSchema }),
          tools: { ...createColorTools() },
          stopWhen: stepCountIs(6),
          prepareStep: async ({ stepNumber }) => {
            // Step 0: force selectColorPalette call
            if (stepNumber === 0) {
              return { toolChoice: 'required' as const };
            }
            // Step 1+: disable tools so model must produce structured output
            if (stepNumber >= 1) {
              return { activeTools: [] as const };
            }
            return {};
          },
          prompt,
          maxOutputTokens: 16384,
        });

        rawText = result.text;
        finishReason = result.finishReason;

        if (!result.output) {
          throw new Error('Model did not produce a valid blueprint object');
        }
        blueprint = result.output;
      }
    } catch (parseErr) {
      // When model doesn't support structuredOutputs, it may produce slightly malformed JSON.
      // Attempt to repair and validate the raw text before giving up.
      if (NoObjectGeneratedError.isInstance(parseErr) && parseErr.text) {
        console.warn('Blueprint JSON parse failed, attempting repair...');
        rawText = parseErr.text;
        finishReason = parseErr.finishReason;
        const repaired = repairAndParseJson(parseErr.text, blueprintSchema);
        if (repaired) {
          console.info('Blueprint JSON repair succeeded');
          blueprint = repaired;
        } else {
          throw parseErr;
        }
      } else {
        throw parseErr;
      }
    }

    debugSession.logResponse({
      response: rawText ?? '',
      status: 'complete',
    });
    debugSession.finish('complete');
    debugSession.logFullResponse(finishReason ?? 'unknown');

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
