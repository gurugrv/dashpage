import { type ZodType } from 'zod';
import { jsonrepair } from 'jsonrepair';

/**
 * Attempts to repair malformed JSON from LLM output using `jsonrepair`,
 * then validates against a Zod schema.
 *
 * Handles: missing braces/brackets, trailing commas, unquoted keys,
 * single quotes, truncated output, markdown fences, and more.
 *
 * Returns the validated object on success, or null if repair/validation fails.
 */
export function repairAndParseJson<T>(
  text: string,
  schema: ZodType<T>,
): T | null {
  try {
    const repaired = jsonrepair(text);
    const parsed = JSON.parse(repaired);
    const result = schema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    console.warn('JSON repair succeeded but schema validation failed:', result.error.issues);
  } catch (err) {
    console.warn('JSON repair failed:', err instanceof Error ? err.message : err);
  }
  return null;
}
