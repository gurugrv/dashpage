import { stepCountIs, streamText } from 'ai';
import { prisma } from '@/lib/db/prisma';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { getPageSystemPrompt } from '@/lib/blueprint/prompts/page-system-prompt';
import { ChatRequestError } from '@/lib/chat/errors';
import { createDebugSession } from '@/lib/chat/stream-debug';
import { createImageTools } from '@/lib/chat/tools/image-tools';
import { createWebTools } from '@/lib/chat/tools/web-tools';
import type { Blueprint } from '@/lib/blueprint/types';

const MAX_PAGE_CONTINUATIONS = 2;
const PAGE_CONTINUE_PROMPT = 'Continue generating the HTML from exactly where you left off. Do not repeat any previously generated content.';

/** Strip markdown code fences (```html ... ```) that LLMs sometimes wrap around output. */
function stripCodeFences(text: string): string {
  return text.replace(/^\s*```\w*\n?/, '').replace(/\n?```\s*$/, '');
}

interface PagesRequestBody {
  conversationId: string;
  provider: string;
  model: string;
  blueprint?: Blueprint;
  headerHtml?: string;
  footerHtml?: string;
  headTags?: string;
  skipPages?: string[];
}

export async function POST(req: Request) {
  let body: PagesRequestBody;
  try {
    body = await req.json() as PagesRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { conversationId, provider, model, headerHtml, footerHtml, headTags, skipPages } = body;
  let blueprint = body.blueprint;

  if (!conversationId || !provider || !model) {
    return new Response(JSON.stringify({ error: 'conversationId, provider, and model are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fetch blueprint from DB if not provided
  if (!blueprint) {
    const dbBlueprint = await prisma.blueprint.findUnique({
      where: { conversationId },
    });
    if (!dbBlueprint) {
      return new Response(JSON.stringify({ error: 'Blueprint not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    blueprint = dbBlueprint.data as Blueprint;
  }

  // Resolve API key and provider
  let apiKey: string | null;
  try {
    apiKey = await resolveApiKey(provider);
    if (!apiKey) throw new ChatRequestError(`No API key for ${provider}`);
  } catch (err: unknown) {
    if (err instanceof ChatRequestError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw err;
  }

  const providerConfig = PROVIDERS[provider];
  if (!providerConfig) {
    return new Response(JSON.stringify({ error: `Unknown provider: ${provider}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const allPages = blueprint.pages;
  const totalPages = allPages.length;
  const skipSet = new Set(skipPages ?? []);
  const pages = allPages.filter(p => !skipSet.has(p.filename));
  const abortSignal = req.signal;

  // Checkpoint: entering page generation phase with shared styles
  if (headTags) {
    await prisma.generationState.update({
      where: { conversationId },
      data: {
        phase: 'generating-pages',
        sharedStyles: { headTags },
      },
    }).catch(() => {});
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function sendEvent(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      let completedPages = totalPages - pages.length; // Start from already-completed count

      // Send status for already-completed (skipped) pages
      for (const page of allPages) {
        if (skipSet.has(page.filename)) {
          sendEvent({
            type: 'page-status',
            filename: page.filename,
            status: 'complete',
            totalPages,
            completedPages,
          });
        }
      }

      // Send pending status for remaining pages
      for (const page of pages) {
        sendEvent({
          type: 'page-status',
          filename: page.filename,
          status: 'pending',
          totalPages,
          completedPages,
        });
      }

      sendEvent({
        type: 'pipeline-status',
        status: 'generating',
        totalPages,
        completedPages,
      });

      const blueprintTools = {
        ...createImageTools(),
        ...createWebTools(),
      };

      let hasErrors = false;
      const completedPagesMap: Record<string, string> = {};

      // Generate pages sequentially so progress updates are visible one at a time
      for (const page of pages) {
        if (abortSignal.aborted) break;

        sendEvent({
          type: 'page-status',
          filename: page.filename,
          status: 'generating',
          totalPages,
          completedPages,
        });

        const sharedHtml = headerHtml && footerHtml ? { headerHtml, footerHtml } : undefined;
        const systemPrompt = getPageSystemPrompt(blueprint!, page, sharedHtml, headTags);
        const modelInstance = providerConfig.createModel(apiKey!, model);
        const pagePrompt = `Generate the complete HTML page for "${page.title}" (${page.filename}).`;

        try {
          let fullPageText = '';

          for (let segment = 0; segment <= MAX_PAGE_CONTINUATIONS; segment++) {
            if (abortSignal.aborted) break;

            const debugSession = createDebugSession({
              scope: `blueprint-page:${page.filename}${segment > 0 ? `:cont${segment}` : ''}`,
              model,
              provider,
              conversationId,
            });

            let result;
            if (segment === 0) {
              debugSession.logPrompt({
                systemPrompt,
                messages: [{ role: 'user', content: pagePrompt }],
                maxOutputTokens: 16000,
              });
              result = streamText({
                model: modelInstance,
                system: systemPrompt,
                prompt: pagePrompt,
                maxOutputTokens: 16000,
                tools: blueprintTools,
                stopWhen: stepCountIs(3),
                abortSignal,
              });
            } else {
              const continuationMessages = [
                { role: 'user' as const, content: pagePrompt },
                { role: 'assistant' as const, content: fullPageText },
                { role: 'user' as const, content: PAGE_CONTINUE_PROMPT },
              ];
              debugSession.logPrompt({
                systemPrompt,
                messages: continuationMessages,
                maxOutputTokens: 16000,
              });
              result = streamText({
                model: modelInstance,
                system: systemPrompt,
                messages: continuationMessages,
                maxOutputTokens: 16000,
                abortSignal,
              });
            }

            for await (const delta of result.textStream) {
              debugSession.logDelta(delta);
            }
            debugSession.finish('complete');

            fullPageText += debugSession.getFullResponse();
            const finishReason = await result.finishReason;
            debugSession.logFullResponse(finishReason);

            if (finishReason !== 'length') break;
          }

          completedPages += 1;

          sendEvent({
            type: 'page-status',
            filename: page.filename,
            status: 'complete',
            html: stripCodeFences(fullPageText),
            totalPages,
            completedPages,
          });

          // Checkpoint completed page to DB
          completedPagesMap[page.filename] = stripCodeFences(fullPageText);
          await prisma.generationState.update({
            where: { conversationId },
            data: { completedPages: completedPagesMap },
          }).catch(() => {});
        } catch (err: unknown) {
          if (err instanceof Error && err.name === 'AbortError') break;
          hasErrors = true;
          sendEvent({
            type: 'page-status',
            filename: page.filename,
            status: 'error',
            error: err instanceof Error ? err.message : 'Generation failed',
            totalPages,
            completedPages,
          });
        }
      }

      sendEvent({
        type: 'pipeline-status',
        status: hasErrors ? 'error' : 'complete',
        totalPages,
        completedPages,
      });

      // Clean up generation state on successful completion
      if (!hasErrors) {
        await prisma.generationState.delete({
          where: { conversationId },
        }).catch(() => {});
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
