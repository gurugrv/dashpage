# Blueprint Page Deduplication Design

## Problem

Generated multi-page sites are massively bloated. Each page is a self-contained monolith that duplicates CSS, JS, and HTML. Analysis of a 4-page site (365KB total):

- **34KB** — identical nav + footer HTML repeated in every page
- **24KB** — CSS in per-page `<style>` blocks (shared styles.css has only 658B of variables)
- **10KB** — identical JS (hamburger menu, scroll reveal, IntersectionObserver) per page
- **30KB** — 471 inline `style=""` attributes (top pattern repeated 52 times)
- **~87KB (24%)** of output is pure duplication, wasting ~42% of output tokens

### Root Causes

1. **No shared stylesheet generation** — `generateSharedStyles()` is deterministic and only emits CSS variables (658B). No utility classes, animations, or component styles.
2. **No shared JS** — no mechanism exists. Every page generates its own hamburger menu, scroll animations, IntersectionObserver boilerplate.
3. **Prompt says "don't duplicate" but nothing enforces it** — page prompt instructs AI not to redefine CSS variables, but there's no post-processing to strip violations.
4. **Component extraction runs on placeholders** — `extractComponents` runs server-side on `<!-- @component:header -->` placeholders, then `mergeComponentsIntoPages` puts full HTML back client-side with no second extraction pass.
5. **`extractComponents` only covers `nav` and `footer`** — `header` elements are ignored.

## Solution

### Architecture Change

```
Blueprint
  → Components (header/footer HTML)
  → Shared Assets (styles.css + scripts.js, sees component HTML)  ← NEW
  → Pages (reference shared assets + components)
  → Post-Processing (4-pass cleanup)  ← NEW
```

Shared Assets runs **sequentially after Components** so the AI can see the component HTML and generate matching styles/JS. Pages then run in parallel as before.

### 1. New "Shared Assets" AI Generation Step

**New API route:** `POST /api/blueprint/assets`

**Input:** Blueprint spec + design system + component HTML (header/footer)

**Output:** Two files via `writeFiles` tool:
- `styles.css` — CSS variables (current) + utility classes for common patterns (text colors, fonts, backgrounds) + animation keyframes (`@keyframes fadeIn`, `slideUp`, etc.) + scroll-reveal transition classes + component-level styles (cards, buttons, section patterns from blueprint)
- `scripts.js` — mobile menu toggle (hamburger, aria, dropdown) + scroll-reveal IntersectionObserver utility (`data-reveal` attribute driven) + smooth scroll for anchor links + blueprint-specific interactions (accordion, tabs, counters based on page specs)

**New prompt:** `getAssetsSystemPrompt(blueprint, designSystem, componentHtml)` — instructs AI to generate both files. Receives component HTML so it can generate matching styles.

**Stop condition:** Same as components — `hasToolCall('writeFiles')` or `stepCountIs(4)`.

**Model config:** Uses the blueprint's `components` step model config (or a new `assets` step config if added).

### 2. Updated Page Prompts

Changes to `getPageSystemPrompt()`:

- Include actual `styles.css` content in the prompt so AI knows what classes are available
- Include actual `scripts.js` content so AI knows what JS utilities exist
- Explicit rules:
  - "Use classes from styles.css instead of inline `style` attributes"
  - "Use `data-reveal` attribute instead of writing your own IntersectionObserver"
  - "Reference functions from scripts.js instead of inline JS"
  - "Do NOT include `<style>` blocks for CSS that already exists in styles.css"
  - "Only add page-specific CSS in a `<style>` block if it's unique to this page"
  - "Only add page-specific JS in a `<script>` block if it's unique to this page"
- Remove old `<design_system_reference>` block (superseded by actual styles.css)
- Keep `headTags` for Tailwind CDN, Google Fonts, and stylesheet/script links

### 3. Post-Processing Pipeline

New module: `src/lib/blueprint/post-process-pages.ts`

Runs server-side in `/api/blueprint/pages` after all pages complete, before SSE delivery. Four idempotent passes:

**Pass 1 — Strip duplicated head resources:**
- Remove duplicate `<script src="tailwindcss">` tags (keep one in headTags)
- Remove duplicate `<link>` to Google Fonts
- Remove `<style>` blocks containing `:root` variable redefinitions
- Uses Cheerio DOM parsing

**Pass 2 — Extract duplicate `<style>` rules:**
- Parse all `<style>` blocks from each page
- Identify CSS rules that appear in 2+ pages (exact match after whitespace normalization)
- Move shared rules to `styles.css`
- Leave page-specific CSS in a single `<style>` block per page

**Pass 3 — Inline style consolidation:**
- Scan all elements for `style=""` attributes
- Detect patterns that repeat 3+ times across all pages
- Generate CSS classes with semantic names where possible (e.g., `text-muted-body` for `color: rgba(255,255,255,0.65); font-family: var(--font-body)`)
- Add generated classes to `styles.css`
- Replace inline `style` with `class` references
- Handle partial matches (inline style is superset of a generated class)

**Pass 4 — JS deduplication:**
- Parse `<script>` blocks from each page (exclude Tailwind config)
- Identify function definitions and event listeners that appear in 2+ pages
- Extract shared functions/listeners to `scripts.js`
- Replace inline occurrences with references
- Use text-based similarity (not AST) — match normalized function bodies
- Wrap extracted functions in a DOMContentLoaded listener in scripts.js if they depend on DOM

Each pass can be disabled independently via a config flag.

### 4. Component Extraction Fix

Two changes:

1. **Expand tag candidates:** Add `header` to the extraction candidates alongside `nav` and `footer`.
2. **Fix extraction timing:** Since pages now receive component HTML in the prompt (not placeholders), `extractComponents` runs on final HTML and correctly detects shared nav/footer. The server-side extraction in `/api/blueprint/pages` now operates on merged content.

### 5. Generation Flow Changes

In `useBlueprintGeneration.approveAndGenerate()`:

```
// Current flow:
Components ─┐
             ├─ parallel ─→ merge → deliver
Pages ───────┘

// New flow:
Components ─→ Shared Assets ─→ Pages ─→ Post-Process ─→ deliver
  (sequential)    (sequential)   (parallel pages)  (server-side)
```

The sequential Components → Assets adds ~3-5s latency but eliminates the placeholder/merge complexity and ensures pages have full context.

`headTags` is expanded to include `<script src="scripts.js"></script>` alongside the existing stylesheet link.

### 6. DB/State Changes

`GenerationState` gets two new optional fields:
- `sharedAssets: { stylesCss: string; scriptsJs: string } | null` — persisted after the assets step for resume capability
- Phase enum extended: `generating-components` → `generating-assets` → `generating-pages`

### Impact Estimate

Based on the analyzed 4-page site (365KB):

| Optimization | Savings |
|---|---|
| Shared styles.css (CSS dedup) | ~28KB |
| Shared scripts.js (JS dedup) | ~10KB |
| Nav/footer extraction fix | ~34KB |
| Inline style → classes | ~15KB |
| **Total** | **~87KB (24%)** |

Token savings: ~40% fewer output tokens per multi-page generation.
Latency impact: +3-5s for shared assets step (sequential after components).
