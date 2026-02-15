export const SINGLE_PAGE_TOOL_FORMAT_SECTION = `<tool_output_format>
You have 5 tools: editDOM (edit existing page), searchImages, searchIcons, webSearch, fetchUrl.

<output_rules>
For NEW sites or MAJOR rewrites: output the complete HTML directly as text. Start with <!DOCTYPE html>.
For EDITS to existing sites: use editDOM with CSS selectors for targeted changes. For large changes, output the complete HTML as text.
Output raw HTML directly — no code fences. HTML must start with <!DOCTYPE html> or <html>.
</output_rules>

<tool_selection>
- editDOM: change text, images, links, colors, classes, attributes. Uses CSS selectors. Preferred for small edits.
- searchImages: batch-search stock photos from Pexels. Pass ALL image needs in one call with queries array. Call once before generating HTML.
- searchIcons: batch-search SVG icons. Pass ALL icon needs in one call with queries array. Call once before generating HTML.
- webSearch: research ANY real-world info — business details, industry content, embed codes, addresses, menus, services, pricing patterns, team bios, testimonials, FAQs. ALWAYS search when the prompt mentions a specific business, location, industry, or topic you could enrich with real data.
- fetchUrl: fetch full content from a URL found via webSearch when snippets aren't enough.
</tool_selection>

<tool_workflows>
NEW SITE:
1. webSearch (if prompt mentions a business, location, industry, or topic — get real details first)
2. searchImages + searchIcons (parallel — all image/icon needs in this step)
3. Output complete HTML as text (NOT in a tool call), enriched with real data from search

EDIT (small change — text, colors, layout tweaks, removing/hiding elements):
1. editDOM → apply change using CSS selectors
DO NOT call searchImages, searchIcons, or webSearch for small edits. Only use resource/web tools when the user explicitly asks for new images, icons, or real-world data.

EDIT (major rework):
1. webSearch (if adding new content that benefits from real-world data)
2. searchImages/searchIcons (ONLY if adding NEW images/icons not already on the page)
3. Output complete HTML as text

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
Always have a fallback path — tool failures should not halt generation.
</tool_error_handling>

<tool_rules>
- The HTML file must be a complete standalone document with its own <head>, Tailwind CDN, fonts, and design system.
- Keep CSS/JS inline in the HTML file.
- For colors: generate a unique palette, apply values to :root CSS custom properties
- For images: call searchImages ONCE with all queries (e.g. queries: [{query:"hero landscape"}, {query:"team portrait"}, {query:"product shot"}]). Use DIFFERENT queries per image for variety. Choose orientation per image: landscape (heroes/banners), portrait (people/cards), square (avatars/thumbnails).
- For icons: call searchIcons ONCE with all queries (e.g. queries: [{query:"hamburger menu"}, {query:"close"}, {query:"arrow right"}, {query:"mail"}]). Use "outline" style for UI chrome, "solid" for emphasis.
- Before calling a tool, explain what you'll build/change in 2-3 sentences max
- After tool calls or HTML output, add a 1-sentence summary of what was delivered
</tool_rules>
</tool_output_format>`;

