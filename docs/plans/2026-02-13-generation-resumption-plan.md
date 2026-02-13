# Generation Resumption Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable full generation resumption for both chat (single-page) and blueprint (multi-page) modes when users navigate away or close the page during generation.

**Architecture:** Checkpoint state machine persisted in Postgres via a new `GenerationState` model. Blueprint API routes write checkpoints after each discrete step (components, each page). Client detects incomplete state on conversation load and offers resume/discard. Resume skips completed work and regenerates only what's missing.

**Tech Stack:** Prisma 7 (migration + model), Next.js 16 API routes, React 19 hooks, Tailwind CSS v4 + shadcn/ui for ResumeCard UI.

**Design doc:** `docs/plans/2026-02-13-generation-resumption-design.md`

**No test framework configured.** Validation is manual: `npm run build` + browser testing.

---

## Task 1: Database Schema — GenerationState Model

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add GenerationState model to schema**

In `prisma/schema.prisma`, add after the Blueprint model (after line 32) and before the Message model (line 34):

```prisma
model GenerationState {
  id             String       @id @default(cuid())
  conversationId String       @unique @map("conversation_id")
  mode           String       // "chat" | "blueprint"
  phase          String       // Current phase in the generation pipeline

  // Chat mode
  autoSegment    Int?         @map("auto_segment")

  // Blueprint mode
  blueprintId    String?      @map("blueprint_id")
  componentHtml  Json?        @map("component_html")
  sharedStyles   Json?        @map("shared_styles")
  completedPages Json?        @map("completed_pages")
  pageStatuses   Json?        @map("page_statuses")

  createdAt      DateTime     @default(now()) @map("created_at")
  updatedAt      DateTime     @updatedAt @map("updated_at")
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@map("generation_states")
}
```

Add the relation field to `Conversation` model (after line 18, after `blueprint Blueprint?`):

```prisma
  generationState GenerationState?
```

**Step 2: Run migration**

```bash
npx prisma migrate dev --name add_generation_state
```

Expected: Migration creates `generation_states` table. Prisma client regenerates.

**Step 3: Verify**

```bash
npx prisma generate
npm run build
```

Expected: Build succeeds with no type errors.

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add GenerationState model for generation resumption"
```

---

## Task 2: Generation State API Route

**Files:**
- Create: `src/app/api/conversations/[id]/generation-state/route.ts`

**Step 1: Create the route file**

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const state = await prisma.generationState.findUnique({
    where: { conversationId: id },
  });

  if (!state) {
    return NextResponse.json(null, { status: 404 });
  }

  return NextResponse.json(state);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  await prisma.generationState.deleteMany({
    where: { conversationId: id },
  });

  return NextResponse.json({ ok: true });
}
```

**Step 2: Verify**

```bash
npm run build
```

Expected: Build succeeds. Route is accessible at `/api/conversations/[id]/generation-state`.

**Step 3: Commit**

```bash
git add src/app/api/conversations/[id]/generation-state/route.ts
git commit -m "feat: add generation-state GET/DELETE API route"
```

---

## Task 3: Blueprint Generate Route — Create GenerationState

**Files:**
- Modify: `src/app/api/blueprint/generate/route.ts:67-73`

**Step 1: Add GenerationState creation after blueprint upsert**

After the `prisma.blueprint.upsert` call (line 71), add:

```typescript
    // Create generation state for resume tracking
    await prisma.generationState.upsert({
      where: { conversationId },
      create: {
        conversationId,
        mode: 'blueprint',
        phase: 'awaiting-approval',
        blueprintId: dbBlueprint.id,
      },
      update: {
        mode: 'blueprint',
        phase: 'awaiting-approval',
        blueprintId: dbBlueprint.id,
        componentHtml: null,
        sharedStyles: null,
        completedPages: null,
        pageStatuses: null,
      },
    });
```

This goes between line 71 (`});` closing the blueprint upsert) and line 73 (`return NextResponse.json(...)`).

