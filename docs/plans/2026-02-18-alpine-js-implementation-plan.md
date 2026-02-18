# Alpine.js Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace inline JavaScript with Alpine.js declarative directives in all generated websites, reducing output tokens by ~25-30% and cutting generation time by ~80-100 seconds.

**Architecture:** New prompt section (`interactivity.ts`) with Alpine.js pattern examples. Alpine CDN tags added to `generateSharedStyles` (blueprint) and `base-rules.ts` (chat). Existing `js-utilities.ts` replaced entirely — Alpine provides the same data-attribute-like patterns but declaratively in HTML attributes.

**Tech Stack:** Alpine.js v3 (core + collapse + intersect plugins via jsDelivr CDN)

**Design doc:** `docs/plans/2026-02-18-alpine-js-integration-design.md`

---

### Task 1: Create `interactivity.ts` Prompt Section

**Files:**
- Create: `src/lib/prompts/sections/interactivity.ts`

**Step 1: Create the file**

Create `src/lib/prompts/sections/interactivity.ts` with the following content:

```typescript
// Alpine.js interactivity patterns for AI-generated websites.
// Replaces inline <script> blocks with declarative Alpine.js directives.
// Used by both chat mode (system-prompt.ts) and blueprint mode (page-system-prompt.ts).

export const ALPINE_CDN_TAGS = `<script defer src="https://cdn.jsdelivr.net/npm/@alpinejs/collapse@3.x.x/dist/cdn.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/@alpinejs/intersect@3.x.x/dist/cdn.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>`;

export const ALPINE_CLOAK_CSS = `[x-cloak] { display: none !important; }`;

