# Blueprint Quality Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve AI-generated website quality through enriched blueprint schema, 2026 design trends, missing Alpine.js patterns, bug fixes, and chat mode parity.

**Architecture:** Extend Zod schemas with new quality-driving fields, rewrite prompt sections with 2026 trends and anti-AI-slop guidance, add 8 missing Alpine.js patterns, fix cross-cutting bugs in shared styles and prompts, and ensure chat mode benefits from the same quality framework as blueprint mode.

**Tech Stack:** TypeScript, Zod, Next.js, Alpine.js, Tailwind CSS v4

**Design Doc:** `docs/plans/2026-02-18-blueprint-quality-enhancement-design.md`

---

### Task 1: Schema Extensions

**Files:**
- Modify: `src/lib/blueprint/types.ts`

**Step 1: Add new enums**

Add after `surfaceTreatmentEnum` (line 39):

```typescript
export const visualStyleEnum = z.enum([
  'editorial-magazine', 'tech-minimal', 'luxury-refined', 'bold-expressive',
  'organic-warm', 'brutalist-raw', 'retro-nostalgic', 'corporate-clean'
]);

export const visualWeightEnum = z.enum([
  'hero-heavy', 'content-dense', 'balanced', 'minimal'
]);

export const contentDepthEnum = z.enum([
  'minimal', 'standard', 'rich'
]);
```

**Step 2: Add fields to blueprintPageSectionSchema**

Add after `motionIntent` field (line 51):

```typescript
imageDirection: z.string().optional().default('').describe('Specific subject/style for imagery, e.g. "close-up hands working with clay, warm tones"'),
contentDepth: contentDepthEnum.catch('standard').optional().default('standard').describe('How much copy/data this section should contain'),
```

**Step 3: Add fields to blueprintPageSchema**

Add after `purpose` field (line 62), before `sections`:

```typescript
contentFocus: z.string().optional().default('').describe('Unique messaging this page owns, e.g. "trust through case studies"'),
visualWeight: visualWeightEnum.catch('balanced').optional().default('balanced').describe('Visual spectacle vs information density'),
heroApproach: z.string().optional().default('').describe('Hero section approach, e.g. "full-bleed image with overlay text"'),
```

**Step 4: Add fields to blueprintDesignSystemSchema**

Add after `surfaceTreatment` field (line 78):

```typescript
visualStyle: visualStyleEnum.catch('bold-expressive').optional().default('bold-expressive').describe('Site-level visual archetype driving layout and composition decisions'),
imageStyle: z.string().optional().default('').describe('Image direction, e.g. "warm documentary photography with natural light"'),
fontWeights: z.object({
  heading: z.array(z.number()).optional().default([400, 600, 700]),
  body: z.array(z.number()).optional().default([400, 500, 600]),
}).optional().default({ heading: [400, 600, 700], body: [400, 500, 600] }).describe('Font weights to load'),
```

**Step 5: Add fields to blueprintContentStrategySchema**

Add after `brandStory` field (line 94):

```typescript
contentDistribution: z.record(z.string(), z.array(z.string())).optional().default({}).describe('Maps page filenames to assigned value propositions — prevents repetitive content across pages'),
seoKeywords: z.record(z.string(), z.array(z.string())).optional().default({}).describe('Per-page target keywords for SEO'),
```

**Step 6: Remove scroll-scrub from interactiveElementEnum**

Replace `scroll-scrub` with `magnetic-button` in the enum (line 27):

```typescript
export const interactiveElementEnum = z.enum([
  'accordion', 'tabs', 'carousel', 'counter-animation', 'toggle-switch',
  'hover-reveal', 'progressive-disclosure', 'before-after-slider',
  'tilt-card', 'magnetic-button', 'none'
]);
```

**Step 7: Verify build**

Run: `npm run build`
Expected: Clean build, no type errors.

**Step 8: Commit**

```bash
git add src/lib/blueprint/types.ts
git commit -m "feat: extend blueprint schema with quality-driving fields

Add visualStyle, imageStyle, fontWeights to design system.
Add contentFocus, visualWeight, heroApproach to pages.
Add imageDirection, contentDepth to page sections.
Add contentDistribution, seoKeywords to content strategy.
Replace scroll-scrub with magnetic-button in interactive enum."
```

---

### Task 2: Shared Styles Fixes

**Files:**
- Modify: `src/lib/blueprint/generate-shared-styles.ts`

**Step 1: Update generateSharedStyles function**

Replace the entire function body. Key changes:
- Fix `--transition` from `all` to specific properties
- Add `--transition-fast` and `--transition-slow`
- Add `scroll-behavior: smooth` to html
- Add `-webkit-font-smoothing: antialiased` and `text-rendering: optimizeLegibility` to body
- Use dynamic font weights from `fontWeights` field (with fallback for old blueprints)
- `borderRadius` is already in the Tailwind config (line 87-89 confirms this — the codebase researcher was wrong about this being missing)