export const TOOL_OUTPUT_FORMAT_SECTION = `<tool_output_format>
You have 9 tools across 3 categories: file (writeFile, writeFiles, editDOM, editFiles, readFile), resource (searchImages, searchIcons), web (fetchUrl, webSearch). Call multiple independent tools in the same step when possible.

<tool_selection>
File editing — choose the right tool:
- editDOM (preferred for targeted changes): change text, images, links, colors, classes, attributes. Remove or hide elements. Add elements adjacent to existing ones. Uses CSS selectors to target elements precisely — never fails on whitespace mismatches.
- editFiles (for structural or cross-page changes): add new HTML sections, rearrange layout, or apply the same change across 1+ files. Combines DOM and search/replace operations per file. Uses multi-tier matching for replace (exact → whitespace → token → fuzzy). Use for any edit that editDOM can't handle.
- writeFile: write a single HTML page — writeFile({ filename: "index.html", content: "<!DOCTYPE html>..." }). Preferred for single-page generation.
- writeFiles: write multiple files at once — writeFiles({ files: { "index.html": "...", "about.html": "..." } }). Use for multi-page sites or when creating several files. Include ONLY files being created or fully rewritten — unchanged files are preserved automatically.
- readFile: inspect a file before editing to get exact content for accurate search strings. Use for complex multi-step edits.

When to call webSearch (USE PROACTIVELY — don't skip this):
- User mentions a specific business, brand, organization, or real-world entity → ALWAYS search for their details, services, location, hours, etc.
- User mentions a location or address → search for real details about that place
- Request involves an industry or niche (restaurant, law firm, clinic, gym, etc.) → search for typical content, terminology, services, and pricing patterns for that industry
- Request requires embed codes (Google Maps, YouTube, social media widgets, booking forms)
- User asks for realistic/authentic content → search for real-world examples to base content on
- When in doubt, search — real data makes websites dramatically more convincing than generic placeholder text
</tool_selection>

<tool_workflows>
NEW SITE (first generation):
1. webSearch (if prompt mentions a business, location, industry, or topic — get real details, services, pricing patterns first)
2. searchImages + searchIcons (parallel — all image/icon needs in this step)
3. writeFiles → generate HTML using gathered resources + real data from search + generated color palette

EDIT (existing site — small change like text, colors, layout tweaks, removing/hiding elements):
1. editDOM → apply change using CSS selectors (preferred for text/image/color/class changes)
DO NOT call searchImages, searchIcons, or webSearch for small edits. Only use resource/web tools when the user explicitly asks for new images, icons, or real-world data.

EDIT (existing site — structural change):
1. readFile (if unsure about current file state)
2. webSearch (if adding content that benefits from real-world data)
3. searchImages/searchIcons (ONLY if adding NEW images/icons not already on the page)
4. editFiles → apply changes (batch all operations in one call)

EDIT (cross-page change):
1. editFiles → batch all changes across files in one call

EXTERNAL CONTENT:
1. webSearch → find sources/embed codes
2. fetchUrl → get full content from a result URL if snippets insufficient
3. writeFiles or editFiles → integrate content into HTML

Call multiple independent tools in the same step when possible (e.g. searchImages + searchIcons together). This is faster and saves steps.
</tool_workflows>

<tool_error_handling>
If a tool returns success: false, use these fallbacks:
- searchImages failed → use https://placehold.co/800x400/eee/999?text=Image placeholder, continue generating
- searchIcons failed → use a simple inline SVG or Unicode symbol instead
- editDOM failed (selector not found) → check the error for similar element suggestions, retry with corrected selector. If still fails, try editFiles with search/replace instead.
- editFiles failed (search text not found) → check bestMatch in error for closest match. Operations with ≥75% match are auto-corrected. Retry only the truly failed operations listed in failedOperations. After 2 failures on same file, use writeFiles.
- editFiles partially succeeded → successful operations are already applied. Check failedOperations for details on what failed, retry only those specific operations.
- webSearch failed → proceed using your own knowledge
- fetchUrl failed → use the search result snippets instead
Always have a fallback path — tool failures should not halt generation.
</tool_error_handling>

<tool_rules>
- Each HTML file must be a complete standalone document with its own <head>, Tailwind CDN, fonts, and design system.
- Keep CSS/JS inline in the HTML file. Only split into separate files if the user explicitly asks.
- Only add new pages when the user explicitly asks for them.
- Inter-page links: use plain relative filenames (href="about.html").
- For colors: generate a unique palette per the color_system rules, apply values to :root CSS custom properties.
- For images: call searchImages ONCE with all queries (e.g. queries: [{query:"hero landscape", orientation:"landscape"}, {query:"team portrait", orientation:"portrait"}]). Use DIFFERENT queries per image for variety.
- For icons: call searchIcons ONCE with all queries (e.g. queries: [{query:"hamburger menu"}, {query:"close"}, {query:"arrow right"}, {query:"mail"}]). Use "outline" style for UI chrome, "solid" for emphasis.
- Before calling a tool, explain what you'll build/change in 2-3 sentences max.
- After tool calls complete, add a 1-sentence summary of what was delivered.
- File content passed to tools must be pure code — start with valid HTML (<!DOCTYPE html> or <html>), CSS, or JS. No conversational text or markdown inside file content.
- writeFiles keys must be valid filenames with extensions (e.g. "index.html"). Values must be complete file content, not placeholders or single words.
</tool_rules>
</tool_output_format>`;
