# Tool Prompt Optimization Design

**Date:** 2026-02-14
**Status:** Draft

## Problem

The system prompt and tool definitions have 10 issues that hurt site generation quality:

1. No tool call sequencing/workflow guidance
2. No error handling instructions for tool failures
3. No tool return value documentation in prompts
4. Tool call step limit undocumented in prompts (now 10/5)
5. Blueprint pages prompt references unavailable tools, ignores available ones
6. Vague editFile vs writeFiles decision criteria ("40%" threshold)
7. validateHtml marked "optional" instead of recommended
8. webSearch lacks clear trigger conditions
9. No multi-tool batching/parallel call guidance
10. Duplicate tool docs across `base-rules.ts` and `tool-output-format.ts`

## Research Findings

Consistent pattern across Anthropic, OpenAI, Cursor, and Bolt.new:

| Where | What belongs there |
|-------|-------------------|
| **Tool definitions** (Zod `.describe()`) | WHAT the tool does, parameters, return values, limitations |
| **System prompt** | WHEN/HOW to use tools — workflows, decision trees, error handling |

Key insights:
- **Anthropic**: "Tool descriptions should be as detailed as possible" — SOTA on SWE-bench via precise tool description refinements
- **OpenAI**: "Describe functionality in the tool definition and how/when to use tools in the prompt"
- **Cursor**: Keeps system prompt + tool definitions fully static for prompt caching efficiency
- **Anthropic**: Tool Use Examples improved accuracy 72% → 90%
- **Both vendors**: Parallel tool calling when tools are independent; sequential when dependent

## Approach

**Approach A (selected): Consolidate behavioral guidance into `tool-output-format.ts`**

- Enhance tool-level Zod descriptions with return values and limitations
- System prompt `tool-output-format.ts` focuses on behavioral guidance: workflows, decision trees, error handling
- Remove duplication from `base-rules.ts`
- Keep content static for prompt caching

## Design

### Part A: Enhanced Tool Definitions (Zod schemas)

Each tool's `description` and `.describe()` calls get enhanced with return value fields and limitations. The tool definition answers "WHAT does this tool do?"

#### writeFiles
```
Current description:
"Create or rewrite complete HTML files. Use for new sites, major redesigns (>40% of page changes), or adding new pages. Include ONLY new or rewritten files — unchanged files are preserved automatically."

New description:
"Create or rewrite complete HTML files. Use for new sites, major redesigns, structural overhauls, or adding new pages. Include ONLY files being created or fully rewritten — unchanged files are preserved automatically. Returns { success, files } with the written file map."
```

#### editFile
```
Current description:
"Apply targeted search/replace edits to an existing file. Use for small-medium changes: colors, text, adding/removing elements, CSS tweaks, bug fixes. Each search string must match EXACTLY in the file (including whitespace). Preferred over writeFiles when changes are localized."

New description:
"Apply targeted search/replace edits to an existing file. Each search string must match EXACTLY including whitespace and indentation. Batch multiple changes into one call using the operations array. Returns { success, file, content } on success. On failure returns { success: false, error } with the failed operation index — fall back to readFile then writeFiles if exact match fails."
```

#### readFile
```
Current description:
"Read the current contents of a file. Use to inspect a file before editing, or to verify changes after an edit. Useful for multi-step edits where you need to see the current state."

New description:
"Read the current contents of a file. Returns { success, file, content, length }. Use before editFile to see exact whitespace/indentation for accurate search strings, or after edits to verify changes."
```

#### searchImages
```
Current description:
"Search for high-quality stock photos from Pexels. Returns image URLs you can use directly in <img> tags. Call this BEFORE writing HTML that needs images — pick the best result for each placement. Use descriptive, specific queries for better results."

New description:
"Search for stock photos from Pexels. Returns { success, images: [{ url, alt, photographer, width, height }] }. Use url in src, alt in alt attribute. Use DIFFERENT queries per image for variety. Call once per distinct image subject — batch all image searches before writing HTML."
```

#### searchIcons
```
Current description:
"Search for SVG icons from Lucide, Heroicons, Tabler, and Phosphor icon libraries. Returns inline SVG markup you can use directly in HTML. Call this BEFORE writing HTML that needs icons — pick the best result for each placement. Icons use currentColor for stroke/fill so they inherit the parent text color."

New description:
"Search for SVG icons from Lucide, Heroicons, Tabler, and Phosphor. Returns { success, icons: [{ name, set, svg, style }] }. Paste the svg string directly into HTML markup. Icons use currentColor so they inherit the parent element's text color automatically."
```

