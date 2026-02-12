import { createUIMessageStream, createUIMessageStreamResponse, type UIMessageChunk } from 'ai';
import { BuildProgressDetector } from '@/lib/stream/build-progress-detector';
import { createStreamDebugLogger } from '@/lib/chat/stream-debug';

interface UIStreamSource {
  toUIMessageStream: () => AsyncIterable<UIMessageChunk>;
}

export function createProgressStreamResponse(result: UIStreamSource) {
  const detector = new BuildProgressDetector();
  const debugLogger = createStreamDebugLogger('continue');

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
}
