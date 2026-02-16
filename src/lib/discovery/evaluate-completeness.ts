import { generateText } from 'ai';
import type { LanguageModel } from 'ai';
import { completenessResultSchema, type CompletenessResult } from './types';
import type { BusinessProfileData } from './types';
import { createDebugSession, isDebugEnabled } from '@/lib/chat/stream-debug';

const MAX_TOTAL_QUESTIONS = 7;

const EVAL_SYSTEM_PROMPT = `You evaluate whether enough business data has been collected to generate a high-quality website without placeholder content.

Given the original prompt, business type, and collected data, decide:
1. Is there enough data to generate a great site? (ready=true)
2. If not, what 1-2 MORE follow-up questions would fill the most impactful gaps?

READY CRITERIA:
- Business name is present
- Phone OR email is present
- Address is present
- At least some industry-specific content (services, menu items, etc.)

FOLLOW-UP RULES:
- Maximum 2 follow-up questions per evaluation
- Don't re-ask for data already collected
- Focus on content that would otherwise be placeholder (testimonials, specific services, team names)
- If the user provided a rich initial prompt, fewer questions needed
- Never ask for data that's nice-to-have but not visible on the site

Respond with a JSON object with this exact structure:
{
  "ready": boolean,
  "followUpQuestions": [
    {
      "id": "string",
      "question": "The question text to display",
      "type": "text|phone|email|select|multi_select|textarea",
      "required": boolean,
      "options": ["only for select/multi_select"]
    }
  ]
}

IMPORTANT: Each question MUST have a "question" field (not "label") with the display text. The type for phone must be "phone" (not "tel").`;

// Map common model deviations to expected field names
const TYPE_ALIASES: Record<string, string> = {
  tel: 'phone',
  telephone: 'phone',
  number: 'text',
  url: 'text',
  checkbox: 'multi_select',
  radio: 'select',
  dropdown: 'select',
  multiselect: 'multi_select',
  'multi-select': 'multi_select',
};

const VALID_TYPES = new Set(['text', 'phone', 'email', 'select', 'multi_select', 'textarea']);

function parseAndNormalizeCompleteness(text: string | undefined): CompletenessResult | null {
  if (!text) return null;

  try {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) return null;

    const raw = JSON.parse(jsonMatch[1] || jsonMatch[0]);

    const normalized: Record<string, unknown> = {
      ready: raw.ready ?? false,
    };

    const rawQuestions = raw.followUpQuestions ?? raw.follow_up_questions ?? raw.questions ?? [];
    if (rawQuestions.length > 0) {
      normalized.followUpQuestions = rawQuestions.map((q: Record<string, unknown>) => {
        const question = q.question ?? q.label ?? q.text ?? q.title ?? '';

        let type = String(q.type ?? 'text').toLowerCase();
        if (TYPE_ALIASES[type]) type = TYPE_ALIASES[type];
        if (!VALID_TYPES.has(type)) type = 'text';

        return {
          id: q.id ?? q.name ?? 'unknown',
          question: String(question),
          type,
          required: q.required ?? false,
          ...(q.options ? { options: q.options } : {}),
        };
      });
    }

    return completenessResultSchema.parse(normalized);
  } catch (e) {
    console.error('[discovery/evaluate] Normalization failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function evaluateCompleteness(
  model: LanguageModel,
  originalPrompt: string,
  collectedData: BusinessProfileData,
  questionsAskedSoFar: number,
  options?: { provider?: string; modelId?: string },
): Promise<CompletenessResult> {
  const debug = isDebugEnabled()
    ? createDebugSession({ scope: 'discovery-evaluate', model: options?.modelId, provider: options?.provider })
    : null;

  // Hard cap: if we've asked enough questions, stop
  if (questionsAskedSoFar >= MAX_TOTAL_QUESTIONS) {
    debug?.logResponse({ response: 'Hard cap reached, skipping AI call', status: 'complete', finishReason: 'hard-cap' });
    return { ready: true };
  }

  // Minimum check: if we have name + (phone or email) + address, likely good enough
  const hasMinimum = collectedData.name && (collectedData.phone || collectedData.email) && collectedData.address;
  if (hasMinimum && questionsAskedSoFar >= 5) {
    debug?.logResponse({ response: 'Minimum data met with 5+ questions, skipping AI call', status: 'complete', finishReason: 'minimum-met' });
    return { ready: true };
  }

  const userPrompt = `Original prompt: "${originalPrompt}"

Collected data so far:
${JSON.stringify(collectedData, null, 2)}

Questions asked so far: ${questionsAskedSoFar}
Remaining question budget: ${MAX_TOTAL_QUESTIONS - questionsAskedSoFar}`;

  debug?.logPrompt({
    systemPrompt: EVAL_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    maxOutputTokens: 1024,
  });

  let result;
  try {
    result = await generateText({
      model,
      system: EVAL_SYSTEM_PROMPT,
      prompt: userPrompt,
      maxOutputTokens: 1024,
    });
  } catch (error) {
    console.error('[discovery/evaluate] AI call failed:', error instanceof Error ? error.message : error);
    debug?.logResponse({ response: String(error), status: 'error', finishReason: 'api-error' });
    return { ready: true }; // Fail-open: proceed with what we have
  }

  const output = parseAndNormalizeCompleteness(result.text);

  if (!output) {
    console.error('[discovery/evaluate] Failed to parse response:', result.text?.slice(0, 500));
    debug?.logResponse({ response: result.text, status: 'error', finishReason: 'parse-failed' });
    return { ready: true }; // Fail-open: proceed with what we have
  }

  const outputJson = JSON.stringify(output, null, 2);
  debug?.logResponse({ response: outputJson, status: 'complete', finishReason: result.finishReason });
  debug?.logGenerationSummary?.({ finishReason: result.finishReason, hasFileOutput: false, toolCallCount: 0, structuredOutput: true, rawTextLength: outputJson.length });

  return output;
}
