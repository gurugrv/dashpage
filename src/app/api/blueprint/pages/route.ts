import { hasToolCall, stepCountIs, streamText, type ModelMessage } from 'ai';
import { prisma } from '@/lib/db/prisma';
import { resolveApiKey } from '@/lib/keys/key-manager';
import { PROVIDERS } from '@/lib/providers/registry';
import { getPageSystemPrompt } from '@/lib/blueprint/prompts/page-system-prompt';
import { ChatRequestError } from '@/lib/chat/errors';
import { resolveMaxOutputTokens } from '@/lib/chat/constants';
import { createDebugSession } from '@/lib/chat/stream-debug';
import { createWebsiteTools } from '@/lib/chat/tools';
import { TOOL_LABELS, summarizeToolInput, summarizeToolOutput } from '@/lib/blueprint/stream-utils';
import { validateBlocks } from '@/lib/blocks/validate-blocks';
import * as cheerio from 'cheerio';
import { extractComponents } from '@/lib/blocks/extract-components';
import { postProcessPages } from '@/lib/blueprint/post-process-pages';
import type { Blueprint } from '@/lib/blueprint/types';
import { createOpenRouterModel } from '@/lib/providers/configs/openrouter';

const MAX_PAGE_CONTINUATIONS = 2;
const MAX_CONCURRENT_PAGES = 3;

/**
 * Extract HTML from model text output. Handles:
 * - Raw HTML (<!DOCTYPE html>...</html>)
 * - Markdown code blocks (```html ... ```)
 * Known issue: Gemini models get MALFORMED_FUNCTION_CALL with large tool arguments,
 * outputting HTML as text instead of calling writeFiles.
 */
function extractHtmlFromText(text: string): string | null {
  // Try raw HTML first
  const rawMatch = text.match(/<!DOCTYPE html>[\s\S]*<\/html>/i);
  if (rawMatch) return rawMatch[0];

  // Try markdown code block: ```html ... ```
  const codeBlockMatch = text.match(/```html\s*\n([\s\S]*?)```/i);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim();
    if (content.includes('<html') || content.includes('<!DOCTYPE')) return content;
  }

  // Try any code block that looks like HTML
  const anyBlockMatch = text.match(/```\s*\n(<!DOCTYPE html>[\s\S]*?<\/html>)\s*\n?```/i);
  if (anyBlockMatch) return anyBlockMatch[1];

  return null;
}

/**
 * Extract a compact summary of resources (images/icons) from previous response messages.
 * Walks tool-call/tool-result pairs and pulls out just the useful URLs and SVGs,
 * discarding verbose metadata that bloats continuation context.
 */
function extractResourceSummary(messages: ModelMessage[]): string {
  const images: string[] = [];
  const icons: string[] = [];

  for (const msg of messages) {
    const parts = Array.isArray(msg.content) ? msg.content : [];
    for (const part of parts) {
      if (!('type' in part) || part.type !== 'tool-result') continue;
      const toolResult = part as { type: 'tool-result'; toolName?: string; output?: unknown };
      if (typeof toolResult.output !== 'object' || !toolResult.output) continue;
      const result = toolResult.output as Record<string, unknown>;
      const toolName = toolResult.toolName;

      // searchImages results: { results: [{ query, images: [{ url, alt }] }] }
      if (toolName === 'searchImages') {
        const results = (result.results ?? result.queries) as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(results)) {
          for (const group of results) {
            const imgs = group.images as Array<Record<string, string>> | undefined;
            if (Array.isArray(imgs)) {
              for (const img of imgs) {
                if (img.url) images.push(`[${img.alt || group.query || 'image'}] ${img.url}`);
              }
            }
          }
        }
      }

      // searchIcons results: { results: [{ query, icons: [{ name, svg }] }] }
      if (toolName === 'searchIcons') {
        const results = result.results as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(results)) {
          for (const group of results) {
            const svgs = group.icons as Array<Record<string, string>> | undefined;
            if (Array.isArray(svgs)) {
              for (const icon of svgs) {
                if (icon.svg) icons.push(`[${icon.name || group.query || 'icon'}] ${icon.svg}`);
              }
            }
          }
        }
      }
    }
  }

  const sections: string[] = [];
  if (images.length > 0) sections.push(`Available images:\n${images.join('\n')}`);
  if (icons.length > 0) sections.push(`Available icons:\n${icons.join('\n')}`);
  return sections.join('\n\n');
}

/**
 * Build a lightweight continuation prompt that avoids passing full message history.
 * Instead of cumulative messages (which grow with each retry), we extract just the
 * useful resources and send a fresh prompt with clear instructions.
 */
