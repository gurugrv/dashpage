# Prompt Engineering Guide

How the system prompt pipeline works, how sections compose, and how to tune generation quality.

---

## Overview

AI Builder uses a modular prompt composition system. The system prompt is assembled from independent sections, conditionally included based on the generation context (first generation vs edit, chat vs blueprint, provider/model specifics).

The main builder is `src/lib/prompts/system-prompt.ts`. Individual sections live in `src/lib/prompts/sections/`. Blueprint mode has its own prompt set in `src/lib/blueprint/prompts/`.

---

## Prompt Composition Architecture

### Chat Mode

```
resolveChatExecution()
  → resolvePreferredTimeZone() → buildTemporalContext()
  → getSystemPromptParts(currentFiles, temporalContext, userPrompt, provider, model, businessProfile)
  → returns { stable, dynamic }
  → systemPrompt = stable + '\n' + dynamic
```

The prompt is split into two parts for caching:

| Part | Contents | Changes |
|------|----------|---------|
| **stable** | Identity, base rules, UI/UX guidelines, creative direction, layout archetypes, tool format, interactivity | Never changes per-request |
| **dynamic** | Context blocks (current files, temporal, business profile, style seed, first-gen vs edit instructions) | Changes every request |

This split enables AI SDK prompt caching — the stable portion hits cache on subsequent requests.

### Blueprint Mode

Blueprint uses four separate system prompts, one per pipeline step:

| Step | Prompt Function | File |
|------|----------------|------|
| Generate | `getBlueprintSystemPrompt()` | `src/lib/blueprint/prompts/blueprint-system-prompt.ts` |
| Components | `getComponentsSystemPrompt()` | `src/lib/blueprint/prompts/components-system-prompt.ts` |
| Assets | `getAssetsSystemPrompt()` | `src/lib/blueprint/prompts/assets-system-prompt.ts` |
| Pages | `getPageSystemPrompt()` | `src/lib/blueprint/prompts/page-system-prompt.ts` |

---

## Prompt Sections (Chat Mode)

### 1. Base Rules (`base-rules.ts`)

**Exports:** `BASE_RULES_SECTION`

The foundational rules every generation must follow. Includes:

- Rule 1: Single self-contained HTML file structure (`<!DOCTYPE html>`, Tailwind CDN, Google Fonts)
- Rule 2: Required CDN tags — injects `ALPINE_CDN_TAGS` (Alpine.js core + collapse + intersect plugins) and `ALPINE_CLOAK_CSS` (`[x-cloak] { display: none !important }`)
- Rule 3: Mobile-first responsive design requirements
- Rule 4: Semantic HTML with `data-block` attributes on all major sections
- Rule 5: Image handling — use `searchImages` tool, include `loading="lazy"`, `alt` text
- Rule 6: Icon handling — use `searchIcons` tool for SVG icons
- Rule 7: No external JS dependencies (except Alpine.js and Tailwind CDN)
- Rule 8: Accessibility requirements (ARIA labels, focus states, contrast)
- Rule 9: Performance (minimize inline styles, prefer Tailwind utilities)

### Identity & Creative Direction (inline in `system-prompt.ts`)

Two inline constants set the overall creative posture:

- **`IDENTITY_LINE`** — Establishes persona as "WebBuilder", expert web designer producing production-ready output
- **`CREATIVE_DIRECTION_SECTION`** — Anti-generic-AI manifesto:
  - Typography variety mandate (never default to the same fonts)
  - Color philosophy: real-world aesthetics over SaaS templates
  - Background atmosphere rules
  - Motion focus on high-impact moments only
  - Vary light/dark themes across generations

### 2. UI/UX Guidelines (`ui-ux-guidelines.ts`)

**Exports:** `UI_UX_GUIDELINES_SECTION` (full), `UI_UX_GUIDELINES_COMPACT_SECTION` (drops industry tones for blueprint page gen)

Design patterns and responsive behavior rules:

- **Industry tones** (21 categories) — per-industry emotional register, what to avoid, what to try instead. Healthcare, Finance, SaaS, Restaurant, Legal, Spa, Fitness, Creative, Education, Real Estate, Construction, etc.
- **Accessibility rules** — WCAG AA, 44px touch targets, focus-visible, animation limits, meaningful alt text
- **Layout principles** — asymmetric layouts, scale contrast, rhythm variation, responsive breakpoints (375/768/1024/1440px)
- **Interaction standards** — use `searchIcons` for SVGs (not emoji), intentional focus states, visible labels

### 3. Design Quality (`design-quality.ts`)

**Exports:** `DESIGN_QUALITY_SECTION` (full, first gen), `BLUEPRINT_DESIGN_QUALITY_SECTION` (condensed, drops color/typography since design system exists), `EDIT_DESIGN_REMINDER` (minimal preservation rules)