**Step 2: Verify**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/app/api/blueprint/generate/route.ts
git commit -m "feat: create GenerationState on blueprint generation"
```

---

## Task 4: Blueprint Components Route — Checkpoint Components

**Files:**
- Modify: `src/app/api/blueprint/components/route.ts`

**Step 1: Add conversationId to request body interface**

At line 10-14, update the interface:

```typescript
interface ComponentsRequestBody {
  blueprint: Blueprint;
  provider: string;
  model: string;
  conversationId?: string;
}
```

**Step 2: Add prisma import**

After line 3 (`import { resolveApiKey } from '@/lib/keys/key-manager';`), add:

```typescript
import { prisma } from '@/lib/db/prisma';
```

**Step 3: Destructure conversationId from body**

At line 52, update destructuring:

```typescript
  const { blueprint, provider, model, conversationId } = body;
```

**Step 4: Add GenerationState checkpoint before each return**

Before the return at line 111 (`return NextResponse.json({ headerHtml: resolvedHeader, footerHtml: resolvedFooter });`), add:

```typescript
      if (conversationId) {
        await prisma.generationState.update({
          where: { conversationId },
          data: {
            phase: 'components-complete',
            componentHtml: { headerHtml: resolvedHeader, footerHtml: resolvedFooter },
          },
        }).catch(() => {}); // Non-critical if state doesn't exist
      }
```

Before the return at line 121 (`return NextResponse.json({ headerHtml, footerHtml });`), add the same pattern:

```typescript
    if (conversationId) {
      await prisma.generationState.update({
        where: { conversationId },
        data: {
          phase: 'components-complete',
          componentHtml: { headerHtml, footerHtml },
        },
      }).catch(() => {});
    }
```

**Step 5: Pass conversationId from client**

In `src/hooks/useBlueprintGeneration.ts`, update the `generateComponents` fetch body (around line 147-152):

```typescript
      const response = await fetch('/api/blueprint/components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blueprint: activeBlueprint,
          provider,
          model,
          conversationId, // ADD THIS
        }),
        signal: controller.signal,
      });
