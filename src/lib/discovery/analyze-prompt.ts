import { generateText } from 'ai';
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
- Always ask for email address — needed for contact sections and forms.
- Always ask for address using address_autocomplete type — needed for location and map embedding.
- Ask for business hours (e.g., "Mon-Fri 9am-5pm") — most business sites display this.
- Ask for a short tagline or description (textarea) — used for the main banner and SEO. Keep the question in plain, non-technical language (e.g., "What's a catchy one-liner that describes your business?" — never use jargon like "hero section", "CTA", "above the fold").
- Ask for social media links (Instagram, Facebook, etc.) — useful for footer/contact sections. Use textarea type so users can paste multiple links.
- After those core questions, ask 1-3 industry-specific questions based on the business type:
  - Restaurant/cafe: menu highlights, cuisine type, reservation info
  - Medical/dental: services offered, insurance accepted, team members
  - Retail/shop: product categories, brands carried, online ordering
  - Service business: services list, service area, certifications
  - Professional services: specializations, team, case studies
  - Generic: business hours, email, key services
- Use "select" type ONLY when exactly one option must be chosen (e.g., cuisine type, business category, primary industry).
- Use "multi_select" type whenever the user could reasonably pick MORE THAN ONE option. This includes: services offered, insurance accepted, product categories, specializations, amenities, features, payment methods, languages spoken, certifications, etc. When in doubt, prefer multi_select over select.
- Use "textarea" for open-ended info (e.g., "describe your services").
- Total questions: 5-9 depending on business complexity.
- Write ALL questions in plain, everyday language. Our users are non-technical — never use web/design jargon like "hero section", "CTA", "above the fold", "viewport", "SEO", etc.
- Localize questions to the user's region/country if mentioned or implied in the prompt. Don't ask about concepts that don't apply locally (e.g., insurance providers for a dental clinic in India, tipping for a restaurant in Japan, BBB accreditation outside the US). Tailor industry-specific options to what's relevant in that market.
- For non-business sites (portfolio, hobby, personal blog), set isBusinessSite=false and return empty questions array.

QUESTION ID CONVENTIONS:
- business_name, phone, email, address, hours, tagline, social_media, website, services, description, team
- Use descriptive IDs for industry-specific: cuisine_type, menu_highlights, insurance, specializations

Respond with a JSON object with this exact structure:
{
  "isBusinessSite": boolean,
  "detectedName": "string or null",
  "questions": [
    {
      "id": "string",
      "question": "The question text to display",
      "type": "text|phone|email|address_autocomplete|select|multi_select|textarea",
      "required": boolean,
      "options": ["only for select/multi_select"],
      "prefilled": "optional default value"
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
  address: 'address_autocomplete',
};

const VALID_TYPES = new Set(['text', 'phone', 'email', 'address_autocomplete', 'select', 'multi_select', 'textarea']);

function parseAndNormalizeAnalysis(text: string | undefined): DiscoveryAnalysis | null {
  if (!text) return null;

  try {
    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) return null;

    const raw = JSON.parse(jsonMatch[1] || jsonMatch[0]);

    // Normalize top-level fields
    const normalized: Record<string, unknown> = {
      isBusinessSite: raw.isBusinessSite ?? raw.is_business_site ?? true,
      detectedName: raw.detectedName ?? raw.detectedBusinessName ?? raw.detected_name ?? raw.businessName ?? null,
      questions: [],
    };

    // Normalize questions
    const rawQuestions = raw.questions ?? [];
    normalized.questions = rawQuestions.map((q: Record<string, unknown>) => {
      // Map "label" -> "question", "defaultValue"/"placeholder" -> "prefilled"
      const question = q.question ?? q.label ?? q.text ?? q.title ?? '';
      const prefilled = q.prefilled ?? q.defaultValue ?? q.default_value ?? q.placeholder ?? undefined;

      // Normalize type
      let type = String(q.type ?? 'text').toLowerCase();
      if (TYPE_ALIASES[type]) type = TYPE_ALIASES[type];
      if (!VALID_TYPES.has(type)) type = 'text';

      return {
        id: q.id ?? q.name ?? 'unknown',
        question: String(question),
        type,
        required: q.required ?? false,
        ...(q.options ? { options: q.options } : {}),
        ...(prefilled ? { prefilled: String(prefilled) } : {}),
      };
    });

    return discoveryAnalysisSchema.parse(normalized);
  } catch (e) {
    console.error('[discovery/analyze] Normalization failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

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
    prompt: userPrompt,
    maxOutputTokens: 2048,
  });

  const output = parseAndNormalizeAnalysis(result.text);

  if (!output) {
    console.error('[discovery/analyze] Failed to parse response:', result.text?.slice(0, 500));
    debug?.logResponse({ response: result.text, status: 'error', finishReason: 'parse-failed' });
    return { isBusinessSite: true, detectedName: null, questions: [] };
  }

  // Post-process: fix LLMs that return "select" for questions that should be "multi_select"
  const ALWAYS_MULTI_SELECT_IDS = new Set([
    'services', 'specializations', 'insurance', 'amenities', 'features',
    'product_categories', 'categories', 'certifications', 'payment_methods',
    'languages', 'menu_highlights', 'brands', 'treatments', 'programs',
  ]);

  for (const q of output.questions) {
    if (q.type === 'select' && q.options && q.options.length > 0) {
      if (ALWAYS_MULTI_SELECT_IDS.has(q.id)) {
        q.type = 'multi_select';
      } else if (q.options.length >= 5) {
        q.type = 'multi_select';
      }
    }
  }

  const outputJson = JSON.stringify(output, null, 2);
  debug?.logResponse({ response: outputJson, status: 'complete', finishReason: result.finishReason });
  debug?.logGenerationSummary?.({ finishReason: result.finishReason, hasFileOutput: false, toolCallCount: 0, structuredOutput: true, rawTextLength: outputJson.length, usage: result.usage });

  return output;
}
