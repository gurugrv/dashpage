# generateColorPalette Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `generateColorPalette` AI tool that generates harmonious color palettes from a base hex color using chroma.js, with WCAG contrast checks.

**Architecture:** New service layer (`src/lib/colors/palette.ts`) handles all color math via chroma.js in LCH color space. Thin tool wrapper (`src/lib/chat/tools/color-tools.ts`) follows the existing pattern (identical to image-tools/icon-tools). Integrated into both chat and blueprint routes.

**Tech Stack:** chroma-js, zod (already installed), ai SDK tool() (already installed)

---

### Task 1: Install chroma-js dependency

**Files:**
- Modify: `package.json`

**Step 1: Install chroma-js and its types**

Run:
```bash
npm install chroma-js && npm install -D @types/chroma-js
```

**Step 2: Verify installation**

Run: `npm run build`
Expected: Build succeeds (no code uses it yet, just confirming install)

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add chroma-js dependency for color palette generation"
```

---

### Task 2: Create color palette service layer

**Files:**
- Create: `src/lib/colors/palette.ts`

**Step 1: Create the service**

```typescript
import chroma from 'chroma-js';

// --- Types ---

export type HarmonyType =
  | 'complementary'
  | 'analogous'
  | 'triadic'
  | 'split-complementary'
  | 'tetradic';

export type SchemeType = 'light' | 'dark';

export type ContrastLevel = 'AAA' | 'AA' | 'FAIL';

export interface ContrastCheck {
  ratio: number;
  level: ContrastLevel;
}

export interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  surface: string;
  text: string;
  textMuted: string;
}

export interface PaletteResult {
  palette: ColorPalette;
  contrast: {
    textOnBg: ContrastCheck;
    textOnSurface: ContrastCheck;
    primaryOnBg: ContrastCheck;
    accentOnBg: ContrastCheck;
  };
  harmony: HarmonyType;
  scheme: SchemeType;
}

// --- Harmony offsets (hue rotation in degrees) ---

const HARMONY_OFFSETS: Record<HarmonyType, { secondary: number; accent: number }> = {
  complementary: { secondary: 180, accent: 180 },
  analogous: { secondary: 30, accent: -30 },
  triadic: { secondary: 120, accent: 240 },
  'split-complementary': { secondary: 150, accent: 210 },
  tetradic: { secondary: 90, accent: 180 },
};

// --- Core functions ---

function rotateHue(color: chroma.Color, degrees: number): chroma.Color {
  const [l, c, h] = color.lch();
  return chroma.lch(l, c, (h + degrees + 360) % 360);
}

function getContrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  return 'FAIL';
}

function checkContrast(fg: string, bg: string): ContrastCheck {
  const ratio = Math.round(chroma.contrast(fg, bg) * 100) / 100;
  return { ratio, level: getContrastLevel(ratio) };
}

function generateNeutrals(primaryHue: number, scheme: SchemeType) {
  // Neutrals carry a subtle tint of the primary hue for cohesion
  if (scheme === 'light') {
    return {
      bg: chroma.lch(97, 2, primaryHue).hex(),
      surface: chroma.lch(100, 0, primaryHue).hex(), // pure white
      text: chroma.lch(15, 3, primaryHue).hex(),
      textMuted: chroma.lch(45, 5, primaryHue).hex(),
    };
  }

  // dark scheme
  return {
    bg: chroma.lch(10, 2, primaryHue).hex(),
    surface: chroma.lch(15, 3, primaryHue).hex(),
    text: chroma.lch(93, 2, primaryHue).hex(),
    textMuted: chroma.lch(60, 5, primaryHue).hex(),
  };
}

function adjustAccentLightness(color: chroma.Color, scheme: SchemeType): chroma.Color {
  // Ensure accent has enough contrast against the background
  const [l, c, h] = color.lch();
  if (scheme === 'light') {
    // For light scheme, accent should be medium-dark (L: 35-55)
    const targetL = Math.min(Math.max(l, 35), 55);
    return chroma.lch(targetL, Math.max(c, 40), h);
  }
  // For dark scheme, accent should be medium-light (L: 55-75)
  const targetL = Math.min(Math.max(l, 55), 75);
  return chroma.lch(targetL, Math.max(c, 40), h);
}

// --- Main export ---