Aesthetic standards that push output beyond generic template quality:

- **Color system** — 5 named palette strategies (LIGHT, MUTED, BOLD, DARK, HIGH-CONTRAST) with HSL ranges. WCAG AA required. Ban on purple/blue gradients ("AI design tell #1"). No default Tailwind colors.
- **Typography** — Two-font requirement. Explicit ban list: Inter, DM Sans, Poppins, Montserrat as defaults. Size hierarchy and weight variation rules.
- **Visual polish** — Transitions, layered shadows, spacing rhythm (py-16 md:py-24 min), micro-details (border-radius token, icon sizing, badge/pill patterns)
- **Motion design** — Alpine.js x-intersect for entrances (stagger 100-150ms), scroll parallax-lite, button `active:scale-95`, `prefers-reduced-motion` always respected
- **Creative framework** — Aesthetic vocabulary (brutalist, editorial, retro-futuristic, etc.) with intensity rules: vague prompt → bold, brand guidelines → respectful, enterprise → conservative
- **Content rules** — Specificity mandate for every text element. No "Welcome to Our Bakery", no "Learn More", no Lorem ipsum.
- **Anti-patterns** — Explicit bans: hero+3-cards+CTA+footer structure, emoji icons, even color distribution, purple gradients
- **Layout techniques** — 7 CSS patterns with code: bento grid, diagonal dividers, overlapping depth, glassmorphism, horizontal scroll, sticky stacking, asymmetric splits

### 4. Tool Output Format (`tool-output-format.ts`)

**Exports:** `TOOL_OUTPUT_FORMAT_SECTION`

Instructions for how the AI should use its tools:

- **First generation workflow:** Use `writeFiles` to create complete HTML
- **Edit workflow:** Read the current file first (`readFile`), then use `editBlock` (preferred for targeted changes) or `editFiles` (for text-level search/replace)
- Tool descriptions and when to use each one
- Error handling: what to do when `editBlock` or `editFiles` fails
- File naming conventions
- Output format requirements (no markdown fences, no explanatory text wrapping the tool call)

### 5. Context Blocks (`context-blocks.ts`)

**Exports:** `buildFirstGenerationBlock()`, `buildCurrentWebsiteBlock()`, `buildEditModeBlock()`, `buildTemporalBlock()`, `LAYOUT_ARCHETYPES_SECTION`, `getWeightedStyleSeed()`, `getRandomStyleSeed()`

Dynamic context injected per-request:

- **Style seed injection** (first gen only) — Selects from 41 mood seeds (e.g., "vintage film warmth", "neon Tokyo night"), each with HSL hue range, palette strategy, and vibe description. `getWeightedStyleSeed(userPrompt)` maps 50+ business keywords to preferred strategies, then picks a compatible seed. Ensures visual variety across generations.
- **Layout archetypes** — 15 named patterns (bento-grid, split-screen, editorial-magazine, immersive-scroll, asymmetric-hero, card-mosaic, diagonal-sections, centered-minimal, horizontal-scroll-showcase, glassmorphism-layers, mega-footer-architecture, kinetic-typography-hero, overlapping-collage, dashboard-inspired, sticky-reveal-panels) with CSS implementation notes.
- **Current files manifest** — Generated by `src/lib/prompts/manifest/generate-manifest.ts`. Small files (<4KB) included in full. Large files get a structural manifest: design tokens from `:root`, font names, `data-block` elements with content summaries (headings, paragraph previews, element counts). Components shown as `<!-- @component:X -->` references.
- **First-gen block** — Injects the selected style seed + layout archetype instruction + 4-step workflow (define `:root` → use Alpine.js → call writeFiles → summary)
- **Edit-mode block** — Detects existing design tokens, legacy wb-utils presence (suggests Alpine.js for new elements), shared `_components/` files, multi-page status. Assembles guidance accordingly.
- **Temporal context** — Current date and timezone (from `temporal-context.ts`)
- **Business context** — If a `BusinessProfile` is attached, injects real business data with instructions to use it instead of placeholders

### 6. Interactivity (`interactivity.ts`)

**Exports:** `INTERACTIVITY_SECTION`, `ALPINE_CDN_TAGS`, `ALPINE_CLOAK_CSS`

Alpine.js pattern reference for the AI:

- **CDN tags:** Alpine.js core, collapse plugin, intersect plugin
- **Patterns included:** accordion (`x-data`, `x-show`, `@click`), carousel (with `x-data` state management), counter animation (with `x-intersect`), mobile menu toggle, scroll reveal (`x-intersect`), tabs
- Each pattern includes the complete Alpine.js directive syntax the AI should use
- Explicit instruction: "All interactivity is handled by Alpine.js — do NOT write inline `<script>` blocks"

