import type { ProjectFiles } from '@/types';
import type { TemporalContext } from '@/lib/prompts/temporal-context';
import type { DesignBrief } from '@/lib/design-brief/types';
import { CURATED_PALETTES } from '@/lib/colors/palettes';

const CONTEXT_TRUNCATE_THRESHOLD = 2000;
const CONTEXT_HEAD_CHARS = 1500;
const CONTEXT_TAIL_CHARS = 300;

function truncateIfNeeded(content: string): string {
  if (content.length <= CONTEXT_TRUNCATE_THRESHOLD) return content;
  return `${content.slice(0, CONTEXT_HEAD_CHARS)}\n[... truncated ...]\n${content.slice(-CONTEXT_TAIL_CHARS)}`;
}

export function buildEditModeBlock(currentFiles?: ProjectFiles): string {
  if (!currentFiles?.['index.html']) return '';

  return `\n<edit_guidance>
Modify the existing HTML based on the user's request.
Do NOT start from scratch unless the user explicitly asks for a redesign.
Do NOT add pages unless the user explicitly asks.
When adding a page: use editDOM or editFile to add nav links to existing pages, then writeFiles for the new page only.
For small changes (text, images, colors, classes): prefer editDOM with CSS selectors.
For structural changes (new sections, rearranging layout): use editFile with search/replace.
For cross-page changes (nav, header, branding): use editFiles to batch all file edits in one call.
</edit_guidance>`;
}

export function buildCurrentWebsiteBlock(currentFiles?: ProjectFiles): string {
  if (!currentFiles?.['index.html']) return '';

  const fileList = Object.keys(currentFiles);

  if (fileList.length === 1) {
    return `\n<current_website>\nThe user has an existing website. Here is the current HTML:\n\`\`\`html\n${currentFiles['index.html']}\n\`\`\`\nModify THIS HTML based on the user's request.\nDo NOT start from scratch unless explicitly asked.\nWhen editing, consider the ENTIRE page context — maintain design consistency across all sections.\n</current_website>`;
  }

  // Multi-file: show each file
  let block = '\n<current_website>\nThe user has an existing multi-file website. Here are the current files:\n';
  for (const filePath of fileList) {
    const content = filePath === 'index.html'
      ? currentFiles[filePath]
      : truncateIfNeeded(currentFiles[filePath]);
    block += `\n<file path="${filePath}">\n${content}\n</file>\n`;
  }
  block += '\nModify THESE files based on the user\'s request.\nDo NOT start from scratch unless explicitly asked.\nWhen editing, consider ALL files — maintain design consistency.\nUnchanged files are preserved automatically — only include new or fully rewritten files in writeFiles.\n</current_website>';
  return block;
}

export function buildFirstGenerationBlock(isFirstGeneration: boolean): string {
  if (!isFirstGeneration) return '';

  const lightPalettes = CURATED_PALETTES
    .filter((p) => p.scheme === 'light')
    .map((p) => ({ name: p.name, roles: p.roles }));
  const darkPalettes = CURATED_PALETTES
    .filter((p) => p.scheme === 'dark')
    .map((p) => ({ name: p.name, roles: p.roles }));

  return `\n<first_generation>
This is a NEW website. Before generating code, briefly:
1. State what you'll build and the overall vibe/mood
2. Pick the best-fit color palette from the palettes below, then pick a font pairing
3. Then use the writeFiles tool to generate the HTML with the design system defined FIRST in <style>, using the palette values in your :root {} custom properties

If the user's request explicitly names multiple pages, include all requested pages in a single writeFiles call. Each page must be a complete standalone HTML document. Otherwise, generate a single index.html.

Make a strong first impression — the design should feel polished and intentional, not templated.
</first_generation>

<available_palettes>
Light palettes (use for light mode / default):
${JSON.stringify(lightPalettes)}

Dark palettes (use when user requests dark mode/theme):
${JSON.stringify(darkPalettes)}

Choose the palette that best fits the project's mood and industry. Use its hex values directly in your CSS custom properties.
</available_palettes>`;
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
