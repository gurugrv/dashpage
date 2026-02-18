import { generateText, NoObjectGeneratedError, Output } from 'ai';
import { after, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@/generated/prisma/client';
import { blueprintSchema, type Blueprint } from '@/lib/blueprint/types';
import { resolveBlueprintExecution } from '@/lib/blueprint/resolve-blueprint-execution';
import { sanitizeFont } from '@/lib/fonts';
import { ChatRequestError } from '@/lib/chat/errors';
import { createDebugSession, createGenerationTracker, isDebugEnabled } from '@/lib/chat/stream-debug';
import { registerGeneration, unregisterGeneration } from '@/lib/stream/generation-registry';
import { recordGenerationEvent } from '@/lib/telemetry/generation-events';
import { repairAndParseJson } from '@/lib/blueprint/repair-json';
import { researchSiteFacts } from '@/lib/blueprint/research';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { resolveMaxOutputTokens } from '@/lib/chat/constants';

interface BlueprintRequestBody {
  prompt: string;
  conversationId: string;
  provider: string;
  model: string;
  maxOutputTokens?: number;
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

  const { prompt, conversationId, provider, model, maxOutputTokens: clientMaxTokens, savedTimeZone, browserTimeZone } = body;

  if (!prompt?.trim() || !conversationId) {
    return NextResponse.json({ error: 'prompt and conversationId are required' }, { status: 400 });
  }

  // Create a linked AbortController for server-side abort registry
  const controller = new AbortController();
  req.signal.addEventListener('abort', () => controller.abort(), { once: true });
  registerGeneration(conversationId, controller);
  const generationStartedAt = Date.now();
  let repairTriggered = false;

  try {
    const { modelInstance, systemPrompt } = await resolveBlueprintExecution({
      provider,
      model,
      savedTimeZone,
      browserTimeZone,
    });

    const providerConfig = PROVIDERS[provider];
    const maxOutputTokens = providerConfig
      ? resolveMaxOutputTokens(providerConfig, model, clientMaxTokens)
      : clientMaxTokens ?? 16_384;

    const tracker = createGenerationTracker('blueprint-generate');
    const debugSession = createDebugSession({
      scope: 'blueprint-generate',
      model,
      provider,
      conversationId,
    });
    debugSession.logPrompt({
      systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      maxOutputTokens,
    });

    // Start DB lookup concurrently — it doesn't depend on the AI result
    const convPromise = prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { businessProfile: true },
    });

    let blueprint: Blueprint;
    let rawText: string | undefined;
    let finishReason: string | undefined;
    let resultUsage: { inputTokens?: number; outputTokens?: number } | undefined;
    const useStructuredOutput = providerConfig?.supportsStructuredOutput !== false;

    try {
      {
        const textPrompt = useStructuredOutput
          ? prompt
          : prompt + '\n\nRespond ONLY with a valid JSON object matching the blueprint schema. No markdown fences, no extra text.';

        const result = await generateText({
          model: modelInstance,
          system: systemPrompt,
          ...(useStructuredOutput ? { output: Output.object({ schema: blueprintSchema }) } : {}),
          prompt: textPrompt,
          maxOutputTokens,
          abortSignal: controller.signal,
        });

        rawText = result.text;
        finishReason = result.finishReason;
        resultUsage = result.usage;
        if (useStructuredOutput) {
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
            repairTriggered = true;
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
        } else {
          // Text mode: parse raw JSON response
          if (rawText) {
            const repaired = repairAndParseJson(rawText, blueprintSchema);
            if (repaired) {
              blueprint = repaired;
            } else {
              throw new Error('Model did not produce a valid blueprint object');
            }
          } else {
            throw new Error('Model did not produce a valid blueprint object');
          }
        }
      }
    } catch (parseErr) {
      // When model doesn't support structuredOutputs, it may produce slightly malformed JSON.
      // Attempt to repair and validate the raw text before giving up.
      if (NoObjectGeneratedError.isInstance(parseErr) && parseErr.text) {
        console.warn('Blueprint JSON parse failed, attempting repair...');
        repairTriggered = true;
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

    if (isDebugEnabled()) {
      console.log('\n[blueprint-generate] Parsed blueprint:\n' + JSON.stringify(blueprint, null, 2) + '\n');
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
      usage: resultUsage,
    });
    tracker.addStep({ model, provider, usage: resultUsage });
    await tracker.logFinalSummary();
    recordGenerationEvent({
      conversationId,
      scope: 'blueprint-generate',
      provider,
      model,
      finishReason: finishReason ?? 'unknown',
      inputTokens: resultUsage?.inputTokens,
      outputTokens: resultUsage?.outputTokens,
      durationMs: Date.now() - generationStartedAt,
      toolCallCount: 0,
      hasFileOutput: false,
      repairTriggered,
    });
    unregisterGeneration(conversationId);

    blueprint.designSystem.headingFont = sanitizeFont(blueprint.designSystem.headingFont, 'heading');
    blueprint.designSystem.bodyFont = sanitizeFont(blueprint.designSystem.bodyFont, 'body');

    // Await the concurrent DB lookup started before generateText
    const conv = await convPromise;
    const businessProfile = conv?.businessProfile;

    // Format hours Record<string, string> as human-readable string
    const formatHours = (hours: Record<string, string> | null | undefined): string => {
      if (!hours || typeof hours !== 'object') return '';
      return Object.entries(hours)
        .map(([day, time]) => `${day}: ${time}`)
        .join(', ');
    };

    // Format socialMedia Record<string, string> as human-readable string
    const formatSocialMedia = (social: Record<string, string> | null | undefined): string => {
      if (!social || typeof social !== 'object') return '';
      return Object.entries(social)
        .map(([platform, url]) => `${platform}: ${url}`)
        .join(', ');
    };

    // Build discovery facts from business profile (user-provided data takes priority)
    const discoveryFacts: import('@/lib/blueprint/types').SiteFacts | null = businessProfile
      ? {
          businessName: businessProfile.name,
          address: businessProfile.address ?? '',
          phone: businessProfile.phone ?? '',
          email: businessProfile.email ?? '',
          hours: formatHours(businessProfile.hours as Record<string, string> | null),
          services: (businessProfile.services as string[] | null) ?? [],
          tagline: '',
          socialMedia: formatSocialMedia(businessProfile.socialMedia as Record<string, string> | null),
          category: businessProfile.category ?? '',
          googleMapsUri: businessProfile.googleMapsUri ?? '',
          location: businessProfile.lat && businessProfile.lng ? `${businessProfile.lat},${businessProfile.lng}` : '',
          additionalInfo: businessProfile.additionalInfo ?? '',
        }
      : null;

    // Apply discovery facts synchronously (user-provided data, no latency)
    if (discoveryFacts) {
      blueprint.siteFacts = discoveryFacts;
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

    // Run web research in the background — results merge into DB blueprint
    // while the user reviews and approves. Client re-fetches before generation.
    if (blueprint.needsResearch) {
      // Mark research as pending so the client can wait for it before generating
      blueprint.researchPending = true;
      await prisma.blueprint.update({
        where: { conversationId },
        data: { data: blueprint },
      });

      // Use the user-provided business name from discovery if available
      const searchName = discoveryFacts?.businessName || blueprint.siteName;

      after(async () => {
        try {
          let researchModelInstance = modelInstance;
          let researchDebugProvider = provider;
          let researchDebugModel = model;

          if (body.researchProvider && body.researchModel) {
            const researchApiKey = await resolveApiKey(body.researchProvider);
            if (researchApiKey) {
              const researchProviderConfig = PROVIDERS[body.researchProvider as keyof typeof PROVIDERS];
              if (researchProviderConfig) {
                researchModelInstance = researchProviderConfig.createModel(researchApiKey, body.researchModel);
                researchDebugProvider = body.researchProvider;
                researchDebugModel = body.researchModel;
              }
            }
          }

          const researchFacts = await researchSiteFacts(
            researchModelInstance,
            searchName,
            prompt,
            {
              conversationId,
              provider: researchDebugProvider,
              model: researchDebugModel,
              businessWebsite: businessProfile?.website ?? undefined,
            },
          );

          if (researchFacts) {
            const filledFields = Object.entries(researchFacts)
              .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v}`);
            console.info(`[blueprint-research] Extracted ${filledFields.length} facts:\n  ${filledFields.join('\n  ')}`);
          } else {
            console.warn(`[blueprint-research] No facts extracted for "${searchName}"`);
          }

          // Re-read the latest blueprint from DB (user may have edited it while research ran)
          const latestRecord = await prisma.blueprint.findUnique({ where: { conversationId } });
          const latestBlueprint = (latestRecord?.data ?? blueprint) as Blueprint;
          const currentFacts = latestBlueprint.siteFacts;

          if (researchFacts) {
            // Merge: discovery data wins for non-empty fields, research fills gaps
            const mergedFacts = currentFacts
              ? {
                  businessName: currentFacts.businessName || researchFacts.businessName,
                  address: currentFacts.address || researchFacts.address,
                  phone: currentFacts.phone || researchFacts.phone,
                  email: currentFacts.email || researchFacts.email,
                  hours: currentFacts.hours || researchFacts.hours,
                  services: currentFacts.services?.length ? currentFacts.services : researchFacts.services,
                  tagline: researchFacts.tagline || currentFacts.tagline,
                  socialMedia: currentFacts.socialMedia || researchFacts.socialMedia,
                  category: currentFacts.category || researchFacts.category,
                  googleMapsUri: currentFacts.googleMapsUri || researchFacts.googleMapsUri,
                  location: currentFacts.location || researchFacts.location,
                  additionalInfo: [currentFacts.additionalInfo, researchFacts.additionalInfo].filter(Boolean).join('\n'),
                }
              : researchFacts;

            const mergedFilledFields = Object.entries(mergedFacts)
              .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
              .map(([k]) => k);
            console.info(`[blueprint-research] Merged siteFacts (${mergedFilledFields.length} fields): ${mergedFilledFields.join(', ')}`);

            // Update blueprint in DB with research results and clear pending flag
            await prisma.blueprint.update({
              where: { conversationId },
              data: { data: { ...latestBlueprint, siteFacts: mergedFacts, researchPending: false } },
            });
            console.info(`[blueprint-research] Saved siteFacts to DB for conversation ${conversationId}`);
          } else {
            // No research results — just clear the pending flag
            console.warn(`[blueprint-research] No research facts to merge, clearing pending flag`);
            await prisma.blueprint.update({
              where: { conversationId },
              data: { data: { ...latestBlueprint, researchPending: false } },
            });
          }
        } catch (err) {
          console.warn('[blueprint-generate] Background research failed:', err instanceof Error ? err.message : err);
          // Clear pending flag on failure so client doesn't wait forever
          try {
            const record = await prisma.blueprint.findUnique({ where: { conversationId } });
            if (record?.data) {
              await prisma.blueprint.update({
                where: { conversationId },
                data: { data: { ...(record.data as Record<string, unknown>), researchPending: false } },
              });
            }
          } catch { /* best effort */ }
        }
      });
    }

    return NextResponse.json({ blueprint, id: dbBlueprint.id });
  } catch (err: unknown) {
    unregisterGeneration(conversationId);
    if (err instanceof Error && err.name === 'AbortError') {
      const abortReason = controller.signal.reason === 'superseded' ? 'superseded' : 'aborted';
      recordGenerationEvent({
        conversationId,
        scope: 'blueprint-generate',
        provider,
        model,
        finishReason: abortReason,
        durationMs: Date.now() - generationStartedAt,
      });
      return NextResponse.json({ error: 'Generation aborted' }, { status: 499 });
    }
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
