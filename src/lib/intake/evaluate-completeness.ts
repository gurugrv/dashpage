import { generateText, Output } from 'ai';
import type { LanguageModel } from 'ai';
import { completenessResultSchema, type CompletenessResult } from './types';
import type { BusinessProfileData } from './types';

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
): Promise<CompletenessResult> {
  // Hard cap: if we've asked enough questions, stop
  if (questionsAskedSoFar >= MAX_TOTAL_QUESTIONS) {
    return { ready: true };
  }

  // Minimum check: if we have name + (phone or email) + address, likely good enough
  const hasMinimum = collectedData.name && (collectedData.phone || collectedData.email) && collectedData.address;
  if (hasMinimum && questionsAskedSoFar >= 5) {
    return { ready: true };
  }

  const result = await generateText({
    model,
    system: EVAL_SYSTEM_PROMPT,
    output: Output.object({ schema: completenessResultSchema }),
    prompt: `Original prompt: "${originalPrompt}"

Collected data so far:
${JSON.stringify(collectedData, null, 2)}

Questions asked so far: ${questionsAskedSoFar}
Remaining question budget: ${MAX_TOTAL_QUESTIONS - questionsAskedSoFar}`,
    maxOutputTokens: 1024,
  });

  if (!result.output) {
    return { ready: true }; // Fail-open: proceed with what we have
  }

  return result.output;
}
