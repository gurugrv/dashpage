# generateColorPalette Tool Design

**Date:** 2026-02-14
**Status:** Approved
**Approach:** Pure chroma.js (local algorithmic, no external API)

## Problem

The LLM freehands all hex color values during site generation. The system prompt provides color psychology rules and mandates CSS custom properties, but there's no algorithmic assistance. This leads to inconsistent harmony, occasional WCAG contrast failures, and unnecessary "make it look professional" iteration loops.

## Solution

A `generateColorPalette` tool that takes a base hex color + harmony type and returns a complete, harmonious palette mapped to the existing CSS custom property names, with WCAG contrast checks included.

## Tool Schema

### Input

```typescript
generateColorPalette({
  baseColor: string,        // Required. Hex color (e.g. "#1e40af")
  harmony: enum,            // Required. "complementary" | "analogous" | "triadic" | "split-complementary" | "tetradic"
  scheme: enum,             // Optional. "light" (default) | "dark"
})
```

### Output

```typescript
{
  success: true,
  palette: {
    primary: string,        // baseColor (or closest harmonious adjustment)
    secondary: string,      // Derived from harmony method
    accent: string,         // Derived from harmony method (high contrast CTA color)
    bg: string,             // Scheme-dependent background
    surface: string,        // Scheme-dependent card/section background
    text: string,           // Scheme-dependent body text
    textMuted: string,      // Desaturated mid-tone for secondary text
  },
  contrast: {
    textOnBg: { ratio: number, level: "AAA" | "AA" | "FAIL" },
    textOnSurface: { ratio: number, level: "AAA" | "AA" | "FAIL" },
    primaryOnBg: { ratio: number, level: "AAA" | "AA" | "FAIL" },
    accentOnBg: { ratio: number, level: "AAA" | "AA" | "FAIL" },
  },
  harmony: string,          // Echo back harmony used
  scheme: string,           // Echo back scheme used
}
```

Property names map 1:1 to CSS vars: `primary` -> `--color-primary`, `secondary` -> `--color-secondary`, etc.

## Color Generation Algorithm

All operations in LCH color space via chroma.js for perceptual uniformity.

### Harmony Logic

| Harmony | Secondary | Accent |
|---------|-----------|--------|
| complementary | hue +180deg | hue +180deg adjusted lightness |
| analogous | hue +30deg | hue -30deg |
| triadic | hue +120deg | hue +240deg |
| split-complementary | hue +150deg | hue +210deg |
| tetradic | hue +90deg | hue +180deg |

### Neutral Derivation (scheme-dependent)

| Property | Light scheme | Dark scheme |
|----------|-------------|-------------|
| bg | L:97, C:2, tinted toward primary hue | L:10, C:2, tinted toward primary hue |
| surface | L:100 (white) | L:15, C:3, tinted toward primary hue |
| text | L:15, C:3, tinted toward primary hue | L:93, C:2, tinted toward primary hue |
| textMuted | L:45, C:5, tinted toward primary hue | L:60, C:5, tinted toward primary hue |

Neutrals carry a subtle tint of the primary hue for cohesion (never pure gray).

### Contrast Check

chroma.js `contrast(color1, color2)` computes WCAG luminance ratio:
- >= 7.0 = "AAA"
- >= 4.5 = "AA"
- else = "FAIL"

## File Structure

### New Files

- `src/lib/colors/palette.ts` — Service layer: chroma.js harmony math, neutral derivation, contrast checks
- `src/lib/chat/tools/color-tools.ts` — Tool definition: thin wrapper calling the service (same pattern as image-tools.ts)

### Modified Files

- `src/lib/chat/tools/index.ts` — Add `...createColorTools()` to `createWebsiteTools()`
- `src/app/api/chat/route.ts` — Add progress label `generateColorPalette -> "Generating color palette..."`
- `src/app/api/blueprint/pages/route.ts` — Add `...createColorTools()` to blueprint tools
- `src/lib/prompts/sections/tool-output-format.ts` — Add color tool description
- `src/lib/prompts/sections/context-blocks.ts` — Update `buildFirstGenerationBlock()` to instruct LLM to call generateColorPalette
- `package.json` — Add `chroma-js` + `@types/chroma-js`

### Unchanged Files

- `design-quality.ts` — Color psychology rules remain as creative guidance
- `base-rules.ts` — Design system template unchanged (LLM still writes `:root {}`, now with tool-provided values)

## System Prompt Changes

### tool-output-format.ts

Add between Icon Tool and Web Tool sections:

```
**Color Tool:**
- **generateColorPalette** — Generate a harmonious color palette from a base color.
  Call BEFORE writing HTML to get your design system colors. Returns all CSS custom
  property values (primary, secondary, accent, bg, surface, text, textMuted) plus
  WCAG contrast checks. Pick the harmony type that matches the mood.
```

Add to Rules section:

```
- For colors: call generateColorPalette first, then use the returned values
  in your :root {} CSS custom properties. If any contrast check returns FAIL,
  adjust that color slightly and re-call.
```

### context-blocks.ts

Update `buildFirstGenerationBlock()` step 2 from:
> "Pick a specific color palette (name the colors) and font pairing"

To:
> "Call generateColorPalette with a base color and harmony type to get your design system colors, then pick a font pairing"

## Dependencies

- `chroma-js` (~14kB, zero dependencies, 1,759+ dependents)
- `@types/chroma-js` (dev dependency)

## Trade-offs

- +14kB server bundle (chroma-js)
- One more tool in the LLM's schema (simple, low overhead)
- Algorithmic palettes are "correct" but not ML-trained — the LLM's creative guidance in design-quality.ts compensates
- No external API: zero latency, zero cost, zero downtime risk