```typescript
export function generateSharedStyles(designSystem: BlueprintDesignSystem): SharedStyles {
  const {
    primaryColor,
    secondaryColor,
    accentColor,
    backgroundColor,
    surfaceColor,
    textColor,
    textMutedColor,
    headingFont,
    bodyFont,
    borderRadius,
  } = designSystem;

  // Use dynamic font weights if available, fallback for old blueprints
  const headingWeights = designSystem.fontWeights?.heading ?? [400, 600, 700];
  const bodyWeights = designSystem.fontWeights?.body ?? [400, 500, 600];

  // Merge and dedupe weights per font
  const fontsParam = [headingFont, bodyFont]
    .filter((f, i, arr) => arr.indexOf(f) === i) // dedupe if same font
    .map((f) => {
      const weights = f === headingFont
        ? [...new Set([...headingWeights, ...(f === bodyFont ? bodyWeights : [])])]
        : bodyWeights;
      return `family=${f.replace(/ /g, '+')}:wght@${weights.sort((a, b) => a - b).join(';')}`;
    })
    .join('&');

  const stylesCss = `html {
  scroll-behavior: smooth;
}

:root {
  --color-primary: ${primaryColor};
  --color-secondary: ${secondaryColor};
  --color-accent: ${accentColor};
  --color-bg: ${backgroundColor};
  --color-surface: ${surfaceColor};
  --color-text: ${textColor};
  --color-text-muted: ${textMutedColor};
  --font-heading: '${headingFont}', sans-serif;
  --font-body: '${bodyFont}', sans-serif;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1);
  --radius: ${borderRadius};
  --transition: transform 0.2s ease-in-out, opacity 0.2s ease-in-out;
  --transition-fast: transform 0.15s ease-in-out, opacity 0.15s ease-in-out;
  --transition-slow: transform 0.4s ease-out, opacity 0.4s ease-out;
}

body {
  font-family: var(--font-body);
  color: var(--color-text);
  background-color: var(--color-bg);
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading);
  text-wrap: balance;
}

p {
  text-wrap: pretty;
}

${ALPINE_CLOAK_CSS}`;

  // headTags stays the same structure but uses dynamic weights
  const headTags = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${fontsParam}&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
${ALPINE_CDN_TAGS}
<script src="https://cdn.tailwindcss.com"></script>
<script>
tailwind.config = {
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        accent: 'var(--color-accent)',
      },
      fontFamily: {
        heading: 'var(--font-heading)',
        body: 'var(--font-body)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
      },
    },
  },
};
</script>`;

  return { stylesCss, headTags };
}
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add src/lib/blueprint/generate-shared-styles.ts
git commit -m "fix: shared styles — transition-all, font smoothing, scroll-behavior, dynamic weights

- Replace --transition: all with specific transform+opacity properties
- Add --transition-fast and --transition-slow variants
- Add scroll-behavior: smooth on html
- Add font-smoothing and text-rendering for crisp type
- Add text-wrap: balance for headings, text-wrap: pretty for paragraphs
- Use dynamic fontWeights from schema instead of hardcoded 400/500/600/700"
```

---

### Task 3: Alpine.js Interactivity Patterns

**Files:**
- Modify: `src/lib/prompts/sections/interactivity.ts`

**Step 1: Fix scroll-reveal pattern**

In the existing `scroll-reveal` pattern, replace `transition-all` with `transition-[transform,opacity]`:
- Line 154: change `class="transition-all duration-700 ease-out"` to `class="transition-[transform,opacity] duration-700 ease-out"`
- Lines 161-162, 163-164, 165-166: same change in staggered cards

**Step 2: Add ARIA attributes to existing patterns**

- **accordion** (line 31): Already has `:aria-expanded` — good.
- **tabs** (line 177-191): Add `role="tablist"` to the tab container div, `role="tab"` and `:aria-selected="tab === 'tab1'"` to each tab button, `role="tabpanel"` to each content div.
- **carousel**: Add `aria-label="Slideshow"` to container, `aria-label="Previous slide"` / `aria-label="Next slide"` to arrow buttons.

**Step 3: Add `prefers-reduced-motion` wrapper note**

Add at the very end of the `<interactivity>` section, before the closing tag:

```
ACCESSIBILITY: ALL scroll-triggered animations and transitions MUST be wrapped in a prefers-reduced-motion media query. Add this CSS to every page:
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Step 4: Add 8 new patterns**

Add these patterns after the existing `tabs` pattern and before the smooth scrolling note:

