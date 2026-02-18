# Two-Pass Single-Page Generation Design

**Date:** 2026-02-18
**Status:** Approved
**Goal:** Reduce single-page first-generation time from ~6-7 minutes to ~60-115 seconds without quality decline.

## Decisions

- **Scope:** First generation only. Edits remain single-pass via editBlock/editFiles.
- **Approach:** Inline Blueprint — reuse blueprint pipeline for Pass 1, new section-level parallel generation for Pass 2.
- **UX:** Transparent two-phase progress ("Planning your site..." → "Building sections..." with per-section bars).
- **Skeleton depth:** Rich — Pass 1 produces actual headlines, service names, testimonial quotes, CTA copy.
- **Model config:** Same model for both passes.
- **Minimum threshold:** Skip two-pass if Pass 1 produces < 3 content sections; fall back to single-pass chat.

## Architecture

### Pass 1 — Blueprint Planning (~15-25s)

Reuses `/api/blueprint/generate` with the existing `blueprintSchema` structured output. Produces a `Blueprint` with designSystem, contentStrategy, siteFacts, and one `BlueprintPage` with N sections.

**Schema extensions** (new optional fields on `BlueprintPageSection`):

```typescript
headlineText?: string       // "Transform Your Smile with Confidence"
subheadlineText?: string    // "Award-winning dental care for the whole family"
ctaText?: string            // "Book Your Free Consultation"
ctaHref?: string            // "#contact"
items?: Array<{
  title: string             // "Cosmetic Dentistry"
  description: string       // "From veneers to whitening..."
  iconQuery?: string        // "tooth sparkle"
  imageQuery?: string       // "dental cosmetic smile"
}>
```

**New field on `BlueprintPage`** — `sectionFlow`:

```typescript
sectionFlow?: Array<{
  sectionId: string
  background: 'bg' | 'surface' | 'primary' | 'dark' | 'accent' | 'gradient'
  visualWeight: 'heavy' | 'balanced' | 'light'
  dividerStyle?: 'none' | 'hairline' | 'gradient-fade' | 'diagonal-clip' | 'wave'
}>
```

Replaces heuristic `section_contrast` with explicit Pass 1 decisions. No section guesses its neighbor's background.

### Pass 2 — Parallel Section Generation (~45-90s)

**New route: `POST /api/twopass/sections`**

Takes blueprint + conversationId. Generates each section as an HTML fragment in parallel, assembles into one `index.html`, streams progress via SSE.

**Per-section generation:**

Each section gets its own `streamText()` call with a focused prompt producing an HTML fragment (just the `<section>` element, no full document).

Input per section:
- Design system tokens (CSS variable names, not definitions)
- Content strategy (tone, audience, brand voice)
- Site facts (if business site)
- Section spec (type, layout, items, headlineText, etc.)
- Neighbor context (previous/next section summaries + backgrounds)
- sectionFlow entry (assigned background, visual weight, divider)

Output per section:
- One `<section data-block="[id]">...</section>` HTML fragment
- Tailwind utilities + `var(--color-*)` tokens only
- No `<head>`, no `<style>` blocks, no `:root` definitions

**Header/footer:** Generated as dedicated units in the same parallel batch.

**Tools per section:** `searchImages`, `searchIcons`, `webSearch`, `fetchUrl`, `writeSection` (custom tool capturing fragment). Stops after `writeSection` fires.

**Concurrency:** Max 5 concurrent (matching existing `MAX_CONCURRENT_PAGES`).

### Assembly Step (synchronous, no AI)

`assemblePageFromSections()` merges fragments:

1. `generateSharedStyles(blueprint.designSystem)` → headTags
2. Build `<head>`: charset, viewport, title, meta description, headTags, Tailwind config script
3. Build `<body>`: header + sections in order + footer
4. Hoist any stray `<style>` blocks to `<head>` (defensive)
5. Add Alpine.js CDN in `<head>`
6. `validateBlocks()` on assembled HTML
7. Return `{ "index.html": assembledHtml }`

## Quality Preservation

### Content Coherence
Pass 1's rich `contentNotes` + structured fields carry specific copy. Sections execute a plan, not improvise. A `sharedCopy` block provides exact text anchors (business name, CTA text, stat values, service list) that all sections reference consistently.

