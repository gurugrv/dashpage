import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, streamText, type FinishReason, type UIMessageChunk } from 'ai';
import type { UIMessage } from 'ai';
import { ChatRequestError } from '@/lib/chat/errors';
import { resolveChatExecution } from '@/lib/chat/resolve-chat-execution';
import { createStreamDebugLogger } from '@/lib/chat/stream-debug';
import { BuildProgressDetector } from '@/lib/stream/build-progress-detector';

interface ChatRequestBody {
  messages: Array<Omit<UIMessage, 'id'>>;
  currentFiles?: Record<string, string>;
  provider: string;
  model: string;
  maxOutputTokens?: number;
  savedTimeZone?: string | null;
  browserTimeZone?: string;
}

const MAX_CONTINUATION_SEGMENTS = 3;
const CONTINUE_PROMPT = 'Continue from where you left off. Output the COMPLETE HTML document.';

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
  } = body;

  try {
    const { modelInstance, maxOutputTokens: resolvedMaxOutputTokens, systemPrompt } = await resolveChatExecution({
      provider,
      model,
      clientMaxTokens: maxOutputTokens,
      savedTimeZone,
      browserTimeZone,
      currentHtml: currentFiles?.['index.html'],
    });

    const detector = new BuildProgressDetector();
    const debugLogger = createStreamDebugLogger('chat');

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
              abortSignal: req.signal,
            });
            const sourceStream = result.toUIMessageStream({ sendStart: segment === 0, sendFinish: false });

            for await (const part of sourceStream) {
              writer.write(part);
              if (
                typeof part === 'object'
                && part !== null
                && 'type' in part
                && (part as { type?: string }).type === 'text-delta'
                && 'delta' in part
                && typeof (part as { delta?: unknown }).delta === 'string'
              ) {
                const delta = (part as { delta: string }).delta;
                debugLogger.logDelta(delta);
                segmentText += delta;
                const progress = detector.processDelta(delta);
                if (progress) {
                  writer.write({ type: 'data-buildProgress', data: progress, transient: true });
                }
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
          debugLogger.finish('complete');
          writer.write({ type: 'finish', finishReason: finalFinishReason } as UIMessageChunk);
        } catch (err: unknown) {
          if (err instanceof Error && err.name === 'AbortError') {
            debugLogger.finish('aborted');
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