```
<pattern name="pricing-toggle">
Annual/monthly pricing toggle:

<div x-data="{ annual: true }">
  <div class="flex items-center justify-center gap-4 mb-10">
    <span :class="!annual ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'" class="text-sm font-medium transition-colors">Monthly</span>
    <button @click="annual = !annual" class="relative w-14 h-7 rounded-full bg-[var(--color-primary)] transition-colors" role="switch" :aria-checked="annual.toString()">
      <span class="absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform" :class="annual && 'translate-x-7'"></span>
    </button>
    <span :class="annual ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'" class="text-sm font-medium transition-colors">Annual <span class="text-[var(--color-accent)] font-semibold">Save 20%</span></span>
  </div>
  <!-- Price display: swap values based on toggle -->
  <div class="text-5xl font-bold font-heading">
    $<span x-text="annual ? '79' : '99'">79</span><span class="text-lg text-[var(--color-text-muted)]">/mo</span>
  </div>
</div>
</pattern>

<pattern name="hover-reveal">
Card with content revealed on hover (touch-friendly via click fallback):

<div x-data="{ show: false }" @mouseenter="show = true" @mouseleave="show = false" @click="show = !show"
  class="relative overflow-hidden rounded-[var(--radius)] cursor-pointer group">
  <img src="..." alt="..." class="w-full h-80 object-cover transition-transform duration-500 group-hover:scale-105">
  <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-end p-6"
    :class="show ? 'opacity-100' : 'opacity-0 md:opacity-0'" class="transition-opacity duration-300 opacity-100 md:opacity-0">
    <div :class="show ? 'translate-y-0' : 'translate-y-4 md:translate-y-4'" class="transition-transform duration-300 translate-y-0 md:translate-y-4">
      <h3 class="text-white text-xl font-heading font-bold">Team Member Name</h3>
      <p class="text-white/80 text-sm mt-1">Role & bio text here</p>
    </div>
  </div>
</div>
</pattern>

<pattern name="modal-lightbox">
Image lightbox modal with backdrop blur and keyboard close:

<div x-data="{ open: false, src: '', alt: '' }">
  <!-- Trigger (repeat per image) -->
  <img src="thumb.jpg" alt="Gallery image" class="cursor-pointer hover:opacity-90 transition-opacity"
    @click="src = 'full.jpg'; alt = 'Gallery image'; open = true; document.body.classList.add('overflow-hidden')">

  <!-- Modal -->
  <template x-teleport="body">
    <div x-show="open" x-transition:enter="transition ease-out duration-300" x-transition:enter-start="opacity-0"
      x-transition:enter-end="opacity-100" x-transition:leave="transition ease-in duration-200"
      x-transition:leave-start="opacity-100" x-transition:leave-end="opacity-0"
      class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      @click.self="open = false; document.body.classList.remove('overflow-hidden')"
      @keydown.escape.window="open = false; document.body.classList.remove('overflow-hidden')"
      role="dialog" aria-modal="true" x-cloak>
      <img :src="src" :alt="alt" class="max-w-full max-h-[90vh] rounded-lg shadow-2xl">
      <button @click="open = false; document.body.classList.remove('overflow-hidden')"
        class="absolute top-4 right-4 text-white/80 hover:text-white" aria-label="Close lightbox">
        <svg class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
  </template>
</div>
</pattern>

<pattern name="sticky-header-shrink">
Header that shrinks on scroll with background change:

<header x-data="{ scrolled: false }" @scroll.window.passive="scrolled = window.scrollY > 50"
  :class="scrolled ? 'py-2 shadow-md bg-[var(--color-bg)]/95 backdrop-blur-sm' : 'py-5 bg-transparent'"
  class="fixed top-0 left-0 right-0 z-50 transition-all duration-300" data-block="main-nav">
  <div class="max-w-7xl mx-auto px-6 flex items-center justify-between">
    <a href="#" class="font-heading font-bold transition-all duration-300" :class="scrolled ? 'text-lg' : 'text-xl'">Brand</a>
    <!-- nav links -->
  </div>
</header>
</pattern>

<pattern name="tilt-card">
3D tilt card that follows mouse position:

<div x-data="{
  rx: 0, ry: 0,
  tilt(e) {
    const r = $el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    this.rx = y * -15;
    this.ry = x * 15;
  },
  reset() { this.rx = 0; this.ry = 0; }
}" @mouseenter="tilt($event)" @mousemove="tilt($event)" @mouseleave="reset()"
  :style="`transform: perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg)`"
  class="transition-transform duration-150 ease-out rounded-[var(--radius)] bg-[var(--color-surface)] p-8 shadow-lg">
  Card content — works great for portfolio items, product cards, or feature highlights.
</div>
</pattern>

<pattern name="before-after-slider">
Draggable before/after image comparison:

<div x-data="{
  pos: 50,
  dragging: false,
  updatePos(e) {
    const r = $el.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    this.pos = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
  }
}" @mousedown="dragging = true" @mousemove="dragging && updatePos($event)"
  @mouseup="dragging = false" @mouseleave="dragging = false"
  @touchstart.prevent="dragging = true" @touchmove="updatePos($event)" @touchend="dragging = false"
  class="relative overflow-hidden rounded-[var(--radius)] cursor-ew-resize select-none" style="aspect-ratio:16/9">
  <!-- After image (full width) -->
  <img src="after.jpg" alt="After" class="absolute inset-0 w-full h-full object-cover">
  <!-- Before image (clipped) -->
  <div class="absolute inset-0" :style="`clip-path: inset(0 ${100 - pos}% 0 0)`">
    <img src="before.jpg" alt="Before" class="w-full h-full object-cover">
  </div>
  <!-- Slider handle -->
  <div class="absolute top-0 bottom-0 w-1 bg-white shadow-lg" :style="`left: ${pos}%`">
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center">
      <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 12H16M8 12L5 9M8 12L5 15M16 12L19 9M16 12L19 15"/></svg>
    </div>
  </div>
</div>
</pattern>

<pattern name="magnetic-button">
Button that subtly follows the cursor on hover (premium CTA feel):

<button x-data="{
  dx: 0, dy: 0,
  pull(e) {
    const r = $el.getBoundingClientRect();
    this.dx = (e.clientX - r.left - r.width/2) * 0.3;
    this.dy = (e.clientY - r.top - r.height/2) * 0.3;
  },
  reset() { this.dx = 0; this.dy = 0; }
}" @mousemove="pull($event)" @mouseleave="reset()"
  :style="`transform: translate(${dx}px, ${dy}px)`"
  class="transition-transform duration-200 ease-out px-8 py-4 bg-[var(--color-primary)] text-white rounded-[var(--radius)] font-semibold hover:shadow-lg">
  Get Started
</button>
</pattern>

<pattern name="counter-scroll">
Animated counter triggered on scroll entry with smooth easing:

<div x-data="{
  value: 0,
  target: 2847,
  animate() {
    const duration = 2000;
    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      this.value = Math.round(this.target * ease);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}" x-intersect.once="animate()">
  <span class="text-5xl font-bold font-heading" x-text="value.toLocaleString()">0</span>
  <span class="text-[var(--color-text-muted)]">Happy Clients</span>
</div>

For multiple counters, use this pattern inline on each stat — no Alpine.data() registration needed.
Preferred over the older counter pattern above — uses requestAnimationFrame for smoother animation and cubic ease-out.
</pattern>
```

