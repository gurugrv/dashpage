import type { ProjectFiles } from '@/types';
import type { TemporalContext } from '@/lib/prompts/temporal-context';

const CONTEXT_TRUNCATE_THRESHOLD = 2000;
const CONTEXT_HEAD_CHARS = 1500;
const CONTEXT_TAIL_CHARS = 300;

function truncateIfNeeded(content: string): string {
  if (content.length <= CONTEXT_TRUNCATE_THRESHOLD) return content;
  return `${content.slice(0, CONTEXT_HEAD_CHARS)}\n[... truncated ...]\n${content.slice(-CONTEXT_TAIL_CHARS)}`;
}

export function buildEditModeBlock(currentFiles?: ProjectFiles): string {
  if (!currentFiles?.['index.html']) return '';

  const fileList = Object.keys(currentFiles);
  const hasMultipleFiles = fileList.length > 1;

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
${hasMultipleFiles ? `
To edit a specific file, use the file attribute:
<editOperations file="about.html">
<edit>
<search>[exact text from the file]</search>
<replace>[replacement text]</replace>
</edit>
</editOperations>
Without the file attribute, edits target index.html by default.
` : ''}
Rules for edit mode:
- <search> must contain an EXACT substring copied from the current file (preserve whitespace and indentation precisely)
- Each <search> must match uniquely in the document — include enough surrounding context to be unambiguous
- Multiple <edit> blocks are applied in order, top to bottom
- You may use an empty <replace></replace> to delete content
- Before <editOperations>, explain what you're changing in 2-3 sentences
- After </editOperations>, add 1 short completion sentence naming what changed

**REWRITE MODE** — Use for major redesigns, structural overhauls, adding large new sections, completely new layouts, or when more than ~40% of the page changes.${hasMultipleFiles ? ' Use <fileArtifact> with ALL files for multi-file rewrites, or <editOperations file="..."> for targeted edits.' : ' Wrap your output in <htmlOutput> tags.'}
${!hasMultipleFiles ? `
**ADDING A PAGE** — If the user asks to add a new page (e.g. "add an about page", "create a contact page"), use <fileArtifact> containing BOTH the existing index.html AND the new page. This transitions the project to multi-file. Do NOT add pages unless the user explicitly requests them.
` : ''}
Choose EDIT MODE by default when the change is localized. Choose REWRITE MODE when the change is fundamental or affects the majority of the page.
</output_modes>`;
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
  block += '\nModify THESE files based on the user\'s request.\nDo NOT start from scratch unless explicitly asked.\nWhen editing, consider ALL files — maintain design consistency.\n</current_website>';
  return block;
}

export function buildFirstGenerationBlock(isFirstGeneration: boolean): string {
  if (!isFirstGeneration) return '';

  return `\n<first_generation>
This is a NEW website. Before generating code, briefly:
1. State what you'll build and the overall vibe/mood
2. Pick a specific color palette (name the colors) and font pairing
3. Then generate the HTML with the design system defined FIRST in <style>

If the user's request explicitly names multiple pages (e.g. "with home, about, and contact pages"), use <fileArtifact> with all requested pages. Each page must be a complete standalone HTML document. Otherwise, use <htmlOutput> for a single-file site.

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
