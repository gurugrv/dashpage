# Blueprint Quality Enhancement Design

**Date**: 2026-02-18
**Goal**: Improve generation quality across blueprint and chat modes with 2026 design trends, richer schema, missing patterns, and bug fixes.
**Constraint**: Quality over cost — token budget is not a limiting factor.
**Scope**: ~15 files, no DB migration, no new pipeline steps, no UI changes.

---

## 1. Schema Extensions (`types.ts`)

### BlueprintDesignSystem (new fields)
- `visualStyle`: enum — `editorial-magazine` | `tech-minimal` | `luxury-refined` | `bold-expressive` | `organic-warm` | `brutalist-raw` | `retro-nostalgic` | `corporate-clean`
- `imageStyle`: string — e.g. "warm documentary photography with natural light"
- `fontWeights`: `{ heading: number[], body: number[] }` — actual weights needed

### BlueprintPage (new fields)
- `contentFocus`: string — unique messaging this page owns
- `visualWeight`: enum `hero-heavy` | `content-dense` | `balanced` | `minimal`
- `heroApproach`: string — e.g. "full-bleed image with overlay text"

### BlueprintPageSection (new fields)
- `imageDirection`: string — specific subject/style for imagery
- `contentDepth`: enum `minimal` | `standard` | `rich`

### BlueprintContentStrategy (new fields)
- `contentDistribution`: `Record<string, string[]>` — maps filenames to assigned value props
- `seoKeywords`: `Record<string, string[]>` — per-page target keywords

All new fields use `.optional()` or `.catch()` for backward compatibility.

---

## 2. Prompt Improvements — 2026 Trends & Anti-AI-Slop

### design-quality.ts
- Replace `color_system` with 2026 palette strategies (earthy eco-digital, warm mahogany, bioluminescent tech, high-contrast mono). Ban purple/indigo as primary. Ban pure #ffffff backgrounds.
- Replace `typography` with anti-AI-slop font tiers: distinctive display (Fraunces, Bricolage Grotesque, Syne, Space Grotesk, DM Serif Display) vs safe body (DM Sans, Plus Jakarta Sans, Outfit, Manrope). Ban Inter/Roboto/Poppins/Nunito as primary. Add `text-wrap: balance/pretty`.
- Add `visual_atmosphere`: gradient mesh backgrounds, SVG noise texture, mix-blend-mode layering.
- Expand `motion_design` with CSS scroll-driven animations: `animation-timeline: view()`, `@starting-style`, staggered `sibling-index()`. All in `prefers-reduced-motion: no-preference`.
- Add `layout_innovation`: bento grid (12-col asymmetric), editorial overlapping grids, stacking cards, horizontal scroll. Concrete CSS patterns.
- Port `surface_treatment` types from blueprint-only to chat mode.

### ui-ux-guidelines.ts
- Add typography register per industry to existing industry_tones.
- Expand `interaction_standards` with icon sizing conventions (16/24/32-48px) and when NOT to use icons.
- Add responsive guidance per breakpoint (375/768/1024/1440).

### blueprint-system-prompt.ts
- Add guidance for all new schema fields.
- Expand font_pairing_principles with positive examples (specific pairings).
- Fix JSON example inconsistency (7 sections vs "3-6" rule).
- Add seoKeywords and contentDistribution generation guidance.

---

## 3. Alpine.js Patterns & Interactivity (`interactivity.ts`)

### New patterns (8)
- `pricing-toggle` — annual/monthly switch (maps to `toggle-switch` enum)
- `hover-reveal` — team card bio overlay with touch fallback
- `modal-lightbox` — gallery expand, x-teleport, backdrop blur, focus trap
- `sticky-header-shrink` — padding/logo reduction on scroll
- `tilt-card` — mouse parallax 3D via perspective/rotateX/Y
- `before-after-slider` — draggable clip-path comparison
- `magnetic-button` — cursor-following translate on hover
- `counter-scroll` — improved counter with x-intersect, cubic ease-out, toLocaleString

### Removed from enum
- `scroll-scrub` — replaced by CSS `animation-timeline: view()` in design-quality