export const INTERACTIVITY_SECTION = `<interactivity>
Use Alpine.js for ALL UI interactivity. Alpine.js and its plugins (Collapse, Intersect) are loaded via CDN in <head>. NEVER write inline <script> blocks for toggles, accordions, carousels, counters, scroll animations, or mobile menus.

The ONLY acceptable <script> blocks are:
1. CDN script tags in <head> (Alpine + plugins + Tailwind)
2. The Tailwind config script
3. A single Alpine.data() registration block for reusable components (optional)

Everything else MUST use Alpine directives in HTML attributes.

CRITICAL: Add x-cloak to every element that uses x-show and starts hidden. The [x-cloak] { display: none !important } CSS rule is already loaded — this prevents flash of unstyled content.

<pattern name="accordion">
FAQ/accordion with smooth collapse animation:

<div x-data="{ active: '' }" class="divide-y divide-gray-200">
  <!-- Repeat this block per item, changing the id string -->
  <div>
    <button @click="active = active === 'q1' ? '' : 'q1'"
      class="flex items-center justify-between w-full py-5 text-left font-medium"
      :aria-expanded="active === 'q1'">
      <span>Question text here</span>
      <svg class="w-5 h-5 shrink-0 transition-transform duration-200" :class="active === 'q1' && 'rotate-180'"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    <div x-show="active === 'q1'" x-collapse x-cloak>
      <div class="pb-5 text-[var(--color-text-muted)]">Answer text here</div>
    </div>
  </div>
</div>
</pattern>

<pattern name="carousel">
Testimonial/card carousel with autoplay and navigation:

<div x-data="{
  current: 0,
  total: 4,
  auto: null,
  init() { this.auto = setInterval(() => this.next(), 5000) },
  destroy() { clearInterval(this.auto) },
  next() { this.current = (this.current + 1) % this.total },
  prev() { this.current = (this.current - 1 + this.total) % this.total }
}" class="relative overflow-hidden">
  <div class="relative min-h-[200px]">
    <!-- One div per slide. Use x-cloak on all but first -->
    <div x-show="current === 0" x-transition.opacity.duration.500ms class="absolute inset-0 p-8">
      Slide 1 content
    </div>
    <div x-show="current === 1" x-transition.opacity.duration.500ms class="absolute inset-0 p-8" x-cloak>
      Slide 2 content
    </div>
    <!-- ... more slides -->
  </div>
  <!-- Dots -->
  <div class="flex justify-center gap-2 mt-6">
    <template x-for="i in total" :key="i">
      <button @click="current = i - 1" class="w-2.5 h-2.5 rounded-full transition-colors"
        :class="current === i - 1 ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-text-muted)]/30'"></button>
    </template>
  </div>
  <!-- Arrows -->
  <button @click="prev()" class="absolute left-2 top-1/2 -translate-y-1/2">&#8249;</button>
  <button @click="next()" class="absolute right-2 top-1/2 -translate-y-1/2">&#8250;</button>
</div>
</pattern>

<pattern name="counter">
Animated counter that counts up when scrolled into view (requires Intersect plugin):

For repeating counters, register once with Alpine.data then reuse:
<script>
document.addEventListener('alpine:init', () => {
  Alpine.data('counter', (target, duration = 2000) => ({
    count: 0, started: false,
    start() {
      if (this.started) return;
      this.started = true;
      const steps = 60, step = Math.ceil(target / steps);
      let current = 0;
      const timer = setInterval(() => {
        current = Math.min(current + step, target);
        this.count = current;
        if (current >= target) clearInterval(timer);
      }, duration / steps);
    }
  }));
});
</script>

<!-- Usage per stat -->
<div x-data="counter(5000)" x-intersect.once="start()">
  <span class="text-5xl font-bold" x-text="count.toLocaleString()">0</span>
  <span>Happy Patients</span>
</div>
</pattern>

<pattern name="mobile-menu">
Mobile hamburger menu with body scroll lock and animated icon:

<nav x-data="{ open: false }" @keydown.escape.window="open = false; document.body.classList.remove('overflow-hidden')">
  <div class="flex items-center justify-between px-6 py-4">
    <a href="#" class="font-heading text-xl font-bold">Brand</a>
    <!-- Desktop links (hidden on mobile) -->
    <div class="hidden md:flex gap-8">
      <a href="#about">About</a>
      <a href="#services">Services</a>
      <a href="#contact">Contact</a>
    </div>
    <!-- Hamburger (visible on mobile only) -->
    <button @click="open = !open; document.body.classList.toggle('overflow-hidden', open)"
      class="md:hidden p-2" :aria-expanded="open">
      <div class="w-6 h-5 flex flex-col justify-between">
        <span class="h-0.5 bg-current transition-all duration-300 origin-center" :class="open && 'rotate-45 translate-y-2'"></span>
        <span class="h-0.5 bg-current transition-all duration-300" :class="open && 'opacity-0'"></span>
        <span class="h-0.5 bg-current transition-all duration-300 origin-center" :class="open && '-rotate-45 -translate-y-2'"></span>
      </div>
    </button>
  </div>
  <!-- Mobile overlay -->
  <div x-show="open" x-transition:enter="transition ease-out duration-200" x-transition:enter-start="opacity-0"
    x-transition:enter-end="opacity-100" x-transition:leave="transition ease-in duration-150"
    x-transition:leave-start="opacity-100" x-transition:leave-end="opacity-0"
    @click="open = false; document.body.classList.remove('overflow-hidden')"
    class="fixed inset-0 bg-black/40 z-40 md:hidden" x-cloak></div>
  <!-- Mobile drawer -->
  <div x-show="open" x-transition:enter="transition ease-out duration-300" x-transition:enter-start="-translate-x-full"
    x-transition:enter-end="translate-x-0" x-transition:leave="transition ease-in duration-200"
    x-transition:leave-start="translate-x-0" x-transition:leave-end="-translate-x-full"
    class="fixed top-0 left-0 h-full w-72 bg-[var(--color-bg)] shadow-xl z-50 flex flex-col p-8 gap-6 md:hidden" x-cloak>
    <a href="#about" @click="open = false; document.body.classList.remove('overflow-hidden')">About</a>
    <a href="#services" @click="open = false; document.body.classList.remove('overflow-hidden')">Services</a>
    <a href="#contact" @click="open = false; document.body.classList.remove('overflow-hidden')">Contact</a>
  </div>
</nav>
</pattern>

<pattern name="scroll-reveal">
Elements that animate in when scrolled into view (requires Intersect plugin):

<!-- Single element fade-up -->
<div x-data="{ shown: false }" x-intersect.once="shown = true"
  :class="shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
  class="transition-all duration-700 ease-out">
  Content here
</div>

<!-- Staggered cards — use inline transition-delay -->
<div class="grid grid-cols-3 gap-6">
  <div x-data="{ shown: false }" x-intersect.once="shown = true" style="transition-delay: 0ms"
    :class="shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
    class="transition-all duration-700 ease-out">Card 1</div>
  <div x-data="{ shown: false }" x-intersect.once="shown = true" style="transition-delay: 150ms"
    :class="shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
    class="transition-all duration-700 ease-out">Card 2</div>
  <div x-data="{ shown: false }" x-intersect.once="shown = true" style="transition-delay: 300ms"
    :class="shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
    class="transition-all duration-700 ease-out">Card 3</div>
</div>

IMPORTANT: Always use full Tailwind class names in :class bindings — never construct classes dynamically with template literals. Tailwind CDN cannot detect dynamically constructed class names.
</pattern>

<pattern name="tabs">
Tab switching component:

<div x-data="{ tab: 'tab1' }">
  <div class="flex border-b border-[var(--color-surface)]">
    <button @click="tab = 'tab1'" class="px-5 py-3 text-sm font-medium border-b-2 transition-colors"
      :class="tab === 'tab1' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)]'">
      Tab 1</button>
    <button @click="tab = 'tab2'" class="px-5 py-3 text-sm font-medium border-b-2 transition-colors"
      :class="tab === 'tab2' ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)]'">
      Tab 2</button>
  </div>
  <div class="p-6">
    <div x-show="tab === 'tab1'" x-transition.opacity>Tab 1 content</div>
    <div x-show="tab === 'tab2'" x-transition.opacity x-cloak>Tab 2 content</div>
  </div>
</div>
</pattern>

Smooth scrolling: Add scroll-behavior: smooth to html element in CSS. For nav links pointing to #section-id anchors, this is all you need — no JavaScript required.
</interactivity>`;
```

**Step 2: Verify TypeScript compiles**

Run: `cd "/Volumes/Work/MAG Centre/AI Builder" && npx tsc --noEmit src/lib/prompts/sections/interactivity.ts`

**Step 3: Commit**

```bash
git add src/lib/prompts/sections/interactivity.ts
git commit -m "feat: add Alpine.js interactivity prompt section"
```

---

### Task 2: Update `generateSharedStyles` — Add Alpine CDN + x-cloak

**Files:**
- Modify: `src/lib/blueprint/generate-shared-styles.ts`

**Step 1: Add Alpine CDN import and update headTags**

In `src/lib/blueprint/generate-shared-styles.ts`, import `ALPINE_CDN_TAGS` from the new interactivity module and add it to `headTags` after Google Fonts and before Tailwind CDN.

Add at top:
```typescript
import { ALPINE_CDN_TAGS, ALPINE_CLOAK_CSS } from '@/lib/prompts/sections/interactivity';
```

Update `headTags` to include Alpine CDN tags (between the Google Fonts stylesheet link and the Tailwind CDN script):
```typescript
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
```

**Step 2: Add x-cloak CSS to stylesCss**

Append `ALPINE_CLOAK_CSS` to the end of the `stylesCss` string, after the heading font-family rule:
```typescript
  const stylesCss = `:root {
  ...existing...
}

...existing body and heading rules...

${ALPINE_CLOAK_CSS}`;
```

**Step 3: Verify build compiles**

Run: `cd "/Volumes/Work/MAG Centre/AI Builder" && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/lib/blueprint/generate-shared-styles.ts
git commit -m "feat: add Alpine.js CDN tags to blueprint shared styles"
```

---

### Task 3: Update `base-rules.ts` — Add Alpine CDN for Chat Mode

**Files:**
- Modify: `src/lib/prompts/sections/base-rules.ts`

**Step 1: Add Alpine CDN to chat mode design system template**

Chat mode doesn't use `generateSharedStyles` — it includes the design system inline. Add Alpine CDN tags and x-cloak CSS to the template.

Import at top:
```typescript
import { ALPINE_CDN_TAGS, ALPINE_CLOAK_CSS } from '@/lib/prompts/sections/interactivity';
```

In the `<design_system>` section, after the `:root { ... }` CSS block and the `tailwind.config` script block, add instruction to include Alpine CDN. The simplest approach: add a line to the template string referencing the Alpine CDN tags.

Update the template string to include after the Tailwind CDN line (rule 2):
```
2. Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
```
Change to:
```
2. Use Tailwind CSS via CDN and Alpine.js for interactivity. Include these scripts in <head>:
   <script src="https://cdn.tailwindcss.com"></script>
   ${ALPINE_CDN_TAGS}
