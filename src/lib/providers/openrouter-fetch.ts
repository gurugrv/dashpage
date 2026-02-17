/**
 * Fetch wrapper that injects OpenRouter's `reasoning` parameter into request bodies.
 *
 * OpenRouter uses `reasoning: { effort }` to control thinking tokens for Anthropic models.
 * The AI SDK's `providerOptions.openai.reasoningEffort` maps to OpenAI's `reasoning_effort`
 * top-level field, which OpenRouter ignores for Anthropic models.
 */

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

export function createReasoningFetch(effort: ReasoningEffort): typeof globalThis.fetch {
  return (input, init) => {
    if (init?.body && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body);
        body.reasoning = { effort };
        return globalThis.fetch(input, { ...init, body: JSON.stringify(body) });
      } catch {
        // Not JSON, pass through
      }
    }
    return globalThis.fetch(input, init);
  };
}
