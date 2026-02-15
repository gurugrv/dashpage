import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, stepCountIs, streamText, type FinishReason, type UIMessageChunk } from 'ai';
import type { UIMessage } from 'ai';
import { ChatRequestError } from '@/lib/chat/errors';
import { resolveChatExecution } from '@/lib/chat/resolve-chat-execution';
import { createWebsiteTools, createSinglePageTools } from '@/lib/chat/tools';
import { createDebugSession } from '@/lib/chat/stream-debug';
import { BuildProgressDetector } from '@/lib/stream/build-progress-detector';
import type { ToolActivityEvent } from '@/types/build-progress';
import { prisma } from '@/lib/db/prisma';

interface ChatRequestBody {
  messages: Array<Omit<UIMessage, 'id'>>;
  currentFiles?: Record<string, string>;
  provider: string;
  model: string;
  maxOutputTokens?: number;
  savedTimeZone?: string | null;
  browserTimeZone?: string;
  conversationId?: string;
}

const MAX_CONTINUATION_SEGMENTS = 3;
const CONTINUE_PROMPT_MULTIPAGE = 'Continue from where you left off. Append the remaining content — do NOT restart files from the beginning.';
const CONTINUE_PROMPT_SINGLEPAGE = 'Continue from where you left off. Append the remaining HTML — do NOT restart from <!DOCTYPE html> or <head>.';

function isStreamPart(part: unknown): part is { type: string; [key: string]: unknown } {
  return typeof part === 'object' && part !== null && 'type' in part;
}

const TOOL_LABELS: Record<string, string> = {
  writeFiles: 'Writing files',
  editDOM: 'Applying edits',
  editFiles: 'Editing files',
  readFile: 'Reading file',
  searchImages: 'Adding images',
  searchIcons: 'Adding icons',
  fetchUrl: 'Loading content',
  webSearch: 'Researching content',
};

function summarizeToolInput(toolName: string, input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const inp = input as Record<string, unknown>;
  switch (toolName) {
    case 'webSearch':
      return typeof inp.query === 'string' ? inp.query : undefined;
    case 'searchImages':
      return typeof inp.query === 'string' ? inp.query : undefined;
    case 'searchIcons':
      return typeof inp.query === 'string' ? inp.query : undefined;
    case 'fetchUrl':
      return typeof inp.url === 'string' ? inp.url : undefined;
    case 'writeFiles':
      if (inp.files && typeof inp.files === 'object') {
        const names = Object.keys(inp.files as Record<string, unknown>);
        return names.join(', ');
      }
      return undefined;
    case 'editDOM':
      return typeof inp.file === 'string' ? inp.file : undefined;
    case 'editFiles': {
      const edits = inp.edits as Array<{ file?: string }> | undefined;
      return edits ? edits.map(e => e.file).filter(Boolean).join(', ') : undefined;
    }
    case 'readFile':
      return typeof inp.file === 'string' ? inp.file : undefined;
    default:
      return undefined;
  }
}

function summarizeToolOutput(toolName: string, output: unknown): string | undefined {
  if (!output || typeof output !== 'object') return undefined;
  const out = output as Record<string, unknown>;
  if (out.success === false) {
    return typeof out.error === 'string' ? out.error.slice(0, 80) : 'Failed';
  }
  switch (toolName) {
    case 'webSearch': {
      const results = out.results as unknown[] | undefined;
      const source = out.source as string | undefined;
      if (results) return `${results.length} result${results.length !== 1 ? 's' : ''}${source ? ` from ${source}` : ''}`;
      return undefined;
    }
    case 'searchImages': {
      const images = out.images as unknown[] | undefined;
      if (images) return images.length > 0 ? `${images.length} image${images.length !== 1 ? 's' : ''} found` : 'No images found';
      return undefined;
    }
    case 'searchIcons': {
      const icons = out.icons as unknown[] | undefined;
      if (icons) return icons.length > 0 ? `${icons.length} icon${icons.length !== 1 ? 's' : ''} found` : 'No icons found';
      return undefined;
    }
    case 'fetchUrl':
      return out.truncated ? 'Content fetched (truncated)' : 'Content fetched';
    case 'writeFiles': {
      const fileNames = out.fileNames as string[] | undefined;
      if (fileNames) return `${fileNames.length} file${fileNames.length !== 1 ? 's' : ''} written`;
      return undefined;
    }
    case 'editFiles': {
      const results = out.results as Array<Record<string, unknown>> | undefined;
      if (results) {
        const ok = results.filter(r => r.success !== false).length;
        return `${ok}/${results.length} file${results.length !== 1 ? 's' : ''} edited`;
      }
      return 'Edits applied';
    }
    case 'readFile':
      return typeof out.length === 'number' ? `${out.length} chars` : 'File read';
    default:
      return undefined;
  }
}

