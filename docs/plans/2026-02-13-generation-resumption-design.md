# Generation Resumption Design

## Problem

When a user navigates away or closes the page during site generation:
- **Single-page (chat):** Partial text + artifact are saved via `sendBeacon`, but auto-continue state is lost and resume is a blind "continue from where you left off" prompt with no context about what was already generated.
- **Multi-page (blueprint):** Everything is lost except the blueprint JSON. All generated components (header/footer), shared styles, and completed pages vanish. No resume is possible.

## Goals

1. **Blueprint mode:** True checkpoint-based resume. Already-completed pages are preserved; only remaining pages are regenerated.
2. **Chat mode:** Improved partial saves with artifact context, so the LLM can continue more accurately.
3. **Unified resume UX:** Automatic detection of interrupted state on conversation load with a clear Resume/Discard card.

## Research Summary

| Tool | Approach | Resumable? |
|------|----------|-----------|
| Bolt.new | Chat history in IndexedDB, no server persistence | No |
| v0.dev | Vercel AI SDK resumable streams (Redis), abort signal issues | Partial |
| Cursor | Git-based checkpoints, no agent state persistence | No (manual rollback) |
| Replit Agent | Full checkpoint system: workspace + conversation + DB snapshots | Yes (bidirectional) |
| LangGraph/Temporal | Durable execution with step-level checkpointing | Yes |

**Chosen pattern:** Checkpoint state machine (inspired by Replit), persisted in Postgres via Prisma. No Redis dependency.

## Database Schema

New `GenerationState` model:

```prisma
model GenerationState {
  id             String       @id @default(cuid())
  conversationId String       @unique @map("conversation_id")
  mode           String       // "chat" | "blueprint"
  phase          String       // Current phase

  // Chat mode
  autoSegment    Int?         @map("auto_segment")

  // Blueprint mode
  blueprintId    String?      @map("blueprint_id")
  componentHtml  Json?        @map("component_html")   // { headerHtml, footerHtml }
  sharedStyles   Json?        @map("shared_styles")     // { stylesCss, headTags }
  completedPages Json?        @map("completed_pages")   // Record<filename, html>
  pageStatuses   Json?        @map("page_statuses")     // PageGenerationStatus[]

  createdAt      DateTime     @default(now()) @map("created_at")
  updatedAt      DateTime     @updatedAt @map("updated_at")
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@map("generation_states")
}
```

Add to `Conversation`:
```prisma
generationState GenerationState?
```

**Lifecycle:** Created when generation starts. Updated at each checkpoint. Deleted on successful completion or user discard.

## Checkpoint Strategy

### Blueprint Mode (server-side checkpoints in API routes)

| Phase | Trigger | Data Written |
|-------|---------|-------------|
| `awaiting-approval` | Blueprint generated | GenerationState created |
| `generating-components` | Components API called | phase updated |
| `components-complete` | Components returned | `componentHtml: { headerHtml, footerHtml }` |
| `generating-pages` | Shared styles built, pages SSE started | `sharedStyles: { stylesCss, headTags }` |
| Each page completes | SSE `page-status: complete` | `completedPages[filename] = html`, `pageStatuses` updated |
| Pipeline complete | All pages done | GenerationState **deleted** |
| Pipeline error | Fatal error | `phase: 'error'`, partial completedPages preserved |

### Chat Mode (client-side + server-side)

| Trigger | Data Written |
|---------|-------------|
| Streaming starts | GenerationState created: `mode: 'chat'`, `phase: 'streaming'` |
| Page unload / stop | Existing partial message save + GenerationState `phase: 'interrupted'` |
| Auto-continue segment boundary | `autoSegment` counter updated |
| Generation completes | GenerationState **deleted** |

## Resume Detection

On conversation load (`handleSelectConversation`):

1. Fetch conversation + messages (existing)
2. Fetch `GET /api/conversations/[id]/generation-state`
3. If GenerationState exists with `phase !== 'idle'` → show ResumeCard
4. Determine mode + progress from state fields

## Resume Flow

### Blueprint Resume

1. Load GenerationState from DB
2. Restore client state: blueprint, componentHtml, sharedStyles, completedPages
3. Determine missing pages: `blueprint.pages.filter(p => !completedPages[p.filename])`
4. **If components missing:** Re-run `generateComponents()` then `generatePages()`
5. **If only pages missing:** Call `/api/blueprint/pages` with `skipPages: [completed filenames]`
6. Server skips completed pages, generates remaining
7. New page completions checkpoint normally
8. On full completion: merge all pages → `onFilesReady()` → delete GenerationState

### Chat Resume

1. Detect `isPartial` message + GenerationState
2. Show ResumeCard with "Continue Generation" / "Keep As-Is"
3. On "Continue": send conversation history including partial artifact HTML in context
4. Enhanced continue prompt: includes the current HTML state so LLM can pick up accurately
5. Delete GenerationState on completion or discard