export function generatePalette(
  baseColor: string,
  harmony: HarmonyType,
  scheme: SchemeType = 'light',
): PaletteResult {
  const base = chroma(baseColor);
  const [, , primaryHue] = base.lch();
  const offsets = HARMONY_OFFSETS[harmony];

  const secondary = rotateHue(base, offsets.secondary);
  const rawAccent = rotateHue(base, offsets.accent);
  const accent = adjustAccentLightness(rawAccent, scheme);

  const neutrals = generateNeutrals(primaryHue, scheme);

  const palette: ColorPalette = {
    primary: base.hex(),
    secondary: secondary.hex(),
    accent: accent.hex(),
    ...neutrals,
  };

  return {
    palette,
    contrast: {
      textOnBg: checkContrast(palette.text, palette.bg),
      textOnSurface: checkContrast(palette.text, palette.surface),
      primaryOnBg: checkContrast(palette.primary, palette.bg),
      accentOnBg: checkContrast(palette.accent, palette.bg),
    },
    harmony,
    scheme,
  };
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds (unused module is fine, tree-shaken)

**Step 3: Commit**

```bash
git add src/lib/colors/palette.ts
git commit -m "feat: add color palette service with chroma.js harmony generation"
```

---

### Task 3: Create color tools wrapper

**Files:**
- Create: `src/lib/chat/tools/color-tools.ts`

**Step 1: Create the tool definition**

Follow the exact pattern from `image-tools.ts` and `icon-tools.ts`:

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { generatePalette } from '@/lib/colors/palette';

export function createColorTools() {
  return {
    generateColorPalette: tool({
      description:
        'Generate a harmonious color palette from a base color. Call BEFORE writing HTML to get your design system colors. Returns CSS custom property values (primary, secondary, accent, bg, surface, text, textMuted) plus WCAG contrast checks. Pick the harmony type that matches the mood.',
      inputSchema: z.object({
        baseColor: z
          .string()
          .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a valid hex color (e.g. "#1e40af")')
          .describe('Base brand color as hex (e.g. "#1e40af", "#e63946"). This becomes the primary color.'),
        harmony: z
          .enum(['complementary', 'analogous', 'triadic', 'split-complementary', 'tetradic'])
          .describe(
            'Color harmony method. complementary (bold contrast), analogous (subtle, cohesive), triadic (vibrant, balanced), split-complementary (nuanced contrast), tetradic (rich, complex).',
          ),
        scheme: z
          .enum(['light', 'dark'])
          .default('light')
          .describe('Color scheme. light: light backgrounds + dark text. dark: dark backgrounds + light text.'),
      }),
      execute: async ({ baseColor, harmony, scheme }) => {
        try {
          const result = generatePalette(baseColor, harmony, scheme);
          return {
            success: true as const,
            ...result,
          };
        } catch (error) {
          return {
            success: false as const,
            error: `Color palette generation failed: ${error instanceof Error ? error.message : 'Unknown error'}. Pick colors manually using your design system.`,
          };
        }
      },
    }),
  };
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/lib/chat/tools/color-tools.ts
git commit -m "feat: add generateColorPalette AI tool definition"
```

---

### Task 4: Register color tools in tool index

**Files:**
- Modify: `src/lib/chat/tools/index.ts`

**Step 1: Add import and spread**

Add import at line 6 (after icon-tools import):
```typescript
import { createColorTools } from './color-tools';
```

Add to the return object at line 16 (after `...createIconTools(),`):
```typescript
    ...createColorTools(),
```

Final file should read:
```typescript
import type { ToolSet } from 'ai';
import type { ProjectFiles } from '@/types';
import { createFileTools } from './file-tools';
import { createImageTools } from './image-tools';
import { createIconTools } from './icon-tools';
import { createColorTools } from './color-tools';
import { createWebTools } from './web-tools';
import { createValidationTools } from './validation-tools';

export function createWebsiteTools(currentFiles: ProjectFiles): ToolSet {
  // Mutable working copy accumulates changes across multi-step tool calls
  const workingFiles: ProjectFiles = { ...currentFiles };

  return {
    ...createFileTools(workingFiles),
    ...createImageTools(),
    ...createIconTools(),
    ...createColorTools(),
    ...createWebTools(),
    ...createValidationTools(workingFiles),
  };
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds — tool is now available in chat route

**Step 3: Commit**

```bash
git add src/lib/chat/tools/index.ts
git commit -m "feat: wire generateColorPalette tool into chat tools registry"
```

---

### Task 5: Add progress label in chat route

**Files:**
- Modify: `src/app/api/chat/route.ts:122-130`

**Step 1: Add progress label**

In the `progressLabels` object (around line 122-130), add after the `searchIcons` entry:

```typescript
                  generateColorPalette: 'Generating color palette...',
```

The updated object should be:
```typescript
                const progressLabels: Record<string, string> = {
                  writeFiles: 'Generating code...',
                  editFile: 'Applying edits...',
                  readFile: 'Reading file...',
                  searchImages: 'Searching for images...',
                  searchIcons: 'Searching for icons...',
                  generateColorPalette: 'Generating color palette...',
                  fetchUrl: 'Fetching content...',
                  validateHtml: 'Validating HTML...',
                };
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: add progress label for generateColorPalette tool"
```

---

### Task 6: Add color tools to blueprint pages route

**Files:**
- Modify: `src/app/api/blueprint/pages/route.ts:8-10,148-152`

**Step 1: Add import**

Add at line 10 (after icon-tools import):
```typescript
import { createColorTools } from '@/lib/chat/tools/color-tools';
```

**Step 2: Add to blueprint tools object**

In the `blueprintTools` object (around line 148-152), add `...createColorTools()`:

```typescript
      const blueprintTools = {
        ...createImageTools(),
        ...createIconTools(),
        ...createColorTools(),
        ...createWebTools(),
      };
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/app/api/blueprint/pages/route.ts
git commit -m "feat: add generateColorPalette to blueprint page generation tools"
```

---

### Task 7: Update system prompt — tool documentation

**Files:**
- Modify: `src/lib/prompts/sections/tool-output-format.ts`

**Step 1: Add color tool description and update rules**

Replace the entire `TOOL_OUTPUT_FORMAT_SECTION` export with:

```typescript
export const TOOL_OUTPUT_FORMAT_SECTION = `<tool_output_format>
You have these tools for building websites:

**File Tools:**
- **writeFiles** — Create or rewrite complete HTML files. Use for: new sites, major redesigns (>40% of page changes), adding new pages. Include ONLY new or rewritten files.
- **editFile** — Apply targeted search/replace edits to an existing file. Use for: small-medium changes. Each search must match EXACTLY including whitespace. Preferred when changes are localized.
- **readFile** — Read the current contents of a file. Use to inspect before editing, or verify changes after edits. Helpful for multi-step modifications.

**Image Tool:**
- **searchImages** — Search for stock photos from Pexels. Call BEFORE writing HTML that needs images. Returns image URLs you place directly in <img> tags. Use descriptive queries and pick the best result.

**Icon Tool:**
- **searchIcons** — Search for SVG icons from Lucide, Heroicons, Tabler, and Phosphor. Call BEFORE writing HTML that needs icons. Returns inline SVG markup you place directly in your HTML. Icons use currentColor so they inherit text color. Specify style: outline for UI chrome, solid for emphasis.

**Color Tool:**
- **generateColorPalette** — Generate a harmonious color palette from a base color. Call BEFORE writing HTML to get your design system colors. Returns all CSS custom property values (primary, secondary, accent, bg, surface, text, textMuted) plus WCAG contrast checks. Pick the harmony type that matches the mood: analogous (subtle, cohesive), complementary (bold contrast), triadic (vibrant), split-complementary (nuanced), tetradic (rich).

**Web Tool:**
- **fetchUrl** — Fetch content from a public URL. Use to retrieve API data, webpage text, or structured data to incorporate into the site. Supports HTML, JSON, XML, and plain text.

**Validation Tool:**
- **validateHtml** — Check an HTML file for syntax errors. Use after generating or editing to catch issues. Fix any errors with editFile.

Rules:
- Each HTML file must be a complete standalone document with its own <head>, Tailwind CDN, fonts, and design system
- Never split CSS/JS into separate files unless the user explicitly asks
- Never add pages unless the user explicitly asks
- Inter-page links: use plain relative filenames (href="about.html")
- For colors: call generateColorPalette first, then use the returned palette values in your :root {} CSS custom properties. If any contrast check returns FAIL, adjust the base color slightly and re-call.
- For images: call searchImages first, then use the returned URLs in your HTML
- Before calling a tool, explain what you'll build/change in 2-3 sentences
- After the tool call completes, add a 1-sentence summary of what was delivered
</tool_output_format>`;
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/lib/prompts/sections/tool-output-format.ts
git commit -m "feat: add generateColorPalette to system prompt tool documentation"
```

---

### Task 8: Update first generation prompt to use color tool

**Files:**
- Modify: `src/lib/prompts/sections/context-blocks.ts:49-62`

**Step 1: Update buildFirstGenerationBlock**

Replace lines 49-62 (the `buildFirstGenerationBlock` function) with:

```typescript
export function buildFirstGenerationBlock(isFirstGeneration: boolean): string {
  if (!isFirstGeneration) return '';

  return `\n<first_generation>
This is a NEW website. Before generating code, briefly:
1. State what you'll build and the overall vibe/mood
2. Call generateColorPalette with a base color and harmony type to get your design system colors, then pick a font pairing
3. Then use the writeFiles tool to generate the HTML with the design system defined FIRST in <style>, using the palette values in your :root {} custom properties

If the user's request explicitly names multiple pages, include all requested pages in a single writeFiles call. Each page must be a complete standalone HTML document. Otherwise, generate a single index.html.

Make a strong first impression — the design should feel polished and intentional, not templated.
</first_generation>`;
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Verify lint**

Run: `npm run lint`
Expected: No errors

**Step 4: Commit**

```bash
git add src/lib/prompts/sections/context-blocks.ts
git commit -m "feat: update first generation prompt to use generateColorPalette tool"
```

---

## Summary

| Task | Files | Action |
|------|-------|--------|
| 1 | package.json | Install chroma-js |
| 2 | src/lib/colors/palette.ts | Create service layer |
| 3 | src/lib/chat/tools/color-tools.ts | Create tool wrapper |
| 4 | src/lib/chat/tools/index.ts | Register in tool index |
| 5 | src/app/api/chat/route.ts | Add progress label |
| 6 | src/app/api/blueprint/pages/route.ts | Add to blueprint tools |
| 7 | src/lib/prompts/sections/tool-output-format.ts | Update tool docs |
| 8 | src/lib/prompts/sections/context-blocks.ts | Update first-gen prompt |

Total: 2 new files, 5 modified files, 8 commits.
