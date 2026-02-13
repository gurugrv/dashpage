# Tool Prompt Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 10 prompt issues to improve AI tool calling quality during site generation by consolidating tool guidance, enhancing tool definitions, and eliminating duplication.

**Architecture:** Two-layer approach — enhance tool-level Zod descriptions with return values/limitations (WHAT), rewrite system prompt `tool-output-format.ts` with behavioral guidance (WHEN/HOW). Remove duplicated tool content from `base-rules.ts` and `context-blocks.ts`. Fix blueprint page prompt tool availability.

**Tech Stack:** TypeScript, Vercel AI SDK 6 `tool()`, Zod schemas, Next.js

**Design doc:** `docs/plans/2026-02-14-tool-prompt-fixes-design.md`

**No test framework configured** — verification is `npm run build` + manual testing.

---

### Task 1: Enhance File Tool Definitions

**Files:**
- Modify: `src/lib/chat/tools/file-tools.ts`

**Step 1: Update writeFiles description**

In `file-tools.ts`, replace the `writeFiles` tool description:

```typescript
description:
  'Create or rewrite complete HTML files. Use for new sites, major redesigns, structural overhauls, or adding new pages. Include ONLY files being created or fully rewritten — unchanged files are preserved automatically. Returns { success, files } with the written file map.',
```

**Step 2: Update editFile description**

Replace the `editFile` tool description:

```typescript
description:
  'Apply targeted search/replace edits to an existing file. Each search string must match EXACTLY including whitespace and indentation. Batch multiple changes into one call using the operations array. Returns { success, file, content } on success. On failure returns { success: false, error } with the failed operation index — fall back to readFile then writeFiles if exact match fails.',
```

**Step 3: Update readFile description**

Replace the `readFile` tool description:

```typescript
description:
  'Read the current contents of a file. Returns { success, file, content, length }. Use before editFile to see exact whitespace/indentation for accurate search strings, or after edits to verify changes.',
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Compiles successfully with no errors.

**Step 5: Commit**

```bash
git add src/lib/chat/tools/file-tools.ts
git commit -m "refactor(prompts): enhance file tool descriptions with return values"
```

---

### Task 2: Enhance Resource Tool Definitions

**Files:**
- Modify: `src/lib/chat/tools/image-tools.ts`
- Modify: `src/lib/chat/tools/icon-tools.ts`
- Modify: `src/lib/chat/tools/color-tools.ts`

**Step 1: Update searchImages description**

In `image-tools.ts`, replace the `searchImages` tool description:

```typescript
description:
  'Search for stock photos from Pexels. Returns { success, images: [{ url, alt, photographer, width, height }] }. Use url in src, alt in alt attribute. Use DIFFERENT queries per image for variety. Call once per distinct image subject — batch all image searches before writing HTML.',
```

**Step 2: Update searchIcons description**

In `icon-tools.ts`, replace the `searchIcons` tool description:

```typescript
description:
  'Search for SVG icons from Lucide, Heroicons, Tabler, and Phosphor. Returns { success, icons: [{ name, set, svg, style }] }. Paste the svg string directly into HTML markup. Icons use currentColor so they inherit the parent element\'s text color automatically.',
```

**Step 3: Update generateColorPalette description**

In `color-tools.ts`, replace the `generateColorPalette` tool description:

```typescript
description:
  'Generate a harmonious color palette from a base color. Returns { success, primary, secondary, accent, bg, surface, text, textMuted, contrastChecks }. Use the returned hex values directly in your :root CSS custom properties. If any contrastCheck shows FAIL, adjust baseColor slightly and re-call.',
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Compiles successfully.

**Step 5: Commit**

```bash
git add src/lib/chat/tools/image-tools.ts src/lib/chat/tools/icon-tools.ts src/lib/chat/tools/color-tools.ts
git commit -m "refactor(prompts): enhance resource tool descriptions with return values"
```

---

### Task 3: Enhance Web, Search, and Validation Tool Definitions

**Files:**
- Modify: `src/lib/chat/tools/web-tools.ts`
- Modify: `src/lib/chat/tools/search-tools.ts`
- Modify: `src/lib/chat/tools/validation-tools.ts`

**Step 1: Update fetchUrl description**

In `web-tools.ts`, replace the `fetchUrl` tool description:

```typescript
description:
  'Fetch content from a public URL. Returns { success, content, contentType, length, truncated }. Supports HTML, JSON, XML, plain text. Max 50KB (truncated if larger). 10s timeout. Cannot access localhost or private IPs.',
```

**Step 2: Update webSearch description**

In `search-tools.ts`, replace the `webSearch` tool description:

```typescript
description:
  'Web search for external reference content. Returns { success, results: [{ title, url, snippet }] }. Chain with fetchUrl if snippets are insufficient. Keep queries short and specific (2-10 words).',
```

**Step 3: Update validateHtml description**

In `validation-tools.ts`, replace the `validateHtml` tool description:

```typescript
description:
  'Validate an HTML file for syntax errors. Returns { success, valid, errorCount, warningCount, issues: [{ severity, message, line, column }] }. Max 10 issues returned. Fix errors with editFile using the line numbers as reference.',
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Compiles successfully.

**Step 5: Commit**

```bash
git add src/lib/chat/tools/web-tools.ts src/lib/chat/tools/search-tools.ts src/lib/chat/tools/validation-tools.ts
git commit -m "refactor(prompts): enhance web, search, and validation tool descriptions"
```

---

### Task 4: Rewrite `tool-output-format.ts`

This is the core change. Replaces the current tool documentation section with behavioral guidance organized into 5 subsections.

**Files:**
- Modify: `src/lib/prompts/sections/tool-output-format.ts`

**Step 1: Replace entire file content**

Replace the full content of `tool-output-format.ts` with:

```typescript
export const TOOL_OUTPUT_FORMAT_SECTION = `<tool_output_format>
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
</tool_output_format>`;
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Compiles successfully.

