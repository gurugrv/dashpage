import { convertToModelMessages, streamText } from 'ai';
import type { UIMessage } from 'ai';
import { createProgressStreamResponse } from '@/lib/chat/create-stream-response';
import { ChatRequestError } from '@/lib/chat/errors';
import { resolveChatExecution } from '@/lib/chat/resolve-chat-execution';

interface ChatRequestBody {
  messages: Array<Omit<UIMessage, 'id'>>;
  currentFiles?: Record<string, string>;
  provider: string;
  model: string;
  maxOutputTokens?: number;
  savedTimeZone?: string | null;
  browserTimeZone?: string;
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

    const result = streamText({
      model: modelInstance,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
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
