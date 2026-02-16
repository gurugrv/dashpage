import { generateText, Output } from 'ai';
import type { LanguageModel } from 'ai';
import { discoveryAnalysisSchema, type DiscoveryAnalysis } from './types';
import { createDebugSession, isDebugEnabled } from '@/lib/chat/stream-debug';

const ANALYSIS_SYSTEM_PROMPT = `You are a smart discovery assistant for a website builder. Analyze the user's prompt and determine:

1. Is this a business/organization website (vs personal hobby, creative project, etc.)?
2. Extract any business name mentioned in the prompt.
3. Generate targeted questions to collect essential business data.

RULES:
- Always ask for business name if not detected in prompt (prefill if detected).
- Always ask for phone number — it's critical for business sites.
- Always ask for address using address_autocomplete type — needed for location and map embedding.
- After those 3 core questions, ask 2-4 industry-specific questions based on the business type:
  - Restaurant/cafe: menu highlights, cuisine type, reservation info
  - Medical/dental: services offered, insurance accepted, team members
  - Retail/shop: product categories, brands carried, online ordering
  - Service business: services list, service area, certifications
  - Professional services: specializations, team, case studies
  - Generic: business hours, email, key services
- Use "select" type when the user should pick ONE option from a list (e.g., cuisine type, business category).
- Use "multi_select" type when the user can pick MULTIPLE options from a list (e.g., services offered, insurance accepted, product categories).
- Use "textarea" for open-ended info (e.g., "describe your services").
- Total questions: 3-7 depending on business complexity.
- For non-business sites (portfolio, hobby, personal blog), set isBusinessSite=false and return empty questions array.

QUESTION ID CONVENTIONS:
- business_name, phone, address, email, website, hours, services, description, team, social_media
- Use descriptive IDs for industry-specific: cuisine_type, menu_highlights, insurance, specializations`;

export async function analyzePromptForDiscovery(
  model: LanguageModel,
  userPrompt: string,
  options?: { provider?: string; modelId?: string },
): Promise<DiscoveryAnalysis> {
  const debug = isDebugEnabled()
    ? createDebugSession({ scope: 'discovery-analyze', model: options?.modelId, provider: options?.provider })
    : null;

  debug?.logPrompt({
    systemPrompt: ANALYSIS_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    maxOutputTokens: 2048,
  });

  const result = await generateText({
    model,
    system: ANALYSIS_SYSTEM_PROMPT,
    output: Output.object({ schema: discoveryAnalysisSchema }),
    prompt: userPrompt,
    maxOutputTokens: 2048,
  });

  if (!result.output) {
    debug?.logResponse({ response: result.text, status: 'error', finishReason: 'no-structured-output' });
    debug?.logGenerationSummary?.({ finishReason: 'no-structured-output', hasFileOutput: false, toolCallCount: 0, structuredOutput: true, rawTextLength: result.text?.length });
    return { isBusinessSite: true, detectedName: null, questions: [] };
  }

  const outputJson = JSON.stringify(result.output, null, 2);
  debug?.logResponse({ response: outputJson, status: 'complete', finishReason: result.finishReason });
  debug?.logGenerationSummary?.({ finishReason: result.finishReason, hasFileOutput: false, toolCallCount: 0, structuredOutput: true, rawTextLength: outputJson.length });

  return result.output;
}