**Step 5: Verify build**

Run: `npm run build`

**Step 6: Commit**

```bash
git add src/lib/prompts/sections/interactivity.ts
git commit -m "feat: add 8 Alpine.js patterns, ARIA, reduced-motion, fix transition-all

New: pricing-toggle, hover-reveal, modal-lightbox, sticky-header-shrink,
tilt-card, before-after-slider, magnetic-button, counter-scroll.
Fix scroll-reveal transition-all. Add ARIA to tabs/carousel.
Add prefers-reduced-motion CSS reset."
```

---

### Task 4: Design Quality Rewrite

**Files:**
- Modify: `src/lib/prompts/sections/design-quality.ts`

This is the largest single change. Replace `DESIGN_QUALITY_SECTION` and `BLUEPRINT_DESIGN_QUALITY_SECTION` with updated content.

**Step 1: Rewrite DESIGN_QUALITY_SECTION**

Replace the full `DESIGN_QUALITY_SECTION` constant. Key changes:
- **color_system**: Replace HSL-only guidance with 2026 palette strategies (earthy eco-digital, warm mahogany, bioluminescent tech, high-contrast mono). Ban pure #ffffff. Keep HSL method but add concrete palette examples.
- **typography**: Add tiered font recommendations. Distinctive display tier: Fraunces, Bricolage Grotesque, Syne, Space Grotesk, DM Serif Display, Bebas Neue, Newsreader, Cormorant Garamond. Safe body tier: DM Sans, Plus Jakarta Sans, Outfit, Manrope. Add `text-wrap: balance` for headings. Keep existing rules.
- **visual_atmosphere** (NEW section): CSS gradient mesh (radial-gradient layering technique with exact CSS), SVG noise texture (inline data URI technique), `mix-blend-mode` layering for depth.
- **motion_design**: Add CSS scroll-driven animations (`animation-timeline: view()`, `animation-range: entry`), `@starting-style` for entry transitions. Keep existing Alpine.js references. Add `prefers-reduced-motion` wrapper requirement.
- **layout_innovation** (replaces `layout_techniques`): Bento grid with 12-col asymmetric spans, editorial overlapping grids with negative margins, stacking cards on scroll with sticky positioning. More detailed CSS patterns than before.
- **surface_treatment** (NEW for chat mode — previously blueprint-only): Port the 7 surface treatment types with their CSS patterns.
- Keep: `creative_framework`, `content_rules`, `anti_patterns` — with minor updates.

The exact content is large (~6KB). When implementing, preserve the existing structure and naming but replace section content as described. The key principle: every technique mentioned must include concrete CSS that the model can copy, not just abstract description.

**Step 2: Update BLUEPRINT_DESIGN_QUALITY_SECTION**

Same as DESIGN_QUALITY_SECTION minus `color_system` and `typography` (already resolved by blueprint). Keep `visual_atmosphere`, updated `motion_design`, `layout_innovation`, `surface_treatment`, `creative_framework`, `content_rules`, `anti_patterns`.

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/lib/prompts/sections/design-quality.ts
git commit -m "feat: rewrite design quality with 2026 trends, anti-AI-slop guidance

