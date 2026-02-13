# Font Picker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace plain text inputs for font selection in the blueprint card with a searchable combobox that shows live Google Fonts previews grouped by category.

**Architecture:** Extract curated font list into a shared data module. Build a `FontPicker` component on top of the existing `@base-ui/react` Combobox primitives (already in `src/components/ui/combobox.tsx`). Load all curated fonts via a single Google Fonts `<link>` on first picker open. Integrate into the blueprint card's edit mode.

**Tech Stack:** React 19, @base-ui/react Combobox, Google Fonts API, Tailwind CSS v4

---

### Task 1: Extract Curated Font List into Shared Data Module

**Files:**
- Create: `src/lib/fonts.ts`
- Modify: `src/lib/prompts/sections/design-quality.ts` (add comment referencing shared source)

**Step 1: Create `src/lib/fonts.ts`**

This file becomes the single source of truth for approved fonts. Both the system prompt and the FontPicker consume it.

```typescript
export interface FontCategory {
  label: string;
  fonts: string[];
}

export const FONT_CATEGORIES: FontCategory[] = [
  {
    label: 'Sans-serif',
    fonts: [
      'Inter', 'DM Sans', 'Work Sans', 'Lato', 'Open Sans', 'Source Sans 3',
      'Nunito Sans', 'Manrope', 'Barlow', 'Karla', 'IBM Plex Sans',
      'Public Sans', 'Figtree', 'Albert Sans', 'Mulish', 'Sora', 'Hanken Grotesk',
    ],
  },
  {
    label: 'Geometric sans',
    fonts: [
      'Montserrat', 'Poppins', 'Raleway', 'Space Grotesk', 'Outfit', 'Syne',
      'Libre Franklin', 'Archivo', 'Jost', 'Exo 2', 'Quicksand', 'Urbanist',
      'Red Hat Display', 'Epilogue',
    ],
  },
  {
    label: 'Serif',
    fonts: [
      'Playfair Display', 'Lora', 'Merriweather', 'EB Garamond', 'Cormorant',
      'Spectral', 'DM Serif Display', 'Literata', 'Source Serif 4', 'Alegreya',
    ],
  },
  {
    label: 'Slab serif',
    fonts: ['Roboto Slab', 'Arvo', 'Aleo', 'Bitter', 'Zilla Slab'],
  },
  {
    label: 'Display',
    fonts: ['Oswald', 'Anton', 'Bebas Neue', 'Abril Fatface', 'Bricolage Grotesque'],
  },
  {
    label: 'Monospace',
    fonts: ['Space Mono', 'JetBrains Mono', 'Fira Code', 'IBM Plex Mono', 'Azeret Mono'],
  },
];

/** Flat list of all approved font names */
export const ALL_FONTS: string[] = FONT_CATEGORIES.flatMap((c) => c.fonts);

/**
 * Build a Google Fonts CSS URL for the given font names.
 * Deduplicates and encodes names.
 */
export function buildGoogleFontsUrl(fonts: string[]): string {
  const unique = [...new Set(fonts)];
  const families = unique
    .map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

/** Google Fonts URL that loads ALL curated fonts (for picker previews) */
export const ALL_FONTS_URL = buildGoogleFontsUrl(ALL_FONTS);
```

**Step 2: Add reference comment in `design-quality.ts`**

At the top of the `<typography>` section's font list in `design-quality.ts`, the font names are in the prompt string and must stay as-is (LLM reads them). No structural change — just add a small code comment above the export so future editors know:

```typescript
// Font names in the prompt below must stay in sync with src/lib/fonts.ts FONT_CATEGORIES.
```

**Step 3: Commit**

```bash
git add src/lib/fonts.ts src/lib/prompts/sections/design-quality.ts
git commit -m "feat: extract curated font list into shared data module"
```

---

### Task 2: Create FontPicker Component

**Files:**
- Create: `src/features/blueprint/font-picker.tsx`

**Step 1: Create the FontPicker component**

This component wraps the existing `@base-ui/react` Combobox with font-specific behavior: grouped by category, live preview in actual typeface, loads Google Fonts on first open.

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxEmpty,
} from '@/components/ui/combobox';
import { FONT_CATEGORIES, ALL_FONTS_URL } from '@/lib/fonts';

// Track whether fonts CSS has been injected globally (across all pickers)
let fontsLoaded = false;

function ensureFontsLoaded() {
  if (fontsLoaded) return;
  fontsLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = ALL_FONTS_URL;
  document.head.appendChild(link);
}

interface FontPickerProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function FontPicker({ value, onValueChange, placeholder = 'Pick a font…', className }: FontPickerProps) {
  const [open, setOpen] = useState(false);

  // Load Google Fonts CSS on first open
  const hasOpened = useRef(false);
  useEffect(() => {
    if (open && !hasOpened.current) {
      hasOpened.current = true;
      ensureFontsLoaded();
    }
  }, [open]);

