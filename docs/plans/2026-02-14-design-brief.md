# Design Brief for Single-Page Sites

## Problem

Single-page sites go straight to generation with no design planning. The AI picks colors, fonts, and mood ad-hoc during HTML generation, often producing generic-looking results. The full blueprint system is overkill for single pages (3-phase pipeline, approval step, component generation).

## Solution

A lightweight "design brief" phase: one fast `generateObject()` call to produce a structured design system (colors, fonts, mood, tone) before the main generation. The brief's tokens are injected as CSS custom properties and a mandatory system prompt section, so the AI follows a cohesive design instead of inventing one mid-stream.

## Routing Logic

Three-tier cascade on first message in `handleSubmit`:

```
First message?
  +-- Yes + detectMultiPageIntent() --> Full Blueprint pipeline (existing, unchanged)
  +-- Yes + not multi-page ----------> Design Brief + single-page generation
  +-- No (edit/follow-up) -----------> Direct generation (existing, unchanged)
```

No new detection function. Existing `detectMultiPageIntent` stays as the multi-page gatekeeper. Everything else on first message gets a design brief. Edits never get one.

## Design Brief Schema

Reuses `blueprintDesignSystemSchema` fields, adds `tone` and `primaryCTA`:

```typescript
const designBriefSchema = z.object({
  // Design tokens (same as blueprintDesignSystemSchema)
  primaryColor: z.string(),      // hex
  secondaryColor: z.string(),    // hex
  accentColor: z.string(),       // hex
  backgroundColor: z.string(),   // hex
  surfaceColor: z.string(),      // hex
  textColor: z.string(),         // hex
  textMutedColor: z.string(),    // hex
  headingFont: z.string(),       // Google Font name
  bodyFont: z.string(),          // Google Font name
  borderRadius: z.string(),      // e.g. "8px"
  mood: z.string(),              // e.g. "warm and inviting"

  // Content direction
  tone: z.string(),              // writing voice
  primaryCTA: z.string(),        // main call-to-action
});
```

## Generation Flow

```
User prompt
  --> POST /api/design-brief/generate  (new route)
      - generateObject() with designBriefSchema
      - Input: user prompt + curated color palettes (same as blueprint uses)
      - Model: user's selected model (same as main generation)
      - Output: JSON design brief
      - ~2-4 seconds
  --> generateSharedStyles(brief)  (existing utility, client-side)
      - Produces CSS custom properties + Google Fonts head tags
      - Zero new code - already takes a design system object
  --> POST /api/chat  (existing route, extended)
      - body gains: { designBrief, headTags, sharedStyles }
      - System prompt builder adds mandatory design tokens section
  --> Normal streaming generation with tools
```

## System Prompt Integration

New conditional section added when `designBrief` is present (first generation only):

```
## Design System (MANDATORY)
Use these exact design tokens. Do NOT invent your own colors or fonts.

CSS Custom Properties (already in <head> via styles.css):
  --color-primary: #...
  --color-secondary: #...
  ... (all 7 color roles)

Typography: [headingFont] for headings, [bodyFont] for body
Border Radius: [borderRadius]
Mood: [mood]
Tone: [tone]
Primary CTA: [primaryCTA]

Use Tailwind classes with these CSS variables:
  bg-[var(--color-primary)], text-[var(--color-text)], etc.
```

## Decisions

| Aspect | Decision | Rationale |
|---|---|---|
| Approval | None (auto) | Speed. Users want instant results for single pages. |
| Model | User's selected model | Simple. Brief schema is small, even large models return fast. |
| Persistence | None (ephemeral) | Not editable. Tokens live in the generated HTML. |
| Styles utility | Reuse `generateSharedStyles()` | Already produces CSS vars + head tags from a design system object. |
| Schema | Flat (no pages/sections/nav) | Single page doesn't need structural planning. |

## What This Does NOT Do

- No approval/editing UI for the brief
- No DB persistence of the brief
- No changes to the blueprint pipeline
- No changes to edit/follow-up flow
- No separate model config
