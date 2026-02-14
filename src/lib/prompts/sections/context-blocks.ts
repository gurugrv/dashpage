import type { ProjectFiles } from '@/types';
import type { TemporalContext } from '@/lib/prompts/temporal-context';
import type { DesignBrief } from '@/lib/design-brief/types';
import { generateManifest } from '@/lib/prompts/manifest/generate-manifest';

export function buildEditModeBlock(currentFiles?: ProjectFiles): string {
  if (!currentFiles?.['index.html']) return '';

  const isMultiPage = Object.keys(currentFiles).length > 1;

  if (isMultiPage) {
    return `\n<edit_guidance>
Modify the existing HTML based on the user's request.
Do NOT start from scratch unless the user explicitly asks for a redesign.
Do NOT add pages unless the user explicitly asks.
When adding a page: use editDOM or editFile to add nav links to existing pages, then writeFiles for the new page only.
For small changes (text, images, colors, classes): prefer editDOM — use CSS selectors from the manifest above.
For structural changes (new sections, rearranging layout): call readFile FIRST to get exact content, then editFile with search/replace.
For cross-page changes (nav, header, branding): use editFiles to batch all file edits in one call.
IMPORTANT: Before using editFile, you MUST call readFile to inspect the exact file content. The manifest above is a structural summary — editFile needs precise text matches.
</edit_guidance>`;
  }

  return `\n<edit_guidance>
Modify the existing HTML based on the user's request.
Do NOT start from scratch unless the user explicitly asks for a redesign.
For small changes (text, images, colors, classes): use editDOM — use CSS selectors from the manifest above.
For structural changes or when you need exact content: call readFile FIRST, then use editFile.
For major changes or redesigns: use writeFiles with complete HTML.
IMPORTANT: Before using editFile, you MUST call readFile to inspect the exact file content. The manifest above is a structural summary — editFile needs precise text matches.
</edit_guidance>`;
}

export function buildCurrentWebsiteBlock(currentFiles?: ProjectFiles): string {
  if (!currentFiles?.['index.html']) return '';

  const manifest = generateManifest(currentFiles);
  const fileCount = Object.keys(currentFiles).length;
  const isMultiPage = fileCount > 1;

  const preamble = isMultiPage
    ? `The user has an existing multi-file website (${fileCount} files). Below is a structural manifest of each file.`
    : 'The user has an existing website. Below is a structural manifest of the page.';

  const instructions = isMultiPage
    ? 'Use readFile to inspect exact content before making editFile changes.\nMaintain design consistency across ALL files.\nUnchanged files are preserved automatically — only include new or fully rewritten files in writeFiles.'
    : 'Use readFile to inspect exact content before making editFile changes.\nWhen editing, consider the ENTIRE page context — maintain design consistency across all sections.';

  return `\n<current_website>
${preamble}

${manifest}

${instructions}
</current_website>`;
}

const STYLE_DIRECTIONS = [
  'vintage film warmth', 'Scandinavian minimalism', 'Mediterranean sun',
  'Japanese wabi-sabi', 'Art Deco opulence', 'desert twilight',
  'coastal morning', 'urban industrial', 'botanical garden',
  'moody editorial', 'tropical sunset', 'alpine freshness',
  'Bauhaus geometry', 'terracotta and clay', 'midnight jazz club',
  'morning coffee shop', 'autumn forest walk', 'ocean at dawn',
  'French patisserie', 'Brooklyn loft', 'Moroccan riad',
  'Northern lights', 'cherry blossom season', 'volcanic earth',
  'golden hour photography', 'rainy day cafe', 'Southwest desert',
  'Pacific Northwest moss', 'Tuscan vineyard', 'neon Tokyo night',
  'Danish hygge', 'Parisian bistro', 'coral reef depths',
  'sunset over lavender fields', 'misty Scottish highlands',
  'Cuban street colors', 'Vermont autumn', 'Kyoto temple garden',
  'Saharan dusk', 'Amalfi Coast tiles', 'Norwegian fjord',
];

function getRandomStyleDirection(): string {
  return STYLE_DIRECTIONS[Math.floor(Math.random() * STYLE_DIRECTIONS.length)];
}

export function buildFirstGenerationBlock(isFirstGeneration: boolean): string {
  if (!isFirstGeneration) return '';

  const styleDirection = getRandomStyleDirection();

  return `\n<first_generation>
This is a NEW website. Before generating code, briefly:
1. State what you'll build and the overall vibe/mood
2. Generate a unique color palette following the color_system rules, then pick a font pairing
3. Then use the writeFiles tool to generate the HTML with the design system defined FIRST in <style>, using your generated palette values in :root {} custom properties

If the user's request explicitly names multiple pages, include all requested pages in a single writeFiles call. Each page must be a complete standalone HTML document. Otherwise, generate a single index.html.

Make a strong first impression — the design should feel polished and intentional, not templated.
</first_generation>

<color_inspiration>
Color mood for this project: "${styleDirection}" — use this as a starting mood, then adapt to fit the user's actual request. Do NOT use this literally if it conflicts with the subject matter.
</color_inspiration>`;
}

export function buildDesignBriefBlock(brief?: DesignBrief, sharedStyles?: string, headTags?: string): string {
  if (!brief) return '';

  return `\n<design_system>
## Design System (MANDATORY)
Use these exact design tokens. Do NOT invent your own colors or fonts.

CSS Custom Properties (already in <head> via styles.css):
  --color-primary: ${brief.primaryColor}
  --color-secondary: ${brief.secondaryColor}
  --color-accent: ${brief.accentColor}
  --color-bg: ${brief.backgroundColor}
  --color-surface: ${brief.surfaceColor}
  --color-text: ${brief.textColor}
  --color-text-muted: ${brief.textMutedColor}

Typography: "${brief.headingFont}" for headings, "${brief.bodyFont}" for body
Border Radius: ${brief.borderRadius}
Mood: ${brief.mood}
Tone: ${brief.tone}
Primary CTA: "${brief.primaryCTA}"

Use Tailwind classes with these CSS variables:
  bg-[var(--color-primary)], text-[var(--color-text)], bg-[var(--color-surface)], etc.

The styles.css file and Google Fonts <head> tags are already provided — include them in your HTML.
${headTags ? `\nHead tags to include:\n${headTags}` : ''}
${sharedStyles ? `\nstyles.css content (include as styles.css in writeFiles):\n${sharedStyles}` : ''}
</design_system>`;
}

export function buildTemporalBlock(temporalContext?: TemporalContext): string {
  if (!temporalContext) return '';

  return `\n<temporal_context>
Authoritative current date: ${temporalContext.currentDate} (${temporalContext.timeZone}).
Interpret "today/current/this year/recent" using this date context.
Use explicit dates when time period accuracy matters.
</temporal_context>`;
}
