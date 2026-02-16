import { generateText, Output } from 'ai';
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
- Never ask for data that's nice-to-have but not visible on the site`;

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

  const result = await generateText({
    model,
    system: EVAL_SYSTEM_PROMPT,
    output: Output.object({ schema: completenessResultSchema }),
    prompt: userPrompt,
    maxOutputTokens: 1024,
  });

  if (!result.output) {
    debug?.logResponse({ response: result.text, status: 'error', finishReason: 'no-structured-output' });
    debug?.logGenerationSummary?.({ finishReason: 'no-structured-output', hasFileOutput: false, toolCallCount: 0, structuredOutput: true, rawTextLength: result.text?.length });
    return { ready: true }; // Fail-open: proceed with what we have
  }

  const outputJson = JSON.stringify(result.output, null, 2);
  debug?.logResponse({ response: outputJson, status: 'complete', finishReason: result.finishReason });
  debug?.logGenerationSummary?.({ finishReason: result.finishReason, hasFileOutput: false, toolCallCount: 0, structuredOutput: true, rawTextLength: outputJson.length });

  return result.output;
}
