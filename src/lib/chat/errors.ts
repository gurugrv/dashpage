import { APICallError, LoadAPIKeyError } from 'ai';

export class ChatRequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type StreamErrorCategory =
  | 'rate_limit'
  | 'auth_error'
  | 'context_length'
  | 'provider_unavailable'
  | 'server_error';

export interface StreamErrorPayload {
  category: StreamErrorCategory;
  message: string;
  retryable: boolean;
}

const CONTEXT_LENGTH_PATTERNS = [
  /context.length/i,
  /max.*tokens/i,
  /token.limit/i,
  /too.many.tokens/i,
  /maximum.context/i,
  /input.too.long/i,
];

export function classifyStreamError(error: unknown): StreamErrorPayload {
  const message = error instanceof Error ? error.message : String(error);

  // AI SDK provider errors carry statusCode
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;

    if (status === 429) {
      return { category: 'rate_limit', message: 'Rate limited by the provider. Try again in a moment.', retryable: true };
    }
    if (status === 401 || status === 403) {
      return { category: 'auth_error', message: 'Invalid or expired API key. Check your provider settings.', retryable: false };
    }
    if (status === 502 || status === 503 || status === 504) {
      return { category: 'provider_unavailable', message: 'Provider is temporarily unavailable. Try again shortly.', retryable: true };
    }

    // Check message for context length even with other status codes
    if (CONTEXT_LENGTH_PATTERNS.some(p => p.test(message))) {
      return { category: 'context_length', message: 'Conversation is too long for this model. Start a new chat or switch to a model with a larger context window.', retryable: false };
    }
  }

  // Missing API key
  if (LoadAPIKeyError.isInstance(error)) {
    return { category: 'auth_error', message: 'API key not configured. Add it in settings.', retryable: false };
  }

  // Context length heuristic for non-APICallError errors
  if (CONTEXT_LENGTH_PATTERNS.some(p => p.test(message))) {
    return { category: 'context_length', message: 'Conversation is too long for this model. Start a new chat or switch to a model with a larger context window.', retryable: false };
  }

  // Fallback
  return { category: 'server_error', message: message || 'An unexpected error occurred.', retryable: true };
}
