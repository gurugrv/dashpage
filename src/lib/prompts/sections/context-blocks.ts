import type { TemporalContext } from '@/lib/prompts/temporal-context';

export function buildEditModeBlock(currentHtml?: string): string {
  if (!currentHtml) return '';

  return `\n<output_modes>
You have TWO output modes. Choose based on the scope of changes:

**EDIT MODE** — Use for targeted changes (color tweaks, text updates, adding/removing a single element, CSS adjustments, fixing a bug, small layout tweaks). More efficient, preferred for small-medium changes.

Wrap your output in <editOperations> tags containing <edit> blocks:
<editOperations>
<edit>
<search>[exact text from current HTML to find]</search>
<replace>[replacement text]</replace>
</edit>
</editOperations>

Rules for edit mode:
- <search> must contain an EXACT substring copied from the current HTML (preserve whitespace and indentation precisely)
- Each <search> must match uniquely in the document — include enough surrounding context to be unambiguous
- Multiple <edit> blocks are applied in order, top to bottom
- You may use an empty <replace></replace> to delete content
- Before <editOperations>, explain what you're changing in 2-3 sentences
- After </editOperations>, add 1 short completion sentence naming what changed

**REWRITE MODE** — Use for major redesigns, structural overhauls, adding large new sections, completely new layouts, or when more than ~40% of the page changes. Wrap your output in <htmlOutput> tags (existing format).

Choose EDIT MODE by default when the change is localized. Choose REWRITE MODE when the change is fundamental or affects the majority of the page.
</output_modes>`;
}

export function buildCurrentWebsiteBlock(currentHtml?: string): string {
  if (!currentHtml) return '';

  return `\n<current_website>\nThe user has an existing website. Here is the current HTML:\n\`\`\`html\n${currentHtml}\n\`\`\`\nModify THIS HTML based on the user's request.\nDo NOT start from scratch unless explicitly asked.\nWhen editing, consider the ENTIRE page context — maintain design consistency across all sections.\n</current_website>`;
}

export function buildFirstGenerationBlock(isFirstGeneration: boolean): string {
  if (!isFirstGeneration) return '';

  return `\n<first_generation>
This is a NEW website. Before generating code, briefly:
1. State what you'll build and the overall vibe/mood
2. Pick a specific color palette (name the colors) and font pairing
3. Then generate the HTML with the design system defined FIRST in <style>

Make a strong first impression — the design should feel polished and intentional, not templated.
</first_generation>`;
}

export function buildTemporalBlock(temporalContext?: TemporalContext): string {
  if (!temporalContext) return '';

  return `\n<temporal_context>
Authoritative current date: ${temporalContext.currentDate} (${temporalContext.timeZone}).
Interpret "today/current/this year/recent" using this date context.
Use explicit dates when time period accuracy matters.
</temporal_context>`;
}