```

This requires adding `conversationId` as a parameter. Update `generateComponents` signature (line 130):

```typescript
  const generateComponents = useCallback(async (
    activeBlueprint: Blueprint,
    conversationId?: string,
  ): Promise<{ headerHtml: string; footerHtml: string } | null> => {
```

And update `approveAndGenerate` (line 296) to pass it:

```typescript
    const components = await generateComponents(activeBlueprint, conversationId);
```

**Step 6: Verify**

```bash
npm run build
```

**Step 7: Commit**

```bash
git add src/app/api/blueprint/components/route.ts src/hooks/useBlueprintGeneration.ts
git commit -m "feat: checkpoint component HTML in GenerationState"
```

---

## Task 5: Blueprint Pages Route — Per-Page Checkpoints + Skip Pages

**Files:**
- Modify: `src/app/api/blueprint/pages/route.ts`

**Step 1: Add skipPages to request body interface**

At line 18-26, add `skipPages`:

```typescript
interface PagesRequestBody {
  conversationId: string;
  provider: string;
  model: string;
  blueprint?: Blueprint;
  headerHtml?: string;
  footerHtml?: string;
  headTags?: string;
  skipPages?: string[];
}
```

**Step 2: Destructure skipPages and filter pages**

At line 39, add `skipPages` to destructuring:

```typescript
  const { conversationId, provider, model, headerHtml, footerHtml, headTags, skipPages } = body;
```

Replace lines 86-87 with skip-aware filtering:

```typescript
  const allPages = blueprint.pages;
  const totalPages = allPages.length;
  const skipSet = new Set(skipPages ?? []);
  const pages = allPages.filter(p => !skipSet.has(p.filename));
```

**Step 3: Initialize completedPages counter from skipped count**

Replace line 116:

```typescript
      let completedPages = totalPages - pages.length; // Start from already-completed count
```

**Step 4: Update shared styles checkpoint**

After line 88 (after pages filtering, before the stream), add a GenerationState update for shared styles:

```typescript
  // Checkpoint: entering page generation phase with shared styles
  if (headTags) {
    await prisma.generationState.update({
      where: { conversationId },
      data: {
        phase: 'generating-pages',
        sharedStyles: { headTags },
      },
    }).catch(() => {});
  }
```

**Step 5: Send initial pending events only for non-skipped pages**

Update the initial event loop (lines 98-107). Before it, send 'complete' events for skipped pages:

```typescript
      // Send status for already-completed (skipped) pages
      for (const page of allPages) {
        if (skipSet.has(page.filename)) {
          sendEvent({
            type: 'page-status',
            filename: page.filename,
            status: 'complete',
            totalPages,
            completedPages,
          });
        }
      }

      // Send pending status for remaining pages
      for (const page of pages) {
        sendEvent({
          type: 'page-status',
          filename: page.filename,
          status: 'pending',
          totalPages,
          completedPages,
        });
      }
```

**Step 6: Add per-page DB checkpoint after each page completes**

After line 204 (after the `sendEvent` for page-status complete), add:

```typescript
          // Checkpoint completed page to DB
          await prisma.generationState.update({
            where: { conversationId },
            data: {
              completedPages: {
                ...(await prisma.generationState.findUnique({
                  where: { conversationId },
                  select: { completedPages: true },
                }).then(s => (s?.completedPages as Record<string, string>) ?? {})),
                [page.filename]: stripCodeFences(fullPageText),
              },
            },
          }).catch(() => {});
```

Note: To avoid the extra DB read, we can accumulate locally. Better approach — use a local accumulator:

Add before the page loop (after `let hasErrors = false;`):

```typescript
      // Track completed pages for DB checkpointing
      const completedPagesMap: Record<string, string> = {};
```

Then the checkpoint becomes:

```typescript
          // Checkpoint completed page to DB
          completedPagesMap[page.filename] = stripCodeFences(fullPageText);
          await prisma.generationState.update({
            where: { conversationId },
            data: { completedPages: completedPagesMap },
          }).catch(() => {});
```

**Step 7: Delete GenerationState on pipeline complete**

After line 224 (after the final pipeline-status sendEvent), add:

```typescript
      // Clean up generation state on successful completion
      if (!hasErrors) {
        await prisma.generationState.delete({
          where: { conversationId },
        }).catch(() => {});
      }
```

**Step 8: Verify**

```bash
npm run build
```

**Step 9: Commit**

```bash
git add src/app/api/blueprint/pages/route.ts
git commit -m "feat: per-page checkpoints and skipPages support in blueprint pages route"
```

---

## Task 6: useBlueprintGeneration — skipPages + beforeunload + resumeGeneration

**Files:**
- Modify: `src/hooks/useBlueprintGeneration.ts`

**Step 1: Add skipPages parameter to generatePages**

Update the `generatePages` signature (line 172-177):

```typescript
  const generatePages = useCallback(async (
    conversationId: string,
    blueprintOverride?: Blueprint,
    sharedHtml?: { headerHtml: string; footerHtml: string },
    headTags?: string,
    skipPages?: string[],
  ) => {
```

**Step 2: Pass skipPages to fetch body**

In the fetch body (lines 203-211), add `skipPages`:

```typescript
        body: JSON.stringify({
          conversationId,
          provider,
          model,
          blueprint: activeBlueprint,
          headerHtml: sharedHtml?.headerHtml,
          footerHtml: sharedHtml?.footerHtml,
          headTags,
          skipPages,
        }),
```

**Step 3: Initialize page statuses with skip awareness**

Update lines 189-194:

```typescript
    const initialStatuses: PageGenerationStatus[] = activeBlueprint.pages.map((p) => ({
      filename: p.filename,
      status: skipPages?.includes(p.filename) ? 'complete' as const : 'pending' as const,
    }));
    setPageStatuses(initialStatuses);
```

**Step 4: Pre-populate filesAccumulator with already-completed pages for resume**

After `filesAccumulatorRef.current = {};` (line 187), add:

```typescript
    // Pre-populate accumulator with already-completed pages (for resume)
    if (skipPages && skipPages.length > 0 && resumeCompletedPages) {
      for (const [filename, html] of Object.entries(resumeCompletedPages)) {
        filesAccumulatorRef.current[filename] = html;
      }
    }
```

This requires adding a `resumeCompletedPages` parameter. Better approach: add a separate `resumeFromState` function.

**Step 5: Add resumeFromState function**

After the `approveAndGenerate` function (line 304), add:

```typescript
  const resumeFromState = useCallback(async (
    conversationId: string,
    state: {
      phase: string;
      blueprintData: Blueprint;
      componentHtml?: { headerHtml: string; footerHtml: string } | null;
      completedPages?: Record<string, string> | null;
    },
  ) => {
    const activeBlueprint = state.blueprintData;
    setBlueprint(activeBlueprint);

    const completedPageFiles = state.completedPages ?? {};
    const completedFilenames = Object.keys(completedPageFiles);

    // Pre-populate accumulator with already-completed pages
    filesAccumulatorRef.current = { ...completedPageFiles };

    if (!state.componentHtml) {
      // Need to regenerate components first, then pages
      const components = await generateComponents(activeBlueprint, conversationId);
      if (!components) return;

      const sharedStyles = generateSharedStyles(activeBlueprint.designSystem);
      sharedStylesRef.current = sharedStyles;

      await generatePages(conversationId, activeBlueprint, components, sharedStyles.headTags, completedFilenames);
    } else {
      // Components exist, just resume page generation
      setHeaderHtml(state.componentHtml.headerHtml);
      setFooterHtml(state.componentHtml.footerHtml);

      const sharedStyles = generateSharedStyles(activeBlueprint.designSystem);
      sharedStylesRef.current = sharedStyles;

      await generatePages(
        conversationId,
        activeBlueprint,
        state.componentHtml,
        sharedStyles.headTags,
        completedFilenames,
      );
    }
  }, [generateComponents, generatePages]);
```

**Step 6: Export resumeFromState**

Update the return (line 306-318):

```typescript
  return {
    phase,
    blueprint,
    pageStatuses,
    error,
    headerHtml,
    footerHtml,
    generateBlueprint,
    generatePages,
    approveAndGenerate,
    resumeFromState,
    cancel,
    reset,
  };
```

**Step 7: Verify**

```bash
npm run build
```

**Step 8: Commit**

```bash
git add src/hooks/useBlueprintGeneration.ts
git commit -m "feat: add resumeFromState and skipPages support to blueprint generation hook"
```

---

## Task 7: ResumeCard Component

**Files:**
- Create: `src/features/prompt/resume-card.tsx`

**Step 1: Create the ResumeCard component**

```typescript
'use client';

import { AlertTriangle, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ResumeCardProps {
  mode: 'chat' | 'blueprint';
  phase: string;
  completedPages?: number;
  totalPages?: number;
  isLoading: boolean;
  onResume: () => void;
  onDiscard: () => void;
}

export function ResumeCard({
  mode,
  phase,
  completedPages = 0,
  totalPages = 0,
  isLoading,
  onResume,
  onDiscard,
}: ResumeCardProps) {
  if (isLoading) return null;

  const isBlueprintMode = mode === 'blueprint';
  const progress = totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0;

  return (
    <div className="mx-4 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium text-foreground">
            {isBlueprintMode
              ? 'Multi-page generation was interrupted'
              : 'Generation was interrupted'}
          </p>
          {isBlueprintMode && totalPages > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{completedPages} of {totalPages} pages completed</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
          {!isBlueprintMode && (
            <p className="text-xs text-muted-foreground">
              Partial response was saved. You can continue generating or keep the current state.
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={onResume} className="gap-1.5">
              <Play className="size-3" />
              {isBlueprintMode ? 'Resume Generation' : 'Continue Generation'}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDiscard} className="gap-1.5 text-muted-foreground">
              <X className="size-3" />
              {isBlueprintMode ? 'Discard & Start Over' : 'Keep As-Is'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify**

```bash
npm run build
```

**Step 3: Commit**

```bash
git add src/features/prompt/resume-card.tsx
git commit -m "feat: add ResumeCard component for interrupted generation"
```

---

## Task 8: Conversation Actions — Fetch GenerationState on Load

**Files:**
- Modify: `src/features/builder/hooks/use-conversation-actions.ts`

**Step 1: Add GenerationState type**

Create a shared type for the GenerationState shape. Add to the existing types or create inline:

At the top of the file, after the imports (line 6), add:

```typescript
export interface ResumableGenerationState {
  id: string;
  conversationId: string;
  mode: 'chat' | 'blueprint';
  phase: string;
  autoSegment?: number | null;
  blueprintId?: string | null;
  componentHtml?: { headerHtml: string; footerHtml: string } | null;
  sharedStyles?: { stylesCss: string; headTags: string } | null;
  completedPages?: Record<string, string> | null;
  pageStatuses?: Array<{ filename: string; status: string }> | null;
}
```

**Step 2: Add callback to options interface**

In `UseConversationActionsOptions` (line 17-27), add:

```typescript
  onRestoreGenerationState?: (state: ResumableGenerationState | null) => void;
```

**Step 3: Destructure in hook**

In the function parameters (line 29-39), add `onRestoreGenerationState`:

```typescript
export function useConversationActions({
  service,
  activeConversationId,
  setActiveConversationId,
  setMessages,
  setFiles,
  resetProgress,
  setHasPartialMessage,
  resetBlueprint,
  onRestoreModel,
  onRestoreGenerationState,
}: UseConversationActionsOptions) {
```

**Step 4: Fetch GenerationState in handleSelectConversation**

After the messages loop (after line 112, before the catch), add:

```typescript
      // Check for interrupted generation state
      try {
        const stateRes = await fetch(`/api/conversations/${id}/generation-state`);
        if (stateRes.ok) {
          const state = await stateRes.json() as ResumableGenerationState;
          onRestoreGenerationState?.(state);
        } else {
          onRestoreGenerationState?.(null);
        }
      } catch {
        onRestoreGenerationState?.(null);
      }
```

**Step 5: Clear generation state on create and delete**

In `handleCreateConversation` (around line 40-49), add:

```typescript
    onRestoreGenerationState?.(null);
```

In `handleDeleteConversation` (around line 120-131), add in the `if (activeConversationId !== id)` block:

```typescript
    onRestoreGenerationState?.(null);
```

**Step 6: Add to dependency arrays**

Add `onRestoreGenerationState` to the dependency arrays of `handleSelectConversation`, `handleCreateConversation`, and `handleDeleteConversation`.

**Step 7: Verify**

```bash
npm run build
```

**Step 8: Commit**

```bash
git add src/features/builder/hooks/use-conversation-actions.ts
git commit -m "feat: fetch GenerationState on conversation load for resume detection"
```

---

## Task 9: Builder.tsx — Wire Up Resume UI and Handlers

**Files:**
- Modify: `src/components/Builder.tsx`

This is the largest integration task. It connects all the pieces.

**Step 1: Add state for generation state**

Near the other state declarations in Builder, add:

```typescript
import type { ResumableGenerationState } from '@/features/builder/hooks/use-conversation-actions';

const [resumableState, setResumableState] = useState<ResumableGenerationState | null>(null);
```

**Step 2: Pass onRestoreGenerationState to useConversationActions**

Where `useConversationActions` is called, add the new callback:

```typescript
  const { handleCreateConversation, handleSelectConversation, handleDeleteConversation } = useConversationActions({
    // ...existing options...
    onRestoreGenerationState: setResumableState,
  });
```

**Step 3: Add blueprint resume handler**

After `handleBlueprintRegenerate` (around line 496), add:

```typescript
  const handleResumeGeneration = useCallback(async () => {
    if (!resumableState || !activeConversationId) return;

    if (resumableState.mode === 'blueprint') {
      // Fetch the blueprint data from DB
      const blueprintRes = await fetch(`/api/blueprint/${activeConversationId}`);
      if (!blueprintRes.ok) {
        setResumableState(null);
        return;
      }
      const { blueprint: blueprintData } = await blueprintRes.json();

      await resumeFromState(activeConversationId, {
        phase: resumableState.phase,
        blueprintData,
        componentHtml: resumableState.componentHtml,
        completedPages: resumableState.completedPages,
      });
    } else {
      // Chat mode — use existing continue mechanism
      await handleContinueGeneration();
    }

    setResumableState(null);
  }, [resumableState, activeConversationId, resumeFromState, handleContinueGeneration]);

  const handleDiscardResume = useCallback(async () => {
    if (!activeConversationId) return;

    await fetch(`/api/conversations/${activeConversationId}/generation-state`, {
      method: 'DELETE',
    }).catch(() => {});

    setResumableState(null);
    setHasPartialMessage(false);
  }, [activeConversationId]);
```

**Step 4: Add GenerationState cleanup on blueprint completion**

In the blueprint completion effect (around line 535-545), before `resetBlueprint();`, add:

```typescript
    // Clean up generation state
    fetch(`/api/conversations/${convId}/generation-state`, {
      method: 'DELETE',
    }).catch(() => {});
```

**Step 5: Import and render ResumeCard**

Add import at top:

```typescript
import { ResumeCard } from '@/features/prompt/resume-card';
```

In the JSX, render the ResumeCard inside the PromptPanel area. Find where `InterruptedBanner` is rendered (it's passed as props to PromptPanel). Instead, render the ResumeCard above or inside the prompt panel area.

The cleanest approach is to render it before the PromptPanel content:

```tsx
{resumableState && (
  <ResumeCard
    mode={resumableState.mode}
    phase={resumableState.phase}
    completedPages={resumableState.completedPages ? Object.keys(resumableState.completedPages).length : 0}
    totalPages={resumableState.pageStatuses?.length ?? 0}
    isLoading={isLoading || blueprintPhase !== 'idle'}
    onResume={handleResumeGeneration}
    onDiscard={handleDiscardResume}
  />
)}
```

The existing `InterruptedBanner` can remain for backward compatibility with chat mode `hasPartialMessage` detection. However, when `resumableState` is present, the ResumeCard takes precedence. Add a condition to hide InterruptedBanner when ResumeCard is showing:

Update the `hasPartialMessage` prop passed to PromptPanel:

```typescript
hasPartialMessage={hasPartialMessage && !resumableState}
```

**Step 6: Destructure resumeFromState from useBlueprintGeneration**

Where `useBlueprintGeneration` is destructured, add `resumeFromState`:

```typescript
  const {
    phase: blueprintPhase,
    blueprint,
    pageStatuses,
    error: blueprintError,
    headerHtml,
    footerHtml,
    generateBlueprint,
    approveAndGenerate,
    resumeFromState,
    cancel: cancelBlueprint,
    reset: resetBlueprint,
  } = useBlueprintGeneration({...});
```

**Step 7: Verify**

```bash
npm run build
```

**Step 8: Commit**

```bash
git add src/components/Builder.tsx
git commit -m "feat: wire up ResumeCard with resume/discard handlers in Builder"
```

---

## Task 10: Chat Mode — GenerationState for Streaming Persistence

**Files:**
- Modify: `src/features/builder/hooks/use-streaming-persistence.ts`

**Step 1: Add GenerationState upsert on save**

In `savePartial` (lines 52-80), after the existing beacon/fetch call, add a GenerationState upsert:

```typescript
    // Also update generation state for resume detection
    const stateUrl = `/api/conversations/${convId}/generation-state`;
    const statePayload = JSON.stringify({
      mode: 'chat',
      phase: 'interrupted',
    });

    if (useSendBeacon && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(stateUrl, new Blob([statePayload], { type: 'application/json' }));
    } else {
      fetch(stateUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: statePayload,
        keepalive: true,
      }).catch(() => {});
    }
```

Wait — the generation-state route only has GET and DELETE. We need a PUT/POST for upsert. Two options:

**Option A:** Add a PUT handler to the generation-state route.
**Option B:** Do the upsert server-side in the partial message route.

Option B is cleaner — the partial route already handles the save, so add GenerationState upsert there.

**Revised Step 1: Add GenerationState upsert in partial message route**

In `src/app/api/conversations/[id]/messages/partial/route.ts`, after the message creation (line 31), add:

```typescript
  // Track interrupted state for resume detection
  await prisma.generationState.upsert({
    where: { conversationId: id },
    create: {
      conversationId: id,
      mode: 'chat',
      phase: 'interrupted',
    },
    update: {
      mode: 'chat',
      phase: 'interrupted',
    },
  }).catch(() => {}); // Non-critical
```

**Step 2: Clean up GenerationState on successful chat completion**

In the chat route (`src/app/api/chat/route.ts`), after the streaming loop completes successfully, delete any GenerationState. Find where the stream finishes and add:

```typescript
  // Clean up generation state on successful completion
  if (conversationId) {
    await prisma.generationState.delete({
      where: { conversationId },
    }).catch(() => {});
  }
```

The exact location depends on the chat route structure — it should go in the `onFinish` callback or after the auto-continue loop completes.

**Step 3: Verify**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/app/api/conversations/[id]/messages/partial/route.ts src/app/api/chat/route.ts
git commit -m "feat: track chat generation state for interrupted resume"
```

---

## Task 11: Integration Testing — Manual Verification

**No test framework available.** Verify manually:

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Test blueprint resume**

1. Create a new conversation
2. Switch to blueprint mode, enter a multi-page site prompt
3. Approve the blueprint
4. While pages are generating (after at least 1 completes), refresh the page
5. Re-select the conversation
6. Verify: ResumeCard appears with correct page count
7. Click "Resume Generation"
8. Verify: Only remaining pages are generated, completed pages preserved
9. Verify: Final result has all pages

**Step 3: Test blueprint discard**

1. Repeat steps 1-5
2. Click "Discard & Start Over"
3. Verify: GenerationState deleted, conversation returns to normal state

**Step 4: Test chat resume**

1. Create a new conversation in chat mode
2. Start generating a single-page site
3. Refresh the page mid-generation
4. Re-select the conversation
5. Verify: ResumeCard (or InterruptedBanner) appears
6. Click "Continue Generation"
7. Verify: LLM continues from partial state

**Step 5: Test clean completion**

1. Let a blueprint generation complete fully
2. Verify: No ResumeCard appears on reload
3. Let a chat generation complete fully
4. Verify: No interrupted state on reload

**Step 6: Final build check**

```bash
npm run build
```

Expected: Clean build, no type errors, no lint warnings.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: complete generation resumption feature"
```

---

## Task Summary

| # | Task | Files | Depends On |
|---|------|-------|-----------|
| 1 | Database schema | `prisma/schema.prisma` | — |
| 2 | Generation state API route | `src/app/api/.../generation-state/route.ts` | 1 |
| 3 | Blueprint generate checkpoint | `src/app/api/blueprint/generate/route.ts` | 1 |
| 4 | Components checkpoint | `src/app/api/blueprint/components/route.ts`, `useBlueprintGeneration.ts` | 1 |
| 5 | Pages checkpoint + skipPages | `src/app/api/blueprint/pages/route.ts` | 1 |
| 6 | Blueprint hook resume | `src/hooks/useBlueprintGeneration.ts` | 4, 5 |
| 7 | ResumeCard component | `src/features/prompt/resume-card.tsx` | — |
| 8 | Conversation actions fetch | `use-conversation-actions.ts` | 2 |
| 9 | Builder wiring | `src/components/Builder.tsx` | 6, 7, 8 |
| 10 | Chat mode tracking | `messages/partial/route.ts`, `chat/route.ts` | 1, 2 |
| 11 | Manual testing | — | All |
