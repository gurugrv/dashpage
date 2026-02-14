# Blueprint Tool Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make blueprint routes (pages + components) use the same writeFiles/validateHtml tool architecture as single-page chat, eliminating text-based extraction and enabling validation from first generation.

**Architecture:** Change `createWebsiteTools` to expose `workingFiles` accumulator. Update blueprint routes to pass full tool set and read HTML from `workingFiles` after generation. Update system prompts to instruct models to use `writeFiles` instead of outputting raw HTML text.

**Tech Stack:** Next.js API routes, Vercel AI SDK `streamText`/`generateText`, Zod tool schemas, existing `createFileTools`/`createWebsiteTools`

**Design doc:** `docs/plans/2026-02-14-blueprint-tool-unification-design.md`

---

### Task 1: Change `createWebsiteTools` to expose `workingFiles`

**Files:**
- Modify: `src/lib/chat/tools/index.ts`

**Step 1: Update return type**

Change `createWebsiteTools` to return `{ tools, workingFiles }` instead of a flat `ToolSet`:

```typescript
import type { ToolSet } from 'ai';
import type { ProjectFiles } from '@/types';
import { createFileTools } from './file-tools';
import { createImageTools } from './image-tools';
import { createIconTools } from './icon-tools';
import { createWebTools } from './web-tools';
import { createSearchTools } from './search-tools';
import { createValidationTools } from './validation-tools';

export function createWebsiteTools(currentFiles: ProjectFiles): { tools: ToolSet; workingFiles: ProjectFiles } {
  const workingFiles: ProjectFiles = { ...currentFiles };

  return {
    tools: {
      ...createFileTools(workingFiles),
      ...createImageTools(),
      ...createIconTools(),
      ...createWebTools(),
      ...createSearchTools(),
      ...createValidationTools(workingFiles),
    },
    workingFiles,
  };
}
```

**Step 2: Update chat route caller**

In `src/app/api/chat/route.ts`, line 166, change:

```typescript
// Before
const tools = createWebsiteTools(currentFiles ?? {});

// After
const { tools, workingFiles: _workingFiles } = createWebsiteTools(currentFiles ?? {});
```

Prefix with `_` since the chat route doesn't need `workingFiles` (client-side `useHtmlParser` handles extraction).

**Step 3: Verify build**

Run: `npm run build`

Expected: Build succeeds with no type errors. No runtime changes — just a structural refactor.

**Step 4: Commit**

```bash
git add src/lib/chat/tools/index.ts src/app/api/chat/route.ts
git commit -m "refactor: expose workingFiles from createWebsiteTools"
```

---

### Task 2: Update page system prompt to use tool workflow

**Files:**
- Modify: `src/lib/blueprint/prompts/page-system-prompt.ts`

**Step 1: Replace `<tool_workflow>` section**

Replace lines 153-162 (the current tool_workflow) with a writeFiles-based workflow:

```typescript
<tool_workflow>
Call tools BEFORE and AFTER writing the page. Parallel calls save steps:
1. searchImages + searchIcons (parallel) — gather all images and icons for the page sections
   - Use DIFFERENT queries per image for variety. Choose orientation: landscape (heroes/banners), portrait (people/cards), square (avatars/thumbnails)
   - searchIcons: use "outline" style for UI chrome, "solid" for emphasis
2. webSearch + fetchUrl (if needed) — for real business info, embed codes (Google Maps, YouTube), or industry-specific content
3. writeFiles → generate the complete HTML page as { "${page.filename}": "<!DOCTYPE html>..." }
4. validateHtml → check for syntax errors
5. editDOM or editFile → fix any errors found by validation

If a tool fails: use https://placehold.co/800x400/eee/999?text=Image for images, inline SVG for icons, your own knowledge for web content. Never let a tool failure halt generation.
</tool_workflow>
```

Note: `${page.filename}` should be interpolated from the template literal — the actual filename like `index.html`, `about.html`.

**Step 2: Replace requirement lines 171-174**

Replace:
```
7. Available tools: searchImages, searchIcons, webSearch, fetchUrl. File tools (writeFiles, editFile, readFile) are NOT available.
</requirements>

Output ONLY the HTML.
```

With:
```
7. Available tools: writeFiles, editDOM, editFile, readFile, validateHtml, searchImages, searchIcons, webSearch, fetchUrl.
8. You MUST call writeFiles to output the page — do NOT output raw HTML as text.
9. Call validateHtml after writeFiles. Fix errors with editDOM or editFile.
</requirements>
```

