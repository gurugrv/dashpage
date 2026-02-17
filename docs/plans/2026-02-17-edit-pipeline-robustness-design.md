# Edit Pipeline Robustness Fixes

**Date:** 2026-02-17
**Status:** Approved

## Problem

Four confirmed bugs in the edit/component pipeline reduce reliability:

1. **Fuzzy matching at 75% corrupts files** — Auto-correct tier allows 25% character differences, silently replacing wrong content.
2. **Manifest regex vs Cheerio mismatch** — `extractBlocks()` in manifest generation uses regex that misparses nested same-type elements (e.g. `<section>` inside `<section>`), while `editBlock` uses Cheerio correctly. AI sees a broken manifest but targets a correct DOM.
3. **findOriginalPosition ignores script/style** — Tier 2 whitespace-tolerant matching preserves script/style content during normalization, but the position mapper doesn't account for this, causing wrong replacement positions.
4. **Component similarity is fragile** — Character-by-character positional comparison drops below the 0.9 threshold when structurally identical nav/footers differ by one class or link text, preventing shared component extraction.

## Fixes

### Fix 1: Merge fuzzy tiers to single 85% threshold

**Files:** `apply-edit-operations.ts`, `types.ts`

- Remove `AUTO_CORRECT_THRESHOLD` (0.75). Use only `FUZZY_THRESHOLD` (0.85).
- Remove `'auto-correct'` from `MatchTier` type union.
- `tryFuzzyMatch` call uses `FUZZY_THRESHOLD` directly; always pushes `'fuzzy'` tier label.
- AI output with 15-25% character errors will now fail with error feedback + best-match context, enabling retry instead of silent corruption.

### Fix 2: Switch manifest block extraction to Cheerio

**File:** `generate-manifest.ts`

- Replace regex-based `extractBlocks()` with Cheerio DOM parsing.
- Load HTML with `cheerio.load()`, query `nav, header, section, footer, aside, main` selectors, read `data-block` attributes, extract inner HTML for summarization.
- `extractNavLinks()` stays regex-based (operates on already-extracted nav content, no nesting issue).
- `summarizeContent()` unchanged (receives inner HTML strings).
- Adds `import * as cheerio from 'cheerio'` (already a project dependency).

### Fix 3: Script/style-aware findOriginalPosition

**File:** `find-original-position.ts`

New algorithm:
1. Pre-scan original string to find `<script...>...</script>` and `<style...>...</style>` byte ranges using regex.
2. Walk original string character by character, tracking normalized position count.
3. Inside script/style blocks: count every character 1:1 (whitespace included) since `normalizeHtmlWhitespace` preserves these verbatim.
4. Outside script/style: collapse whitespace runs to 1 count (existing behavior).
5. Function signature unchanged: `(original: string, normalizedPos: number) => number`.

### Fix 4: Structural similarity for component extraction

**File:** `extract-components.ts`

Replace `similarity()` with `structuralSimilarity()`:
1. Extract tag skeleton from both strings: opening tags (preserving `class`, `id`, `data-block` attributes), closing tags. Strip text nodes and all other attribute values.
2. Compare skeletons using character comparison — identical structures with different content (link text, href values, active classes) now score ~0.95+ instead of dropping below 0.9.
3. Threshold stays at 0.9 — appropriate for structural comparison where differences indicate genuinely different layouts.

## Files Changed

| File | Change |
|------|--------|
| `src/lib/parser/edit-operations/apply-edit-operations.ts` | Remove auto-correct tier, use 85% only |
| `src/lib/parser/edit-operations/types.ts` | Remove `'auto-correct'` from MatchTier |
| `src/lib/parser/edit-operations/find-original-position.ts` | Script/style-aware position mapping |
| `src/lib/prompts/manifest/generate-manifest.ts` | Cheerio-based block extraction |
| `src/lib/blocks/extract-components.ts` | Structural similarity comparison |

## Non-goals

- No changes to the editBlock tool itself (Cheerio-based, works correctly).
- No changes to the 0.9 similarity threshold (appropriate for structural comparison).
- No test framework additions (project has none configured).