function buildLightweightContinuePrompt(
  filename: string,
  prevMessages: ModelMessage[],
  writeFilesAttempted: boolean,
): string {
  const resources = extractResourceSummary(prevMessages);

  const instruction = writeFilesAttempted
    ? `Your previous file write call was cut off due to output length limits. Call writeFile again with the COMPLETE HTML.`
    : `You gathered resources but did not write the file. Call writeFile now with the complete HTML.`;

  return [
    instruction,
    '',
    `writeFile({ filename: "${filename}", content: "<!DOCTYPE html>..." })`,
    '',
    `The "content" must be the complete HTML string starting with <!DOCTYPE html>. Generate the full page content — no placeholders or abbreviated content.`,
    '',
    resources,
  ].filter(Boolean).join('\n');
}

interface PagesRequestBody {
  conversationId: string;
  provider: string;
  model: string;
  maxOutputTokens?: number;
  blueprint?: Blueprint;
  headerHtml?: string;
  footerHtml?: string;
  headTags?: string;
  stylesCss?: string;
  scriptsJs?: string;
  skipPages?: string[];
  imageProvider?: 'pexels' | 'together';
  imageModel?: string;
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

  const { conversationId, provider, model, maxOutputTokens: clientMaxTokens, headerHtml, footerHtml, headTags, stylesCss, scriptsJs, skipPages } = body;
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

  const maxOutputTokens = resolveMaxOutputTokens(providerConfig, model, clientMaxTokens);
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

      // --- Concurrency-limited parallel page generation ---

