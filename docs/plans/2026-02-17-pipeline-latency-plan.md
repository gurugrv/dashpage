# Pipeline Latency Improvements - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce multi-page blueprint generation latency by parallelizing component and page generation, and fixing smaller sequential bottlenecks.

**Architecture:** Components and pages generate simultaneously using placeholder injection (`<!-- @component:header/footer -->`), merged after both complete. Research URL fetches parallelized. DB writes made concurrent or fire-and-forget where safe.

**Tech Stack:** Next.js API routes, Vercel AI SDK, Prisma, Cheerio, SSE streams

---

### Task 1: Parallelize URL Fetching in Research

**Files:**
- Modify: `src/lib/blueprint/research.ts:164-213`

**Step 1: Replace sequential for-loop with Promise.allSettled**

In `fetchTopUrls`, replace lines 177-204:

```typescript
// OLD (sequential):
const fetched: string[] = [];
for (const url of urlsToFetch) {
  try {
    const response = await fetch(url, { ... });
    ...
  } catch { }
}

// NEW (parallel):
const fetchResults = await Promise.allSettled(
  urlsToFetch.map(async (url) => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIBuilder/1.0)' },
    });

    if (!response.ok) return null;

    const html = await response.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_PAGE_CONTENT_LENGTH);

    return text.length > 100 ? `[Page content from ${url}]\n${text}` : null;
  }),
);

const fetched = fetchResults
  .filter((r): r is PromiseFulfilledResult<string | null> => r.status === 'fulfilled')
  .map((r) => r.value)
  .filter((v): v is string => v !== null);
```

**Step 2: Verify build**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/blueprint/research.ts
git commit -m "perf: parallelize URL fetches in research step"
```

---

### Task 2: Concurrent DB Lookup in Blueprint Generate Route

**Files:**
- Modify: `src/app/api/blueprint/generate/route.ts:80-175`

**Step 1: Issue DB lookup concurrently with AI call**

The `prisma.conversation.findUnique` at line 171 doesn't depend on the AI result. Move it to run concurrently with `generateText`. The key constraint: `businessProfile` is needed at line 178 (after AI result), and `blueprint` is needed from the AI call. Both can run in parallel.

Find the AI call (around line 80) and the DB lookup (line 171). Wrap them:

```typescript
// Before the AI call, start the DB lookup promise (don't await yet)
const businessProfilePromise = prisma.conversation.findUnique({
  where: { id: conversationId },
  include: { businessProfile: true },
});

// ... existing generateText call ...
// After getting the blueprint result, await the DB lookup:
const conv = await businessProfilePromise;
const businessProfile = conv?.businessProfile;
```

Remove the original `await prisma.conversation.findUnique` block at lines 171-174.

**Step 2: Verify build**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/api/blueprint/generate/route.ts
git commit -m "perf: run business profile DB lookup concurrently with AI call"
```

---

### Task 3: Fire-and-Forget Page DB Writes

**Files:**
- Modify: `src/app/api/blueprint/pages/route.ts:574-578`

**Step 1: Remove await from per-page generationState update**

At line 575, the `await` on the DB write blocks the semaphore slot release. The `.catch()` already swallows errors. Remove the `await`:

```typescript
// OLD:
completedPagesMap[page.filename] = pageHtml;
await prisma.generationState.update({
  where: { conversationId },
  data: { completedPages: completedPagesMap },
}).catch((err) => { console.error('[blueprint/pages] Failed to persist completedPages:', err); });

// NEW:
completedPagesMap[page.filename] = pageHtml;
prisma.generationState.update({
  where: { conversationId },
  data: { completedPages: completedPagesMap },
}).catch((err) => { console.error('[blueprint/pages] Failed to persist completedPages:', err); });
```

**Step 2: Verify build**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/api/blueprint/pages/route.ts
git commit -m "perf: fire-and-forget per-page DB writes to release semaphore faster"
```

---

### Task 4: Component-Page Parallel Generation (Placeholder Injection)

This is the biggest change. It touches the page system prompt, the pages API route, and the client hook.

**Files:**
- Modify: `src/lib/blueprint/prompts/page-system-prompt.ts:37-38, 66-118, 257-259, 279-281`
- Modify: `src/app/api/blueprint/pages/route.ts:150, 285-286`
- Modify: `src/hooks/useBlueprintGeneration.ts:397-445, 628-641, 644-689`

#### Step 1: Update page system prompt for placeholder mode

In `src/lib/blueprint/prompts/page-system-prompt.ts`, add a third mode alongside "shared header verbatim" and "generate header from spec". When components will be injected later (placeholder mode), pages should output placeholder comments.

The function signature already accepts `sharedHtml?: SharedHtml`. When `sharedHtml` is `undefined` AND it's a multi-page site, pages currently generate their own header/footer. We want to change multi-page behavior to use placeholders instead.

Replace the header/footer section logic (lines 66-118):

```typescript
const headerSection = hasSharedHeader
  ? `<shared_header>
Embed this header HTML VERBATIM at the start of <body> (do NOT modify it):
${sharedHtml!.headerHtml}
</shared_header>`
  : isSinglePage
    ? `<header_spec>
Generate a responsive header with:
- Site name "${blueprint.siteName}" as logo/brand text (styled with --color-primary and font-heading)
- Navigation: use smooth-scroll anchor links to the page sections (e.g., #hero, #features, #contact) — NOT links to other .html files
- Mobile: hamburger menu button that toggles a dropdown/slide nav (include the JS)
- Use design system tokens: bg-[var(--color-bg)], text-[var(--color-text)], etc.
- Sticky/fixed at top with subtle shadow
</header_spec>`
    : `<header_placeholder>
Place exactly this comment at the very start of <body>:
<!-- @component:header -->
Do NOT generate any header/nav HTML. The shared header component will be injected here automatically.
</header_placeholder>`;