```

Also add `${ALPINE_CLOAK_CSS}` to the `:root { ... }` CSS template as a style rule the AI should include.

**Step 2: Verify build compiles**

Run: `cd "/Volumes/Work/MAG Centre/AI Builder" && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/lib/prompts/sections/base-rules.ts
git commit -m "feat: add Alpine.js CDN to chat mode base rules"
```

---

### Task 4: Update `system-prompt.ts` — Include Interactivity Section in Chat Mode

**Files:**
- Modify: `src/lib/prompts/system-prompt.ts`

**Step 1: Import and add INTERACTIVITY_SECTION**

Import `INTERACTIVITY_SECTION` from the new interactivity module:
```typescript
import { INTERACTIVITY_SECTION } from '@/lib/prompts/sections/interactivity';
```

Add it to the `stable` part of `getSystemPromptParts`, after `TOOL_OUTPUT_FORMAT_SECTION`:
```typescript
  const stable = `${IDENTITY_LINE}

${getBaseRulesSection(isFirstGeneration)}
${UI_UX_GUIDELINES_SECTION}
${CREATIVE_DIRECTION_SECTION}
${LAYOUT_ARCHETYPES_SECTION}
${toolSection}
${INTERACTIVITY_SECTION}`;
```

**Step 2: Verify build compiles**

Run: `cd "/Volumes/Work/MAG Centre/AI Builder" && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/lib/prompts/system-prompt.ts
git commit -m "feat: add Alpine.js interactivity section to chat system prompt"
```

---

### Task 5: Update `page-system-prompt.ts` — Include Interactivity Section in Blueprint Mode

**Files:**
- Modify: `src/lib/blueprint/prompts/page-system-prompt.ts`

**Step 1: Import and add INTERACTIVITY_SECTION**

Import:
```typescript
import { INTERACTIVITY_SECTION } from '@/lib/prompts/sections/interactivity';
```

Insert into the return string after `UI_UX_GUIDELINES_COMPACT_SECTION` (around line 203):
```typescript
${BLUEPRINT_DESIGN_QUALITY_SECTION}