### Visual Coherence
Shared CSS variables via `generateSharedStyles()`. Tailwind utilities prevent CSS conflicts. No section generates its own `:root`. The `sectionFlow` array assigns backgrounds and visual weight explicitly.

### Cross-Section Flow
Each section receives neighbor context:
```
Previous section: "hero" — dark gradient bg, large headline, CTA button
Next section: "features" — light surface bg, 3-column card grid
Your background: use bg-[var(--color-surface)]
```

### Section Prompt Structure
```
1. <design_system_reference> — CSS variable names
2. <content_strategy> — tone, audience, brand voice, CTA
3. <site_facts> — business details
4. <your_section> — full spec with headlineText, items, layout
5. <section_context> — assigned background, neighbors, dividers
6. <shared_copy> — text anchors for consistency
7. <tool_workflow> — searchImages/searchIcons, then writeSection
8. <rules> — Tailwind only, no <style>, namespace keyframes, data-block required
```

### Post-Assembly Validation
- All sections present and in order
- No duplicate `data-block` IDs
- Background alternation matches `sectionFlow`
- All `<img>` tags have `src` attributes
- Minimum HTML length per section (reject stubs)

Failed sections get one retry. If retry fails, simplified generation (no tools, content from plan only).

## Client-Side Orchestration

### New hook: `useTwoPassGeneration`

```
1. User submits prompt
2. Builder detects isFirstGeneration → twoPass.generate(prompt)
3. POST /api/blueprint/generate → Blueprint JSON
4. generateSharedStyles() → headTags (synchronous)
5. POST /api/twopass/sections → SSE stream
6. On pipeline-status: complete → onFilesReady({ "index.html": html })
7. Switch to useChat for subsequent edits
```

### Progress UX
Reuses `BuildProgress.tsx` with new phase labels:
- Phase 1: "Planning your site..." (0-20%)
- Phase 2: "Building sections..." (20-95%) — per-section progress bars
- Phase 3: "Assembling..." (95-100%)

### Streaming Preview
Sections render incrementally as they complete. Assembly runs on each completion, producing a growing preview.

### Abort Handling
Stop cancels all in-flight section calls. Completed sections discarded. Conversation reverts to empty state.

### Post-Completion
Conversation switches to `useChat`. Generated `index.html` set as `currentFiles`. Subsequent edits use normal single-pass `editBlock`/`editFiles`.

## Edge Cases

| Case | Handling |
|---|---|
| < 3 content sections | Fall back to single-pass chat |
| Section fails after retry | Assemble without it, TODO comment in HTML |
| Vague prompt | Pass 1 handles inference (blueprint generation already does this) |
| Business site with discovery | BusinessProfile → siteFacts on blueprint → sections |
| Model lacks structured output | Fall back to single-pass chat |
| Section emits `<style>` block | Assembly extracts, namespaces, hoists to `<head>` |
| Alpine.js interactivity | Each section includes own Alpine markup, CDN loaded once |

## Files

### New
- `src/app/api/twopass/sections/route.ts` — Pass 2 route
- `src/hooks/useTwoPassGeneration.ts` — Client orchestration
- `src/lib/twopass/section-prompt.ts` — Section-level prompt builder
- `src/lib/twopass/assemble-page.ts` — Fragment → full HTML assembly
- `src/lib/twopass/types.ts` — Types (if needed beyond blueprint types)

### Modified
- `src/lib/blueprint/types.ts` — Add headlineText, items[], sectionFlow[]
- `src/components/Builder.tsx` — Route first-gen to two-pass
- `src/components/BuildProgress.tsx` — Two-pass phases + per-section progress
- `src/lib/blueprint/prompts/blueprint-system-prompt.ts` — Richer content directives

### Unchanged
- `/api/blueprint/generate/route.ts` — Reused as-is
- `/api/chat/route.ts` — Handles edits only
- `src/hooks/useHtmlParser.ts` — Bypassed (uses onFilesReady)
- `src/lib/chat/tools/` — Unchanged
- `src/lib/blocks/validate-blocks.ts` — Called by assembly
- `generateSharedStyles()` — Reused as-is