const footerSection = hasSharedFooter
  ? `<shared_footer>
Embed this footer HTML VERBATIM at the end of <body> (do NOT modify it):
${sharedHtml!.footerHtml}
</shared_footer>`
  : isSinglePage
    ? `<footer_spec>
Generate a footer with:
- Site name and footer tagline
- Anchor links to key sections of the page
- Copyright line with current year
- Use design system tokens for colors
</footer_spec>`
    : `<footer_placeholder>
Place exactly this comment at the very end of <body> (before </body>):
<!-- @component:footer -->
Do NOT generate any footer HTML. The shared footer component will be injected here automatically.
</footer_placeholder>`;

const headerRequirement = hasSharedHeader
  ? '3. Embed the shared header HTML VERBATIM at the start of <body> — do not modify it in any way.'
  : isSinglePage
    ? '3. Generate header per header_spec at start of <body>.'
    : '3. Place the <!-- @component:header --> placeholder comment at the start of <body>. Do NOT generate header HTML.';

const footerRequirement = hasSharedFooter
  ? '5. Embed the shared footer HTML VERBATIM at the end of <body> — do not modify it in any way.'
  : isSinglePage
    ? '5. Generate footer per footer_spec at end of <body>.'
    : '5. Place the <!-- @component:footer --> placeholder comment at the end of <body>. Do NOT generate footer HTML.';
```

#### Step 2: Update pages API route to not require headerHtml/footerHtml

In `src/app/api/blueprint/pages/route.ts`, the `headerHtml` and `footerHtml` are destructured from the request body at line 150 and passed to `getPageSystemPrompt` at line 285-286. These should now be optional — pages can generate without them.

No code change needed here since `sharedHtml` is already optional (line 285: `headerHtml && footerHtml ? { ... } : undefined`). When both are absent, the prompt falls through to the placeholder/spec branches we just updated.

#### Step 3: Add component merge utility

Create a small merge helper. Add to existing file `src/lib/blueprint/generate-shared-styles.ts` (or create a new utility — but prefer the existing file to avoid file bloat):

Actually, add it to a more appropriate location. Create a small function in the hook or add to an existing utility. Since it's only used in the hook, add it inline in `useBlueprintGeneration.ts`:

```typescript
/** Replace placeholder comments with actual component HTML */
function mergeComponentsIntoPages(
  files: ProjectFiles,
  components: { headerHtml: string; footerHtml: string },
): ProjectFiles {
  const result: ProjectFiles = {};
  for (const [filename, html] of Object.entries(files)) {
    if (!filename.endsWith('.html') || filename.startsWith('_components/')) {
      result[filename] = html;
      continue;
    }
    result[filename] = html
      .replace('<!-- @component:header -->', components.headerHtml)
      .replace('<!-- @component:footer -->', components.footerHtml);
  }
  return result;
}
```

Add this function inside `useBlueprintGeneration.ts`, before the `useBlueprintGeneration` function export (around line 100, as a module-level helper).

#### Step 4: Update approveAndGenerate to run components + pages in parallel

In `useBlueprintGeneration.ts`, modify `approveAndGenerate` (lines 628-641):

```typescript
const approveAndGenerate = useCallback(async (conversationId: string, activeBlueprint: Blueprint) => {
  const sharedStyles = generateSharedStyles(activeBlueprint.designSystem);
  sharedStylesRef.current = sharedStyles;

  const isSinglePage = activeBlueprint.pages.length === 1;
  if (isSinglePage) {
    // Single-page sites skip the components step
    await generatePages(conversationId, activeBlueprint, undefined, sharedStyles.headTags);
  } else {
    // Run components and pages in parallel
    // Pages use placeholder markers; components generate independently
    const [components] = await Promise.all([
      generateComponentsWithRetry(activeBlueprint, conversationId),
      generatePages(conversationId, activeBlueprint, undefined, sharedStyles.headTags),
    ]);

    // Merge components into pages after both complete
    if (components && Object.keys(filesAccumulatorRef.current).length > 0) {
      const merged = mergeComponentsIntoPages(filesAccumulatorRef.current, components);
      filesAccumulatorRef.current = merged;
      // Re-deliver merged files to preview
      let files = { ...merged };
      if (sharedStylesRef.current) {
        files['styles.css'] = sharedStylesRef.current.stylesCss;
      }
      files = removeDeadNavLinks(files);
      onFilesReady(files);
    }
  }
}, [generateComponentsWithRetry, generatePages, onFilesReady]);
```

**Important consideration:** The `generatePages` callback currently sets `phase` to `'complete'` when it receives `pipeline-status: complete`. But now components might still be generating when pages finish. We need to handle the timing:

- If pages finish first → `filesAccumulatorRef` has all page HTML with placeholders. The `pipeline-status: complete` handler in `generatePages` calls `onFilesReady`. But we need the merge to happen first.
- If components finish first → `generateComponentsWithRetry` returns, pages continue.

**Solution:** Modify the `pipeline-status: complete` handler to NOT call `onFilesReady` when in parallel mode. Instead, let `approveAndGenerate` handle the final merge and delivery. Add a ref to signal parallel mode:

```typescript
const parallelModeRef = useRef(false);
```

In the `pipeline-status: complete` handler (around line 555-566), check the ref:

```typescript
} else if (event.type === 'pipeline-status' && event.status === 'complete') {
  flushPendingRafs();
  if (!parallelModeRef.current) {
    // Sequential mode: deliver files immediately
    let files = { ...filesAccumulatorRef.current };
    if (sharedStylesRef.current) {
      files['styles.css'] = sharedStylesRef.current.stylesCss;
    }
    files = removeDeadNavLinks(files);
    onFilesReady(files);
    setRetryAttempt(0);
  }
  setPhase('complete');
}
```

And in `approveAndGenerate`, set the ref:

```typescript
} else {
  parallelModeRef.current = true;
  const [components] = await Promise.all([...]);
  parallelModeRef.current = false;
  // ... merge and deliver ...
}
```

#### Step 5: Update phase display for parallel generation

Currently, `generateComponents` sets `phase` to `'generating-components'` and `generatePages` sets it to `'generating-pages'`. In parallel mode, both run simultaneously. The phase should reflect this.

Add a new phase value to `BlueprintPhase`:

```typescript
export type BlueprintPhase =
  | 'idle'
  | 'generating-blueprint'
  | 'awaiting-approval'
  | 'generating-components'
  | 'generating-pages'
  | 'generating-site'  // NEW: components + pages in parallel
  | 'complete'
  | 'error';