  return (
    <Combobox
      value={value}
      onValueChange={(val) => {
        if (val != null) onValueChange(val as string);
      }}
      open={open}
      onOpenChange={setOpen}
    >
      <ComboboxInput
        placeholder={placeholder}
        className={className}
        style={{ fontFamily: value || undefined }}
      />
      <ComboboxContent>
        <ComboboxList>
          <ComboboxEmpty>No fonts found</ComboboxEmpty>
          {FONT_CATEGORIES.map((category) => (
            <ComboboxGroup key={category.label}>
              <ComboboxLabel>{category.label}</ComboboxLabel>
              {category.fonts.map((font) => (
                <ComboboxItem key={font} value={font} style={{ fontFamily: font }}>
                  {font}
                </ComboboxItem>
              ))}
            </ComboboxGroup>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
```

Key decisions:
- `ensureFontsLoaded()` is a module-level singleton — injects the `<link>` once, shared across all FontPicker instances on the page.
- The trigger input itself renders in the selected font (`style={{ fontFamily: value }}`).
- Each dropdown item renders in its actual typeface for live preview.
- Uses existing `ComboboxGroup` + `ComboboxLabel` for category grouping.

**Step 2: Verify it renders**

Run: `npm run dev`
(No test framework — manual verification in next task after integration)

**Step 3: Commit**

```bash
git add src/features/blueprint/font-picker.tsx
git commit -m "feat: add FontPicker component with live Google Fonts preview"
```

---

### Task 3: Integrate FontPicker into Blueprint Card

**Files:**
- Modify: `src/features/blueprint/blueprint-card.tsx:1-8` (imports)
- Modify: `src/features/blueprint/blueprint-card.tsx:141-163` (typography section)

**Step 1: Add FontPicker import**

Add to the imports at the top of `blueprint-card.tsx`:

```typescript
import { FontPicker } from '@/features/blueprint/font-picker';
```

**Step 2: Replace text inputs with FontPicker**

Replace the typography edit section (lines 141-163) — the `{isEditing ? ... : ...}` block inside the Typography div:

```tsx
{/* Typography */}
<div className="flex items-center gap-2">
  <Type className="size-3.5 shrink-0 text-muted-foreground" />
  <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">Fonts</span>
  {isEditing ? (
    <div className="flex items-center gap-1 text-xs">
      <FontPicker
        value={designSource.headingFont}
        onValueChange={(v) => updateDesign('headingFont', v)}
        placeholder="Heading font"
        className="w-36"
      />
      <span className="text-muted-foreground">/</span>
      <FontPicker
        value={designSource.bodyFont}
        onValueChange={(v) => updateDesign('bodyFont', v)}
        placeholder="Body font"
        className="w-36"
      />
    </div>
  ) : (
    <span className="text-xs">
      <span className="font-medium">{designSystem.headingFont}</span>
      <span className="text-muted-foreground"> / </span>
      <span>{designSystem.bodyFont}</span>
    </span>
  )}
</div>
```

**Step 3: Verify in browser**

Run: `npm run dev`
1. Navigate to a blueprint card (start a multi-page generation or use an existing blueprint).
2. Click "Edit" on the blueprint card.
3. Click a font field — combobox should open with categorized fonts.
4. Type to filter (e.g., "Play" should show "Playfair Display").
5. Each font name should render in its actual typeface.
6. Selecting a font should update the value and close the dropdown.
7. Click "Done" — font should persist in the blueprint.

**Step 4: Commit**

```bash
git add src/features/blueprint/blueprint-card.tsx
git commit -m "feat: replace font text inputs with FontPicker combobox in blueprint card"
```

---

### Task 4: Style Refinements & Edge Cases

**Files:**
- Modify: `src/features/blueprint/font-picker.tsx` (as needed)

**Step 1: Test edge cases in browser**

Check:
- Both pickers open independently (no z-index conflicts)
- Dropdown positioning works when card is near viewport edge
- Search filtering works (type partial name)
- Selecting same font for both heading and body works
- View mode (non-editing) still shows font names correctly
- The "Done" button correctly saves updated fonts

**Step 2: Adjust sizing/styling if needed**

The ComboboxInput from shadcn uses `InputGroup` which has `h-9` by default. For the compact blueprint card context, we may need to override height. If the default size is too large for the inline layout, add a `size` variant or className overrides in the FontPicker. This is a judgment call during implementation — the goal is to match the compact feel of the current text inputs.

**Step 3: Run lint**

```bash
npm run lint
```

Fix any issues.

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix: font picker styling and edge case refinements"
```

---

### Task 5: Build Verification

**Step 1: Run production build**

```bash
npm run build
```

Ensure no TypeScript errors or build failures.

**Step 2: Fix any issues and commit if needed**
