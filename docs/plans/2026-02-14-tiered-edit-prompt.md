# Tiered Edit Prompt Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce system prompt by ~1,650 tokens on edit requests by dropping design guidelines the model doesn't need when editing existing sites.

**Architecture:** Gate `DESIGN_QUALITY_SECTION` and `UI_UX_GUIDELINES_SECTION` behind `isFirstGeneration`. Replace with a condensed `EDIT_DESIGN_REMINDER` (~100 tokens) for edits. Three files changed, no API/client/tool changes.

**Tech Stack:** TypeScript, template literals, no new dependencies.

---

### Task 1: Add EDIT_DESIGN_REMINDER to design-quality.ts

**Files:**
- Modify: `src/lib/prompts/sections/design-quality.ts` (append after existing export)

**Step 1: Add the new export**

Add this after the existing `DESIGN_QUALITY_SECTION` export (after the closing backtick+semicolon on the last line):

```ts
export const EDIT_DESIGN_REMINDER = `<design_reminders>
Maintain visual consistency with the existing design system:
- Keep all :root CSS custom properties. Use design tokens, never hardcode colors.
- Interactive elements need hover states + transitions (duration-200/300).
- Maintain spacing rhythm (py-16 md:py-24 between sections).
- Focus-visible states on all interactive elements.
- Consistent border-radius via --radius token.
- NEVER introduce purple/blue gradients, emoji icons, or lorem ipsum.
- NEVER remove existing design system variables or font imports.
</design_reminders>`;
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to design-quality.ts

**Step 3: Commit**

```
git add src/lib/prompts/sections/design-quality.ts
git commit -m "feat(prompts): add condensed EDIT_DESIGN_REMINDER for edit mode"
```

---

### Task 2: Make getBaseRulesSection() accept isFirstGeneration

**Files:**
- Modify: `src/lib/prompts/sections/base-rules.ts`

**Context:** This file currently imports `DESIGN_QUALITY_SECTION` and unconditionally includes it. After this change, it conditionally includes either the full section or the condensed reminder.

**Step 1: Update the import and function signature**

Change the import line from:
```ts
import { DESIGN_QUALITY_SECTION } from './design-quality';
```
to:
```ts
import { DESIGN_QUALITY_SECTION, EDIT_DESIGN_REMINDER } from './design-quality';
```

Change the function signature from:
```ts
export function getBaseRulesSection() {
```
to:
```ts
export function getBaseRulesSection(isFirstGeneration: boolean) {
```

**Step 2: Conditionally include design section**

Change the last line of the template literal from:
```ts
${DESIGN_QUALITY_SECTION}`;
```
to:
```ts
${isFirstGeneration ? DESIGN_QUALITY_SECTION : EDIT_DESIGN_REMINDER}`;
```

**Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: Error in `system-prompt.ts` because `getBaseRulesSection()` now requires an argument. This is expected and fixed in Task 3.

**Step 4: Commit**

```
git add src/lib/prompts/sections/base-rules.ts
git commit -m "feat(prompts): make getBaseRulesSection() tier-aware via isFirstGeneration param"
```

---

### Task 3: Update system-prompt.ts to use tiered prompt

**Files:**
- Modify: `src/lib/prompts/system-prompt.ts`

**Context:** This file calls `getBaseRulesSection()` (no args) and unconditionally includes `UI_UX_GUIDELINES_SECTION`. After this change, both are gated on `isFirstGeneration`.

**Step 1: Pass isFirstGeneration to getBaseRulesSection**

Change line 18 from:
```ts
${getBaseRulesSection()}
```
to:
```ts
${getBaseRulesSection(isFirstGeneration)}
```

**Step 2: Conditionally include UI_UX_GUIDELINES_SECTION**

Change line 20 from:
```ts
${UI_UX_GUIDELINES_SECTION}
```
to:
```ts
${isFirstGeneration ? UI_UX_GUIDELINES_SECTION : ''}
```

**Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: Clean — no errors.

**Step 4: Verify prompt output for both modes**

Run a quick check that both prompt tiers produce valid output:

```bash
npx tsx -e "
import { getSystemPrompt } from './src/lib/prompts/system-prompt';

// New generation (no files)
const newGen = getSystemPrompt();
console.log('=== NEW GEN ===');
console.log('Length:', newGen.length, 'chars');
console.log('Has color_system:', newGen.includes('<color_system>'));
console.log('Has typography:', newGen.includes('<typography>'));
console.log('Has ui_ux_guidelines:', newGen.includes('<ui_ux_guidelines>'));
console.log('Has design_reminders:', newGen.includes('<design_reminders>'));

// Edit mode (existing file)
const edit = getSystemPrompt({ 'index.html': '<html><body>test</body></html>' });
console.log('\n=== EDIT MODE ===');
console.log('Length:', edit.length, 'chars');
console.log('Has color_system:', edit.includes('<color_system>'));
console.log('Has typography:', edit.includes('<typography>'));
console.log('Has ui_ux_guidelines:', edit.includes('<ui_ux_guidelines>'));
console.log('Has design_reminders:', edit.includes('<design_reminders>'));
console.log('Has current_website:', edit.includes('<current_website>'));
console.log('Has edit_guidance:', edit.includes('<edit_guidance>'));
"
```

Expected output:
```
=== NEW GEN ===
Length: ~18000 chars
Has color_system: true
Has typography: true
Has ui_ux_guidelines: true
Has design_reminders: false

=== EDIT MODE ===
Length: ~8000 chars (smaller because no full design sections, tiny test HTML)
Has color_system: false
Has typography: false
Has ui_ux_guidelines: false
Has design_reminders: true
Has current_website: true
Has edit_guidance: true
```

**Step 5: Commit**

```
git add src/lib/prompts/system-prompt.ts
git commit -m "feat(prompts): tiered system prompt — skip design guidelines for edits

Edit requests now receive a condensed design reminder (~100 tokens)
instead of full design guidelines (~2,750 tokens). New generation
prompts are unchanged. Saves ~1,650 tokens per edit request."
```

---

### Task 4: Manual smoke test

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test new generation**

Create a new conversation. Prompt: "Build a bakery landing page"
Verify: Model calls selectColorPalette, picks fonts, generates full HTML with design system.

**Step 3: Test edit**

In the same conversation, prompt: "Change the hero heading to red"
Verify: Model uses editDOM or editFile (not writeFiles). Maintains existing design system. Does not introduce hardcoded colors or break the layout.

**Step 4: Test structural edit**

Prompt: "Add a testimonials section with 3 customer reviews"
Verify: Model uses editFile or writeFiles appropriately. New section matches existing design tokens and style.
