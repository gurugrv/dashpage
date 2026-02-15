import { stepCountIs, streamText } from 'ai';
import { prisma } from '@/lib/db/prisma';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { getPageSystemPrompt } from '@/lib/blueprint/prompts/page-system-prompt';
import { ChatRequestError } from '@/lib/chat/errors';
import { resolveMaxOutputTokens } from '@/lib/chat/constants';
import { createDebugSession } from '@/lib/chat/stream-debug';
import { createWebsiteTools } from '@/lib/chat/tools';
import { TOOL_LABELS, summarizeToolInput, summarizeToolOutput } from '@/lib/blueprint/stream-utils';
import type { Blueprint } from '@/lib/blueprint/types';

const MAX_PAGE_CONTINUATIONS = 2;
const PAGE_CONTINUE_PROMPT = 'The page was not completed. Call writeFiles to append the remaining HTML — do NOT restart from the beginning.';

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

  const maxOutputTokens = resolveMaxOutputTokens(providerConfig, model);
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

      let hasErrors = false;
      const completedPagesMap: Record<string, string> = {};

      // Generate pages sequentially so progress updates are visible one at a time
      for (const page of pages) {
        if (abortSignal.aborted) break;

        // Fresh tool set per page — workingFiles accumulator starts empty
        const { tools: pageTools, workingFiles } = createWebsiteTools({});

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
          let accumulatedResponse = '';

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
                maxOutputTokens,
              });
              result = streamText({
                model: modelInstance,
                system: systemPrompt,
                prompt: pagePrompt,
                maxOutputTokens,
                tools: pageTools,
                stopWhen: stepCountIs(8),
                abortSignal,
              });
            } else {
              const continuationMessages = [
                { role: 'user' as const, content: pagePrompt },
                { role: 'assistant' as const, content: accumulatedResponse },
                { role: 'user' as const, content: PAGE_CONTINUE_PROMPT },
              ];
              debugSession.logPrompt({
                systemPrompt,
                messages: continuationMessages,
                maxOutputTokens,
              });
              result = streamText({
                model: modelInstance,
                system: systemPrompt,
                messages: continuationMessages,
                maxOutputTokens,
                tools: pageTools,
                stopWhen: stepCountIs(8),
                abortSignal,
              });
            }

            for await (const part of result.fullStream) {
              if (part.type === 'text-delta') {
                debugSession.logDelta(part.text);
              } else if (part.type === 'tool-input-start') {
                debugSession.logToolStarting({ toolName: part.toolName, toolCallId: part.id });
                sendEvent({
                  type: 'tool-activity',
                  filename: page.filename,
                  toolCallId: part.id,
                  toolName: part.toolName,
                  status: 'running',
                  label: TOOL_LABELS[part.toolName] ?? part.toolName,
                });
              } else if (part.type === 'tool-call') {
                debugSession.logToolCall({ toolName: part.toolName, toolCallId: part.toolCallId, input: part.input });
                const detail = summarizeToolInput(part.toolName, part.input);
                if (detail) {
                  sendEvent({
                    type: 'tool-activity',
                    filename: page.filename,
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    status: 'running',
                    label: TOOL_LABELS[part.toolName] ?? part.toolName,
                    detail,
                  });
                }
              } else if (part.type === 'tool-result') {
                debugSession.logToolResult({ toolName: part.toolName, toolCallId: part.toolCallId, output: part.output });
                sendEvent({
                  type: 'tool-activity',
                  filename: page.filename,
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  status: 'done',
                  label: TOOL_LABELS[part.toolName] ?? part.toolName,
                  detail: summarizeToolOutput(part.toolName, part.output),
                });
              } else if (part.type === 'tool-error') {
                const rawErr = (part as { error?: unknown }).error;
                const errMsg = rawErr instanceof Error ? rawErr.message.slice(0, 100) : typeof rawErr === 'string' ? rawErr.slice(0, 100) : 'Tool error';
                debugSession.logToolResult({ toolName: part.toolName, toolCallId: part.toolCallId, error: errMsg });
                sendEvent({
                  type: 'tool-activity',
                  filename: page.filename,
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  status: 'error',
                  label: TOOL_LABELS[part.toolName] ?? part.toolName,
                  detail: errMsg,
                });
              }
            }
            debugSession.finish('complete');
            accumulatedResponse += debugSession.getFullResponse();

            const finishReason = await result.finishReason;
            debugSession.logFullResponse(finishReason);

            // writeFiles succeeded — page is complete, no continuation needed
            if (workingFiles[page.filename]) break;

            // Not truncated, just didn't produce output
            if (finishReason !== 'length') break;
          }

          // Extract HTML from workingFiles
          const pageHtml = workingFiles[page.filename]
            // Fallback: check for any file that looks like the page
            ?? Object.values(workingFiles).find(v => v.includes('<!DOCTYPE') || v.includes('<html'));

          if (pageHtml) {
            completedPages += 1;
            sendEvent({
              type: 'page-status',
              filename: page.filename,
              status: 'complete',
              html: pageHtml,
              totalPages,
              completedPages,
            });
            completedPagesMap[page.filename] = pageHtml;
            await prisma.generationState.update({
              where: { conversationId },
              data: { completedPages: completedPagesMap },
            }).catch(() => {});
          } else {
            hasErrors = true;
            sendEvent({
              type: 'page-status',
              filename: page.filename,
              status: 'error',
              error: 'Model did not produce file output via writeFiles',
              totalPages,
              completedPages,
            });
          }
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