### Updates to existing patterns
- Fix `scroll-reveal`: `transition-transform` instead of `transition-all`
- Add `prefers-reduced-motion` media query wrapper to every pattern
- Add ARIA attributes to all interactive patterns

---

## 4. Bug Fixes

### generate-shared-styles.ts
- Fix `--transition`: `transform 0.2s ease-in-out, opacity 0.2s ease-in-out` (not `all`)
- Add `--transition-fast: 0.15s` and `--transition-slow: 0.4s`
- Add `borderRadius` to Tailwind config extend
- Add `scroll-behavior: smooth`
- Add `-webkit-font-smoothing: antialiased`, `text-rendering: optimizeLegibility`
- Add `overflow-x: hidden` on body
- Dynamic font weights from new `fontWeights` schema field
- Generate oklch color values alongside hex

### components-system-prompt.ts
- Replace full `UI_UX_GUIDELINES_SECTION` with compact version (saves ~1000 tokens)
- Fix contradictory "include the JS" + "no inline scripts"
- Add footer layout archetypes (minimal vs rich multi-column)
- Add sticky header scroll behavior guidance
- Complete `data-current-page` feature end-to-end

### page-system-prompt.ts
- Add section-to-section visual contrast guidance (alternate bg colors, density variation)
- Per-page content differentiation using `contentFocus` and `contentDistribution`
- Truncation recovery: "finish current section completely rather than starting incomplete new one"
- Suppress `webSearch` when `siteFacts` covers business info
- Add `data-current-page` attribute instruction

### base-rules.ts
- Add `<meta name="viewport">` to required boilerplate
- Add `<meta name="description">` requirement
- Add semantic heading hierarchy rule (one h1, h2 > h3 nesting)

### Deduplication
- Remove completion summary from `context-blocks.ts` `buildFirstGenerationBlock()`
- Remove Alpine.js one-liner from first-gen block

---

## 5. Chat Mode Parity

### system-prompt.ts
- Remove duplicate `CREATIVE_DIRECTION_SECTION` — replace with 3-line reinforcement
- Strengthen `IDENTITY_LINE`: "output should feel like a $5,000 agency portfolio piece"
- Make `CLOSING_LINE` actionable: "prioritize visual impact in the first viewport"

### design-quality.ts
- Port surface treatment types to full `DESIGN_QUALITY_SECTION` (currently blueprint-only)

### ui-ux-guidelines.ts (style seeds)
- Update `STYLE_SEEDS` with 2026-aligned palettes. Remove purple/indigo defaults.
- Add `visualStyle` field to each seed mapping to the new enum.
- Add `imageStyle` hint derived from each seed.

### context-blocks.ts
- Inject `visualStyle` archetype from style seed into first-gen context
- Add image style hint from seed

---

## Files Affected

| File | Changes |
|---|---|
| `src/lib/blueprint/types.ts` | 9 new schema fields |
| `src/lib/blueprint/generate-shared-styles.ts` | 7 fixes |
| `src/lib/blueprint/prompts/blueprint-system-prompt.ts` | New field guidance, font examples, JSON fix |
| `src/lib/blueprint/prompts/page-system-prompt.ts` | Content differentiation, contrast, truncation, data-current-page |
| `src/lib/blueprint/prompts/components-system-prompt.ts` | Slim UI/UX, fix JS contradiction, footer archetypes, sticky header |
| `src/lib/prompts/sections/design-quality.ts` | Major rewrite: colors, typography, atmosphere, motion, layout, surface |
| `src/lib/prompts/sections/ui-ux-guidelines.ts` | Industry typography, icon sizing, responsive, style seeds update |
| `src/lib/prompts/sections/interactivity.ts` | 8 new patterns, ARIA, reduced-motion, fix scroll-reveal |
| `src/lib/prompts/sections/base-rules.ts` | viewport meta, description meta, heading hierarchy |
| `src/lib/prompts/sections/context-blocks.ts` | Remove duplication, add visualStyle/imageStyle to first-gen |
| `src/lib/prompts/sections/tool-output-format.ts` | Minor dedup |
| `src/lib/prompts/system-prompt.ts` | Remove duplicate creative direction, stronger identity/closing |
