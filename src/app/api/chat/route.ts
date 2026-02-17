import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, stepCountIs, streamText, type FinishReason, type UIMessageChunk } from 'ai';
import type { UIMessage } from 'ai';
import { ChatRequestError, classifyStreamError } from '@/lib/chat/errors';
import { resolveChatExecution } from '@/lib/chat/resolve-chat-execution';
import { createWebsiteTools } from '@/lib/chat/tools';
import { createDebugSession } from '@/lib/chat/stream-debug';
import { BuildProgressDetector } from '@/lib/stream/build-progress-detector';
import type { ToolActivityEvent } from '@/types/build-progress';
import { prisma } from '@/lib/db/prisma';
import { validateBlocks } from '@/lib/blocks/validate-blocks';
import { extractComponents } from '@/lib/blocks/extract-components';

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
const MAX_TOTAL_OUTPUT_TOKENS_MULTIPLIER = 3; // Total budget = resolvedMaxOutputTokens * multiplier

function extractLastSection(segmentText: string): string | null {
  // Look for the last data-block or semantic section id, not all HTML id attributes
  const sectionIdMatches = segmentText.match(
    /(?:data-block=["']([^"']+)["']|<(?:section|header|footer|main|nav|aside)[^>]+id=["']([^"']+)["'])/gi,
  );
  if (sectionIdMatches && sectionIdMatches.length > 0) {
    const last = sectionIdMatches[sectionIdMatches.length - 1];
    const match = last.match(/(?:data-block=["']([^"']+)["']|id=["']([^"']+)["'])/i);
    if (match) return match[1] ?? match[2];
  }
  const commentMatches = segmentText.match(/<!--\s*(.+?)\s*(?:Section|section)\s*-->/g);
  if (commentMatches && commentMatches.length > 0) {
    const last = commentMatches[commentMatches.length - 1];
    const match = last.match(/<!--\s*(.+?)\s*(?:Section|section)\s*-->/);
    if (match) return match[1].trim();
  }
  return null;
}

function buildContinuePrompt(segmentText: string): string {
  const base = 'Continue from where you left off. Append the remaining content — do NOT restart files from the beginning.';

  const lastSection = extractLastSection(segmentText);
  if (lastSection) {
    return `${base} You were generating the "${lastSection}" section. Continue from there and complete all remaining sections.`;
  }
  return base;
}

function isStreamPart(part: unknown): part is { type: string; [key: string]: unknown } {
  return typeof part === 'object' && part !== null && 'type' in part;
}

/**
 * Compact messages before sending to LLM to reduce redundant HTML in context.
 * For each assistant tool-invocation part:
 * - writeFiles/writeFile args: replace HTML content with placeholder
 * - editBlock/editFiles results: strip _fullContent, optionally strip large content
 * - readFile results: truncate large content to head/tail
 */
