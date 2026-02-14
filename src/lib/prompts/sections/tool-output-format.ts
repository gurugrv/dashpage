export const SINGLE_PAGE_TOOL_FORMAT_SECTION = `<tool_output_format>
You have 5 tools: editDOM (edit existing page), searchImages, searchIcons, webSearch, fetchUrl.

<output_rules>
For NEW sites or MAJOR rewrites: output the complete HTML directly as text. Start with <!DOCTYPE html>.
For EDITS to existing sites: use editDOM with CSS selectors for targeted changes. For large changes, output the complete HTML as text.
Do NOT wrap HTML in code fences. Output raw HTML directly.
NEVER include conversational text inside your HTML output. HTML must start with <!DOCTYPE html> or <html>.
</output_rules>

<tool_selection>
- editDOM: change text, images, links, colors, classes, attributes. Uses CSS selectors. Preferred for small edits.
- searchImages: find stock photos from Pexels. Call before generating HTML when images are needed.
- searchIcons: find SVG icons. Call before generating HTML when icons are needed.
- webSearch: research business info, embed codes, real-world data.
- fetchUrl: fetch content from a URL found via webSearch.
</tool_selection>

<tool_workflows>
NEW SITE:
1. searchImages + searchIcons (parallel — all image/icon needs in this step)
2. Output complete HTML as text (NOT in a tool call)

EDIT (small change):
1. editDOM → apply change using CSS selectors

EDIT (major rework):
1. searchImages/searchIcons (if needed)
2. Output complete HTML as text

EXTERNAL CONTENT:
1. webSearch → fetchUrl → output HTML as text or editDOM

Call multiple independent tools in the same step when possible (e.g. searchImages + searchIcons together).
</tool_workflows>

<tool_error_handling>
- searchImages failed → use https://placehold.co/800x400/eee/999?text=Image placeholder, continue generating
- searchIcons failed → use a simple inline SVG or Unicode symbol instead
- editDOM failed (selector not found) → check the error for suggestions, retry with corrected selector. If still fails, output the complete HTML as text instead.
- webSearch failed → proceed using your own knowledge
- fetchUrl failed → use the search result snippets instead
Never let a tool failure halt generation. Always have a fallback path.
</tool_error_handling>

<tool_rules>
- The HTML file must be a complete standalone document with its own <head>, Tailwind CDN, fonts, and design system
- Never split CSS/JS into separate files unless the user explicitly asks
- For colors: generate a unique palette, apply values to :root CSS custom properties
- For images: use DIFFERENT search queries per image to ensure variety
- Before calling a tool, explain what you'll build/change in 2-3 sentences max
- After tool calls or HTML output, add a 1-sentence summary of what was delivered
</tool_rules>
</tool_output_format>`;

export const TOOL_OUTPUT_FORMAT_SECTION = `<tool_output_format>
You have 9 tools across 3 categories: file (writeFiles, editDOM, editFile, editFiles, readFile), resource (searchImages, searchIcons), web (fetchUrl, webSearch). Call multiple independent tools in the same step when possible.

<tool_selection>
File editing — choose the right tool:
- editDOM (preferred for targeted changes): change text, images, links, colors, classes, attributes. Remove or hide elements. Add elements adjacent to existing ones. Uses CSS selectors to target elements precisely — never fails on whitespace mismatches.
- editFile (for structural/block changes): add new HTML sections or blocks of code. Rearrange or reorder sections. Complex changes spanning multiple nested elements. Changes where CSS selectors can't isolate the target. Uses multi-tier matching (exact → whitespace → token → fuzzy).
- editFiles (for cross-page changes): same change needed on 2+ files (nav links, headers, footers, branding). Combines DOM and search/replace operations in one call. Each file can use DOM operations, replace operations, or both.
- writeFiles: new files, complete redesigns, structural overhauls, or when editFile fails twice on the same file. Include ONLY files being created or fully rewritten — unchanged files are preserved automatically.
- readFile: inspect a file before editing to get exact content for accurate search strings. Use for complex multi-step edits.

When to call webSearch:
- User mentions a specific business, brand, or real-world entity you need facts about
- Request requires current embed codes (Google Maps, YouTube, social media widgets)
- Industry-specific terminology, pricing, or data you're unsure about
- Do NOT search for: basic HTML/CSS patterns, common design layouts, Tailwind classes
</tool_selection>

<tool_workflows>
NEW SITE (first generation):
1. searchImages + searchIcons (parallel — all image/icon needs in this step)
2. writeFiles → generate HTML using gathered resources + generated color palette

EDIT (existing site — small change):
1. editDOM → apply change using CSS selectors (preferred for text/image/color/class changes)

EDIT (existing site — structural change):
1. readFile (if unsure about current file state)
2. searchImages/searchIcons (if adding new visual elements)
3. editFile → apply changes (batch all operations in one call)

EDIT (cross-page change):
1. editFiles → batch all changes across files in one call

EXTERNAL CONTENT:
1. webSearch → find sources/embed codes
2. fetchUrl → get full content from a result URL if snippets insufficient
3. writeFiles or editFile → integrate content into HTML

Call multiple independent tools in the same step when possible (e.g. searchImages + searchIcons together). This is faster and saves steps.
</tool_workflows>

<tool_error_handling>
If a tool returns success: false, use these fallbacks:
- searchImages failed → use https://placehold.co/800x400/eee/999?text=Image placeholder, continue generating
- searchIcons failed → use a simple inline SVG or Unicode symbol instead
- editDOM failed (selector not found) → check the error for similar element suggestions, retry with corrected selector. If still fails, try editFile with search/replace instead.
- editFile failed (search text not found) → check bestMatch in error for closest match. If partial success, retry just the failed operations. After 2 failures on same file, use writeFiles.
- editFiles partially failed → check per-file results, retry failed files individually
- webSearch failed → proceed using your own knowledge
- fetchUrl failed → use the search result snippets instead
Never let a tool failure halt generation. Always have a fallback path.
</tool_error_handling>

<tool_rules>
- Each HTML file must be a complete standalone document with its own <head>, Tailwind CDN, fonts, and design system
- Never split CSS/JS into separate files unless the user explicitly asks
- Never add pages unless the user explicitly asks
- Inter-page links: use plain relative filenames (href="about.html")
- For colors: generate a unique palette per the color_system rules, apply values to :root CSS custom properties
- For images: use DIFFERENT search queries per image to ensure variety. Choose orientation: landscape (heroes/banners), portrait (people/cards), square (avatars/thumbnails)
- Before calling a tool, explain what you'll build/change in 2-3 sentences max
- After tool calls complete, add a 1-sentence summary of what was delivered
- NEVER include conversational text, explanations, or markdown inside file content passed to tools. File content must start with valid HTML (<!DOCTYPE html> or <html>), CSS, or JS — no preamble text.
</tool_rules>
</tool_output_format>`;
