# Prompt Quality Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix generic/basic AI-generated website output by improving system prompts — layout variety, anti-slop for all providers, explicit anti-patterns, reduced procedural overhead.

**Architecture:** Prompt-only changes across 3 files in `src/lib/prompts/`. No API, UI, tool, hook, or functional changes. The layout archetype system parallels the existing color seed system in `context-blocks.ts`.

**Tech Stack:** TypeScript, string template literals (system prompt sections)

**Note:** No test framework is configured. Verification is manual: `npm run build` to catch type/syntax errors, then visual testing via the app.

---

### Task 1: Add Layout Archetypes to context-blocks.ts

**Files:**
- Modify: `src/lib/prompts/sections/context-blocks.ts`

**Step 1: Add the LayoutArchetype type and array after the STYLE_SEEDS array (after line 114)**

Add this after the closing `];` of `STYLE_SEEDS`:

```typescript
interface LayoutArchetype {
  name: string;
  description: string;
  cssHint: string;
}

const LAYOUT_ARCHETYPES: LayoutArchetype[] = [
  {
    name: 'bento-grid',
    description: 'Asymmetric grid tiles with varying column/row spans — like a Japanese lunchbox. Mix large feature tiles (span 2-3 cols) with small detail tiles. NOT a uniform card grid.',
    cssHint: 'display:grid; grid-template-columns:repeat(4,1fr); use grid-column:span 2, grid-row:span 2 for variety. Gap 1rem-1.5rem. Round corners on tiles.',
  },
  {
    name: 'split-screen',
    description: 'Side-by-side contrasting panels (50/50 or 60/40). Hero splits image and text. Sections alternate which side has content vs media. Strong vertical divide.',
    cssHint: 'display:grid; grid-template-columns:1fr 1fr (or 3fr 2fr). Full-height sections. On mobile: stack vertically. Use contrasting bg colors per side.',
  },
  {
    name: 'editorial-magazine',
    description: 'Large hero image with overlaid text, multi-column body text, pull quotes that break columns, varied image sizes. Feels like a magazine spread.',
    cssHint: 'column-count:2 for text sections; column-span:all for pull quotes. Mix full-bleed images with contained text. Vary font sizes dramatically.',
  },
  {
    name: 'immersive-scroll',
    description: 'Full-viewport height sections (min-h-screen) that create a narrative scroll journey. Each section is a complete visual moment. Scroll-triggered reveals.',
    cssHint: 'Each section min-h-screen with flex centering. Snap optional: scroll-snap-type:y mandatory. Intersection Observer for entrance animations.',
  },
  {
    name: 'asymmetric-hero',
    description: 'Hero content pushed off-center (not centered). Overlapping elements create depth — images that break container bounds, text overlaid on images with offset.',
    cssHint: 'Hero grid: grid-template-columns:1fr 1.5fr. Overlap with negative margins (-mt-20, -ml-12) and z-index. Position:relative on containers.',
  },
  {
    name: 'card-mosaic',
    description: 'Mixed card sizes in a masonry-like flow. Some cards are tall, some wide, some small. Content density varies per card. NOT uniform heights.',
    cssHint: 'CSS columns (column-count:3, break-inside:avoid) OR grid with grid-auto-rows:minmax(200px,auto) and varying spans. Cards should feel organic, not rigid.',
  },
  {
    name: 'diagonal-sections',
    description: 'Angled dividers between sections using clip-path. Creates dynamic visual flow. Alternating angles. Background colors shift across the diagonals.',
    cssHint: 'clip-path:polygon(0 0,100% 0,100% 85%,0 100%) on sections. Alternate angle direction. Use negative margin-top to overlap clipped edges.',
  },
  {
    name: 'centered-minimal',
    description: 'Dramatic whitespace, single-column focus. Content is narrow (max-w-2xl). Large type contrasts with small body text. The emptiness IS the design.',
    cssHint: 'max-w-2xl mx-auto. Huge vertical padding (py-32+). Very large headings (text-6xl+) with normal body text. Minimal elements per section.',
  },
  {
    name: 'horizontal-scroll-showcase',
    description: 'Key sections scroll horizontally within the vertical page. Portfolio items, features, or testimonials in a sideways-scrolling strip with snap points.',
    cssHint: 'Container: overflow-x:auto; scroll-snap-type:x mandatory; display:flex; gap. Children: flex:0 0 80vw; scroll-snap-align:start. Hide scrollbar with scrollbar-width:none.',
  },
  {
    name: 'glassmorphism-layers',
    description: 'Frosted glass cards floating over rich gradient or image backgrounds. Translucent panels with blur. Depth through layered transparency. Feels premium and modern.',
    cssHint: 'backdrop-filter:blur(16px); background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2). Rich gradient or image as page background.',
  },
  {
    name: 'mega-footer-architecture',
    description: 'Minimal, spacious above-the-fold content. The footer is a dense, multi-column information hub — links, newsletter, social, sitemap. Footer IS a design feature.',
    cssHint: 'Footer: grid with 4-5 columns, generous padding (py-20+). Dark bg contrasting with page. Above-fold: very minimal, breathing room, strong single CTA.',
  },
  {
    name: 'kinetic-typography-hero',
    description: 'Oversized animated text as the primary visual element. Minimal imagery — the words ARE the design. Text scales, rotates, or reveals on scroll/load.',
    cssHint: 'Hero text: text-8xl md:text-9xl, font-weight:900. CSS @keyframes for text animation (slide-in, reveal, scale). mix-blend-mode for text over backgrounds.',
  },
  {
    name: 'overlapping-collage',
    description: 'Scattered, rotated elements in art-directed chaos. Images and cards overlap with intentional disorder. Feels handmade, editorial, creative.',
    cssHint: 'position:absolute/relative with manual top/left offsets. transform:rotate(-3deg to 5deg). z-index layering. Negative margins for overlap. Box shadows for depth.',
  },
  {
    name: 'dashboard-inspired',
    description: 'Data visualization aesthetic for non-dashboard sites. Stat counters, progress rings, metric cards, mini charts. Information feels quantified and precise.',
    cssHint: 'Grid of stat cards with large numbers (text-5xl font-bold). SVG circles for progress rings. CSS counters or animated number reveals. Monospace font for data.',
  },
  {
    name: 'sticky-reveal-panels',
    description: 'Sections that pin in place and layer over each other as you scroll. Each panel sticks, then the next slides over it. Creates a card-stacking reveal effect.',
    cssHint: 'Each section: position:sticky; top:0; min-h-screen. Increment z-index per section. Add box-shadow on top edge for depth. Background must be opaque.',
  },
];

function getRandomArchetype(): LayoutArchetype {
  return LAYOUT_ARCHETYPES[Math.floor(Math.random() * LAYOUT_ARCHETYPES.length)];
}
```

