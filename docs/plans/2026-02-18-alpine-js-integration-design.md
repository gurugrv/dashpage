# Alpine.js Integration for Token Reduction

**Date:** 2026-02-18
**Goal:** Reduce generated HTML output tokens by 25-30% by replacing inline JavaScript with Alpine.js declarative directives, cutting single-page generation time from ~6 minutes to ~4 minutes.

## Problem

Single-page blueprint generation streams ~31,000 output tokens (92KB HTML) in a single `writeFile` call at ~190 chars/sec, taking 347 seconds. A significant portion of these tokens are inline `<script>` blocks for common interactive patterns (accordions, carousels, counters, mobile menus, scroll animations). These patterns are boilerplate-heavy in vanilla JS but compact as Alpine.js declarative attributes.

## Solution

Add Alpine.js v3 CDN (core + collapse + intersect plugins) to all generated sites. Create a prompt section with explicit Alpine.js patterns for 6 common interactive elements. Ban inline `<script>` blocks for UI interactivity.

## Scope

Both chat mode (single-page) and blueprint mode (multi-page). All generated sites will use Alpine.js.

## Architecture

### CDN Tags

Added to `generateSharedStyles()` headTags output (blueprint mode) and referenced in `base-rules.ts` design system template (chat mode).

Three scripts, loaded in order (plugins before core):
```html
<script defer src="https://cdn.jsdelivr.net/npm/@alpinejs/collapse@3.x.x/dist/cdn.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/@alpinejs/intersect@3.x.x/dist/cdn.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
```

Plus `[x-cloak] { display: none !important; }` in CSS.

### New Prompt Section

New file: `src/lib/prompts/sections/interactivity.ts`

Exports `INTERACTIVITY_SECTION` containing:

1. **Directive block** — "Use Alpine.js for all UI interactivity. Never write inline `<script>` blocks for toggles, accordions, carousels, counters, scroll animations, or mobile menus."

2. **6 pattern blocks** with concrete HTML examples:

| Pattern | Alpine.js Approach | Vanilla JS Replaced |
|---------|-------------------|-------------------|
| FAQ Accordion | `x-data` + `x-show` + `x-collapse` + `x-cloak` | querySelector, classList.toggle, height animation |
| Testimonial Carousel | `x-data` with `init()`/`destroy()` lifecycle, `x-show` + `x-transition` | Slide logic, autoplay setInterval, dot navigation |
| Counter Animation | `x-intersect.once` + setInterval in expression | IntersectionObserver + requestAnimationFrame |
| Mobile Hamburger | `x-data` + `@click` + `x-show` + `x-transition` + body scroll lock | querySelector, event listeners, classList toggle |
| Scroll Reveal | `x-data="{ shown: false }"` + `x-intersect.once="shown = true"` + `:class` | IntersectionObserver per element, callback functions |
| Tabs | `x-data` + `x-show` + `@click` bindings | Tab state management, aria attribute toggling |

3. **Explicit ban** — Only acceptable `<script>` blocks: Alpine CDN tags, Tailwind config, `Alpine.data()` registrations for reusable components. Everything else must be Alpine directives.

4. **`Alpine.data()` guidance** — When the same interactive pattern repeats (e.g., multiple counters with different targets), register a reusable component via `Alpine.data('counter', (target) => ({...}))` in a single `<script>` block, then reference via `x-data="counter(500)"`. This further reduces token output for repetitive patterns.

### Prompt Integration Points

**Chat mode (`src/lib/prompts/system-prompt.ts`):**
- Import and insert `INTERACTIVITY_SECTION` into the `stable` part, after `TOOL_OUTPUT_FORMAT_SECTION`

**Blueprint mode (`src/lib/blueprint/prompts/page-system-prompt.ts`):**
- Insert `INTERACTIVITY_SECTION` after `UI_UX_GUIDELINES_COMPACT_SECTION`
- Update `sharedScriptsSection` — the `data-reveal`, `data-accordion-trigger`, `data-tab-trigger`, `data-count-to`, `data-menu-toggle` JS hooks are replaced by Alpine.js directives. If `sharedAssets.scriptsJs` exists, the prompt should still reference it but note that Alpine handles the interactive patterns.

**Motion design references in `design-quality.ts`:**
- Update `BLUEPRINT_DESIGN_QUALITY_SECTION` motion_design: change "CSS @keyframes + Intersection Observer" to "Alpine.js x-intersect directive for scroll-triggered reveals and counters"
- Update `DESIGN_QUALITY_SECTION` motion_design: same change for chat mode

### `generateSharedStyles` Changes

File: `src/lib/blueprint/generate-shared-styles.ts`

- Add Alpine CDN script tags to `headTags` (after Google Fonts, before Tailwind CDN)
- Add `[x-cloak] { display: none !important; }` to end of `stylesCss`

### `base-rules.ts` Changes

File: `src/lib/prompts/sections/base-rules.ts`

- In the `<design_system>` template, add Alpine CDN script tags to the `<head>` pattern (for chat mode which doesn't use `generateSharedStyles`)
- Add `[x-cloak]` to the CSS custom properties template

## What Doesn't Change

- No tool changes (writeFile, editBlock, editFiles, etc.)
- No API route changes
- No client-side changes (useHtmlParser, useBlueprintGeneration, PreviewPanel)
- No type changes
- No database changes
- iframe sandbox already has `allow-scripts` + `allow-same-origin` — Alpine works
- CSP meta tag only restricts `connect-src`, not `script-src` — `unsafe-eval` (needed by Alpine) is implicitly allowed

## Gotchas

1. **Plugin load order:** Collapse and Intersect MUST come before Alpine core in script tags. `defer` ensures DOM is ready. The template enforces this order.
2. **x-cloak required:** Every `x-show` element that starts hidden needs `x-cloak` to prevent FOUC. Pattern examples include this.
3. **No dynamic Tailwind classes:** Patterns use full class names (`'opacity-100'`), never template literals (`` `text-${color}-600` ``). Tailwind CDN JIT can't detect dynamic string construction.
4. **Model fallback risk:** If the model ignores Alpine directives and writes inline JS anyway, the site still works — it's just larger. No functional regression, only a missed optimization.
5. **`$id()` requires Alpine 3.4+:** The accordion pattern uses `$id('faq')` for auto-generated unique IDs. Pinning to `3.x.x` resolves to 3.15.8, so this is fine.

## Expected Impact

- **Token reduction:** 15-20K characters per 8-section page (~25-30% of output)
- **Time savings:** ~80-100 seconds off a 347-second generation (down to ~250s)
- **Quality improvement:** Cleaner HTML, proper accessibility via Alpine's built-in aria handling, smoother animations (x-collapse > hand-rolled height transitions)
- **Prompt overhead:** ~2-3KB added to system prompt (negligible vs savings)

## Verification

1. Generate the same dental clinic single-page site with Alpine.js prompts
2. Measure output token count and wall-clock time
3. Verify all interactive elements work in iframe preview (accordion, carousel, counter, hamburger, scroll reveal)
4. Check that no inline `<script>` blocks exist for UI interactivity
5. Test on mobile viewport (hamburger menu, responsive layout)