### 7. Temporal Context (`temporal-context.ts`)

**Exports:** `buildTemporalContext()`, `resolvePreferredTimeZone()`

Provides current date and timezone so generated sites have correct copyright years and date-sensitive content.

- `resolvePreferredTimeZone(saved, browser)` — prefers saved timezone, falls back to browser, then `'America/New_York'`
- `buildTemporalContext(timezone)` — returns formatted string: `"Current date: Tuesday, February 18, 2026. Timezone: America/New_York."`

---

## Blueprint Prompts

### Blueprint Generation (`blueprint-system-prompt.ts`)

**Function:** `getBlueprintSystemPrompt(temporalContext?, businessContext?)`

Tells the AI to output a raw JSON object (no markdown fences) matching the Blueprint schema. Includes:

- The exact JSON structure with annotated fields
- Design system requirements (7 colors, 2 fonts, border radius, mood, surface treatment)
- Section type, layout hint, media type, interactive element, and motion intent enums
- Content strategy requirements (tone, audience, CTA, brand voice, value props, differentiators, key stats, brand story)
- Shared components spec (nav links, footer tagline)
- `needsResearch: true/false` flag for the AI to signal whether web research is needed
- Temporal context block (for correct year references)
- Business context block (if discovery data available)

### Components Generation (`components-system-prompt.ts`)

**Function:** `getComponentsSystemPrompt(blueprint)`

Generates shared `header.html` and `footer.html`:

- Full design system CSS custom properties reference
- Navigation spec (all pages + nav links from blueprint)
- `siteFacts` block if present
- Header requirements: sticky, brand text, desktop horizontal nav, mobile hamburger with `data-menu-toggle`/`data-mobile-menu` attributes, responsive, z-50
- Footer requirements: site name, tagline, nav links, business info, copyright year, design tokens
- Available tools: `searchIcons`, `searchImages`, `writeFiles`
- Must output via `writeFiles` with exactly `header.html` and `footer.html`
- No inline `<script>`, no `<style>` blocks, no `:root` redefinition

### Assets Generation (`assets-system-prompt.ts`)

**Function:** `getAssetsSystemPrompt(blueprint, componentHtml?)`

Generates shared `styles.css` and `scripts.js`:

- Full design system with all CSS custom property values
- Actual generated header/footer HTML (so styles match the components)
- Collected interactive elements and motion intents from all pages' sections
- `styles.css` requirements: `:root` variables, base styles, utility classes, animation keyframes, scroll reveal, component styles, header/footer styles
- `scripts.js` requirements: mobile menu toggle, scroll reveal (IntersectionObserver), smooth scroll, accordion/tabs/counter (conditional based on blueprint sections)
- Must output via `writeFiles` with exactly `styles.css` and `scripts.js`

### Page Generation (`page-system-prompt.ts`)

**Function:** `getPageSystemPrompt(blueprint, page, sharedStyles?)`

Generates individual page HTML:

- Design system reference
- Shared `<head>` tags (fonts, styles.css link, Alpine.js CDN, Tailwind config) — injected verbatim
- Page spec: filename, title, description, purpose, ordered sections with full metadata
- Content strategy (tone, audience, CTA, brand voice, value props)
- `siteFacts` block if available
- Sibling page context (what other pages exist)
- Header/footer as `<!-- @component:header -->` / `<!-- @component:footer -->` placeholders (multi-page) or full inline spec (single-page)
- `INTERACTIVITY_SECTION` — full Alpine.js pattern reference
- Section-by-section generation instructions with layout hints, media types, interactive elements, and motion intents

---

## Tuning Generation Quality

### Style Seed System

The primary variety mechanism. 41 mood seeds ensure each generation looks different:

Each seed has: `mood` (name), `hueRange` (HSL degrees), `strategy` (LIGHT/MUTED/BOLD/DARK/HIGH-CONTRAST), `vibe` (5-7 word feel).

**Chat mode:** `getWeightedStyleSeed(userPrompt)` maps business keywords (50+ entries like "restaurant", "tech", "wedding") to 2 preferred strategies, then picks a random compatible seed. Falls back to fully random if no keywords match.

**Blueprint mode:** `getRandomStyleSeed()` — purely random selection.

To add visual variety: add new seeds to the `STYLE_SEEDS` array. To bias toward certain aesthetics: modify the `KEYWORD_STRATEGY_MAP`.

### Design Quality Lever

The `design-quality.ts` section is the primary lever for output aesthetics. Three variants:

- **`DESIGN_QUALITY_SECTION`** — Full version for chat first-gen. All subsections (color, typography, polish, motion, anti-patterns, layout techniques).
- **`BLUEPRINT_DESIGN_QUALITY_SECTION`** — Drops color/typography (already defined in design system). Used for blueprint page/component generation.
- **`EDIT_DESIGN_REMINDER`** — 7 bullet preservation rules for edit mode. Keeps `:root`, tokens, spacing, color story.

