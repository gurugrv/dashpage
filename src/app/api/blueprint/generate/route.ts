import { generateText, NoObjectGeneratedError, Output } from 'ai';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@/generated/prisma/client';
import { blueprintSchema, type Blueprint } from '@/lib/blueprint/types';
import { resolveBlueprintExecution } from '@/lib/blueprint/resolve-blueprint-execution';
import { sanitizeFont } from '@/lib/fonts';
import { ChatRequestError } from '@/lib/chat/errors';
import { createDebugSession } from '@/lib/chat/stream-debug';
import { repairAndParseJson } from '@/lib/blueprint/repair-json';
import { researchSiteFacts } from '@/lib/blueprint/research';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';

interface BlueprintRequestBody {
  prompt: string;
  conversationId: string;
  provider: string;
  model: string;
  savedTimeZone?: string | null;
  browserTimeZone?: string;
  researchProvider?: string;
  researchModel?: string;
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

    try {
      {
        const result = await generateText({
          model: modelInstance,
          system: systemPrompt,
          output: Output.object({ schema: blueprintSchema }),
          prompt,
          maxOutputTokens: 16384,
        });

        rawText = result.text;
        finishReason = result.finishReason;

        // result.output getter throws NoOutputGeneratedError when parsing failed internally
        let parsed: Blueprint | undefined;
        try {
          parsed = result.output;
        } catch {
          // fall through to repair
        }

        if (parsed) {
          blueprint = parsed;
        } else if (rawText) {
          console.warn('Blueprint output missing, attempting repair from raw text...');
          const repaired = repairAndParseJson(rawText, blueprintSchema);
          if (repaired) {
            console.info('Blueprint JSON repair succeeded');
            blueprint = repaired;
          } else {
            throw new Error('Model did not produce a valid blueprint object');
          }
        } else {
          throw new Error('Model did not produce a valid blueprint object');
        }
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
    debugSession.logGenerationSummary?.({
      finishReason: finishReason ?? 'unknown',
      hasFileOutput: false,
      toolCallCount: 0,
      structuredOutput: true,
      rawTextLength: rawText?.length ?? 0,
    });

    blueprint.designSystem.headingFont = sanitizeFont(blueprint.designSystem.headingFont, 'heading');
    blueprint.designSystem.bodyFont = sanitizeFont(blueprint.designSystem.bodyFont, 'body');

    // Research site facts if the AI flagged this as a real business
    if (blueprint.needsResearch) {
      try {
        // Use research model override if provided, otherwise fall back to planning model
        let researchModelInstance = modelInstance;
        let researchDebugProvider = provider;
        let researchDebugModel = model;

        if (body.researchProvider && body.researchModel) {
          const researchApiKey = await resolveApiKey(body.researchProvider);
          if (researchApiKey) {
            const researchProviderConfig = PROVIDERS[body.researchProvider as keyof typeof PROVIDERS];
            if (researchProviderConfig) {
              researchModelInstance = researchProviderConfig.createModel(body.researchModel, researchApiKey);
              researchDebugProvider = body.researchProvider;
              researchDebugModel = body.researchModel;
            }
          }
        }

        const siteFacts = await researchSiteFacts(
          researchModelInstance,
          blueprint.siteName,
          blueprint.siteDescription,
          { conversationId, provider: researchDebugProvider, model: researchDebugModel },
        );
        if (siteFacts) {
          blueprint.siteFacts = siteFacts;
        }
      } catch (err) {
        // Non-fatal: proceed without facts
        console.warn('[blueprint-generate] Site facts research failed:', err instanceof Error ? err.message : err);
      }
    }

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