function compactMessagesForLLM<T extends { role: string; parts: Array<Record<string, unknown>> }>(
  messages: T[],
): T[] {
  return messages.map((msg) => {
    if (msg.role !== 'assistant') return msg;

    let changed = false;
    const parts = msg.parts.map((part) => {
      if (part.type !== 'tool-invocation') return part;

      const inv = part.toolInvocation as Record<string, unknown> | undefined;
      if (!inv || inv.state !== 'result') return part;

      const toolName = inv.toolName as string;
      const args = inv.args as Record<string, unknown> | undefined;
      const result = inv.result as Record<string, unknown> | undefined;

      // writeFiles: replace HTML content strings in args.files with placeholders
      if (toolName === 'writeFiles' && args?.files && typeof args.files === 'object') {
        const files = args.files as Record<string, unknown>;
        const compactFiles: Record<string, string> = {};
        for (const [name, content] of Object.entries(files)) {
          if (typeof content === 'string' && content.length > 200) {
            compactFiles[name] = `[${content.length} chars — use readFile to inspect]`;
          } else {
            compactFiles[name] = content as string;
          }
        }
        changed = true;
        return {
          ...part,
          toolInvocation: { ...inv, args: { ...args, files: compactFiles } },
        };
      }

      // writeFile: replace args.content with placeholder
      if (toolName === 'writeFile' && args?.content && typeof args.content === 'string' && args.content.length > 200) {
        changed = true;
        return {
          ...part,
          toolInvocation: {
            ...inv,
            args: { ...args, content: `[${args.content.length} chars — use readFile to inspect]` },
          },
        };
      }

      // editFiles: strip _fullContent from results, and strip large content
      if (toolName === 'editFiles' && result?.results && Array.isArray(result.results)) {
        const compactResults = (result.results as Array<Record<string, unknown>>).map((r) => {
          const compacted = { ...r };
          // Always strip _fullContent (redundant with content)
          if ('_fullContent' in compacted) {
            delete compacted._fullContent;
          }
          // Strip content over 20K (already truncated to head/tail format anyway)
          if (typeof compacted.content === 'string' && compacted.content.length > 20_000) {
            compacted.content = `[${compacted.content.length} chars — edits applied, use readFile to inspect]`;
          }
          return compacted;
        });
        changed = true;
        return {
          ...part,
          toolInvocation: { ...inv, result: { ...result, results: compactResults } },
        };
      }

      // editBlock: strip _fullContent, strip large content
      if (toolName === 'editBlock' && result) {
        const needs = '_fullContent' in result || (typeof result.content === 'string' && result.content.length > 20_000);
        if (needs) {
          const compacted = { ...result };
          if ('_fullContent' in compacted) delete compacted._fullContent;
          if (typeof compacted.content === 'string' && compacted.content.length > 20_000) {
            compacted.content = `[${compacted.content.length} chars — edits applied, use readFile to inspect]`;
          }
          changed = true;
          return { ...part, toolInvocation: { ...inv, result: compacted } };
        }
      }

      // readFile: truncate large results (can trigger for line-range reads that bypass tool-level truncation)
      if (toolName === 'readFile' && result?.content && typeof result.content === 'string' && result.content.length > 20_000) {
        const content = result.content;
        const lines = content.split('\n');
        const SUMMARY_LINES = 50;
        const head = lines.slice(0, SUMMARY_LINES).join('\n');
        const tail = lines.slice(-SUMMARY_LINES).join('\n');
        const omitted = Math.max(0, lines.length - SUMMARY_LINES * 2);
        changed = true;
        return {
          ...part,
          toolInvocation: {
            ...inv,
            result: {
              ...result,
              content: `${head}\n\n/* [truncated — ${omitted} lines omitted, ${content.length} chars total] */\n\n${tail}`,
            },
          },
        };
      }

      return part;
    });

    if (!changed) return msg;
    return { ...msg, parts };
  });
}

/**
 * Sanitize UIMessages so tool-invocation parts always have a valid object `input`.
 * The Anthropic API rejects tool_use blocks whose `input` is not a dictionary.
 * This can happen when:
 *  - A tool call was aborted mid-stream (input never fully parsed)
 *  - The AI SDK falls back to rawInput (a string) for errored tool calls
 *  - A tool has no parameters and input ends up undefined
 */
function sanitizeToolInputs<T extends { role: string; parts: Array<Record<string, unknown>> }>(
  messages: T[],
): T[] {
  return messages.map((msg) => {
    if (msg.role !== 'assistant') return msg;

    let changed = false;
    const parts = msg.parts.map((part) => {
      if (part.type !== 'tool-invocation') return part;

      // Drop incomplete tool invocations (still streaming input)
      if (part.state === 'input-streaming') {
        changed = true;
        return null;
      }

      const input = part.input;
      if (input != null && typeof input === 'object' && !Array.isArray(input)) {
        return part; // Already a valid dictionary
      }

      changed = true;

      // Try to recover: parse string input (rawInput fallback from AI SDK)
      if (typeof input === 'string') {
        try {
          const parsed = JSON.parse(input);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return { ...part, input: parsed };
          }
        } catch {
          // Fall through to empty object
        }
      }

      return { ...part, input: {} };
    });

    if (!changed) return msg;
    return { ...msg, parts: parts.filter(Boolean) as Array<Record<string, unknown>> };
  });
}

const TOOL_LABELS: Record<string, string> = {
  writeFile: 'Writing file',
  writeFiles: 'Writing files',
  editBlock: 'Applying edits',
  editFiles: 'Editing files',
  readFile: 'Reading file',
  searchImages: 'Adding images',
  searchIcons: 'Adding icons',
  fetchUrl: 'Loading content',
  webSearch: 'Researching content',
  deleteFile: 'Deleting file',
};