### Section Type and Layout Enums

The blueprint schema defines extensive enums that guide visual variety:

- **22 section types** — from `hero` and `features` to `scrollytelling` and `calculator-tool`
- **14 layout hints** — `bento-grid`, `split-screen`, `card-mosaic`, `cinematic-fullscreen`, etc.
- **8 media types** — `hero-image`, `gradient-mesh`, `illustration`, etc.
- **11 interactive elements** — `accordion`, `carousel`, `before-after-slider`, `tilt-card`, etc.
- **10 motion intents** — `entrance-reveal`, `parallax-bg`, `kinetic-type`, etc.
- **7 surface treatments** — `glassmorphism`, `neubrutalist`, `claymorphism`, etc.

The AI selects from these enums during blueprint generation. The page generation prompt then interprets them as specific implementation instructions.

### Content Strategy

The `contentStrategy` field in the blueprint drives tone and copy:

- `tone` — e.g., "professional yet approachable"
- `brandVoice` — 2-3 word personality (e.g., "bold innovator")
- `valuePropositions` — 3-5 concrete selling points
- `differentiators` — what makes this business unique
- `keyStats` — impressive numbers to display
- `brandStory` — 2-3 sentence narrative

These are passed to every page generation prompt, ensuring consistent voice across multi-page sites.

### Business Context Integration

When a `BusinessProfile` exists (from discovery or research), `buildBusinessContextBlock()` injects real data:

```
<business_context>
Business Name: Joe's Bakery
Category: bakery
Address: 123 Main St, Springfield, IL
Phone: (555) 123-4567
Hours: Mon: 6am-6pm, Tue: 6am-6pm, ...
Services: Custom Cakes, Wedding Cakes, Pastries, Bread

USE THIS REAL DATA. Do not invent placeholder names, addresses, phone numbers, or services.
</business_context>
```

This is the strongest instruction in the system — the AI is explicitly told to use real data over placeholders.

### Provider/Model Adaptations

The prompt composition in `getSystemPromptParts()` accepts `provider` and `model` parameters. Currently used for:

- Adjusting tool format instructions for models that handle tool schemas differently
- Future: model-specific prompt optimizations based on observed output quality

---

## File Reference

| File | Exports | Purpose |
|------|---------|---------|
| `src/lib/prompts/system-prompt.ts` | `getSystemPromptParts()` | Main chat prompt assembler |
| `src/lib/prompts/sections/base-rules.ts` | `BASE_RULES_SECTION` | Core HTML generation rules |
| `src/lib/prompts/sections/ui-ux-guidelines.ts` | `UI_UX_GUIDELINES_SECTION` | Design patterns |
| `src/lib/prompts/sections/design-quality.ts` | `DESIGN_QUALITY_SECTION` | Aesthetic standards |
| `src/lib/prompts/sections/tool-output-format.ts` | `TOOL_OUTPUT_FORMAT_SECTION` | Tool usage instructions |
| `src/lib/prompts/sections/context-blocks.ts` | `buildContextBlocks()` | Dynamic per-request context |
| `src/lib/prompts/sections/interactivity.ts` | `INTERACTIVITY_SECTION`, `ALPINE_CDN_TAGS`, `ALPINE_CLOAK_CSS` | Alpine.js patterns |
| `src/lib/prompts/temporal-context.ts` | `buildTemporalContext()`, `resolvePreferredTimeZone()` | Date/timezone |
| `src/lib/discovery/build-business-context.ts` | `buildBusinessContextBlock()` | Business data injection |
| `src/lib/prompts/sections/js-utilities.ts` | `JS_UTILITIES_MARKER`, `JS_UTILITIES_SNIPPET` | Legacy inline JS (pre-Alpine.js). Detected in edit mode for backward compat. |
| `src/lib/prompts/manifest/generate-manifest.ts` | `generateManifest()`, `extractDesignTokens()`, `extractBlocks()` | Structural file summaries for prompt context |
| `src/lib/chat/resolve-chat-execution.ts` | `resolveChatExecution()` | Wires prompt + model + key |
| `src/lib/blueprint/prompts/blueprint-system-prompt.ts` | `getBlueprintSystemPrompt()` | Blueprint JSON generation |
| `src/lib/blueprint/prompts/components-system-prompt.ts` | `getComponentsSystemPrompt()` | Header/footer generation |
| `src/lib/blueprint/prompts/assets-system-prompt.ts` | `getAssetsSystemPrompt()` | Shared CSS/JS generation |
| `src/lib/blueprint/prompts/page-system-prompt.ts` | `getPageSystemPrompt()` | Per-page HTML generation |

---

*Last updated: February 18, 2026*