**Step 3: Commit**

```bash
git add src/lib/prompts/sections/tool-output-format.ts
git commit -m "refactor(prompts): rewrite tool-output-format with workflows, error handling, and selection guidance"
```

---

### Task 5: Clean Up `base-rules.ts`

Remove rules 1, 6, 9, 10 that are now covered by `tool-output-format.ts`. Renumber remaining rules.

**Files:**
- Modify: `src/lib/prompts/sections/base-rules.ts`

**Step 1: Replace the rules block**

In `base-rules.ts`, replace the `<rules>` block (lines 4-20, the template literal content before `</rules>`) with:

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

**Removed:**
- Old rule 1: "Use the writeFiles and editFile tools..." → now in `<tool_selection>`
- Old rule 6: "For images, use the searchImages tool..." → now in `<tool_rules>` and tool definitions
- Old rule 9: "Before calling a tool, explain..." → now in `<tool_rules>`
- Old rule 10: "After the tool call, add 1 short..." → now in `<tool_rules>`

**Step 2: Verify build**

Run: `npm run build`
Expected: Compiles successfully.

**Step 3: Commit**

```bash
git add src/lib/prompts/sections/base-rules.ts
git commit -m "refactor(prompts): remove duplicate tool guidance from base-rules"
```

---

### Task 6: Slim Down `edit_guidance` in `context-blocks.ts`

Remove tool selection advice (now in `<tool_selection>`). Keep only edit-specific behavioral hints.

**Files:**
- Modify: `src/lib/prompts/sections/context-blocks.ts`

**Step 1: Replace the edit_guidance block**

In `context-blocks.ts`, replace the `buildEditModeBlock` return string (lines 16-25) with:

```typescript
  return `\n<edit_guidance>
Modify the existing HTML based on the user's request.
Do NOT start from scratch unless the user explicitly asks for a redesign.
Do NOT add pages unless the user explicitly asks.
When adding a page: use editFile to add nav links to existing pages, then writeFiles for the new page only.
</edit_guidance>`;
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Compiles successfully.

**Step 3: Commit**

```bash
git add src/lib/prompts/sections/context-blocks.ts
git commit -m "refactor(prompts): slim down edit_guidance, remove duplicate tool selection advice"
```

---

### Task 7: Fix Blueprint Page System Prompt Tool Availability

The blueprint page prompt references searchImages/searchIcons but doesn't mention generateColorPalette/fetchUrl (which ARE available) or clarify that file tools/webSearch/validateHtml are NOT available.

**Files:**
- Modify: `src/lib/blueprint/prompts/page-system-prompt.ts`

**Step 1: Replace requirement 7**

In `page-system-prompt.ts`, find line 160:

```
7. For images, use the searchImages tool to find real photos from Pexels. Call it BEFORE writing HTML that needs images, then use the returned URLs directly in <img> tags. Use descriptive 2-5 word queries. Use DIFFERENT queries per image. For icons, use the searchIcons tool.
```

Replace with:

```
7. Available tools: searchImages (stock photos — returns { url, alt }), searchIcons (SVG icons — returns { svg }), generateColorPalette (color harmony), fetchUrl (external content). Call resource tools BEFORE writing HTML. File tools (writeFiles, editFile, readFile) and webSearch are NOT available — output the complete HTML directly. Use DIFFERENT image queries per image for variety.
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Compiles successfully.

**Step 3: Commit**

```bash
git add src/lib/blueprint/prompts/page-system-prompt.ts
git commit -m "refactor(prompts): fix blueprint page prompt to document available/unavailable tools"
```

---

### Task 8: Final Verification

**Step 1: Full build check**

Run: `npm run build`
Expected: Clean compilation, no errors.

**Step 2: Lint check**

Run: `npm run lint`
Expected: No new lint errors.

**Step 3: Diff review**

Run: `git diff HEAD~7 --stat` to confirm all expected files were changed and nothing unexpected was modified.

Expected changed files:
- `src/lib/prompts/sections/tool-output-format.ts`
- `src/lib/prompts/sections/base-rules.ts`
- `src/lib/prompts/sections/context-blocks.ts`
- `src/lib/blueprint/prompts/page-system-prompt.ts`
- `src/lib/chat/tools/file-tools.ts`
- `src/lib/chat/tools/image-tools.ts`
- `src/lib/chat/tools/icon-tools.ts`
- `src/lib/chat/tools/color-tools.ts`
- `src/lib/chat/tools/web-tools.ts`
- `src/lib/chat/tools/search-tools.ts`
- `src/lib/chat/tools/validation-tools.ts`

**Step 4: Content audit**

Verify no tool guidance was lost — every piece of advice from the old prompts should exist in either the tool definitions or the new `tool-output-format.ts`. Specifically check:
- Image orientation guidance (landscape/portrait/square) → in `<tool_rules>`
- "Different queries per image" → in `<tool_rules>` and searchImages description
- "Before calling a tool, explain" → in `<tool_rules>`
- "After tool call, summary" → in `<tool_rules>`
- editFile vs writeFiles decision → in `<tool_selection>`
- "Don't add pages unless asked" → in `<tool_rules>` and `<edit_guidance>`
