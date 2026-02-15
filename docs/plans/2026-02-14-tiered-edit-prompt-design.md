# Tiered System Prompt for Edit Mode

**Date:** 2026-02-14
**Status:** Approved

## Problem

The system prompt sends ~4,500 tokens of static content on every request, including ~1,650 tokens of design guidelines (typography lists, color palettes, creative framework, content rules) that are irrelevant during edits — the existing HTML already embodies these choices.

## Solution

Two-tier prompt: full design guidance for new generation, condensed reminder for edits.

### Changes

**1. `src/lib/prompts/sections/design-quality.ts`**
- Export new `EDIT_DESIGN_REMINDER` constant (~100 tokens)
- Covers anti-regression guardrails only: design tokens, hover states, spacing, no hardcoded colors

**2. `src/lib/prompts/sections/base-rules.ts`**
- `getBaseRulesSection(isFirstGeneration: boolean)` — includes full `DESIGN_QUALITY_SECTION` for new gen, `EDIT_DESIGN_REMINDER` for edits
- `<rules>` and `<design_system>` blocks always included (model needs :root vars and Tailwind CDN context)

**3. `src/lib/prompts/system-prompt.ts`**
- Pass `isFirstGeneration` to `getBaseRulesSection()`
- Conditionally include `UI_UX_GUIDELINES_SECTION` only for new generation

### Token Impact

| Scenario | Before | After | Saved |
|---|---|---|---|
| Edit (static portion) | ~2,700 tok | ~1,050 tok | ~1,650 tok (61%) |
| Edit (with 8KB HTML) | ~4,750 tok | ~3,100 tok | ~1,650 tok (35%) |
| New generation | ~4,500 tok | ~4,500 tok | 0 (unchanged) |

### What stays the same

- `tool-output-format.ts` — always included (critical for edit tool selection)
- `context-blocks.ts` — unchanged (already conditional)
- `resolve-chat-execution.ts`, `route.ts`, all tools — unchanged

### Risk

Low. The model sees the full HTML with its design system during edits. The condensed reminder catches regression risks (hardcoded colors, removed vars, missing hover states). No API/client/tool changes.
