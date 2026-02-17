# Pipeline Latency Improvements Design

## Problem

The blueprint generation pipeline runs key steps sequentially when they could overlap. The biggest bottleneck: component generation (header/footer, 5-20s) blocks all page generation from starting. Quick wins in research and DB operations also leave time on the table.

## Changes

### 1. Component-Page Parallelism (Placeholder Injection)

**Current flow:**
```
[generateComponents 5-20s] → [generatePages 10-30s] = 15-50s total
```

**New flow:**
```
[generateComponents 5-20s]  ─┐
[generatePages     10-30s]  ─┤→ [merge <100ms] → done
                              │
                     whichever finishes last triggers merge
```

**How it works:**

1. After blueprint approval, `approveAndGenerate` kicks off components and pages simultaneously
2. Page system prompts no longer receive actual header/footer HTML. Instead, pages are instructed to use placeholder markers:
   - `<!-- @component:header -->` at the top of `<body>`
   - `<!-- @component:footer -->` at the bottom of `<body>`
3. Pages generate their unique content independently of components
4. Components generate header.html and footer.html as before
5. After both complete, a merge step replaces placeholders with actual component HTML in each page
6. The merged files are sent to the client

**Page system prompt change:** Remove the `headerHtml`/`footerHtml` injection. Add instructions like:
> "Place `<!-- @component:header -->` where the site header should appear and `<!-- @component:footer -->` where the footer should appear. These will be replaced with shared components. Do not generate header or footer content."

**Merge implementation:** Simple string replacement on each page's HTML:
```ts
function mergeComponents(pageHtml: string, components: Record<string, string>): string {
  return pageHtml
    .replace('<!-- @component:header -->', components['header.html'] || '')
    .replace('<!-- @component:footer -->', components['footer.html'] || '');
}
```

**Client changes (`useBlueprintGeneration`):**
- `approveAndGenerate` calls `generateComponents` and `generatePages` with `Promise.all` instead of sequentially
- `generatePages` no longer waits for component results
- A new `mergeComponentsIntoPages` step runs after both promises resolve
- SSE streams from both endpoints are consumed concurrently

**Server changes (`/api/blueprint/pages`):**
- Remove `headerHtml`/`footerHtml` from request body (no longer needed at generation time)
- Update `getPageSystemPrompt` to use placeholder instructions instead of injecting component HTML

**Edge cases:**
- If components fail, pages still have valid HTML with placeholder comments (graceful degradation)
- If pages finish before components, they wait at the merge step (not blocked during generation)
- Single-page sites already skip components, no change needed

**Expected savings:** 5-20s on every multi-page generation.

### 2. Parallel URL Fetching in Research

**File:** `src/lib/blueprint/research.ts` (fetchTopUrls)

**Current:** For-loop fetches up to 2 URLs sequentially.
**Change:** Use `Promise.all` to fetch both URLs in parallel.

**Expected savings:** Up to 5s when research is triggered.

### 3. Concurrent DB Lookup in Blueprint Route

**File:** `src/app/api/blueprint/generate/route.ts`

**Current:** `prisma.conversation.findUnique({ include: { businessProfile } })` runs after the main AI call.
**Change:** Issue the DB lookup concurrently with the AI call via `Promise.all`, since it doesn't depend on AI output.

**Expected savings:** 5-20ms (minor but free).

### 4. Fire-and-Forget Page DB Writes

**File:** `src/app/api/blueprint/pages/route.ts`

**Current:** Per-page `prisma.generationState.update` is awaited before releasing the semaphore slot.
**Change:** Don't await the DB write. Error handling already swallows failures. This frees the semaphore slot ~5-30ms faster per page.

**Expected savings:** 5-30ms per page (adds up with many pages).

## Non-Goals

- Changing the max concurrent pages (keep at 3 for now)
- Adding an AI orchestrator layer
- Changing the chat mode auto-continuation flow
- Quality-gate or revision loops

## Risks

- **Placeholder leakage:** If merge fails or components error out, users see raw `<!-- @component:X -->` comments. Mitigation: fall back to removing placeholders and showing pages without shared components.
- **Style coherence:** Pages generated without seeing actual header/footer might create conflicting styles. Mitigation: shared design system (colors, fonts, spacing) is already passed to page prompts via `sharedStyles`. The header/footer are structural, not stylistic.
- **SSE stream complexity:** Consuming two concurrent SSE streams (components + pages) in the client adds complexity. Mitigation: each stream already has independent event handling; they just need to write to separate result stores.