```

In `approveAndGenerate`, set phase before starting parallel work:

```typescript
} else {
  setPhase('generating-site');
  parallelModeRef.current = true;
  ...
```

And modify `generateComponents` and `generatePages` to NOT override the phase when `parallelModeRef.current` is true. In `generateComponents` (line 278):

```typescript
if (!parallelModeRef.current) {
  setPhase('generating-components');
}
```

In `generatePages` (line 413):

```typescript
if (!parallelModeRef.current) {
  setPhase('generating-pages');
}
```

#### Step 6: Update resumeFromState for the new flow

In `resumeFromState` (lines 644-689), the multi-page path where `!state.componentHtml` should also use parallel mode:

```typescript
} else if (!state.componentHtml) {
  // Need components + remaining pages — run in parallel
  parallelModeRef.current = true;
  setPhase('generating-site');
  const [components] = await Promise.all([
    generateComponentsWithRetry(activeBlueprint, conversationId),
    generatePages(conversationId, activeBlueprint, undefined, sharedStyles.headTags, completedFilenames),
  ]);
  parallelModeRef.current = false;

  if (components && Object.keys(filesAccumulatorRef.current).length > 0) {
    const merged = mergeComponentsIntoPages(filesAccumulatorRef.current, components);
    filesAccumulatorRef.current = merged;
    let files = { ...merged };
    if (sharedStylesRef.current) {
      files['styles.css'] = sharedStylesRef.current.stylesCss;
    }
    files = removeDeadNavLinks(files);
    onFilesReady(files);
  }
} else {
  // Components exist, just resume pages (sequential, components already done)
  ...
```

#### Step 7: Update UI to handle 'generating-site' phase

Search for any UI code that checks `phase === 'generating-components'` or `phase === 'generating-pages'` and ensure `'generating-site'` is handled appropriately. This likely includes:

- `src/components/Builder.tsx` — progress display
- `src/features/blueprint/page-progress.tsx` — page status grid
- Any conditional rendering based on phase

For `generating-site`, show both component progress AND page progress simultaneously.

Run: `grep -rn "generating-components\|generating-pages" src/` to find all references.

#### Step 8: Verify build

Run: `npm run build`
Expected: No errors

#### Step 9: Manual test

1. Start dev server: `npm run dev`
2. Submit a multi-page prompt (e.g., "Create a restaurant website with home, menu, about, and contact pages")
3. After blueprint approval, verify:
   - Components and pages start generating simultaneously
   - Page HTML contains `<!-- @component:header -->` and `<!-- @component:footer -->` placeholders during generation
   - After both complete, placeholders are replaced with actual header/footer HTML
   - Final preview shows correct header/footer on all pages

#### Step 10: Commit

```bash
git add src/lib/blueprint/prompts/page-system-prompt.ts \
        src/app/api/blueprint/pages/route.ts \
        src/hooks/useBlueprintGeneration.ts \
        src/components/Builder.tsx
git commit -m "perf: parallelize component and page generation with placeholder injection"
```
