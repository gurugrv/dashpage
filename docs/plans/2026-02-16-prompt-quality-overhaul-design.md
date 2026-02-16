# Prompt Quality Overhaul — Design Doc

**Date:** 2026-02-16
**Goal:** Fix generic/basic website output by improving system prompts. No API, UI, tool, or functional changes.

## Problem

Generated websites are structurally identical (hero + 3-column cards + CTA + footer), use generic fonts/colors, and lack creative visual impact regardless of which AI model is used.

## Root Causes

1. Anti-slop instructions gated to Anthropic models only
2. No layout variety mechanism — only color/mood seeds exist
3. Abstract rules without concrete CSS patterns
4. Procedural overhead (explain palette, justify fonts) wastes generation budget
5. No explicit anti-pattern list
6. Competing rules (accessibility, block IDs, tool workflows) dilute design focus

## Approach

Prompt-only changes. 3 files modified. Zero functional changes.

## Changes

### 1. Make Anti-Slop Universal (`system-prompt.ts`)

- Remove `isAnthropicModel` gate on `ANTHROPIC_AESTHETICS_SECTION`
- Rename to universal creative directive
- Apply to ALL providers/models
- Trim "you tend to converge" framing, keep actionable directives

### 2. Add Layout Archetypes (`context-blocks.ts`)

15 layout archetypes, randomly selected per generation alongside color seed:

1. **Bento grid** — asymmetric grid tiles with varying column/row spans
2. **Split-screen** — 50/50 or 60/40 side-by-side contrasting content
3. **Editorial/magazine** — large hero image, multi-column text, pull quotes
4. **Immersive scroll** — full-viewport sections with scroll-driven reveals
5. **Asymmetric hero** — off-center hero, overlapping elements, negative margins
6. **Card mosaic** — mixed card sizes in masonry-like flow
7. **Diagonal sections** — angled clip-path dividers between sections
8. **Centered minimal** — dramatic whitespace, single-column focus
9. **Horizontal scroll showcase** — sideways-scrolling sections within vertical page
10. **Glassmorphism layers** — frosted glass cards, backdrop-blur, translucent panels
11. **Mega footer architecture** — minimal above-fold, dense structured footer as design feature
12. **Kinetic typography hero** — oversized animated text as primary visual, minimal imagery
13. **Overlapping collage** — scattered/rotated elements, organic placement, art-directed chaos
14. **Dashboard-inspired** — data viz aesthetic — stat counters, progress rings, metric cards
15. **Sticky reveal panels** — sections that pin and layer over each other via position:sticky

Each archetype includes: name, description, key CSS technique snippet (3-5 lines).

`buildFirstGenerationBlock` picks one randomly and injects it alongside the color seed.

### 3. Add Anti-Pattern List (`design-quality.ts`)

Explicit NEVER list in `DESIGN_QUALITY_SECTION`:
- Hero + 3-column equal cards + CTA + footer structure
- Inter, Roboto, Open Sans, Poppins, DM Sans as default fonts
- Purple/indigo/blue gradient as primary accent
- All sections same height/padding
- Centered everything — must vary alignment
- Emoji as icons
- Generic stock photo placeholders without searchImages
- Evenly-distributed color palettes

### 4. Reduce Procedural Steps (`context-blocks.ts`)

Current `buildFirstGenerationBlock` steps (verbose):
1. State what you'll build and how seed influences approach
2. Declare exact palette: list all 7 HSL values with explanations
3. Pick font pairing, explain contrast principle
4. Call writeFiles

New steps (lean):
1. Use the design seed and layout archetype to build your page
2. Define :root CSS variables and Tailwind config
3. Call writeFiles with the complete HTML

Removes ~300-500 tokens of planning text per generation.

### 5. Strengthen Creative Framework (`design-quality.ts`)

- Add aesthetic vocabulary list for variety
- Add rule: "Each generation should feel like a different designer built it"
- Reinforce layout archetype as structural foundation

### 6. Add Layout CSS Patterns (`design-quality.ts`)

Compact CSS technique snippets inside a `<layout_techniques>` section:
- Bento: grid-template-columns with span variations
- Diagonal: clip-path polygon
- Overlapping: negative margins + z-index
- Glassmorphism: backdrop-filter blur + rgba backgrounds
- Sticky stacking: position sticky with z-index layering
- Horizontal scroll: overflow-x + scroll-snap

## Files Touched

| File | Change |
|------|--------|
| `src/lib/prompts/system-prompt.ts` | Remove Anthropic gate, make anti-slop universal |
| `src/lib/prompts/sections/context-blocks.ts` | Add layout archetypes, trim procedural steps |
| `src/lib/prompts/sections/design-quality.ts` | Add anti-patterns, layout patterns, strengthen creative framework |

## Files NOT Touched

- All API routes
- All tools (writeFiles, editBlock, editFiles, etc.)
- All UI components
- All hooks and parsers
- Blueprint prompts (separate files, future work)
- Tool output format section
- Block ID system
