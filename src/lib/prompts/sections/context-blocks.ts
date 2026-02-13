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

  return `\n<edit_guidance>
Choose the right tool based on scope:
- **editFile** — for targeted changes (colors, text, elements, CSS, bug fixes). Preferred when changes are localized.
- **writeFiles** — for major redesigns, structural overhauls, or when more than ~40% of the page changes. Include ONLY rewritten files.
- **Adding a page** — use editFile to add nav links to existing pages, then writeFiles for the new page only. Do NOT add pages unless the user explicitly asks.

You can call both tools in the same turn when needed (e.g. editFile for nav links + writeFiles for a new page).
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

  return `\n<first_generation>
This is a NEW website. Before generating code, briefly:
1. State what you'll build and the overall vibe/mood
2. Pick a specific color palette (name the colors) and font pairing
3. Then use the writeFiles tool to generate the HTML with the design system defined FIRST in <style>

If the user's request explicitly names multiple pages, include all requested pages in a single writeFiles call. Each page must be a complete standalone HTML document. Otherwise, generate a single index.html.

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