Replace color/typography with tiered recommendations and banned defaults.
Add visual_atmosphere (gradient mesh, noise texture, blend modes).
Add CSS scroll-driven animations to motion_design.
Add layout_innovation (bento 12-col, editorial overlap, stacking cards).
Port surface_treatment to chat mode (was blueprint-only)."
```

---

### Task 5: UI/UX Guidelines Update

**Files:**
- Modify: `src/lib/prompts/sections/ui-ux-guidelines.ts` (specifically the `context-blocks.ts` exports that live here)

**Step 1: Add typography register to industry_tones**

For each industry in `UI_UX_GUIDELINES_SECTION`, add a typography line after the "Try:" line. Examples:
- Healthcare: `Type: warm humanist sans headings (Plus Jakarta Sans, Outfit), clean sans body`
- Legal: `Type: editorial serif headings (DM Serif Display, Newsreader), refined sans body`
- Creative/Agency: `Type: expressive display headings (Syne, Bricolage Grotesque), neutral body`
- Restaurant/Food: `Type: warm serif or handwritten-feel headings, humanist sans body`
- SaaS/B2B: `Type: geometric sans headings (Space Grotesk, Manrope), clean sans body`

Add similar for all 20+ industries.

**Step 2: Expand interaction_standards**

Add after line 144:

```
- Icon sizing conventions: 16px for inline text icons, 20-24px for UI chrome (nav, buttons), 32-48px for feature/service cards. Keep consistent per context.
- Do NOT use icons as primary visual decoration on feature cards — prefer numbered lists, bold typography, colored borders, or background images instead.
```

**Step 3: Add responsive guidance to layout_principles**

Add after the breakpoint line:

```
Responsive behavior per breakpoint:
  - 375px (mobile): single column, touch targets 44px+, hamburger nav, full-width images
  - 768px (tablet): 2-column grids, side nav possible, image+text splits
  - 1024px (desktop): full navigation, 3-4 column grids, hover effects activate
  - 1440px (max): max-width container, decorative elements appear, generous padding
```

**Step 4: Update STYLE_SEEDS with visualStyle**

Add `visualStyle` field to the `StyleSeed` interface:

```typescript
interface StyleSeed {
  mood: string;
  hueRange: string;
  strategy: 'LIGHT' | 'MUTED' | 'BOLD' | 'HIGH-CONTRAST';
  vibe: string;
  visualStyle: string;
  imageStyle: string;
}
```

Update each seed with appropriate `visualStyle` and `imageStyle`. Examples:
- `vintage film warmth` → `visualStyle: 'retro-nostalgic'`, `imageStyle: 'warm film-grain photography, faded colors, golden hour tones'`
- `Scandinavian minimalism` → `visualStyle: 'tech-minimal'`, `imageStyle: 'clean product photography, white space, natural materials'`
- `Art Deco opulence` → `visualStyle: 'luxury-refined'`, `imageStyle: 'high-contrast editorial photography, metallic surfaces, geometric patterns'`
- `urban industrial` → `visualStyle: 'brutalist-raw'`, `imageStyle: 'gritty documentary photography, concrete textures, high contrast B&W'`
- `botanical garden` → `visualStyle: 'organic-warm'`, `imageStyle: 'soft natural light photography, close-up botanicals, earth tones'`
- `moody editorial` → `visualStyle: 'editorial-magazine'`, `imageStyle: 'dramatic editorial photography, deep shadows, cinematic framing'`

Map all 40 seeds to the 8 visual styles. Ensure even distribution — no single visualStyle gets more than 8 seeds.

Replace any seeds with purple/indigo primary hues. Specifically replace:
- `neon Tokyo night` (hueRange 270-330) — replace with `bioluminescent tech` (hueRange 150-180, strategy BOLD, visualStyle 'tech-minimal', vibe 'void black backgrounds, holo teal accents, plasma gradients')
- `sunset over lavender fields` (hueRange 270-290) — replace with `Saharan market` (hueRange 20-45, strategy MUTED, visualStyle 'organic-warm', vibe 'spice market oranges, indigo textiles, sandy plaster')

**Step 5: Verify build**

Run: `npm run build`

**Step 6: Commit**

```bash
git add src/lib/prompts/sections/ui-ux-guidelines.ts
git commit -m "feat: typography per industry, responsive breakpoints, style seeds with visualStyle

