import type { ProjectFiles } from '@/types';
import type { TemporalContext } from '@/lib/prompts/temporal-context';
import type { BusinessProfileData } from '@/lib/discovery/types';
import { buildBusinessContextBlock } from '@/lib/discovery/build-business-context';
import { getBaseRulesSection } from '@/lib/prompts/sections/base-rules';
import {
  buildCurrentWebsiteBlock,
  buildEditModeBlock,
  buildFirstGenerationBlock,
  buildTemporalBlock,
  LAYOUT_ARCHETYPES_SECTION,
} from '@/lib/prompts/sections/context-blocks';
import { INTERACTIVITY_SECTION } from '@/lib/prompts/sections/interactivity';
import { TOOL_OUTPUT_FORMAT_SECTION } from '@/lib/prompts/sections/tool-output-format';
import { UI_UX_GUIDELINES_SECTION } from '@/lib/prompts/sections/ui-ux-guidelines';

export interface SystemPromptParts {
  stable: string;
  dynamic: string;
}

const IDENTITY_LINE = `You are WebBuilder, an expert web designer and developer who creates distinctive, production-ready websites. Your output should feel like a $5,000 agency portfolio piece — distinctive, intentional, crafted. Every design choice must be intentional.`;

const CLOSING_LINE = `IMPORTANT: Prioritize visual impact in the first viewport — the hero section sells the entire site. Be concise in explanations, bold in design.`;

const CREATIVE_REINFORCEMENT = `<creative_reinforcement>
Your output should feel like a $5,000 agency portfolio piece — distinctive, intentional, crafted. Follow the design seed's visual style archetype to guide every layout and composition decision. The design_quality section has your full creative toolkit.
</creative_reinforcement>`;

/**
 * Returns the system prompt split into stable (cacheable) and dynamic parts.
 * The stable part contains the identity, base rules, UI/UX guidelines, and tool format —
 * content that rarely changes between requests. The dynamic part contains temporal context,
 * current website state, and edit mode instructions.
 */
export function getSystemPromptParts(
  currentFiles?: ProjectFiles,
  temporalContext?: TemporalContext,
  userPrompt?: string,
  provider?: string,
  modelId?: string,
  businessProfile?: BusinessProfileData | null,
): SystemPromptParts {
  const isFirstGeneration = !currentFiles || !Object.keys(currentFiles).some(f => f.endsWith('.html'));
  const toolSection = TOOL_OUTPUT_FORMAT_SECTION;

  const stable = `${IDENTITY_LINE}

${getBaseRulesSection(isFirstGeneration)}
${UI_UX_GUIDELINES_SECTION}
${CREATIVE_REINFORCEMENT}
${LAYOUT_ARCHETYPES_SECTION}
${toolSection}
${INTERACTIVITY_SECTION}`;

  const dynamic = `${buildTemporalBlock(temporalContext)}${buildBusinessContextBlock(businessProfile ?? null)}${buildFirstGenerationBlock(isFirstGeneration, userPrompt)}${buildCurrentWebsiteBlock(currentFiles)}${buildEditModeBlock(currentFiles)}

${CLOSING_LINE}`;

  return { stable, dynamic };
}

export function getSystemPrompt(
  currentFiles?: ProjectFiles,
  temporalContext?: TemporalContext,
  userPrompt?: string,
  provider?: string,
  modelId?: string,
  businessProfile?: BusinessProfileData | null,
): string {
  const { stable, dynamic } = getSystemPromptParts(currentFiles, temporalContext, userPrompt, provider, modelId, businessProfile);
  return stable + '\n' + dynamic;
}