#### generateColorPalette
```
Current description:
"Generate a harmonious color palette from a base color. Call BEFORE writing HTML to get your design system colors. Returns CSS custom property values (primary, secondary, accent, bg, surface, text, textMuted) plus WCAG contrast checks. Pick the harmony type that matches the mood."

New description:
"Generate a harmonious color palette from a base color. Returns { success, primary, secondary, accent, bg, surface, text, textMuted, contrastChecks }. Use the returned hex values directly in your :root CSS custom properties. If any contrastCheck shows FAIL, adjust baseColor slightly and re-call."
```

#### fetchUrl
```
Current description:
"Fetch content from a public URL. Use to retrieve API data, webpage content, or structured data to incorporate into the website. Returns text content (HTML, JSON, XML, plain text). Cannot access private/internal URLs."

New description:
"Fetch content from a public URL. Returns { success, content, contentType, length, truncated }. Supports HTML, JSON, XML, plain text. Max 50KB (truncated if larger). 10s timeout. Cannot access localhost or private IPs."
```

#### webSearch
```
Current description:
"Quick web search for reference content, embed codes, design inspiration, or factual data. Returns snippets — use fetchUrl if you need full page content from a result URL. Keep queries short and specific (2-10 words)."

New description:
"Web search for external reference content. Returns { success, results: [{ title, url, snippet }] }. Chain with fetchUrl if snippets are insufficient. Keep queries short and specific (2-10 words)."
```

#### validateHtml
```
Current description:
"Validate an HTML file for syntax errors and common issues. Use after writing or editing files to catch problems. Returns errors with line numbers so you can fix them with editFile."

New description:
"Validate an HTML file for syntax errors. Returns { success, valid, errorCount, warningCount, issues: [{ severity, message, line, column }] }. Max 10 issues returned. Fix errors with editFile using the line numbers as reference."
```

### Part B: Rewritten `tool-output-format.ts`

The system prompt section focuses on WHEN/HOW — behavioral guidance only. No longer duplicates tool descriptions (those live in tool definitions).

```
<tool_output_format>
You have 9 tools across 5 categories: file (writeFiles, editFile, readFile), resource (searchImages, searchIcons, generateColorPalette), web (fetchUrl, webSearch), and validation (validateHtml). You can make up to 10 tool calls per turn.

<tool_selection>
File tool decision:
- editFile: targeted changes — colors, text, adding/removing elements, CSS tweaks, bug fixes. Batch multiple changes into one call with multiple operations. Preferred when changes are localized.
- writeFiles: new files, complete redesigns, structural overhauls, or when editFile fails (exact match not found). Include ONLY files being created or rewritten.
- readFile: inspect a file before editing to get exact whitespace for accurate search strings. Use for complex multi-step edits.

When to call webSearch:
- User mentions a specific business, brand, or real-world entity you need facts about
- Request requires current embed codes (Google Maps, YouTube, social media widgets)
- Industry-specific terminology, pricing, or data you're unsure about
- Do NOT search for: basic HTML/CSS patterns, common design layouts, Tailwind classes
</tool_selection>

<tool_workflows>
NEW SITE (first generation):
1. generateColorPalette → get design system colors
2. searchImages + searchIcons (parallel — all image/icon needs in this step)
3. writeFiles → generate HTML using all gathered resources
4. validateHtml → check for errors
5. editFile → fix any errors found

EDIT (existing site):
1. readFile (if unsure about current file state)
2. searchImages/searchIcons (if adding new visual elements)
3. editFile → apply changes (batch all operations in one call)
4. validateHtml → verify correctness
5. editFile → fix any errors found

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
- generateColorPalette failed → pick colors manually, define in :root
- editFile failed (search text not found) → call readFile to see current state, then use writeFiles with complete replacement
- webSearch failed → proceed using your own knowledge
- fetchUrl failed → use the search result snippets instead
- validateHtml failed → file likely doesn't exist yet, generate with writeFiles first

Never let a tool failure halt generation. Always have a fallback path.
</tool_error_handling>

<tool_rules>
- Each HTML file must be a complete standalone document with its own <head>, Tailwind CDN, fonts, and design system
- Never split CSS/JS into separate files unless the user explicitly asks
- Never add pages unless the user explicitly asks
- Inter-page links: use plain relative filenames (href="about.html")
- For colors: use generateColorPalette first, then apply returned values to :root CSS custom properties
- For images: use DIFFERENT search queries per image to ensure variety. Choose orientation: landscape (heroes/banners), portrait (people/cards), square (avatars/thumbnails)
- Call validateHtml after writeFiles or editFile to catch syntax errors before finishing
- Before calling a tool, explain what you'll build/change in 2-3 sentences max
- After tool calls complete, add a 1-sentence summary of what was delivered
</tool_rules>
</tool_output_format>
```

