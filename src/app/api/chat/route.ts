import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, stepCountIs, streamText, type FinishReason, type UIMessageChunk } from 'ai';
import type { UIMessage } from 'ai';
import { ChatRequestError } from '@/lib/chat/errors';
import { resolveChatExecution } from '@/lib/chat/resolve-chat-execution';
import { createWebsiteTools } from '@/lib/chat/tools';
import { createDebugSession } from '@/lib/chat/stream-debug';
import { BuildProgressDetector } from '@/lib/stream/build-progress-detector';
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
const CONTINUE_PROMPT = 'Continue from where you left off. Use the writeFiles tool to output the complete website files.';

function isStreamPart(part: unknown): part is { type: string; [key: string]: unknown } {
  return typeof part === 'object' && part !== null && 'type' in part;
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
    const appUrl = new URL(req.url).origin;

    const { modelInstance, maxOutputTokens: resolvedMaxOutputTokens, systemPrompt } = await resolveChatExecution({
      provider,
      model,
      clientMaxTokens: maxOutputTokens,
      savedTimeZone,
      browserTimeZone,
      currentFiles,
      appUrl,
    });

    const tools = createWebsiteTools(currentFiles ?? {});
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

        try {
          for (let segment = 0; segment < MAX_CONTINUATION_SEGMENTS; segment += 1) {
            let segmentText = '';
            const result = streamText({
              model: modelInstance,
              system: systemPrompt,
              messages: await convertToModelMessages(continuationMessages),
              maxOutputTokens: resolvedMaxOutputTokens,
              tools,
              stopWhen: stepCountIs(3),
              abortSignal: req.signal,
            });
            const sourceStream = result.toUIMessageStream({ sendStart: segment === 0, sendFinish: false });

            for await (const part of sourceStream) {
              writer.write(part);

              if (!isStreamPart(part)) continue;

              // Text delta: track for debug + progress
              if (part.type === 'text-delta' && typeof part.delta === 'string') {
                debugSession.logDelta(part.delta);
                segmentText += part.delta;
                const progress = detector.processDelta(part.delta);
                if (progress) {
                  writer.write({ type: 'data-buildProgress', data: progress, transient: true });
                }
              }

              // Tool lifecycle: debug logging + progress
              if (part.type === 'tool-input-start') {
                debugSession.logToolCall({
                  toolName: part.toolName as string,
                  toolCallId: part.toolCallId as string,
                });
                writer.write({
                  type: 'data-buildProgress',
                  data: { phase: 'generating' as const, label: 'Generating code...', file: 'index.html', percent: 15, timestamp: Date.now() },
                  transient: true,
                });
              }
              if (part.type === 'tool-input-available') {
                debugSession.logToolCall({
                  toolName: part.toolName as string,
                  toolCallId: part.toolCallId as string,
                  input: (part as { input?: unknown }).input,
                });
              }
              if (part.type === 'tool-output-available') {
                debugSession.logToolResult({
                  toolCallId: part.toolCallId as string,
                  output: (part as { output?: unknown }).output,
                });
                writer.write({
                  type: 'data-buildProgress',
                  data: { phase: 'generating' as const, label: 'Code generated', file: 'index.html', percent: 90, timestamp: Date.now() },
                  transient: true,
                });
              }
              if (part.type === 'tool-output-error') {
                debugSession.logToolResult({
                  toolCallId: part.toolCallId as string,
                  error: (part as { errorText?: string }).errorText || 'Unknown tool error',
                });
              }
            }

            finalFinishReason = await result.finishReason;

            if (finalFinishReason !== 'length') {
              break;
            }

            if (segment + 1 >= MAX_CONTINUATION_SEGMENTS) {
              break;
            }

            continuationMessages = [
              ...continuationMessages,
              { role: 'assistant', parts: [{ type: 'text', text: segmentText }] },
              { role: 'user', parts: [{ type: 'text', text: CONTINUE_PROMPT }] },
            ] as Array<Omit<UIMessage, 'id'>>;
          }

          writer.write({ type: 'data-buildProgress', data: detector.finish(), transient: true });
          debugSession.finish('complete');
          debugSession.logFullResponse(finalFinishReason);

          // Clean up generation state on successful completion
          if (clientConversationId) {
            await prisma.generationState.delete({
              where: { conversationId: clientConversationId },
            }).catch(() => {});
          }

          writer.write({ type: 'finish', finishReason: finalFinishReason } as UIMessageChunk);
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
