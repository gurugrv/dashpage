import { generateText } from 'ai';
import { prisma } from '@/lib/db/prisma';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { getPageSystemPrompt } from '@/lib/blueprint/prompts/page-system-prompt';
import { ChatRequestError } from '@/lib/chat/errors';
import { isDebugEnabled, logAiPrompt, logAiResponse } from '@/lib/chat/stream-debug';
import type { Blueprint } from '@/lib/blueprint/types';

interface PagesRequestBody {
  conversationId: string;
  provider: string;
  model: string;
  blueprint?: Blueprint;
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

  const { conversationId, provider, model } = body;
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

  const pages = blueprint.pages;
  const totalPages = pages.length;
  const abortSignal = req.signal;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function sendEvent(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      // Send initial pending status for all pages
      for (const page of pages) {
        sendEvent({
          type: 'page-status',
          filename: page.filename,
          status: 'pending',
          totalPages,
          completedPages: 0,
        });
      }

      sendEvent({
        type: 'pipeline-status',
        status: 'generating',
        totalPages,
        completedPages: 0,
      });

      let completedPages = 0;

      const results = await Promise.allSettled(
        pages.map(async (page) => {
          if (abortSignal.aborted) throw new Error('Aborted');

          sendEvent({
            type: 'page-status',
            filename: page.filename,
            status: 'generating',
            totalPages,
            completedPages,
          });

          const systemPrompt = getPageSystemPrompt(blueprint!, page);
          const modelInstance = providerConfig.createModel(apiKey!, model);
          const pagePrompt = `Generate the complete HTML page for "${page.title}" (${page.filename}).`;

          if (isDebugEnabled()) {
            logAiPrompt({
              scope: `blueprint-page:${page.filename}`,
              systemPrompt,
              messages: [{ role: 'user', content: pagePrompt }],
              model,
              provider,
              maxOutputTokens: 16000,
            });
          }

          const result = await generateText({
            model: modelInstance,
            system: systemPrompt,
            prompt: pagePrompt,
            maxOutputTokens: 16000,
            abortSignal,
          });

          if (isDebugEnabled()) {
            logAiResponse({
              scope: `blueprint-page:${page.filename}`,
              response: result.text,
              status: 'complete',
              finishReason: result.finishReason,
            });
          }

          completedPages += 1;

          sendEvent({
            type: 'page-status',
            filename: page.filename,
            status: 'complete',
            html: result.text,
            totalPages,
            completedPages,
          });

          return { filename: page.filename, html: result.text };
        }),
      );

      // Check for errors
      const errors = results
        .map((r, i) => ({ result: r, page: pages[i] }))
        .filter((item): item is { result: PromiseRejectedResult; page: typeof pages[0] } =>
          item.result.status === 'rejected',
        );

      for (const { result, page } of errors) {
        sendEvent({
          type: 'page-status',
          filename: page.filename,
          status: 'error',
          error: result.reason instanceof Error ? result.reason.message : 'Generation failed',
          totalPages,
          completedPages,
        });
      }

      sendEvent({
        type: 'pipeline-status',
        status: errors.length > 0 ? 'error' : 'complete',
        totalPages,
        completedPages,
      });

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