**Step 2: Update `buildFirstGenerationBlock` to include layout archetype**

Replace the existing `buildFirstGenerationBlock` function (lines 195-218) with:

```typescript
export function buildFirstGenerationBlock(isFirstGeneration: boolean, userPrompt?: string): string {
  if (!isFirstGeneration) return '';

  const seed = userPrompt ? getWeightedStyleSeed(userPrompt) : getRandomStyleSeed();
  const layout = getRandomArchetype();

  return `\n<first_generation>
This is a NEW website. Your creative direction for this project:

DESIGN SEED:
  Mood: "${seed.mood}" | Hue zone: ${seed.hueRange}° | Strategy: ${seed.strategy}
  Visual feel: ${seed.vibe}

LAYOUT ARCHETYPE: "${layout.name}"
  ${layout.description}
  CSS approach: ${layout.cssHint}

Fuse the design seed's aesthetic with the layout archetype's structure. A "${seed.mood}" site using "${layout.name}" layout. Adapt the archetype to suit the content — not every section needs to follow it, but the overall page structure should reflect it.

Steps:
1. Define your :root CSS custom properties (7 HSL colors from the seed's strategy ranges + font families + shadows + radius) and Tailwind config
2. Call writeFiles with the complete HTML — apply the layout archetype's structural pattern
3. After tool calls, add a 1-sentence summary

Make a strong first impression — the design should feel polished, intentional, and unlike anything a template generator would produce.
</first_generation>`;
}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: No errors. Only string content changed.

**Step 4: Commit**

```bash
git add src/lib/prompts/sections/context-blocks.ts
git commit -m "feat: add 15 layout archetypes for structural variety in generations"
```

---

### Task 2: Add Anti-Patterns and Layout Techniques to design-quality.ts

**Files:**
- Modify: `src/lib/prompts/sections/design-quality.ts`

**Step 1: Add anti-patterns block inside DESIGN_QUALITY_SECTION**

Insert after the closing `</content_rules>` tag (before the final backtick-semicolon at line 149), add:

```typescript
<anti_patterns>
NEVER do these — they are the hallmarks of generic AI-generated sites:

Structure:
- NEVER: hero section + 3 equal-width cards + CTA banner + footer. This is THE most common AI layout. Break it.
- NEVER: all sections the same height or vertical padding
- NEVER: everything centered — vary alignment across sections (left-aligned hero, right-aligned stats, centered CTA)
- NEVER: predictable section ordering — surprise the user with unexpected content flow

Typography:
- NEVER default to: Inter, Roboto, Open Sans, Poppins, DM Sans, Montserrat, Lato, Source Sans Pro
- NEVER use the same font weight throughout — create contrast with weight variation
- NEVER make all headings the same size — use dramatic scale differences

Color:
- NEVER: purple/indigo/blue gradient as primary accent (the #1 AI design tell)
- NEVER: evenly-distributed color palette — one dominant color with sharp accents
- NEVER: gray-100 backgrounds with indigo-600 buttons (Tailwind defaults)

Elements:
- NEVER: emoji as icons — always use the searchIcons tool for real SVGs
- NEVER: placeholder images when searchImages is available
- NEVER: "Lorem ipsum" or "Learn More" as button text — be specific
</anti_patterns>
```

**Step 2: Add layout techniques block**

Insert after the new `</anti_patterns>` block:

```typescript
<layout_techniques>
Use these CSS patterns to create visual interest. Mix and match across sections:

Bento grid:
  display:grid; grid-template-columns:repeat(4,1fr); gap:1.5rem;
  Feature tiles: grid-column:span 2; grid-row:span 2;

Diagonal dividers:
  clip-path:polygon(0 0, 100% 0, 100% 85%, 0 100%);
  Next section: negative margin-top to overlap the clipped edge.

Overlapping depth:
  position:relative; z-index layers; negative margins (-mt-16, -ml-8);
  Child elements breaking parent bounds for dimensional feel.

Glassmorphism:
  backdrop-filter:blur(16px); background:rgba(255,255,255,0.08);
  border:1px solid rgba(255,255,255,0.15); Rich bg behind.

Horizontal scroll:
  overflow-x:auto; scroll-snap-type:x mandatory; display:flex;
  Children: flex:0 0 clamp(280px,80vw,600px); scroll-snap-align:start;

Sticky stacking:
  Each section: position:sticky; top:0; z-index incrementing;
  Opaque backgrounds. Box-shadow on leading edge for depth.

Asymmetric splits:
  grid-template-columns: 2fr 3fr (or 3fr 2fr). Alternate per section.
  Not everything needs to be 50/50 or full-width.
</layout_techniques>
```

**Step 3: Strengthen creative_framework**

Replace the `<creative_framework>` section (lines 121-137) in `DESIGN_QUALITY_SECTION` with:

```typescript
<creative_framework>
Each generation should feel like a DIFFERENT designer built it. Vary your aesthetic instincts.

Aesthetic vocabulary — draw from these for inspiration:
brutalist, neobrutalist, organic/biomorphic, editorial, retro-futuristic, maximalist, art-deco, Swiss/international, Memphis, mid-century modern, cyberpunk, Japanese minimalist, Scandinavian, industrial, whimsical/playful

Match intensity to the request:
IF vague ("make me a landing page", "build a portfolio"):
-> BE BOLD: Strong layout archetype, distinctive palette, unexpected typography. Make creative decisions confidently.

IF brand guidelines or specific design direction provided:
-> BE RESPECTFUL: Work within constraints. Polish through execution, not rebellion.

IF enterprise/professional tools (dashboards, admin panels, SaaS):
-> BE CONSERVATIVE: Usability first. Creativity through craft and micro-details, not wild layout choices.

IF personal/creative projects (portfolios, art sites, event pages):
-> BE EXPERIMENTAL: Push the layout archetype further. Unconventional typography. Take calculated risks.

The layout archetype in your creative direction is your structural foundation — build on it, don't ignore it for a generic grid.
</creative_framework>
```

**Step 4: Verify build**

Run: `npm run build`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/lib/prompts/sections/design-quality.ts
git commit -m "feat: add anti-patterns, layout techniques, and stronger creative framework"
```

---

### Task 3: Make Anti-Slop Universal in system-prompt.ts

**Files:**
- Modify: `src/lib/prompts/system-prompt.ts`

**Step 1: Replace the Anthropic-only aesthetics section with a universal one**

Remove the `ANTHROPIC_AESTHETICS_SECTION` constant (lines 24-35) and the `isAnthropicModel`/`aestheticsBlock` logic (lines 52-54, and the `${aestheticsBlock}` interpolation on line 59).

Replace with a new universal constant:

```typescript
const CREATIVE_DIRECTION_SECTION = `<creative_direction>
Fight generic "AI-generated" aesthetics actively. Every design choice should feel intentional and distinctive.

Typography: Pick distinctive, lesser-known Google Fonts. NEVER default to Inter, DM Sans, Roboto, Open Sans, Poppins, Montserrat, Space Grotesk, or system fonts. The Google Fonts catalog has 1700+ options — explore it.
Color: Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Draw from real-world aesthetics (vintage travel posters, Japanese print design, mid-century modern, brutalism) not SaaS templates.
Backgrounds: Create atmosphere — layer CSS gradients, use geometric SVG patterns, add contextual texture. NEVER default to plain white/gray backgrounds.
Layout: Follow your assigned layout archetype. Break grid monotony with the techniques in layout_techniques. A predictable 3-column card grid is the hallmark of AI-generated design.
Motion: Focus on high-impact moments — one orchestrated page load with staggered reveals creates more delight than scattered micro-interactions.

Vary between light and dark themes, different font pairings, different aesthetic moods across generations. The best designs feel inevitable in hindsight but surprising at first glance.
</creative_direction>`;
```

**Step 2: Update getSystemPromptParts to use it unconditionally**

Replace the function body. Remove `isAnthropicModel` and `aestheticsBlock` variables. Change the stable string to always include `CREATIVE_DIRECTION_SECTION`:

```typescript
export function getSystemPromptParts(
  currentFiles?: ProjectFiles,
  temporalContext?: TemporalContext,
  userPrompt?: string,
  provider?: string,
  modelId?: string,
): SystemPromptParts {
  const isFirstGeneration = !currentFiles?.['index.html'];
  const toolSection = TOOL_OUTPUT_FORMAT_SECTION;

  const stable = `${IDENTITY_LINE}

${getBaseRulesSection(isFirstGeneration)}
${UI_UX_GUIDELINES_SECTION}
${CREATIVE_DIRECTION_SECTION}
${toolSection}`;

  const dynamic = `${buildTemporalBlock(temporalContext)}${buildFirstGenerationBlock(isFirstGeneration, userPrompt)}${buildCurrentWebsiteBlock(currentFiles)}${buildEditModeBlock(currentFiles)}

${CLOSING_LINE}`;

  return { stable, dynamic };
}
```

Note: `provider` and `modelId` params are still accepted for API compatibility but no longer used internally. Do NOT remove them from the signature — callers pass them.

**Step 3: Verify build**

Run: `npm run build`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/lib/prompts/system-prompt.ts
git commit -m "feat: make creative direction universal for all AI providers"
```

---

### Task 4: Also update BLUEPRINT_DESIGN_QUALITY_SECTION in design-quality.ts

**Files:**
- Modify: `src/lib/prompts/sections/design-quality.ts`

The `BLUEPRINT_DESIGN_QUALITY_SECTION` (line 154+) is a condensed version used for blueprint page generation. It has its own `<creative_framework>` that also needs the strengthened version, and should get the anti-patterns too (condensed).

**Step 1: Update the creative_framework in BLUEPRINT_DESIGN_QUALITY_SECTION**

Replace the `<creative_framework>` block (lines 213-229) inside `BLUEPRINT_DESIGN_QUALITY_SECTION` with the same strengthened version from Task 2 Step 3.

**Step 2: Add condensed anti-patterns to BLUEPRINT_DESIGN_QUALITY_SECTION**

Insert before `</creative_framework>` closing or after it:

```typescript
<anti_patterns>
NEVER: hero + 3 equal cards + CTA + footer layout. NEVER: Inter/Roboto/Poppins fonts. NEVER: purple/indigo gradients. NEVER: emoji as icons. NEVER: all sections same height. NEVER: everything centered. Each page should feel crafted, not templated.
</anti_patterns>
```

**Step 3: Verify build**

Run: `npm run build`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/lib/prompts/sections/design-quality.ts
git commit -m "feat: add anti-patterns and stronger creative framework to blueprint prompts"
```

---

### Task 5: Final Verification

**Step 1: Full build check**

Run: `npm run build`
Expected: Clean build, no errors.

**Step 2: Run dev server and test generation**

Run: `npm run dev`
Test: Open localhost:3000, generate a website with a simple prompt like "build a bakery website". Verify:
- Design seed AND layout archetype appear in the AI's response context
- The generated HTML structure is NOT the generic hero+cards+CTA pattern
- Fonts are not Inter/Roboto/Poppins
- Colors are not purple/indigo

**Step 3: Test with different models**

Try generation with at least 2 different providers to confirm anti-slop applies universally.

**Step 4: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "fix: adjustments from manual testing"
```