function summarizeToolInput(toolName: string, input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const inp = input as Record<string, unknown>;
  switch (toolName) {
    case 'webSearch':
      return typeof inp.query === 'string' ? inp.query : undefined;
    case 'searchImages': {
      const queries = inp.queries as Array<{ query?: string }> | undefined;
      if (queries) return queries.map(q => q.query).filter(Boolean).join(', ');
      return typeof inp.query === 'string' ? inp.query : undefined;
    }
    case 'searchIcons': {
      const queries = inp.queries as Array<{ query?: string }> | undefined;
      if (queries) return queries.map(q => q.query).filter(Boolean).join(', ');
      return typeof inp.query === 'string' ? inp.query : undefined;
    }
    case 'fetchUrl':
      return typeof inp.url === 'string' ? inp.url : undefined;
    case 'writeFile':
      return typeof inp.filename === 'string' ? inp.filename : undefined;
    case 'writeFiles':
      if (inp.files && typeof inp.files === 'object') {
        const names = Object.keys(inp.files as Record<string, unknown>);
        return names.join(', ');
      }
      return undefined;
    case 'editBlock':
      return typeof inp.file === 'string' ? inp.file : undefined;
    case 'editFiles': {
      const edits = inp.edits as Array<{ file?: string }> | undefined;
      return edits ? edits.map(e => e.file).filter(Boolean).join(', ') : undefined;
    }
    case 'readFile':
      return typeof inp.file === 'string' ? inp.file : undefined;
    case 'deleteFile':
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
    case 'searchImages':
      return 'Images added';
    case 'searchIcons':
      return 'Icons added';
    case 'fetchUrl':
      return out.truncated ? 'Content fetched (truncated)' : 'Content fetched';
    case 'writeFile': {
      const fileName = out.fileName as string | undefined;
      return fileName ? `Wrote ${fileName}` : 'File written';
    }
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
    case 'deleteFile':
      return typeof out.file === 'string' ? `Deleted ${out.file}` : 'File deleted';
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
    // Extract the last user message text for weighted style seed selection
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    const lastUserText = lastUserMessage?.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map(p => p.text)
      .join(' ') ?? '';

    // Fetch linked business profile if conversation has one
    let businessProfile: import('@/lib/discovery/types').BusinessProfileData | null = null;
    if (clientConversationId) {
      const conv = await prisma.conversation.findUnique({
        where: { id: clientConversationId },
        include: { businessProfile: true },
      });
      if (conv?.businessProfile) {
        const bp = conv.businessProfile;
        businessProfile = {
          name: bp.name,
          phone: bp.phone ?? undefined,
          email: bp.email ?? undefined,
          website: bp.website ?? undefined,
          address: bp.address ?? undefined,
          lat: bp.lat ?? undefined,
          lng: bp.lng ?? undefined,
          placeId: bp.placeId ?? undefined,
          category: bp.category ?? undefined,
          categories: (bp.categories as string[] | null) ?? undefined,
          hours: (bp.hours as Record<string, string> | null) ?? undefined,
          services: (bp.services as string[] | null) ?? undefined,
          socialMedia: (bp.socialMedia as Record<string, string> | null) ?? undefined,
          additionalInfo: bp.additionalInfo ?? undefined,
          googleMapsUri: bp.googleMapsUri ?? undefined,
        };
      }
    }

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
      userPrompt: lastUserText,
      businessProfile,
    });

    const isAnthropicDirect = resolvedProvider === 'anthropic';

    const fileCount = Object.keys(currentFiles ?? {}).length;
    const { tools, workingFiles } = createWebsiteTools(currentFiles ?? {});
    // continuePrompt is built dynamically per segment via buildContinuePrompt()
    const isEditing = fileCount > 0;
    const primaryFile = Object.keys(currentFiles ?? {})[0] ?? 'index.html';
    const detector = new BuildProgressDetector(primaryFile);
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
      onError: (error) => {
        console.error('[chat] Stream error:', error);
        return JSON.stringify(classifyStreamError(error));
      },
      execute: async ({ writer }) => {
        let continuationMessages = [...messages];
        let finalFinishReason: FinishReason | undefined;
        const toolCallNames = new Map<string, string>();
        let prevSegmentText = '';  // Track previous segment for degenerate loop detection
        let totalTokensUsed = 0;
        let totalPromptTokens = 0;
        const totalTokenBudget = resolvedMaxOutputTokens * MAX_TOTAL_OUTPUT_TOKENS_MULTIPLIER;

        // Track whether file-producing tools were called (for incomplete generation detection)
        let hasFileOutput = false;
        const FILE_PRODUCING_TOOLS = new Set(['writeFiles', 'writeFile', 'editBlock', 'editFiles', 'deleteFile']);

        // Tool-aware monotonic progress tracker
        const TOOL_START_PERCENT: Record<string, number> = {
          searchImages: 18,
          searchIcons: 18,
          webSearch: 18,
          fetchUrl: 18,
          readFile: 28,
          writeFile: 32,
          writeFiles: 32,
          editBlock: 32,
          editFiles: 32,
          deleteFile: 32,
        };
        const TOOL_END_PERCENT: Record<string, number> = {
          searchImages: 28,
          searchIcons: 28,
          webSearch: 28,
          fetchUrl: 28,
          readFile: 30,
          writeFile: 92,
          writeFiles: 92,
          editBlock: 90,
          editFiles: 90,
          deleteFile: 90,
        };
        let maxPercent = 0;

        function bumpPercent(percent: number): number {
          if (percent > maxPercent) maxPercent = percent;
          return maxPercent;
        }

        try {
          for (let segment = 0; segment < MAX_CONTINUATION_SEGMENTS; segment += 1) {
            let segmentText = '';
            // Collect tool invocations for proper continuation context
            const segmentToolInvocations = new Map<string, { toolName: string; args: unknown; result?: unknown }>();
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
              messages: await convertToModelMessages(compactMessagesForLLM(sanitizeToolInputs(continuationMessages))),
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
                      file: primaryFile,
                      percent: bumpPercent(Math.max(progress.percent, 5)),
                      timestamp: Date.now(),
                    },
                    transient: true,
                  });
                }
              }

              // Stream tool input deltas to debug console (shows actual code being generated)
              if (part.type === 'tool-input-delta') {
                const toolCallId = part.toolCallId as string;
                const delta = (part as { inputTextDelta: string }).inputTextDelta;
                debugSession.logToolInputDelta({ toolCallId, delta });
              }

              // Tool lifecycle: debug logging + progress + activity events
              if (part.type === 'tool-input-start') {
                const toolName = part.toolName as string;
                const toolCallId = part.toolCallId as string;
                toolCallNames.set(toolCallId, toolName);
                debugSession.logToolStarting({ toolName, toolCallId });

                const progressLabels: Record<string, string> = {
                  writeFile: 'Generating code...',
                  writeFiles: 'Generating code...',
                  editBlock: 'Applying edits...',
                  editFiles: 'Applying edits...',
                  readFile: 'Reading file...',
                  searchImages: 'Adding images...',
                  searchIcons: 'Adding icons...',
                  fetchUrl: 'Loading content...',
                  webSearch: 'Researching content...',
                  deleteFile: 'Deleting file...',
                };

                writer.write({
                  type: 'data-buildProgress',
                  data: {
                    phase: isEditing ? 'edit-applying' as const : 'generating' as const,
                    label: progressLabels[toolName] ?? 'Processing...',
                    file: primaryFile,
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
                segmentToolInvocations.set(toolCallId, { toolName, args: input });
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
                const inv = segmentToolInvocations.get(toolCallId);
                if (inv) inv.result = output;
                debugSession.logToolResult({ toolCallId, output });

                // Track file-producing tool completions
                if (FILE_PRODUCING_TOOLS.has(toolName)) {
                  const out = output as Record<string, unknown> | undefined;
                  if (out && out.success !== false) hasFileOutput = true;
                }

                const TOOL_END_LABELS: Record<string, string> = {
                  writeFile: 'Code generated',
                  writeFiles: 'Code generated',
                  searchImages: 'Images found',
                  searchIcons: 'Icons found',
                  webSearch: 'Search complete',
                  fetchUrl: 'Content fetched',
                  readFile: 'File read',
                  editBlock: 'Edits applied',
                  editFiles: 'Edits applied',
                  deleteFile: 'File deleted',
                };
                const endLabel = TOOL_END_LABELS[toolName] ?? 'Processing...';
                writer.write({
                  type: 'data-buildProgress',
                  data: {
                    phase: isEditing ? 'edit-applying' as const : 'generating' as const,
                    label: endLabel,
                    file: primaryFile,
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
                const errorText = (part as { errorText?: string }).errorText || 'Unknown tool error';
                debugSession.logToolResult({ toolCallId, error: errorText });
                // Don't emit tool activity for errors — the SDK sends the error back
                // to the model which retries, producing a new 'running' event.
                // Showing validation errors to users is just noise.
              }
            }

            finalFinishReason = await result.finishReason;

            // Track cumulative token usage
            const usage = await result.usage;
            if (usage?.outputTokens) {
              totalTokensUsed += usage.outputTokens;
            }
            if (usage?.inputTokens) {
              totalPromptTokens += usage.inputTokens;
            }

            // Log Anthropic cache stats if available
            if (isAnthropicDirect) {
              const metadata = await result.providerMetadata;
              debugSession.logCacheStats?.(metadata?.anthropic);
            }

            // Auto-continue when:
            // 1. Output was truncated (finish reason 'length'), OR
            // 2. Model gathered assets (tool activity) but never produced files —
            //    common with models that stop early with finish reason 'other'
            const hadToolActivity = toolCallNames.size > 0;
            const needsContinuation =
              finalFinishReason === 'length' ||
              (finalFinishReason !== 'stop' && hadToolActivity && !hasFileOutput);

            if (!needsContinuation) {
              break;
            }

            // Detect degenerate loops: if this segment produced nearly identical output
            // to the previous one (model stuck repeating garbage), stop continuing
            if (prevSegmentText && segmentText.length > 0) {
              const isDegenerate = (() => {
                if (segmentText === prevSegmentText) return true;
                if (segmentText.length < 200 && prevSegmentText.length < 200) return true;
                // Check prefix similarity for longer segments
                const len = Math.min(segmentText.length, prevSegmentText.length, 500);
                const sliceA = segmentText.slice(0, len);
                const sliceB = prevSegmentText.slice(0, len);
                let matches = 0;
                for (let i = 0; i < len; i++) {
                  if (sliceA[i] === sliceB[i]) matches++;
                }
                return matches / len > 0.8;
              })();
              if (isDegenerate) {
                debugSession.logToolResult?.({ toolCallId: 'auto-continue', error: 'Degenerate loop detected — stopping auto-continue' });
                break;
              }
            }
            prevSegmentText = segmentText;

            if (segment + 1 >= MAX_CONTINUATION_SEGMENTS) {
              break;
            }

            // Enforce total token budget across segments
            if (totalTokensUsed >= totalTokenBudget) {
              debugSession.logToolResult?.({ toolCallId: 'auto-continue', error: `Total token budget exhausted (${totalTokensUsed}/${totalTokenBudget})` });
              break;
            }

            // Build assistant parts with text AND tool invocations so
            // continuation requests preserve full tool context (required by
            // Anthropic's tool_use/tool_result alternation, and gives all
            // providers memory of what was already generated/fetched).
            const assistantParts: Array<Record<string, unknown>> = [];
            if (segmentText) {
              assistantParts.push({ type: 'text', text: segmentText });
            }
            for (const [toolCallId, inv] of segmentToolInvocations) {
              assistantParts.push({
                type: 'tool-invocation',
                toolInvocation: {
                  state: 'result',
                  toolCallId,
                  toolName: inv.toolName,
                  args: inv.args ?? {},
                  result: inv.result ?? {},
                },
              });
            }
            if (assistantParts.length === 0) {
              assistantParts.push({ type: 'text', text: '' });
            }

            continuationMessages = [
              ...continuationMessages,
              { role: 'assistant', parts: assistantParts },
              { role: 'user', parts: [{ type: 'text', text: buildContinuePrompt(segmentText) }] },
            ] as Array<Omit<UIMessage, 'id'>>;
          }

          // Post-generation: validate blocks and extract components on workingFiles
          if (hasFileOutput && Object.keys(workingFiles).some(f => f.endsWith('.html'))) {
            try {
              validateBlocks(workingFiles);
              extractComponents(workingFiles);
            } catch (postProcessErr) {
              console.warn('[chat] Post-generation pipeline error (validateBlocks/extractComponents):', postProcessErr);
              writer.write({
                type: 'data-postProcessWarning',
                data: { message: postProcessErr instanceof Error ? postProcessErr.message : 'Post-processing encountered an issue' },
                transient: true,
              });
            }

            // Stream post-processed files to client so it has block IDs + extracted components
            writer.write({
              type: 'data-postProcessedFiles',
              data: workingFiles,
              transient: true,
            });
          }

          writer.write({ type: 'data-buildProgress', data: detector.finish(), transient: true });
          debugSession.finish('complete');
          debugSession.logFullResponse(finalFinishReason);
          debugSession.logGenerationSummary?.({
            finishReason: finalFinishReason,
            hasFileOutput,
            toolCallCount: toolCallNames.size,
            usage: { inputTokens: totalPromptTokens, outputTokens: totalTokensUsed },
          });

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
            debugSession.logGenerationSummary?.({
              finishReason: 'aborted',
              hasFileOutput,
              toolCallCount: toolCallNames.size,
              usage: { inputTokens: totalPromptTokens, outputTokens: totalTokensUsed },
            });
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