Add font recommendations to all 20 industry tones.
Expand interaction_standards with icon sizing conventions.
Add per-breakpoint responsive guidance.
Add visualStyle + imageStyle to all style seeds.
Replace purple/indigo seeds with 2026-aligned palettes."
```

---

### Task 6: Base Rules Fixes

**Files:**
- Modify: `src/lib/prompts/sections/base-rules.ts`

**Step 1: Add viewport meta and description requirements**

In `getBaseRulesSection`, add to the rules list (after rule 1):

```
1b. ALWAYS include <meta name="viewport" content="width=device-width, initial-scale=1"> in <head>.
1c. ALWAYS include <meta name="description" content="..."> derived from the page's purpose.
1d. Use semantic heading hierarchy: exactly one <h1> per page, <h2> for section headings, <h3> for subsections. Never skip levels.
```

**Step 2: Verify build**

Run: `npm run build`

**Step 3: Commit**

```bash
git add src/lib/prompts/sections/base-rules.ts
git commit -m "fix: add viewport meta, meta description, heading hierarchy rules"
```

---

### Task 7: Context Blocks Dedup + Enhancements

**Files:**
- Modify: `src/lib/prompts/sections/context-blocks.ts`

**Step 1: Remove duplicated instructions from buildFirstGenerationBlock**

In `buildFirstGenerationBlock` (line 298-320), remove step 4 (completion summary — already in tool-output-format.ts) and simplify step 2 (Alpine.js one-liner — already in interactivity section).

**Step 2: Inject visualStyle and imageStyle from seed**

Update the DESIGN SEED block in `buildFirstGenerationBlock` to include the new seed fields:

```typescript
return `\n<first_generation>
This is a NEW website. Your design seed for this project:

DESIGN SEED:
  Mood: "${seed.mood}" | Hue zone: ${seed.hueRange}° | Strategy: ${seed.strategy}
  Visual feel: ${seed.vibe}
  Visual style: ${seed.visualStyle} — use this archetype to guide your layout composition, spacing rhythm, and visual weight.
  Image style: ${seed.imageStyle} — use this to guide your searchImages queries and image treatment.

Choose a layout archetype from layout_archetypes above that fits both this visual style and the content. Fuse the design seed's aesthetic with the archetype's structure.

Steps:
1. Define your :root CSS custom properties (7 colors from the seed's strategy ranges + font families + shadows + radius) and Tailwind config
2. Call writeFiles with the complete HTML — apply your chosen layout archetype's structural pattern

Make a strong first impression — the design should feel polished, intentional, and unlike anything a template generator would produce.
</first_generation>`;
```

**Step 3: Verify build**

Run: `npm run build`

**Step 4: Commit**

```bash
git add src/lib/prompts/sections/context-blocks.ts
git commit -m "fix: dedup first-gen block, inject visualStyle+imageStyle from seed"
```

---

### Task 8: System Prompt Cleanup

**Files:**
- Modify: `src/lib/prompts/system-prompt.ts`

**Step 1: Replace CREATIVE_DIRECTION_SECTION with short reinforcement**

Replace the full `CREATIVE_DIRECTION_SECTION` constant (lines 26-36) with:

```typescript
const CREATIVE_REINFORCEMENT = `<creative_reinforcement>
Your output should feel like a $5,000 agency portfolio piece — distinctive, intentional, crafted. Follow the design seed's visual style archetype to guide every layout and composition decision. The design_quality section has your full creative toolkit.
</creative_reinforcement>`;
```

**Step 2: Strengthen IDENTITY_LINE and CLOSING_LINE**

```typescript
const IDENTITY_LINE = `You are WebBuilder, an expert web designer and developer who creates distinctive, production-ready websites. Your output should feel like it was designed by a top-tier agency — not generated by AI, not pulled from a template library. Every design choice must be intentional.`;

const CLOSING_LINE = `IMPORTANT: Prioritize visual impact in the first viewport — the hero section sells the entire site. Be concise in explanations, bold in design.`;
```

**Step 3: Update the stable prompt assembly**

Replace `${CREATIVE_DIRECTION_SECTION}` with `${CREATIVE_REINFORCEMENT}` in the stable string (line 59).

**Step 4: Verify build**

Run: `npm run build`

**Step 5: Commit**

```bash
git add src/lib/prompts/system-prompt.ts
git commit -m "fix: remove duplicate creative direction, strengthen identity and closing lines"
```

---

### Task 9: Blueprint System Prompt Update

**Files:**
- Modify: `src/lib/blueprint/prompts/blueprint-system-prompt.ts`

**Step 1: Add new schema field guidance**

Add a `<new_fields>` section before `</rules>`:

```
<new_fields>
For each page, you MUST also set:
- contentFocus: what unique messaging angle this page owns. Distribute value propositions across pages — do NOT repeat the same selling points on every page. The homepage gets the overview; inner pages go deep on specifics.
- visualWeight: how visually heavy vs content-dense this page should feel. Homepage is typically "hero-heavy", about/team is "balanced", blog/resources is "content-dense".
- heroApproach: describe the hero section's specific visual approach, e.g. "split layout with photo left, oversized headline right" or "full-bleed video background with centered minimal text".

For the design system, you MUST also set:
- visualStyle: one of editorial-magazine, tech-minimal, luxury-refined, bold-expressive, organic-warm, brutalist-raw, retro-nostalgic, corporate-clean. This drives the page generator's layout composition and spacing decisions.
- imageStyle: a descriptive phrase guiding all image searches, e.g. "warm documentary photography with natural light and earth tones".
- fontWeights: specify actual weights needed for each font. Check Google Fonts — not all fonts have all weights. Common: { heading: [400, 700], body: [400, 500, 600] }.

For each section, also set:
- imageDirection: what specific imagery this section needs, e.g. "overhead shot of team collaboration" or "abstract geometric pattern in brand colors".
- contentDepth: minimal (headline + 1-2 lines), standard (headline + paragraph + supporting elements), rich (multiple paragraphs, data, testimonials, detailed content).

