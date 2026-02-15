# Richer Manifest for Robust Editing

**Date:** 2026-02-16
**Goal:** Improve edit accuracy by giving the AI better context about existing sites
**Approach:** Enrich the system prompt manifest with fonts, nav links, site-level overview, and better section summaries

## Problem

The current manifest gives the AI a skeletal view of each file — design tokens + section selectors with minimal summaries like "content block". This leads to:
- AI not knowing which file contains a specific section
- Inconsistent design across pages (doesn't see shared fonts/palette at a glance)
- Unnecessary `readFile` calls because the manifest doesn't have enough to orient

## Design

### 1. Site-Level Overview Block

New `extractSiteOverview()` function builds a cross-file summary placed before per-file manifests:

```xml
<site_overview>
  <design_system>
    Palette: --primary: hsl(220,60%,50%), --bg: hsl(0,0%,98%), --text: hsl(220,20%,15%)
    Fonts: Inter (body), Playfair Display (headings)
    CDN: Tailwind CSS
  </design_system>
  <navigation>
    index.html ↔ about.html ↔ services.html ↔ contact.html
  </navigation>
  <shared_elements>
    All pages share: nav (5 links), footer (3 links + copyright)
  </shared_elements>
</site_overview>
```

- **Design system**: extracted from `index.html` `:root {}` tokens + Google Fonts links
- **Navigation**: union of all `<nav>` link targets across pages
- **Shared elements**: detect nav/footer patterns repeated across multiple files

### 2. Per-File Manifest Enrichments

#### Font extraction
Parse `<link>` tags with `fonts.googleapis.com` or `fonts.bunny.net` to extract font family names.

#### Nav link targets
Parse `<a href>` within `<nav>` elements to show which internal pages each file links to.

#### Richer section summaries
- Extract h1, h2, h3 headings (not just first heading)
- Include paragraph preview (first ~80 chars of first `<p>`)
- Better element counts

Example per-file output:
```xml
<file name="about.html" size="6200">
  <fonts>Inter, Playfair Display</fonts>
  <sections>
    nav — 5 nav links → [index.html, about.html, services.html, blog.html, contact.html]
    section#hero — h1: "About Our Team", p: "We are a passionate group of...", 1 images
    section.team-grid — h2: "Meet the Team", 4 cards, 4 images
    footer — 3 nav links, copyright text
  </sections>
</file>
```

### 3. Context-Aware Edit Guidance

Replace generic edit guidance with manifest-aware instructions:

```xml
<edit_guidance>
Modify the existing HTML based on the user's request.
Build on the existing design — preserve what works, change what's requested.

BEFORE EDITING: Check the manifest above. It contains the site's design system,
page structure, and CSS selectors. Use this context FIRST — do not call readFile
unless you need exact content for editFiles search strings.

Tool selection:
- editDOM: text, images, colors, classes, attributes. Use CSS selectors from manifest.
- editFiles: structural changes, new sections. MUST call readFile first for precise matches.
- writeFiles: new pages only, or full rewrites. Match the design system from site_overview.

Cross-page awareness:
- Nav and footer appear on ALL pages. Changing them requires editing every file.
- New pages must use the same design_system tokens and font imports.
- Use editFiles to batch cross-page changes in one call.

Only add new pages when the user explicitly asks for them.
</edit_guidance>
```

## Files to Modify

1. **`src/lib/prompts/manifest/generate-manifest.ts`**
   - Add `extractFonts()` — parse Google Fonts link tags
   - Add `extractNavLinks()` — parse `<a href>` within `<nav>`
   - Enrich `summarizeContent()` — h2/h3 headings, paragraph previews
   - Add `extractSiteOverview()` — site-level summary from all files
   - Update `generateManifest()` — include new extractions + site overview

2. **`src/lib/prompts/sections/context-blocks.ts`**
   - `buildCurrentWebsiteBlock()` — integrate site overview into template
   - `buildEditModeBlock()` — replace with context-aware guidance

## Files NOT Changing

- `system-prompt.ts` — no structural change
- `file-tools.ts` — tools stay the same
- `useHtmlParser.ts` — client parsing unchanged
- API routes — no changes

## Risk

Manifest grows ~20-30 lines for a 5-page site. Negligible for 1-5 page sites within token budgets.