${INTERACTIVITY_SECTION}

<creative_direction>
```

**Step 2: Update sharedScriptsSection**

The existing `sharedScriptsSection` (lines 170-185) references `data-reveal`, `data-accordion-trigger`, `data-tab-trigger`, `data-count-to`, `data-menu-toggle` — vanilla JS data-attribute hooks. These are now replaced by Alpine.js directives.

Update the `sharedScriptsSection` variable to replace the data-attribute instruction with Alpine.js references:
```typescript
  const sharedScriptsSection = sharedAssets?.scriptsJs
    ? `<shared_scripts_api>
The shared scripts.js is loaded via <script defer>. It provides smooth-scroll for anchor links.
All other interactivity (accordions, carousels, counters, mobile menus, scroll reveals, tabs) is handled by Alpine.js — use the patterns from the interactivity section above.
Do NOT write custom IntersectionObserver, hamburger menu JS, or scroll animation JS.
</shared_scripts_api>`
    : '';
```

**Step 3: Verify build compiles**

Run: `cd "/Volumes/Work/MAG Centre/AI Builder" && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/lib/blueprint/prompts/page-system-prompt.ts
git commit -m "feat: add Alpine.js interactivity section to blueprint page prompt"
```

---

### Task 6: Replace `js-utilities.ts` References in Chat Mode

**Files:**
- Modify: `src/lib/prompts/sections/context-blocks.ts`

The existing `js-utilities.ts` provides a minified JS snippet with data-attribute patterns. Alpine.js replaces all of this. We need to:

1. Remove the JS_UTILITIES_SNIPPET and JS_UTILITIES_INSTRUCTION from `buildFirstGenerationBlock`
2. Update `buildEditModeBlock` to reference Alpine.js instead of wb-utils data-attributes
3. Keep `js-utilities.ts` file intact for now (backward compatibility with existing generated sites that already have the snippet)

**Step 1: Update `buildFirstGenerationBlock`**

In the `<first_generation>` template (around line 303-325), replace:
```
2. Include the shared JS utilities script verbatim before </body> (from shared_js_utilities below) and use its data-attributes for interactivity

${JS_UTILITIES_INSTRUCTION}

