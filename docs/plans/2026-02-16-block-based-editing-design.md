# Block-Based Editing with Shared Components — Design

**Date**: 2026-02-16
**Status**: Approved

## Problem

Current editing system has three major pain points:

1. **Unreliable file targeting**: CSS selectors (editDOM) are ambiguous — `section` matches 5 elements. Search/replace (editFiles) depends on AI generating exact strings — fails often, needs 5-tier fuzzy matching fallback.
2. **No shared components**: Nav/footer duplicated in every page. Editing nav requires AI to target every file. AI often forgets some pages.
3. **Split tool sets**: Single-page sites get crippled tools (only editDOM). Major rewrites must go through raw text output — fragile, bypasses structured tool pipeline.

## Solution

Every semantic section gets a stable `data-block` ID during generation. A new `editBlock` tool targets blocks by ID (guaranteed unique match). Shared elements (nav, footer) are auto-extracted to component files and injected at preview/download time.

## Design Decisions

| Decision | Choice |
|----------|--------|
| Block identification | AI generates `data-block` attrs, system validates/backfills |
| Shared components | Bake in at preview + download time (no Web Components) |
| Edit tool | Merged `editBlock` with block ID + CSS selector modes |
| Tool set split | Eliminated — one tool set for all cases |
| Component storage | `_components/` prefix in ProjectFiles |
| Component extraction | Auto-detect after first multi-page generation |
| Existing conversations | Self-healing — blocks injected on first edit |
| DB changes | None |

## Section 1: Block Identification

AI generates `data-block` attributes on every semantic section during generation:

```html
<nav data-block="main-nav">...</nav>
<section data-block="hero">...</section>
<section data-block="features">...</section>
<section data-block="pricing">...</section>
<footer data-block="site-footer">...</footer>
```

Rules:
- AI chooses semantic names (not `section-1`, `section-2`)
- Names must be unique within a file
- System prompt enforces this in generation rules
- Post-generation validation: if any top-level semantic element (`nav`, `header`, `section`, `footer`, `main`, `aside`) lacks `data-block`, the system auto-assigns one based on tag + position (e.g. `section-3`)
- Existing `data-block` attributes are preserved across edits

## Section 2: Shared Components

Internal storage — shared elements stored as separate entries in ProjectFiles with `_components/` prefix:

```typescript
ProjectFiles = {
  "index.html": "...",           // has <!-- @component:main-nav --> placeholder
  "about.html": "...",           // has <!-- @component:main-nav --> placeholder
  "_components/main-nav.html": "<nav data-block=\"main-nav\">...</nav>",
  "_components/site-footer.html": "<footer data-block=\"site-footer\">...</footer>",
}
```

How components get created:
- **First generation**: AI generates full pages with nav/footer inline (no change to current behavior)
- **Post-generation extraction**: After first multi-page generation completes, system detects duplicate nav/footer across pages using content similarity (strip whitespace, compare). If similarity >= 90% across all pages, extract to `_components/{block-name}.html` and replace inline content with `<!-- @component:{block-name} -->` placeholders.
- **Subsequent edits**: AI sees components as separate files in manifest. Edits component file once — system injects it everywhere.

Preview: `combineForPreview()` replaces placeholders with component file content before setting srcdoc.

Download: Same injection at export time. User gets standalone HTML files with everything baked in.

Single-page sites: No components extracted. Block IDs still work for editing.

## Section 3: The `editBlock` Tool

Single unified editing tool replacing editDOM, with two targeting modes:

**Mode 1: Block ID targeting** (primary)
```typescript
editBlock({ file: "index.html", blockId: "hero", action: "replace", content: "..." })
```

**Mode 2: CSS selector targeting** (fallback for edge cases)
```typescript
editBlock({ file: "index.html", selector: "[data-block='hero'] h1", action: "setText", value: "New Headline" })
```

Available actions:

| Action | Block ID mode | CSS selector mode | Use case |
|--------|:---:|:---:|------|
| `replace` | Full block replacement | Replace matched element | Structural changes |
| `replaceInner` | Replace block's inner HTML | Replace element's inner HTML | Content overhaul |
| `setText` | — | Set text content | Change heading, paragraph |
| `setAttribute` | — | Set attribute value | Change href, src, class |
| `addClass` / `removeClass` | On block wrapper | On matched elements | Style tweaks |
| `remove` | Remove entire block | Remove matched elements | Delete sections |
| `insertBefore` / `insertAfter` | Insert relative to block | Insert relative to element | Add new sections |