### Part C: Changes to `base-rules.ts`

Remove rules that are now in `tool-output-format.ts`:
- **Remove rule 1** ("Use the writeFiles and editFile tools...") → covered by `<tool_selection>`
- **Remove rule 6** ("For images, use the searchImages tool...") → covered by `<tool_rules>` and tool definitions
- **Remove rule 9** ("Before calling a tool, explain...") → covered by `<tool_rules>`
- **Remove rule 10** ("After the tool call, add 1 short...") → covered by `<tool_rules>`

Keep and renumber remaining rules:
```
<rules>
1. Generate complete, self-contained website files. Each HTML page is a standalone document.
2. Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
3. All custom CSS goes in <style> tags, all scripts in <script> tags.
4. Make designs responsive — mobile-first using Tailwind prefixes (sm:, md:, lg:).
5. Include Google Fonts via CDN link in <head>.
6. ALWAYS output the COMPLETE HTML document. Never use placeholders like "rest of content here."
7. ALWAYS define a design system in <style> using CSS custom properties BEFORE any markup uses them.
</rules>
```

### Part D: Changes to `context-blocks.ts` edit_guidance

Remove tool selection advice (now in `<tool_selection>`). Keep only edit-specific behavioral hints:

```
<edit_guidance>
Modify the existing HTML based on the user's request.
Do NOT start from scratch unless the user explicitly asks for a redesign.
Do NOT add pages unless the user explicitly asks.
When adding a page: use editFile to add nav links to existing pages, then writeFiles for the new page only.
</edit_guidance>
```

### Part E: Blueprint `page-system-prompt.ts` fix

Replace the current requirement 7 (line 160) which only mentions searchImages/searchIcons:

```
Current (line 160):
"7. For images, use the searchImages tool to find real photos from Pexels. Call it BEFORE writing HTML that needs images, then use the returned URLs directly in <img> tags. Use descriptive 2-5 word queries. Use DIFFERENT queries per image. For icons, use the searchIcons tool."

New:
"7. Available tools: searchImages (stock photos), searchIcons (SVG icons), generateColorPalette (color harmony), fetchUrl (external content). Call resource tools BEFORE writing HTML. File tools (writeFiles, editFile, readFile) and webSearch are NOT available — output the complete HTML directly. Use DIFFERENT image queries per image for variety."
```

## Files Changed

| File | Change |
|------|--------|
| `src/lib/prompts/sections/tool-output-format.ts` | Rewrite with 5 subsections |
| `src/lib/prompts/sections/base-rules.ts` | Remove rules 1, 6, 9, 10; renumber |
| `src/lib/prompts/sections/context-blocks.ts` | Slim down `edit_guidance` block |
| `src/lib/blueprint/prompts/page-system-prompt.ts` | Fix requirement 7 tool availability |
| `src/lib/chat/tools/file-tools.ts` | Enhance tool descriptions |
| `src/lib/chat/tools/image-tools.ts` | Enhance tool description |
| `src/lib/chat/tools/icon-tools.ts` | Enhance tool description |
| `src/lib/chat/tools/color-tools.ts` | Enhance tool description |
| `src/lib/chat/tools/web-tools.ts` | Enhance tool description |
| `src/lib/chat/tools/search-tools.ts` | Enhance tool description |
| `src/lib/chat/tools/validation-tools.ts` | Enhance tool description |

## Token Impact

- Removing duplication from `base-rules.ts` saves ~200 tokens
- New `tool-output-format.ts` is ~100 tokens larger than current
- Net: ~100 tokens more, but better organized for prompt caching (static content)
- Tool definition enhancements add ~50 tokens total across all tools (return value docs)

## Verification

1. `npm run build` passes (TypeScript compiles)
2. Manual test: new site generation uses correct workflow (palette → images → write → validate)
3. Manual test: edit workflow reads file before editing when needed
4. Manual test: blueprint page generation mentions correct available tools
5. Diff review: no content lost, only reorganized + enhanced