For content strategy, also set:
- contentDistribution: map each page filename to which value propositions it should feature. Example: { "index.html": ["prop1", "prop2"], "about.html": ["prop3", "prop4"] }
- seoKeywords: map each page to 3-5 target keywords. Example: { "index.html": ["keyword1", "keyword2"] }
</new_fields>
```

**Step 2: Fix JSON example section count**

In the JSON example (task section), reduce from 7 sections to 5 to match the "3-6" rule. Remove 2 sections (e.g. the faq and the separate cta section, merging CTA into the stats section).

**Step 3: Add positive font pairing examples**

Add to `font_pairing_principles`:

```
Proven distinctive pairings (use as starting points, not defaults):
- Fraunces (serif display) + Plus Jakarta Sans (humanist body) — editorial warmth
- Syne (geometric display) + Outfit (clean body) — futuristic precision
- DM Serif Display (refined serif) + DM Sans (matching body) — elegant harmony
- Space Grotesk (tech display) + Manrope (modern body) — tech-forward warmth
- Bricolage Grotesque (expressive display) + Inter (neutral body) — personality + readability
- Cormorant Garamond (luxury serif) + Outfit (clean body) — premium editorial
- Bebas Neue (condensed impact) + Plus Jakarta Sans (friendly body) — bold energy
```

**Step 4: Add new fields to the JSON example**

Update the JSON example to include the new fields on the page object and design system.

**Step 5: Verify build**

Run: `npm run build`

**Step 6: Commit**

```bash
git add src/lib/blueprint/prompts/blueprint-system-prompt.ts
git commit -m "feat: blueprint prompt — new field guidance, font pairings, JSON fix"
```

---

### Task 10: Page System Prompt Update

**Files:**
- Modify: `src/lib/blueprint/prompts/page-system-prompt.ts`

**Step 1: Add section contrast guidance**

Add a new `<section_contrast>` block after `<creative_seed>`:

```typescript
const sectionContrastBlock = `<section_contrast>
Vary visual rhythm between consecutive sections:
- Alternate backgrounds: bg → surface → bg → primary/dark → bg. Never use the same background on consecutive sections.
- Vary density: follow a rich section with a minimal one. Dense content grids next to breathing whitespace.
- Break patterns: after 2 contained-width sections, go full-bleed. After text-heavy sections, go visual-heavy.
- Section transitions: use subtle dividers (hairline border, gradient fade, diagonal clip-path) between sections with same background color.
</section_contrast>`;
```

**Step 2: Add per-page content differentiation**

In the `<page_spec>` block, add content focus and visual weight from the new page fields:

```typescript
// After "Purpose: ${page.purpose}\n"
${page.contentFocus ? `Content Focus: ${page.contentFocus} — this is YOUR unique angle. Do NOT repeat messaging that belongs to other pages.\n` : ''}
${page.visualWeight ? `Visual Weight: ${page.visualWeight}\n` : ''}
${page.heroApproach ? `Hero Approach: ${page.heroApproach}\n` : ''}
```

**Step 3: Add contentDistribution to content_strategy block**

After the existing content strategy fields, add:

```typescript
${contentStrategy.contentDistribution && Object.keys(contentStrategy.contentDistribution).length > 0 && contentStrategy.contentDistribution[page.filename]
  ? `\nYOUR assigned value propositions (use ONLY these, not others): ${contentStrategy.contentDistribution[page.filename].join(' | ')}` : ''}
${contentStrategy.seoKeywords && contentStrategy.seoKeywords[page.filename]
  ? `\nSEO keywords to naturally weave in: ${contentStrategy.seoKeywords[page.filename].join(', ')}` : ''}
```

**Step 4: Add imageDirection to section list formatting**

In the `sectionsList` map function, add imageDirection and contentDepth:

```typescript
if (s.imageDirection) meta.push(`imagery:${s.imageDirection}`);
if (s.contentDepth && s.contentDepth !== 'standard') meta.push(`depth:${s.contentDepth}`);
```

**Step 5: Add truncation recovery guidance**

Add to `<requirements>` section:

```
10. COMPLETION PRIORITY: If approaching output limits, finish the current section completely rather than starting a new section you cannot complete. A page with 4 fully-realized sections is better than 6 sections where the last 2 are stubs.
```

**Step 6: Suppress webSearch when siteFacts covers info**

The existing code already handles this (line 183-185). No change needed — verified.

**Step 7: Add data-current-page instruction**

For multi-page sites, add to the header_placeholder:

```
The shared header uses data-current-page for active link styling. After the <!-- @component:header --> comment, add this script:
<script>document.querySelector('header')?.setAttribute('data-current-page', '${page.filename}')</script>
```

**Step 8: Add visualStyle to the design system reference**

In the `designSystemSection` where headTags exist, add:

```
Visual Style: ${designSystem.visualStyle || 'bold-expressive'} — use this archetype to guide your layout composition, spacing rhythm, and decorative choices.
Image Style: ${designSystem.imageStyle || 'high-quality photography'} — use this to guide searchImages queries.
```

**Step 9: Verify build**

Run: `npm run build`

**Step 10: Commit**

```bash
git add src/lib/blueprint/prompts/page-system-prompt.ts
git commit -m "feat: page prompt — section contrast, content differentiation, truncation recovery