<shared_js_utilities>
${JS_UTILITIES_SNIPPET}
</shared_js_utilities>
```

With:
```
2. Use Alpine.js directives for all interactivity — follow the patterns in the interactivity section. Do NOT write inline <script> blocks for UI interactions.
```

Remove the `JS_UTILITIES_SNIPPET` and `JS_UTILITIES_INSTRUCTION` imports if no longer used elsewhere in the file (keep `JS_UTILITIES_MARKER` for `buildEditModeBlock` backward compat detection).

**Step 2: Update `buildEditModeBlock`**

In the `hasSharedUtils` section (line 54-55), update the instruction from data-attribute references to Alpine.js:
```typescript
${hasSharedUtils ? `\nShared JS utilities:
- The page may include legacy JS utilities (wb-utils). For new interactive elements, prefer Alpine.js directives (x-data, x-show, x-collapse, x-intersect) over data-attributes. See the interactivity patterns in the system prompt.` : ''}
```

For sites that DON'T have the legacy marker (newly generated with Alpine.js), the `hasSharedUtils` check will be false and this block won't appear — which is correct since Alpine.js guidance is already in the stable prompt section.

**Step 3: Verify build compiles**

Run: `cd "/Volumes/Work/MAG Centre/AI Builder" && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/lib/prompts/sections/context-blocks.ts
git commit -m "feat: replace js-utilities with Alpine.js in chat mode prompts"
```

---

### Task 7: Update Motion Design References in `design-quality.ts`

**Files:**
- Modify: `src/lib/prompts/sections/design-quality.ts`

**Step 1: Update DESIGN_QUALITY_SECTION motion_design**

In the `<motion_design>` block within `DESIGN_QUALITY_SECTION` (line 101-125), change:
```
- Fade-up and slide-in for content sections using CSS @keyframes + Intersection Observer
```
To:
```
- Fade-up and slide-in for content sections using Alpine.js x-intersect directive (see interactivity patterns)
```

And change:
```
- Progress indicators or scroll-triggered counters for stats sections
```
To:
```
- Progress indicators or scroll-triggered counters using Alpine.js x-intersect + counter pattern
```

**Step 2: Update BLUEPRINT_DESIGN_QUALITY_SECTION motion_design**

Same changes in the `<motion_design>` block within `BLUEPRINT_DESIGN_QUALITY_SECTION` (line 254-278).

**Step 3: Verify build compiles**

Run: `cd "/Volumes/Work/MAG Centre/AI Builder" && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/lib/prompts/sections/design-quality.ts
git commit -m "feat: update motion design references to use Alpine.js"
```

---

### Task 8: Full Build Verification

**Files:** None (verification only)

**Step 1: Run full TypeScript check**

Run: `cd "/Volumes/Work/MAG Centre/AI Builder" && npx tsc --noEmit`
Expected: No errors

**Step 2: Run lint**

Run: `cd "/Volumes/Work/MAG Centre/AI Builder" && npm run lint`
Expected: No new errors

**Step 3: Run dev build**

Run: `cd "/Volumes/Work/MAG Centre/AI Builder" && npm run build`
Expected: Build succeeds

**Step 4: Commit any fixes if needed**

---

### Task 9: Manual Verification — Generate Test Site

**No code changes. Manual testing.**

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Generate the same dental clinic site**

Prompt: "Make a single page website for Dr. Maninder Saluja. He is a dentist. Clinic name is Impressions Dental Centre."

**Step 3: Verify in browser**

Check that:
- [ ] Alpine.js CDN tags appear in `<head>` (3 script tags)
- [ ] `[x-cloak]` CSS rule present
- [ ] No inline `<script>` blocks for UI interactions (only Alpine CDN, Tailwind config, and optionally Alpine.data registrations)
- [ ] FAQ accordion opens/closes smoothly (x-collapse)
- [ ] Testimonial carousel auto-plays and navigates
- [ ] Counter numbers animate on scroll
- [ ] Mobile hamburger menu works (resize browser to mobile)
- [ ] Scroll reveal animations trigger on scroll
- [ ] Smooth scrolling works for anchor links

**Step 4: Measure token reduction**

Compare output token count in server logs against baseline (~31,791 tokens for the same prompt).
Target: <23,000 tokens (25%+ reduction).

**Step 5: Measure generation time**

Compare `writeFile` streaming duration against baseline (~347 seconds).
Target: <260 seconds.
