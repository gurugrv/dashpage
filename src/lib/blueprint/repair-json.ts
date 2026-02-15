import { type ZodType } from 'zod';
import { jsonrepair } from 'jsonrepair';

/**
 * Strip reasoning/thinking blocks that some models (e.g. DeepSeek) prepend
 * before the actual JSON output. Handles <think>...</think> and similar tags.
 */
function stripThinkingBlocks(text: string): string {
  // Remove <think>...</think> blocks (including nested content, non-greedy)
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Also handle unclosed <think> tags (model may not close them)
  cleaned = cleaned.replace(/<think>[\s\S]*/gi, '');
  return cleaned.trim();
}

/**
 * Attempts to repair malformed JSON from LLM output using `jsonrepair`,
 * then validates against a Zod schema.
 *
 * Handles: missing braces/brackets, trailing commas, unquoted keys,
 * single quotes, truncated output, markdown fences, thinking blocks, and more.
 *
 * Returns the validated object on success, or null if repair/validation fails.
 */
export function repairAndParseJson<T>(
  text: string,
  schema: ZodType<T>,
): T | null {
  // Strip thinking/reasoning blocks before attempting repair
  const cleaned = stripThinkingBlocks(text);
  const candidates = cleaned.length > 0 ? [cleaned, text] : [text];

  for (const candidate of candidates) {
    try {
      const repaired = jsonrepair(candidate);
      const parsed = JSON.parse(repaired);
      const result = schema.safeParse(parsed);
      if (result.success) {
        return result.data;
      }
      console.warn('JSON repair succeeded but schema validation failed:', result.error.issues);
    } catch (err) {
      console.warn('JSON repair failed:', err instanceof Error ? err.message : err);
    }
  }
  return null;
}