## API Changes

### New: `GET /api/conversations/[id]/generation-state`
Returns GenerationState for the conversation, or 404 if none exists.

### New: `DELETE /api/conversations/[id]/generation-state`
Deletes GenerationState (used on discard or completion cleanup).

### Modified: `POST /api/blueprint/pages`
New optional body field: `skipPages?: string[]`
- Filters `blueprint.pages` to exclude completed filenames
- Adjusts `totalPages` and `completedPages` counters in SSE events

### Modified: `POST /api/blueprint/generate`
After creating blueprint, also creates GenerationState:
```typescript
await prisma.generationState.upsert({
  where: { conversationId },
  create: { conversationId, mode: 'blueprint', phase: 'awaiting-approval', blueprintId: dbBlueprint.id },
  update: { phase: 'awaiting-approval', blueprintId: dbBlueprint.id },
});
```

### Modified: `POST /api/blueprint/components`
After successful generation, updates GenerationState:
```typescript
await prisma.generationState.update({
  where: { conversationId },
  data: { phase: 'components-complete', componentHtml: { headerHtml, footerHtml } },
});
```

### Modified: `POST /api/blueprint/pages` (per-page checkpoint)
After each page completes, updates GenerationState:
```typescript
await prisma.generationState.update({
  where: { conversationId },
  data: {
    completedPages: { ...currentCompleted, [filename]: html },
    pageStatuses: updatedStatuses,
  },
});
```

On pipeline completion, deletes GenerationState:
```typescript
await prisma.generationState.delete({ where: { conversationId } });
```

## Client-Side Changes

### `useBlueprintGeneration` hook
- Add `resumeGeneration(state: GenerationState)` method
- Restores phase, blueprint, components, completedPages, pageStatuses from DB state
- Calls `generatePages()` with `skipPages` for remaining pages
- Add `beforeunload` handler during blueprint generation to save accumulated files

### `use-conversation-actions.ts`
- After fetching messages, also fetch GenerationState
- Expose `generationState` to Builder for resume card

### `use-streaming-persistence.ts`
- On `beforeunload` during chat streaming: also upsert GenerationState with `phase: 'interrupted'`
- On stop button: same behavior

### New: `ResumeCard` component
Replaces `InterruptedBanner` with a unified resume UI:

**Blueprint variant:**
```
+--------------------------------------------------+
|  Warning icon  Blueprint generation interrupted   |
|                                                   |
|  Progress: 3 of 7 pages completed                 |
|  [===-------]  42%                                |
|                                                   |
|  [Resume Generation]  [Discard & Start Over]      |
+--------------------------------------------------+
```

**Chat variant:**
```
+--------------------------------------------------+
|  Warning icon  Generation was interrupted         |
|                                                   |
|  Partial response saved. Continue generating?     |
|                                                   |
|  [Continue Generation]  [Keep As-Is]              |
+--------------------------------------------------+
```

## Edge Cases

1. **Multiple interruptions:** GenerationState is upserted (not created), so repeated interruptions just update the same record.
2. **User starts new generation on same conversation:** Old GenerationState is overwritten by new one.
3. **Conversation deleted:** Cascade delete removes GenerationState.
4. **Components succeed but pages fail partway:** completedPages has partial set, phase is 'generating-pages'. Resume picks up remaining pages.
5. **Blueprint approval never given (interrupted during blueprint generation):** GenerationState exists with `phase: 'generating-blueprint'` or `'awaiting-approval'`. Resume shows the blueprint card again.
6. **Chat auto-continue interrupted mid-segment:** `autoSegment` tracks which segment was active. Resume sends full accumulated text + continue prompt.

## Files to Create/Modify

**New files:**
- `prisma/migrations/XXXX_add_generation_state/migration.sql`
- `src/app/api/conversations/[id]/generation-state/route.ts`
- `src/components/ResumeCard.tsx`

**Modified files:**
- `prisma/schema.prisma` — Add GenerationState model + relation
- `src/app/api/blueprint/generate/route.ts` — Create GenerationState on blueprint generation
- `src/app/api/blueprint/components/route.ts` — Update GenerationState with component HTML
- `src/app/api/blueprint/pages/route.ts` — Per-page checkpoints + skipPages support + cleanup
- `src/hooks/useBlueprintGeneration.ts` — Add `resumeGeneration()`, `beforeunload` handler
- `src/features/builder/hooks/use-conversation-actions.ts` — Fetch GenerationState on conversation load
- `src/features/builder/hooks/use-streaming-persistence.ts` — Upsert GenerationState for chat mode
- `src/components/Builder.tsx` — Wire up ResumeCard, handle resume/discard actions
- `src/features/prompt/interrupted-banner.tsx` — Replace with or redirect to ResumeCard
