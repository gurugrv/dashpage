# Homepage-Anchored Blueprint Generation

## Problem

Multi-page blueprint sites are slower, less creative, less beautiful, and less visually consistent than single-page chat mode sites. Root cause: pages are generated in parallel isolation — each page independently interprets abstract design tokens without seeing how other pages look.

## 8 Identified Gaps

1. **Random style seed** — blueprint uses `getRandomStyleSeed()`, ignoring prompt. Chat uses `getWeightedStyleSeed(userPrompt)`.
2. **Pages generated in parallel with zero visual context** — no page sees another page's HTML.
3. **Components built before any page exists** — header/footer can feel disconnected from page aesthetics.
4. **Hex colors instead of HSL** — pages can't reason about tints/shades precisely.
5. **CSS API reference is just class names** — no property values, insufficient for creative reuse.
6. **Lightweight continuation loses creative context** — discards message history on truncation.
7. **No "design reference page"** — all pages start from blank slate.
8. **Single-page blueprints get better header/footer** — inline generation produces more cohesive results.

## Solution: Homepage as Design Anchor

Generate the homepage first in full creative mode (same quality as single-page chat), extract a style digest from its HTML, then feed that digest to components and remaining pages.

## New Generation Flow

```
Phase 1: Planning (unchanged)        → blueprint JSON (with weighted seed fix)
Phase 2: Shared styles (unchanged)   → deterministic CSS from design tokens
Phase 3: Homepage generation (NEW)   → full creative mode, single page
Phase 4: Style digest extraction (NEW)→ extract design patterns from homepage HTML
Phase 5: Components generation        → header/footer (now with homepage context)
Phase 6: Remaining pages              → parallel, all referencing style digest
Phase 7: Post-processing (unchanged) → extract components, dedup CSS
```

## Changes

### 1. Weighted Style Seed for Blueprint

**File:** `src/lib/blueprint/prompts/blueprint-system-prompt.ts`

Replace `getRandomStyleSeed()` with `getWeightedStyleSeed(userPrompt)`. User prompt is passed from the route handler.

### 2. New Homepage Generation Phase

**New route:** `POST /api/blueprint/homepage`

- Generates only `index.html` using `getPageSystemPrompt()` but with full creative freedom
- Gets full `DESIGN_QUALITY_SECTION` (not compact) and full `UI_UX_GUIDELINES_SECTION` with industry tones
- Homepage generates header/footer inline (no component placeholders) — like the `isSinglePage` path
- Uses `writeFiles` tool, same as current page generation
- Returns complete homepage HTML

**Client hook phase:** `'generating-homepage'` added to `BlueprintPhase`.

### 3. Style Digest Extractor

**New file:** `src/lib/blueprint/extract-style-digest.ts`

Uses a focused AI call to analyze homepage HTML and extract (~1-2K tokens):

- **Color application** — where primary/secondary/accent are actually used (not just hex values)
- **Typography scale** — exact sizes, weights, line-heights for headings, body, captions
- **Layout patterns** — section spacing, max-width, grid configurations, alternating patterns
- **Visual vocabulary** — border-radius, shadows, gradients, animations used
- **Component styles** — button, card, divider patterns with exact Tailwind classes

The digest is concrete ("buttons use `bg-primary text-white px-8 py-4 rounded-full`") rather than abstract ("use primary color for CTAs").

### 4. Components Get Homepage Context

**File:** `src/app/api/blueprint/components/route.ts`

Add style digest to components system prompt. Header/footer AI sees how the homepage looks, matching its visual language.

### 5. Remaining Pages Get Style Digest

**File:** `src/lib/blueprint/prompts/page-system-prompt.ts`

Add `<style_digest>` block to page system prompt with instruction: "Match the visual vocabulary established in the style digest. Use the same typography scale, color application patterns, spacing rhythm, and component styles."

### 6. Homepage Excluded from Parallel Batch

**Files:** `src/app/api/blueprint/pages/route.ts`, `src/hooks/useBlueprintGeneration.ts`

Page generation phase generates pages 2-N only. Homepage HTML is merged into final `ProjectFiles`.

### 7. UI Progress Update

New phase sequence: `generating-blueprint → awaiting-approval → generating-homepage → generating-components → generating-assets → generating-pages → complete`

Homepage shows as "complete" in `PageGenerationStatus` while remaining pages generate.

## Performance Impact

- Adds one sequential LLM call (~15-30s) for homepage generation
- Adds one small AI call (~3-5s) for style digest extraction
- Remaining pages still parallel (unchanged speed)
- Net: ~20-35s slower, dramatically better consistency

## Files to Create/Modify

| File | Action |
|---|---|
| `src/lib/blueprint/prompts/blueprint-system-prompt.ts` | Modify — accept userPrompt, use weighted seed |
| `src/app/api/blueprint/generate/route.ts` | Modify — pass userPrompt to prompt builder |
| `src/lib/blueprint/extract-style-digest.ts` | Create — AI-based style digest extractor |
| `src/app/api/blueprint/homepage/route.ts` | Create — homepage generation endpoint |
| `src/app/api/blueprint/components/route.ts` | Modify — add style digest to prompt |
| `src/lib/blueprint/prompts/page-system-prompt.ts` | Modify — add style digest block |
| `src/lib/blueprint/prompts/components-system-prompt.ts` | Modify — add style digest block |
| `src/app/api/blueprint/pages/route.ts` | Modify — exclude homepage from batch |
| `src/hooks/useBlueprintGeneration.ts` | Modify — add homepage phase, orchestration |
| `src/features/blueprint/page-progress.tsx` | Modify — show homepage status |