Remove the trailing `Output ONLY the HTML.` line entirely.

**Step 3: Verify build**

Run: `npm run build`

Expected: Build succeeds. Prompt is just a string — no type issues possible.

**Step 4: Commit**

```bash
git add src/lib/blueprint/prompts/page-system-prompt.ts
git commit -m "feat(prompts): update page prompt to use writeFiles tool workflow"
```

---

### Task 3: Update components system prompt to use tool workflow

**Files:**
- Modify: `src/lib/blueprint/prompts/components-system-prompt.ts`

**Step 1: Replace `<output_format>` section (lines 58-67)**

Replace comment marker instructions with writeFiles instructions:

```
<output_format>
Call writeFiles with exactly two files:
- "header.html" — containing ONLY the <header>...</header> element (with inline <script> for mobile toggle)
- "footer.html" — containing ONLY the <footer>...</footer> element

Do NOT output raw HTML as text. You MUST use the writeFiles tool.
</output_format>
```

**Step 2: Replace `<available_tools>` section (lines 91-102)**

Replace with full tool list:

```
<available_tools>
You have access to these tools:

1. searchIcons({ query, count, style }) — Search for SVG icons. Returns { icons: [{ name, set, svg, style }] }. Icons use currentColor. style: "outline" for nav/UI, "solid" for emphasis.
2. searchImages({ query, count, orientation }) — Search for stock photos. Returns { images: [{ url, alt, photographer }] }.
3. writeFiles({ files }) — Write the header.html and footer.html files. REQUIRED — this is how you deliver output.
4. validateHtml({ file }) — Validate HTML syntax. Call after writeFiles.

WORKFLOW: Call searchIcons for "hamburger menu", "close", and any social/footer icons FIRST. Then call writeFiles with both files. Then validateHtml on each.
</available_tools>
```

**Step 3: Update `<rules>` section**

Remove rule 7 (`Output NOTHING before <!-- HEADER_START -->...`) and rule 8 (`Do NOT wrap the output in markdown code fences`). These are irrelevant with tool-based output.

Replace them with:
```
7. You MUST call writeFiles to deliver output — do NOT output raw HTML as text.
8. Call validateHtml on both header.html and footer.html after writing them.
```

**Step 4: Verify build**

Run: `npm run build`

**Step 5: Commit**

```bash
git add src/lib/blueprint/prompts/components-system-prompt.ts
git commit -m "feat(prompts): update components prompt to use writeFiles tool workflow"
```

---

### Task 4: Update pages route to use full tool set

**Files:**
- Modify: `src/app/api/blueprint/pages/route.ts`

This is the largest task. Multiple sub-steps.

**Step 1: Update imports**

Replace the individual tool imports:
```typescript
// Remove these
import { createImageTools } from '@/lib/chat/tools/image-tools';
import { createIconTools } from '@/lib/chat/tools/icon-tools';
import { createWebTools } from '@/lib/chat/tools/web-tools';
import { createSearchTools } from '@/lib/chat/tools/search-tools';

// Add this
import { createWebsiteTools } from '@/lib/chat/tools';
```

**Step 2: Remove `stripCodeFences` function (lines 17-20)**

Delete entirely — no longer needed.

**Step 3: Expand `summarizeToolInput` (lines 22-37)**

Add cases for new tools:

```typescript
function summarizeToolInput(toolName: string, input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const inp = input as Record<string, unknown>;
  switch (toolName) {
    case 'searchImages':
    case 'searchIcons':
    case 'webSearch':
      return typeof inp.query === 'string' ? inp.query : undefined;
    case 'fetchUrl':
      return typeof inp.url === 'string' ? inp.url : undefined;
    case 'writeFiles': {
      const files = inp.files as Record<string, unknown> | undefined;
      return files ? Object.keys(files).join(', ') : undefined;
    }
    case 'editDOM':
    case 'editFile':
    case 'readFile':
    case 'validateHtml':
      return typeof inp.file === 'string' ? inp.file : undefined;
    default:
      return undefined;
  }
}
```

**Step 4: Expand `summarizeToolOutput` (lines 39-66)**

Add cases for new tools:

```typescript
function summarizeToolOutput(toolName: string, output: unknown): string | undefined {
  if (!output || typeof output !== 'object') return undefined;
  const out = output as Record<string, unknown>;
  if (out.success === false) {
    return typeof out.error === 'string' ? out.error.slice(0, 80) : 'Failed';
  }
  switch (toolName) {
    case 'searchImages': {
      const images = out.images as unknown[] | undefined;
      return images ? `${images.length} image${images.length !== 1 ? 's' : ''} found` : undefined;
    }
    case 'searchIcons': {
      const icons = out.icons as unknown[] | undefined;
      return icons ? `${icons.length} icon${icons.length !== 1 ? 's' : ''} found` : undefined;
    }
    case 'webSearch': {
      const results = out.results as unknown[] | undefined;
      return results ? `${results.length} result${results.length !== 1 ? 's' : ''} found` : undefined;
    }
    case 'fetchUrl':
      return out.truncated ? 'Content fetched (truncated)' : 'Content fetched';
    case 'writeFiles': {
      const fileNames = out.fileNames as string[] | undefined;
      return fileNames ? `Wrote ${fileNames.join(', ')}` : 'Files written';
    }
    case 'editDOM':
    case 'editFile':
      return out.success === true ? 'Edits applied' : out.success === 'partial' ? 'Partial edits applied' : undefined;
    case 'validateHtml':
      return out.valid ? 'Valid HTML' : `${out.errorCount ?? 0} error(s) found`;
    case 'readFile':
      return 'File read';
    default:
      return undefined;
  }
}
```

**Step 5: Expand `TOOL_LABELS` (line 202-207)**

```typescript
const TOOL_LABELS: Record<string, string> = {
  searchImages: 'Adding images',
  searchIcons: 'Adding icons',
  fetchUrl: 'Loading content',
  webSearch: 'Researching content',
  writeFiles: 'Writing page',
  editDOM: 'Fixing issues',
  editFile: 'Fixing issues',
  editFiles: 'Fixing issues',
  readFile: 'Reading file',
  validateHtml: 'Validating HTML',
};
```

**Step 6: Replace `blueprintTools` with `createWebsiteTools` per page**

Move tool creation inside the per-page loop (line 213). Each page gets a fresh tool set so `workingFiles` is isolated:

```typescript
for (const page of pages) {
  if (abortSignal.aborted) break;

  // Fresh tool set per page — workingFiles accumulator starts empty
  const { tools: pageTools, workingFiles } = createWebsiteTools({});

  // ... rest of page generation
```

**Step 7: Pass tools on ALL segments (including continuations)**

Currently segment 0 passes `tools: blueprintTools` but continuations don't. Change both to pass `pageTools`:

```typescript
if (segment === 0) {
  result = streamText({
    model: modelInstance,
    system: systemPrompt,
    prompt: pagePrompt,
    maxOutputTokens: 16000,
    tools: pageTools,
    stopWhen: stepCountIs(8),  // Increased from 5 to allow validate+fix cycle
    abortSignal,
  });
} else {
  result = streamText({
    model: modelInstance,
    system: systemPrompt,
    messages: continuationMessages,
    maxOutputTokens: 16000,
    tools: pageTools,  // Now included on continuations too
    stopWhen: stepCountIs(8),
    abortSignal,
  });
}
```

**Step 8: Update HTML extraction after stream completes**

Replace text-based extraction with workingFiles read. After the segment loop (around line 333-346):

```typescript
// After all segments complete, extract HTML from workingFiles
const pageHtml = workingFiles[page.filename];

if (!pageHtml) {
  // Model didn't call writeFiles — check for any file that looks like the page
  const anyHtml = Object.values(workingFiles).find(v => v.includes('<!DOCTYPE') || v.includes('<html'));
  if (anyHtml) {
    completedPages += 1;
    sendEvent({
      type: 'page-status',
      filename: page.filename,
      status: 'complete',
      html: anyHtml,
      totalPages,
      completedPages,
    });
    completedPagesMap[page.filename] = anyHtml;
    // ... checkpoint to DB
  } else {
    // No file output at all — treat as error
    hasErrors = true;
    sendEvent({
      type: 'page-status',
      filename: page.filename,
      status: 'error',
      error: 'Model did not produce file output via writeFiles',
      totalPages,
      completedPages,
    });
  }
} else {
  completedPages += 1;
  sendEvent({
    type: 'page-status',
    filename: page.filename,
    status: 'complete',
    html: pageHtml,
    totalPages,
    completedPages,
  });
  completedPagesMap[page.filename] = pageHtml;
  await prisma.generationState.update({
    where: { conversationId },
    data: { completedPages: completedPagesMap },
  }).catch(() => {});
}
```

**Step 9: Update continuation handling**

Replace text concatenation approach. The current `fullPageText += debugSession.getFullResponse()` pattern is replaced:

