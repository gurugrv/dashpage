# Editable Blueprint Design System

## Overview

Make the blueprint's design system and content strategy user-configurable. After AI generates the blueprint and before "Generate Pages", users can edit colors, fonts, mood, and content strategy fields inline on the BlueprintCard.

## Scope

**Editable fields:**
- Design system: 7 colors (primary, secondary, accent, background, surface, text, textMuted), heading font, body font, mood
- Content strategy: tone, target audience, primary CTA, brand voice

**Excluded:** Border radius (hidden from user, AI-decided), pages/sections structure.

## Approach: Inline Edit Mode on BlueprintCard

The existing `BlueprintCard` gains an edit/view toggle. No new modals or dialogs.

### View Mode (current)
Read-only display with buttons: "Edit", "Generate Pages", "Regenerate", "Cancel".

### Edit Mode
Same card layout, fields become interactive:
- **Colors**: Each circle becomes clickable. Opens a `Popover` with a hex text input. Circle updates live as user types.
- **Fonts**: Heading/body font labels become plain text `<input>` fields (free-text, any Google Font name).
- **Mood, tone, audience, CTA, brand voice**: Each becomes an inline text `<input>`.
- **Visual treatment**: Subtle bottom border or light background on inputs to indicate editability.
- **Buttons**: "Edit" swaps to "Done". "Generate Pages" disabled while editing. "Regenerate" and "Cancel" remain.

### State Flow
1. User clicks "Edit" → local draft state initialized from current blueprint
2. User modifies fields → local draft updates
3. User clicks "Done" → `onUpdate(draft)` pushes to hook + PATCH to DB
4. User clicks "Generate Pages" → uses updated blueprint

## Data Flow

### New: `updateBlueprint()` in `useBlueprintGeneration` hook
- Calls `setBlueprint(updated)` to update React state
- Fires `PATCH /api/blueprint/[conversationId]` (fire-and-forget) to persist edits

### New: PATCH endpoint on `/api/blueprint/[conversationId]/route.ts`
- Updates `Blueprint.data` JSON in DB
- Simple upsert, no validation beyond what Zod provides

### Existing (unchanged)
- `approveAndGenerate()` already receives blueprint as parameter — picks up edits naturally
- `generateSharedStyles()` is deterministic from design system — edits flow through automatically
- Blueprint already persisted to DB after AI generation (survives navigation)

## Component Changes

### `BlueprintCard` (modify existing)
- New props: `onUpdate: (blueprint: Blueprint) => void`
- New local state: `isEditing: boolean`, `draft: Blueprint`
- Each section renders edit or view mode based on `isEditing`
- ~120 lines → ~250 lines estimated. No sub-component extraction needed yet.

### New shadcn component needed
- `Popover` (for color picker popovers on color circles)

## Files to Change

1. `src/features/blueprint/blueprint-card.tsx` — Add edit mode UI
2. `src/hooks/useBlueprintGeneration.ts` — Add `updateBlueprint()` function
3. `src/app/api/blueprint/[conversationId]/route.ts` — Add PATCH handler
4. `src/components/PromptPanel.tsx` — Pass `onUpdate` prop to BlueprintCard
5. `src/components/Builder.tsx` — Wire `updateBlueprint` from hook to PromptPanel
