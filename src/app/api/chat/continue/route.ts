import { convertToModelMessages, streamText } from 'ai';
import type { UIMessage } from 'ai';
import { createProgressStreamResponse } from '@/lib/chat/create-stream-response';
import { ChatRequestError } from '@/lib/chat/errors';
import { resolveChatExecution } from '@/lib/chat/resolve-chat-execution';

interface ContinueRequestBody {
  messages: Array<Omit<UIMessage, 'id'>>;
  provider: string;
  model: string;
  attempt: number;
  maxOutputTokens?: number;
  savedTimeZone?: string | null;
  browserTimeZone?: string;
}

export async function POST(req: Request) {
  let body: ContinueRequestBody;
  try {
    body = await req.json() as ContinueRequestBody;
  } catch {
    return Response.json({ error: 'Invalid or empty request body' }, { status: 400 });
  }

  const {
    messages,
    provider,
    model,
    attempt,
    maxOutputTokens,
    savedTimeZone,
    browserTimeZone,
  } = body;

  if (attempt > 3) {
    return Response.json({ error: 'Max continuation attempts reached' }, { status: 400 });
  }

  try {
    const { modelInstance, maxOutputTokens: resolvedMaxOutputTokens, systemPrompt } = await resolveChatExecution({
      provider,
      model,
      clientMaxTokens: maxOutputTokens,
      savedTimeZone,
      browserTimeZone,
    });

    const continuationMessages = [
      ...messages,
      {
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: 'Continue from where you left off. Output the COMPLETE HTML document.' }],
      },
    ];

    const result = streamText({
      model: modelInstance,
      system: systemPrompt,
      messages: await convertToModelMessages(continuationMessages),
      maxOutputTokens: resolvedMaxOutputTokens,
      abortSignal: req.signal,
    });

    return createProgressStreamResponse(result);
  } catch (err: unknown) {
    if (err instanceof ChatRequestError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