```typescript
// After stream completes for a segment, check if writeFiles produced output
const finishReason = await result.finishReason;
debugSession.logFullResponse(finishReason);

if (workingFiles[page.filename]) {
  // writeFiles succeeded — page is complete, no continuation needed
  break;
}

// writeFiles didn't execute (truncated or model didn't call it) — continue
if (finishReason !== 'length') break; // Not truncated, just didn't produce output

// Build continuation messages
const continuationMessages = [
  { role: 'user' as const, content: pagePrompt },
  { role: 'assistant' as const, content: debugSession.getFullResponse() },
  { role: 'user' as const, content: 'The page was not completed. Call writeFiles with the complete HTML page.' },
];
```

**Step 10: Verify build**

Run: `npm run build`

**Step 11: Commit**

```bash
git add src/app/api/blueprint/pages/route.ts
git commit -m "feat(blueprint): pages route uses full tool set with writeFiles extraction"
```

---

### Task 5: Update components route to use full tool set

**Files:**
- Modify: `src/app/api/blueprint/components/route.ts`

**Step 1: Update imports**

```typescript
// Remove
import { createIconTools } from '@/lib/chat/tools/icon-tools';

// Add
import { createWebsiteTools } from '@/lib/chat/tools';
```

**Step 2: Remove extraction helper functions**

Delete `extractBlock` (lines 19-38) and `extractTagBlock` (lines 41-45) entirely.

**Step 3: Replace tool creation and extraction logic**

Replace the `generateText` call and all the response parsing (lines 83-134) with:

```typescript
const { tools, workingFiles } = createWebsiteTools({});

const result = await generateText({
  model: modelInstance,
  system: systemPrompt,
  prompt: userPrompt,
  maxOutputTokens: 16000,
  tools,
  stopWhen: stepCountIs(8),
});

// Extract from workingFiles — model should have called writeFiles with header.html and footer.html
const resolvedHeader = workingFiles['header.html'];
const resolvedFooter = workingFiles['footer.html'];

if (!resolvedHeader || !resolvedFooter) {
  const responseText = result.steps.map((s) => s.text).filter(Boolean).join('\n');
  console.error('Model did not produce header.html and/or footer.html via writeFiles. Available files:', Object.keys(workingFiles), 'Raw response:', responseText.slice(0, 2000));
  return NextResponse.json(
    { error: 'Failed to generate header/footer — model did not call writeFiles' },
    { status: 500 },
  );
}
```

**Step 4: Update the success responses**

Replace the two success response blocks (lines 116-127 and 136-145) with a single one after the extraction above:

```typescript
if (conversationId) {
  await prisma.generationState.update({
    where: { conversationId },
    data: {
      phase: 'components-complete',
      componentHtml: { headerHtml: resolvedHeader, footerHtml: resolvedFooter },
    },
  }).catch(() => {});
}
return NextResponse.json({ headerHtml: resolvedHeader, footerHtml: resolvedFooter });
```

**Step 5: Verify build**

Run: `npm run build`

**Step 6: Commit**

```bash
git add src/app/api/blueprint/components/route.ts
git commit -m "feat(blueprint): components route uses full tool set with writeFiles extraction"
```

---

### Task 6: Build verification and manual test

**Step 1: Full build check**

Run: `npm run build`

Expected: Clean build, no type errors.

**Step 2: Lint check**

Run: `npm run lint`

Expected: No new lint errors.

**Step 3: Manual smoke test**

1. Start dev server: `npm run dev`
2. Create a new multi-page site (e.g. "Build a portfolio website with Home, About, and Contact pages")
3. Verify:
   - Blueprint generation phase works (JSON plan)
   - Components phase: model calls `writeFiles` with `header.html` and `footer.html`
   - Pages phase: each page shows tool activity labels ("Adding images", "Writing page", "Validating HTML")
   - Each page completes with HTML in the preview
   - All pages render correctly in the iframe
4. Edit a page via chat to confirm the edit flow still works

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: blueprint tool unification — build verified"
```

Only if there were fixups needed. If build was clean after Task 5, skip this.

---

## Task Dependency Graph

```
Task 1 (createWebsiteTools signature)
  ├── Task 2 (page system prompt) — independent
  ├── Task 3 (components system prompt) — independent
  ├── Task 4 (pages route) — depends on Task 1 + Task 2
  └── Task 5 (components route) — depends on Task 1 + Task 3
Task 6 (verification) — depends on all above
```

Tasks 2 and 3 can be done in parallel. Tasks 4 and 5 can be done in parallel after their dependencies.