Add section_contrast guidance for visual rhythm.
Inject contentFocus, visualWeight, heroApproach per page.
Add contentDistribution and seoKeywords to content strategy.
Add imageDirection/contentDepth to section metadata.
Add data-current-page script for active nav.
Add truncation recovery rule."
```

---

### Task 11: Components System Prompt Fixes

**Files:**
- Modify: `src/lib/blueprint/prompts/components-system-prompt.ts`

**Step 1: Replace UI_UX_GUIDELINES_SECTION with compact version**

Change the import (line 3):
```typescript
import { UI_UX_GUIDELINES_COMPACT_SECTION } from '@/lib/prompts/sections/ui-ux-guidelines';
```

Replace `${UI_UX_GUIDELINES_SECTION}` with `${UI_UX_GUIDELINES_COMPACT_SECTION}` in the template string.

**Step 2: Fix contradictory JS instructions**

In `<header_requirements>`, replace line 85-86:
```
- Mobile: hamburger menu button (3-line icon) with data-menu-toggle attribute that toggles a dropdown/slide nav (with data-mobile-menu attribute)
- Do NOT include inline <script> — a shared scripts.js handles mobile menu toggle via data-menu-toggle/data-mobile-menu attributes
```
With:
```
- Mobile: hamburger menu button (3-line SVG icon) with data-menu-toggle attribute. The mobile nav container must have data-mobile-menu attribute and start hidden (x-cloak or hidden class).
- Mobile menu toggle is handled by shared scripts.js via data-menu-toggle/data-mobile-menu attributes. Do NOT include inline <script> blocks or Alpine.js toggle logic — just the data attributes.
```

**Step 3: Add footer layout archetypes**

Add to `<footer_requirements>` after "Simple, clean layout":

```
- Footer layout: choose based on content density:
  • Minimal (few links, no address): single-row flex with logo, links, copyright
  • Standard (links + contact): 3-column grid — brand/tagline | nav links | contact info + copyright below
  • Rich (links + contact + social + hours): 4-column grid with generous padding (py-16+), subtle top border, contrasting background using --color-surface
```

**Step 4: Add sticky header scroll behavior**

Add to `<header_requirements>`:

```
- Scroll behavior: header should transition from transparent/expanded to solid/compact on scroll. Use a class convention: initial state is transparent with larger padding; scrolled state adds bg-[var(--color-bg)]/95, backdrop-blur, shadow, and reduced padding. The shared scripts.js handles adding a 'scrolled' class on window scroll.
```

**Step 5: Verify build**

Run: `npm run build`

**Step 6: Commit**

```bash
git add src/lib/blueprint/prompts/components-system-prompt.ts
git commit -m "fix: components prompt — slim UI/UX, fix JS contradiction, footer archetypes

Replace full UI_UX_GUIDELINES with compact version (saves ~1000 tokens).
Clarify mobile menu uses data attributes not Alpine.js.
Add footer layout archetypes (minimal/standard/rich).
Add sticky header scroll behavior guidance."
```

---

### Task 12: Tool Output Format Dedup

**Files:**
- Modify: `src/lib/prompts/sections/tool-output-format.ts`

**Step 1: Minor cleanup only**

The tool-output-format is mostly correct. One small addition — add note about not re-searching images on edits:

In `<tool_workflows>` EDIT (small change) section, add:
```
DO NOT call searchImages, searchIcons, or webSearch for small edits unless the user explicitly asks for new images.
```

This line already exists (line 51). Verified — no change needed for this file.

**Step 2: Commit** — skip, no changes.

---

### Task 13: Final Build Verification

**Step 1: Run full build**

Run: `npm run build`
Expected: Clean build, no type errors.

**Step 2: Run lint**

Run: `npm run lint`
Expected: No new lint errors.

**Step 3: Manual testing**

Start dev server (`npm run dev`) and test:
1. Chat mode: generate a new single-page site — verify enhanced design quality
2. Blueprint mode: generate a multi-page blueprint — verify new schema fields appear
3. Blueprint generation: approve and generate — verify pages use new fields
4. Edit mode: make a small edit — verify no regressions

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: blueprint quality enhancement — 2026 trends, richer schema, 8 Alpine patterns

Complete quality improvement across blueprint and chat modes:
- 9 new schema fields for richer planning data
- Shared styles fixes (transition, font smoothing, dynamic weights)
- 8 new Alpine.js patterns with ARIA + reduced-motion
- Design quality rewrite with 2026 trends and anti-AI-slop
- UI/UX updates with per-industry typography and responsive guidance
- Chat mode parity (surface treatments, visualStyle seeds)
- Bug fixes (dedup, data-current-page, component prompt slim)"
```

---

## Execution Order Summary

| Task | Depends On | Est. Complexity |
|---|---|---|
| 1. Schema Extensions | none | low |
| 2. Shared Styles Fixes | Task 1 (fontWeights type) | low |
| 3. Alpine.js Patterns | none | medium |
| 4. Design Quality Rewrite | none | high (largest file) |
| 5. UI/UX Guidelines Update | none | medium |
| 6. Base Rules Fixes | none | low |
| 7. Context Blocks Dedup | Task 5 (seed type) | low |
| 8. System Prompt Cleanup | none | low |
| 9. Blueprint Prompt Update | Task 1 (new fields) | medium |
| 10. Page Prompt Update | Task 1 (new fields) | medium |
| 11. Components Prompt Fixes | none | low |
| 12. Tool Output Format | none | skip (no changes) |
| 13. Final Verification | all above | low |

Tasks 1, 3, 4, 5, 6, 8, 11 can run in parallel. Tasks 2, 7, 9, 10 depend on Task 1 or 5.
