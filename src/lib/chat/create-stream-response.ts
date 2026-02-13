import { createUIMessageStream, createUIMessageStreamResponse, type UIMessageChunk } from 'ai';
import { BuildProgressDetector } from '@/lib/stream/build-progress-detector';
import { createDebugSession } from '@/lib/chat/stream-debug';

interface UIStreamSource {
  toUIMessageStream: () => AsyncIterable<UIMessageChunk>;
}

export function createProgressStreamResponse(result: UIStreamSource, context?: { model?: string; conversationId?: string }) {
  const detector = new BuildProgressDetector();
  const debugLogger = createDebugSession({ scope: 'continue', model: context?.model, conversationId: context?.conversationId });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
        const sourceStream = result.toUIMessageStream();
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
            const progress = detector.processDelta(delta);
            if (progress) {
              writer.write({ type: 'data-buildProgress', data: progress, transient: true });
            }
          }
        }

        writer.write({ type: 'data-buildProgress', data: detector.finish(), transient: true });
        debugLogger.finish('complete');
        // Log the full AI response
        debugLogger.logFullResponse('complete');
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          debugLogger.finish('aborted');
          debugLogger.logFullResponse('aborted');
          return;
        }
        throw err;
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