export async function POST(req: Request) {
  let body: ChatRequestBody;
  try {
    body = await req.json() as ChatRequestBody;
  } catch {
    return Response.json({ error: 'Invalid or empty request body' }, { status: 400 });
  }

  const {
    messages,
    currentFiles,
    provider,
    model,
    maxOutputTokens,
    savedTimeZone,
    browserTimeZone,
    conversationId: clientConversationId,
  } = body;

  try {
    const {
      modelInstance,
      maxOutputTokens: resolvedMaxOutputTokens,
      systemPromptParts,
      systemPrompt,
      provider: resolvedProvider,
    } = await resolveChatExecution({
      provider,
      model,
      clientMaxTokens: maxOutputTokens,
      savedTimeZone,
      browserTimeZone,
      currentFiles,
    });

    const isAnthropicDirect = resolvedProvider === 'anthropic';

    const fileCount = Object.keys(currentFiles ?? {}).length;
    // Single-page mode: only when editing an existing single-page site (exactly 1 file).
    // First generation (0 files) and multi-page (>1 files) use full tool set.
    const isSinglePageEdit = fileCount === 1;
    const { tools, workingFiles: _workingFiles } = isSinglePageEdit
      ? createSinglePageTools(currentFiles ?? {})
      : createWebsiteTools(currentFiles ?? {});
    const continuePrompt = isSinglePageEdit ? CONTINUE_PROMPT_SINGLEPAGE : CONTINUE_PROMPT_MULTIPAGE;
    const isEditing = fileCount > 0;
    const detector = new BuildProgressDetector();
    const debugSession = createDebugSession({
      scope: 'chat',
      model,
      provider,
      conversationId: clientConversationId,
    });

    // Log the prompt being sent to the AI
    const messagesForLogging = messages.map((msg) => ({
      role: msg.role,
      content: msg.parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('\n'),
    }));
    debugSession.logPrompt({
      systemPrompt,
      messages: messagesForLogging,
      maxOutputTokens: resolvedMaxOutputTokens,
    });

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        let continuationMessages = [...messages];
        let finalFinishReason: FinishReason | undefined;
        const toolCallNames = new Map<string, string>();

        // Track whether file-producing tools were called (for incomplete generation detection)
        let hasFileOutput = false;
        const FILE_PRODUCING_TOOLS = new Set(['writeFiles', 'editDOM', 'editFiles']);

        // Tool-aware monotonic progress tracker
        const TOOL_START_PERCENT: Record<string, number> = {
          searchImages: 18,
          searchIcons: 18,
          webSearch: 18,
          fetchUrl: 18,
          readFile: 28,
          writeFiles: 32,
          editDOM: 32,
          editFiles: 32,
        };
        const TOOL_END_PERCENT: Record<string, number> = {
          searchImages: 28,
          searchIcons: 28,
          webSearch: 28,
          fetchUrl: 28,
          readFile: 30,
          writeFiles: 92,
          editDOM: 90,
          editFiles: 90,
        };
        let maxPercent = 0;

        function bumpPercent(percent: number): number {
          if (percent > maxPercent) maxPercent = percent;
          return maxPercent;
        }

        try {
          for (let segment = 0; segment < MAX_CONTINUATION_SEGMENTS; segment += 1) {
            let segmentText = '';
            // For Anthropic: pass system prompt as two SystemModelMessages — the stable part
            // with cacheControl to enable prompt caching (~90% cost reduction on cache hits),
            // and the dynamic part without. Anthropic concatenates system messages in order.
            // For all other providers: use system string as before (OpenAI auto-caches >= 1024 tokens).
            const systemOption = isAnthropicDirect
              ? [
                  {
                    role: 'system' as const,
                    content: systemPromptParts.stable,
                    providerOptions: {
                      anthropic: { cacheControl: { type: 'ephemeral' } },
                    },
                  },
                  {
                    role: 'system' as const,
                    content: systemPromptParts.dynamic,
                  },
                ]
              : systemPrompt;

            const result = streamText({
              model: modelInstance,
              system: systemOption,
              messages: await convertToModelMessages(continuationMessages),
              maxOutputTokens: resolvedMaxOutputTokens,
              tools,
              stopWhen: stepCountIs(10),
              abortSignal: req.signal,
            });
            const sourceStream = result.toUIMessageStream({ sendStart: segment === 0, sendFinish: false });

            for await (const part of sourceStream) {
              writer.write(part);

              if (!isStreamPart(part)) continue;

              // Text delta: track for debug + progress (only if detector percent exceeds tool-driven maxPercent)
              if (part.type === 'text-delta' && typeof part.delta === 'string') {
                debugSession.logDelta(part.delta);
                segmentText += part.delta;
                const progress = detector.processDelta(part.delta);
                if (progress && (progress.percent > maxPercent || maxPercent < 5)) {
                  writer.write({
                    type: 'data-buildProgress',
                    data: {
                      phase: isEditing ? 'edit-applying' as const : 'generating' as const,
                      label: progress.label,
                      file: 'index.html',
                      percent: bumpPercent(Math.max(progress.percent, 5)),
                      timestamp: Date.now(),
                    },
                    transient: true,
                  });
                }
              }

              // Tool lifecycle: debug logging + progress + activity events
              if (part.type === 'tool-input-start') {
                const toolName = part.toolName as string;
                const toolCallId = part.toolCallId as string;
                toolCallNames.set(toolCallId, toolName);
                debugSession.logToolStarting({ toolName, toolCallId });

                const progressLabels: Record<string, string> = {
                  writeFiles: 'Generating code...',
                  editDOM: 'Applying edits...',
                  editFiles: 'Applying edits...',
                  readFile: 'Reading file...',
                  searchImages: 'Adding images...',
                  searchIcons: 'Adding icons...',
                  fetchUrl: 'Loading content...',
                  webSearch: 'Researching content...',
                };

                writer.write({
                  type: 'data-buildProgress',
                  data: {
                    phase: isEditing ? 'edit-applying' as const : 'generating' as const,
                    label: progressLabels[toolName] ?? 'Processing...',
                    file: 'index.html',
                    percent: bumpPercent(TOOL_START_PERCENT[toolName] ?? maxPercent),
                    timestamp: Date.now(),
                  },
                  transient: true,
                });

                writer.write({
                  type: 'data-toolActivity',
                  data: {
                    toolCallId,
                    toolName,
                    status: 'running',
                    label: TOOL_LABELS[toolName] ?? toolName,
                    timestamp: Date.now(),
                  } satisfies ToolActivityEvent,
                  transient: true,
                });
              }
              if (part.type === 'tool-input-available') {
                const toolName = part.toolName as string;
                const toolCallId = part.toolCallId as string;
                const input = (part as { input?: unknown }).input;
                debugSession.logToolCall({ toolName, toolCallId, input });

                const detail = summarizeToolInput(toolName, input);
                if (detail) {
                  writer.write({
                    type: 'data-toolActivity',
                    data: {
                      toolCallId,
                      toolName,
                      status: 'running',
                      label: TOOL_LABELS[toolName] ?? toolName,
                      detail,
                      timestamp: Date.now(),
                    } satisfies ToolActivityEvent,
                    transient: true,
                  });
                }
              }
              if (part.type === 'tool-output-available') {
                const toolCallId = part.toolCallId as string;
                const toolName = toolCallNames.get(toolCallId) ?? '';
                const output = (part as { output?: unknown }).output;
                debugSession.logToolResult({ toolCallId, output });

                // Track file-producing tool completions
                if (FILE_PRODUCING_TOOLS.has(toolName)) {
                  const out = output as Record<string, unknown> | undefined;
                  if (out && out.success !== false) hasFileOutput = true;
                }

                const TOOL_END_LABELS: Record<string, string> = {
                  writeFiles: 'Code generated',
                  searchImages: 'Images found',
                  searchIcons: 'Icons found',
                  webSearch: 'Search complete',
                  fetchUrl: 'Content fetched',
                  readFile: 'File read',
                  editDOM: 'Edits applied',
                  editFiles: 'Edits applied',
                };
                const endLabel = TOOL_END_LABELS[toolName] ?? 'Processing...';
                writer.write({
                  type: 'data-buildProgress',
                  data: {
                    phase: isEditing ? 'edit-applying' as const : 'generating' as const,
                    label: endLabel,
                    file: 'index.html',
                    percent: bumpPercent(TOOL_END_PERCENT[toolName] ?? maxPercent),
                    timestamp: Date.now(),
                  },
                  transient: true,
                });

                writer.write({
                  type: 'data-toolActivity',
                  data: {
                    toolCallId,
                    toolName,
                    status: 'done',
                    label: TOOL_LABELS[toolName] ?? toolName,
                    detail: summarizeToolOutput(toolName, output),
                    timestamp: Date.now(),
                  } satisfies ToolActivityEvent,
                  transient: true,
                });
              }
              if (part.type === 'tool-output-error') {
                const toolCallId = part.toolCallId as string;
                const toolName = toolCallNames.get(toolCallId) ?? '';
                const errorText = (part as { errorText?: string }).errorText || 'Unknown tool error';
                debugSession.logToolResult({ toolCallId, error: errorText });

                writer.write({
                  type: 'data-toolActivity',
                  data: {
                    toolCallId,
                    toolName,
                    status: 'error',
                    label: TOOL_LABELS[toolName] ?? toolName,
                    detail: errorText.slice(0, 100),
                    timestamp: Date.now(),
                  } satisfies ToolActivityEvent,
                  transient: true,
                });
              }
            }

            finalFinishReason = await result.finishReason;

            // Log Anthropic cache stats if available
            if (isAnthropicDirect) {
              const metadata = await result.providerMetadata;
              debugSession.logCacheStats?.(metadata?.anthropic);
            }

            // Auto-continue when:
            // 1. Output was truncated (finish reason 'length'), OR
            // 2. Model gathered assets (tool activity) but never produced files —
            //    common with models that stop early with finish reason 'other'
            // For single-page mode: text HTML output counts as file output
            const hadToolActivity = toolCallNames.size > 0;
            const hasTextHtml = isSinglePageEdit && /<!doctype\s/i.test(segmentText);
            const effectiveFileOutput = hasFileOutput || hasTextHtml;
            const needsContinuation =
              finalFinishReason === 'length' ||
              (finalFinishReason !== 'stop' && hadToolActivity && !effectiveFileOutput);

            if (!needsContinuation) {
              break;
            }

            if (segment + 1 >= MAX_CONTINUATION_SEGMENTS) {
              break;
            }

            continuationMessages = [
              ...continuationMessages,
              { role: 'assistant', parts: [{ type: 'text', text: segmentText }] },
              { role: 'user', parts: [{ type: 'text', text: continuePrompt }] },
            ] as Array<Omit<UIMessage, 'id'>>;
          }

          writer.write({ type: 'data-buildProgress', data: detector.finish(), transient: true });
          debugSession.finish('complete');
          debugSession.logFullResponse(finalFinishReason);

          // Send finish immediately so client can update UI without waiting for DB cleanup
          writer.write({ type: 'finish', finishReason: finalFinishReason } as UIMessageChunk);

          // Fire-and-forget: clean up generation state after finish is sent
          if (clientConversationId) {
            prisma.generationState.delete({
              where: { conversationId: clientConversationId },
            }).catch(() => {});
          }
        } catch (err: unknown) {
          if (err instanceof Error && err.name === 'AbortError') {
            debugSession.finish('aborted');
            debugSession.logFullResponse('aborted');
            return;
          }
          throw err;
        }
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (err: unknown) {
    if (err instanceof ChatRequestError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