      /** Unescape JSON string escape sequences in streaming deltas */
      function unescapeJson(text: string): string {
        return text
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\r/g, '\r')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
      }

      async function generateSinglePage(page: typeof pages[number]) {
        if (abortSignal.aborted) return;

        // Fresh tool set per page — exclude edit tools not needed during generation
        const PAGE_GEN_TOOLS = new Set(['writeFile', 'writeFiles', 'readFile', 'searchImages', 'searchIcons', 'webSearch', 'fetchUrl']);
        const { tools: pageTools, workingFiles } = createWebsiteTools({}, { toolSubset: PAGE_GEN_TOOLS, imageProvider: body.imageProvider, imageModel: body.imageModel });

        sendEvent({
          type: 'page-status',
          filename: page.filename,
          status: 'generating',
          totalPages,
          completedPages,
        });

        const sharedHtml = headerHtml && footerHtml ? { headerHtml, footerHtml } : undefined;
        const sharedAssets = stylesCss || scriptsJs ? { stylesCss, scriptsJs } : undefined;
        const systemPrompt = getPageSystemPrompt(blueprint!, page, sharedHtml, headTags, sharedAssets);
        // Disable reasoning tokens for page generation — models spend their output budget
        // on invisible thinking instead of producing HTML tool calls
        const modelInstance = provider === 'OpenRouter'
          ? createOpenRouterModel(apiKey!, model, 'none')
          : providerConfig.createModel(apiKey!, model);
        const pagePrompt = `Generate the complete HTML page for "${page.title}" (${page.filename}).`;

        let prevMessages: ModelMessage[] = [];
        let prevSegmentToolInputs = '';  // Degenerate loop detection
        let writeFilesAttempted = false;
        let toolCallCount = 0;
        let segmentsWithoutWriteFiles = 0;
        let allTextOutput = '';  // Accumulate text across all segments for fallback
        let pageSummary: string | undefined;  // Extracted from writeFile/writeFiles summary field

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
              stopWhen: [hasToolCall('writeFile'), hasToolCall('writeFiles'), stepCountIs(8)],
              abortSignal,
            });
          } else {
            // Lightweight continuation: extract resources, discard full message history
            const continuationPrompt = buildLightweightContinuePrompt(
              page.filename,
              prevMessages,
              writeFilesAttempted,
            );
            debugSession.logPrompt({
              systemPrompt,
              messages: [{ role: 'system', content: `[lightweight continuation seg=${segment}, writeFilesAttempted=${writeFilesAttempted}]` }],
              maxOutputTokens,
            });
            result = streamText({
              model: modelInstance,
              system: systemPrompt,
              prompt: continuationPrompt,
              maxOutputTokens,
              tools: pageTools,
              stopWhen: [hasToolCall('writeFile'), hasToolCall('writeFiles'), stepCountIs(8)],
              abortSignal,
            });
          }

          // Per-segment streaming state for writeFiles code deltas
          let writeFilesToolId: string | null = null;
          let writeFilesJsonBuffer = '';
          let writeFilesContentStarted = false;
          let segmentTextBuffer = '';  // Accumulate text output for fallback extraction

          for await (const part of result.fullStream) {
            if (part.type === 'text-delta') {
              debugSession.logDelta(part.text);
              segmentTextBuffer += part.text;
            } else if (part.type === 'tool-input-delta' && part.id !== writeFilesToolId) {
              debugSession.logToolInputDelta({ toolCallId: part.id, delta: part.delta });
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
              // Track writeFile/writeFiles tool for streaming code deltas
              if (part.toolName === 'writeFiles' || part.toolName === 'writeFile') {
                writeFilesToolId = part.id;
                writeFilesJsonBuffer = '';
                writeFilesContentStarted = false;
                writeFilesAttempted = true;
              }
            } else if (part.type === 'tool-input-delta' && writeFilesToolId && part.id === writeFilesToolId) {
              writeFilesJsonBuffer += part.delta;
              if (!writeFilesContentStarted) {
                // Match writeFiles format: {"files":{"filename.html":"
                // OR writeFile format: {"filename":"...","content":"
                const multiMatch = writeFilesJsonBuffer.match(/"files"\s*:\s*\{\s*"[^"]+"\s*:\s*"/);
                const singleMatch = !multiMatch && writeFilesJsonBuffer.match(/"content"\s*:\s*"/);
                const match = multiMatch ?? singleMatch;
                if (match) {
                  writeFilesContentStarted = true;
                  const contentStart = writeFilesJsonBuffer.indexOf(match[0]) + match[0].length;
                  const initialContent = writeFilesJsonBuffer.slice(contentStart);
                  if (initialContent) {
                    sendEvent({
                      type: 'code-delta',
                      filename: page.filename,
                      delta: unescapeJson(initialContent),
                    });
                  }
                }
              } else {
                sendEvent({
                  type: 'code-delta',
                  filename: page.filename,
                  delta: unescapeJson(part.delta),
                });
              }
            } else if (part.type === 'tool-call') {
              toolCallCount++;
              debugSession.logToolCall({ toolName: part.toolName, toolCallId: part.toolCallId, input: part.input });
              // Extract summary from writeFile/writeFiles tool calls
              if ((part.toolName === 'writeFile' || part.toolName === 'writeFiles') && part.input) {
                const input = part.input as Record<string, unknown>;
                if (typeof input.summary === 'string' && input.summary.trim()) {
                  pageSummary = input.summary.trim();
                }
              }
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

          // Collect response messages for resource extraction (used by lightweight continuation)
          const response = await result.response;
          const responseMessages = response.messages;
          if (segment === 0) {
            prevMessages = [
              { role: 'user' as const, content: pagePrompt },
              ...responseMessages,
            ];
          } else {
            // Only keep latest segment's messages — we extract resources, not replay history
            prevMessages = responseMessages;
          }

          const finishReason = await result.finishReason;
          const pageUsage = await result.usage;
          debugSession.logFullResponse(finishReason);
          debugSession.logGenerationSummary?.({
            finishReason,
            hasFileOutput: !!workingFiles[page.filename],
            toolCallCount,
            usage: pageUsage,
          });

          // Normalize filenames: models sometimes hallucinate prefixes like _about.html
          for (const key of Object.keys(workingFiles)) {
            const normalized = key.replace(/^_/, '').toLowerCase();
            if (normalized !== key && !workingFiles[normalized]) {
              workingFiles[normalized] = workingFiles[key];
            }
          }

          // writeFiles succeeded — page is complete, no continuation needed
          if (workingFiles[page.filename]) break;

          // Accumulate text across segments for fallback extraction
          allTextOutput += segmentTextBuffer;

          // If model output HTML as text (not via writeFiles), extract and use it.
          // Known issue: Gemini models get MALFORMED_FUNCTION_CALL with large tool arguments
          // and fall back to outputting HTML as text instead of calling writeFiles.
          if (allTextOutput) {
            const extracted = extractHtmlFromText(allTextOutput);
            if (extracted) {
              workingFiles[page.filename] = extracted;
              console.warn(`[blueprint-page:${page.filename}] Extracted HTML from text output (model did not use writeFiles)`);
              break;
            }
          }

          // Continue if truncated OR if model stopped without ever attempting writeFile
          // (reasoning-exhausted case: finishReason=stop but no output produced)
          const shouldContinue = finishReason === 'length'
            || (!workingFiles[page.filename] && !writeFilesAttempted && segment < MAX_PAGE_CONTINUATIONS);
          if (!shouldContinue) break;

          // Track segments where writeFiles was never even attempted
          if (!writeFilesJsonBuffer) {
            segmentsWithoutWriteFiles++;
          } else {
            segmentsWithoutWriteFiles = 0;
          }

          // Detect degenerate loops
          const currentToolInputs = writeFilesJsonBuffer;
          if (prevSegmentToolInputs && currentToolInputs === prevSegmentToolInputs) {
            debugSession.logToolResult?.({ toolCallId: 'auto-continue', error: 'Degenerate loop detected — stopping page continuation' });
            break;
          }
          // If writeFiles was never attempted for 2 segments, model is confused — stop
          if (segmentsWithoutWriteFiles >= 2) {
            debugSession.logToolResult?.({ toolCallId: 'auto-continue', error: 'writeFiles never attempted across 2 segments — stopping' });
            break;
          }
          prevSegmentToolInputs = currentToolInputs;
        }

        // Extract HTML from workingFiles
        let pageHtml: string | undefined = workingFiles[page.filename]
          // Fallback: check for any file that looks like the page
          ?? Object.values(workingFiles).find(v => v.includes('<!DOCTYPE') || v.includes('<html'));

        // Text fallback: if writeFiles didn't produce output, try extracting from accumulated text
        if (!pageHtml && allTextOutput) {
          pageHtml = extractHtmlFromText(allTextOutput) ?? undefined;
          if (pageHtml) {
            console.warn(`[blueprint-page:${page.filename}] Extracted HTML from accumulated text output (writeFiles fallback)`);
          }
        }

        // Last resort: extract text from AI SDK response messages
        if (!pageHtml) {
          const responseText = prevMessages
            .filter(m => m.role === 'assistant')
            .map(m => {
              if (typeof m.content === 'string') return m.content;
              if (Array.isArray(m.content)) {
                return (m.content as Array<{ type: string; text?: string }>)
                  .filter(p => p.type === 'text' && p.text)
                  .map(p => p.text)
                  .join('');
              }
              return '';
            })
            .join('\n');
          pageHtml = extractHtmlFromText(responseText) ?? undefined;
          if (pageHtml) {
            console.warn(`[blueprint-page:${page.filename}] Extracted HTML from response messages (writeFiles fallback)`);
          }
        }

        if (pageHtml) {
          // Post-process: ensure all semantic elements have data-block attributes
          const singleFileMap = { [page.filename]: pageHtml };
          validateBlocks(singleFileMap);
          pageHtml = singleFileMap[page.filename];

          // Deterministically set data-current-page on the header/nav element
          // AI often copies the shared header verbatim without updating this attribute
          const $ = cheerio.load(pageHtml);
          $('header, nav').first().attr('data-current-page', page.filename);
          pageHtml = $.html({ decodeEntities: false });

          completedPages += 1;
          sendEvent({
            type: 'page-status',
            filename: page.filename,
            status: 'complete',
            html: pageHtml,
            totalPages,
            completedPages,
            ...(pageSummary ? { summary: pageSummary } : {}),
          });
          completedPagesMap[page.filename] = pageHtml;
          // Fire-and-forget: don't block semaphore slot release on DB write
          prisma.generationState.update({
            where: { conversationId },
            data: { completedPages: completedPagesMap },
          }).catch((err) => {
            // P2025 = record not found; expected if generation state was already cleaned up
            if (err?.code !== 'P2025') console.error('[blueprint/pages] Failed to persist completedPages:', err);
          });
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
      }

      // Semaphore for concurrency limiting
      let running = 0;
      const waitQueue: (() => void)[] = [];

      async function acquireSlot() {
        if (running >= MAX_CONCURRENT_PAGES) {
          await new Promise<void>(resolve => { waitQueue.push(resolve); });
        }
        running++;
      }

      function releaseSlot() {
        running--;
        if (waitQueue.length > 0) {
          const next = waitQueue.shift()!;
          next();
        }
      }

      const results = await Promise.allSettled(
        pages.map(async (page) => {
          await acquireSlot();
          try {
            await generateSinglePage(page);
          } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') return;
            hasErrors = true;
            sendEvent({
              type: 'page-status',
              filename: page.filename,
              status: 'error',
              error: err instanceof Error ? err.message : 'Generation failed',
              totalPages,
              completedPages,
            });
          } finally {
            releaseSlot();
          }
        }),
      );

      // Check for any unhandled rejections
      for (const result of results) {
        if (result.status === 'rejected') {
          hasErrors = true;
        }
      }

      // Extract shared components (nav/footer) across all completed pages
      if (Object.keys(completedPagesMap).length >= 2) {
        try {
          extractComponents(completedPagesMap);
          // Send updated files (with _components/ entries) to the client
          if (Object.keys(completedPagesMap).some(f => f.startsWith('_components/'))) {
            sendEvent({
              type: 'components-extracted',
              files: completedPagesMap,
            });
          }
        } catch (err) {
          console.warn('[blueprint-pages] extractComponents error:', err);
        }
      }

      // Post-process: deduplicate CSS, JS, and inline styles
      if (stylesCss) completedPagesMap['styles.css'] = stylesCss;
      if (scriptsJs) completedPagesMap['scripts.js'] = scriptsJs;
      try {
        postProcessPages(completedPagesMap, headTags);
        if (completedPagesMap['styles.css'] || completedPagesMap['scripts.js']) {
          sendEvent({
            type: 'post-processed',
            files: completedPagesMap,
          });
        }
      } catch (err) {
        console.warn('[blueprint-pages] postProcessPages error:', err);
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