Design decisions:
- `blockId` and `selector` are mutually exclusive — tool validates this
- Block ID uses Cheerio `[data-block="X"]` — guaranteed unique match
- CSS selector mode has single-element enforcement for content operations
- Component files are valid edit targets
- Returns `{ success, file, content }` with suggestions on failure

editFiles is kept but demoted — search/replace only (no DOM ops). editDOM is removed.

## Section 4: Block-Aware Manifest

Manifest changes from CSS-selector-based to block-based summaries:

```
<file name="index.html" size="8432">
  <blocks>
    main-nav (component:header) — Logo + 4 links, dark bg
    hero — h1: "Build Faster", p: "The modern way...", 2 buttons
    features — h2: "Features", 3-col grid, 3 icon cards
    pricing — h2: "Pricing", 3 tier cards, toggle
    site-footer (component:footer) — 3-col links, copyright
  </blocks>
</file>

<file name="_components/main-nav.html" size="890">
  <blocks>
    main-nav — Logo, 4 nav links, mobile hamburger
  </blocks>
</file>
```

Changes to `generateManifest()`:
- `extractSections()` reads `data-block` attributes instead of building selectors from tag+id+class
- Component blocks show `(component:X)` annotation
- Component files listed separately with own block summaries

Changes to `buildEditModeBlock()`:
- Cross-page guidance updated: "Blocks marked (component:X) are shared. Edit them in `_components/X.html`."

## Section 5: Unified Tool Set

Kill single-page vs multi-page split. One tool set always:

```typescript
// New — always use full tools
const { tools } = createWebsiteTools(currentFiles ?? {});
```

`createSinglePageTools()` deleted. `SINGLE_PAGE_TOOL_FORMAT_SECTION` deleted. `TOOL_OUTPUT_FORMAT_SECTION` updated for editBlock.

The "output HTML as text" workflow is removed — all generation goes through tools.

Text-based HTML extraction fallback in useHtmlParser kept for safety but should rarely trigger.

## Section 6: Post-Generation Pipeline

After AI generation completes (in onFinish), three steps run:

**Step 1: Validate block IDs**
- Parse each HTML file with Cheerio
- Find top-level semantic elements without `data-block`
- Auto-assign based on tag + position
- Fix duplicates with `-2`, `-3` suffix

**Step 2: Extract shared components** (multi-page only)
- Only runs when: 2+ pages, no `_components/` exist yet
- For each page, extract outerHTML of nav/footer blocks
- Normalize whitespace, compare across pages
- Similarity >= 90% → extract to `_components/`, replace with placeholders

**Step 3: Build block index**
- Compute `BlockIndex` from HTML (not persisted to DB)
- Feeds into manifest generator for next turn

Performance: Single Cheerio parse per file. ~10-20ms for 5-page site.

## Section 7: Preview System Changes

`combineForPreview()` updated flow:
1. Take active page HTML
2. **Replace `<!-- @component:X -->` placeholders with `_components/X.html` content**
3. Inline .css and .js files
4. Inject helper scripts

`getHtmlPages()` excludes `_components/` files from page tabs.

Section highlight script updated to match `[data-block]` selectors.

Download/export: Same injection — component files consumed, excluded from zip.

## Section 8: Edge Cases

| Edge Case | Handling |
|-----------|----------|
| AI forgets `data-block` attrs | Post-generation auto-assigns. Next turn works normally. |
| AI edits component in page file | Placeholder has no DOM — error guides to component file. |
| Single-page promoted to multi-page | Post-generation extracts components on first multi-page gen. |
| Component content diverges | AI removes placeholder, writes custom nav inline with different block ID. |
| CSS selector targets inside placeholder | No DOM nodes found — error suggests component file. |
| AI forgets `data-block` on replacement | Auto-inject original block ID onto replacement element. |
| Blueprint mode parallel gen | Extraction runs after all pages complete. |
| Nested blocks | Cheerio `[data-block="X"]` naturally selects correct element. |

## Section 9: Migration / Backwards Compatibility

Existing conversations with no `data-block` attrs:
1. First edit: manifest falls back to current CSS selector summaries
2. `editBlock` CSS selector mode works as equivalent to old editDOM
3. After AI responds, post-generation pipeline injects block IDs
4. Second edit onward: blocks exist, full system works

No migration script needed. No DB schema changes. Self-healing on first interaction.

Graceful degradation order:
1. `editBlock` with `blockId` — best path
2. `editBlock` with `selector` — works on any HTML
3. `editFiles` with search/replace — works on any text
4. `writeFiles` — full rewrite, always works
