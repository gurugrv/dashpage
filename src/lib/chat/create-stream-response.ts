import { createUIMessageStream, createUIMessageStreamResponse, type UIMessageChunk } from 'ai';
import { BuildProgressDetector } from '@/lib/stream/build-progress-detector';

interface UIStreamSource {
  toUIMessageStream: () => AsyncIterable<UIMessageChunk>;
}

export function createProgressStreamResponse(result: UIStreamSource) {
  const detector = new BuildProgressDetector();

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
            const progress = detector.processDelta((part as { delta: string }).delta);
            if (progress) {
              writer.write({ type: 'data-buildProgress', data: progress, transient: true });
            }
          }
        }

        writer.write({ type: 'data-buildProgress', data: detector.finish(), transient: true });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        throw err;
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
