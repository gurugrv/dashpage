# Streaming & Post-Processing Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three issues where server-side post-processing mutations and edit tool states don't reach the client properly.

**Architecture:** (1) Stream a custom `data-postProcessedFiles` chunk after validateBlocks/extractComponents so the client receives post-processed HTML. (2) Whitelist `_components/` in artifact validation so component files persist. (3) Add `isEditing` state to useHtmlParser and show a shimmer overlay during edit tool execution.

**Tech Stack:** Next.js App Router, Vercel AI SDK 6 (createUIMessageStream), React 19, Tailwind CSS v4

---

### Task 1: Allow `_components/` paths in artifact validation

**Files:**
- Modify: `src/lib/parser/validate-artifact.ts:33-36`

**Step 1: Update the nested path check to whitelist `_components/`**

In `src/lib/parser/validate-artifact.ts`, replace the flat-path check (lines 33-36):

```typescript
// Old:
// No nested paths — flat filenames only
if (key.includes('/') || key.includes('\\')) {
  return { valid: false, reason: `Nested path "${key}" not allowed` };
}

// New:
// Allow _components/ prefix (one level deep), reject other nested paths
if (key.includes('/') || key.includes('\\')) {
  const isComponentFile = key.startsWith('_components/') && !key.includes('..') && key.split('/').length === 2;
  if (!isComponentFile) {
    return { valid: false, reason: `Nested path "${key}" not allowed` };
  }
}
```

**Step 2: Verify the build passes**

Run: `npm run build`
Expected: No type errors related to validate-artifact.ts

**Step 3: Commit**

```bash
git add src/lib/parser/validate-artifact.ts
git commit -m "fix: allow _components/ paths in artifact validation"
```

---

### Task 2: Stream post-processed files to the client

**Files:**
- Modify: `src/app/api/chat/route.ts:588-594`
- Modify: `src/components/Builder.tsx:164-171`

**Step 1: Add `data-postProcessedFiles` chunk in route.ts**

In `src/app/api/chat/route.ts`, after the `validateBlocks`/`extractComponents` calls (~line 592), add a stream write before the `data-buildProgress` finish write:

```typescript
// Post-generation: validate blocks and extract components on workingFiles
if (hasFileOutput && Object.keys(workingFiles).some(f => f.endsWith('.html'))) {
  validateBlocks(workingFiles);
  extractComponents(workingFiles);

  // Stream post-processed files to client so it has block IDs + extracted components
  writer.write({
    type: 'data-postProcessedFiles',
    data: workingFiles,
    transient: true,
  });
}
```

**Step 2: Handle the chunk in Builder.tsx onData**

In `src/components/Builder.tsx`, in the `onData` callback (~line 164), add a handler for the new chunk type. Add the `ProjectFiles` type import if not already present:

```typescript
onData: (part) => {
  if (part.type === 'data-buildProgress') {
    handleProgressData(part.data as BuildProgressData);
  }
  if (part.type === 'data-toolActivity') {
    handleToolActivity(part.data as ToolActivityEvent);
  }
  if (part.type === 'data-postProcessedFiles') {
    setFiles(part.data as ProjectFiles);
  }
},
```

Note: `setFiles` is already destructured from `useHtmlParser()` at line 86. It updates both `currentFiles` and `lastValidFiles` (plus their refs), ensuring `currentFilesRef.current` has the post-processed HTML when `onFinish` runs.

**Step 3: Verify the build passes**

Run: `npm run build`
Expected: No type errors

**Step 4: Commit**

```bash
git add src/app/api/chat/route.ts src/components/Builder.tsx
git commit -m "fix: stream post-processed files (block IDs, components) to client"
```

---

### Task 3: Add `isEditing` detection to useHtmlParser

**Files:**
- Modify: `src/hooks/useHtmlParser.ts`

**Step 1: Add the `detectEditInProgress` helper function**

In `src/hooks/useHtmlParser.ts`, add this function after `extractStreamingCode` (~after line 214):

```typescript
const EDIT_TOOLS = new Set(['editBlock', 'editFiles']);

/**
 * Detect whether an edit tool is currently executing (no output yet).
 * Returns true when editBlock/editFiles is in input-streaming or input-available state.
 */
function detectEditInProgress(parts: UIMessage['parts']): boolean {
  for (const part of parts) {
    if (!isToolPart(part)) continue;
    if (!EDIT_TOOLS.has(part.toolName ?? '')) continue;
    if (part.state === 'input-streaming' || part.state === 'input-available') {
      return true;
    }
  }
  return false;
}
```

**Step 2: Add `isEditing` state and expose it from the hook**

In the `useHtmlParser` function body, add state and update logic. After the `streamingCodeRef` declaration (~line 221):

```typescript
const [isEditing, setIsEditing] = useState(false);
```

In the `processMessages` callback, after the streaming code extraction block (~after line 263), add:

```typescript
// Detect in-progress edit tool execution
if (isLoading) {
  setIsEditing(detectEditInProgress(lastMessage.parts));
} else {
  setIsEditing(false);
}
```

Update the return statement (~line 306) to include `isEditing`:

```typescript
return { currentFiles, lastValidFiles, isGenerating, isEditing, streamingCode, processMessages, setFiles };
```

**Step 3: Verify the build passes**

Run: `npm run build`
Expected: No type errors (Builder.tsx doesn't use `isEditing` yet, so no breakage)

**Step 4: Commit**

```bash
git add src/hooks/useHtmlParser.ts
git commit -m "feat: add isEditing detection for edit tool execution state"
```

---

### Task 4: Wire `isEditing` through Builder to PreviewPanel

**Files:**
- Modify: `src/components/Builder.tsx:86,754-771`
- Modify: `src/components/PreviewPanel.tsx:17-28,247`

**Step 1: Destructure `isEditing` in Builder.tsx**

In `src/components/Builder.tsx` line 86, add `isEditing` to the destructured return:

```typescript
const { currentFiles, lastValidFiles, isGenerating, isEditing, streamingCode, processMessages, setFiles } = useHtmlParser();
```

**Step 2: Pass `isEditing` to PreviewPanel**

In `src/components/Builder.tsx`, in the PreviewPanel JSX (~line 754), add the prop:

```typescript
<PreviewPanel
  files={currentFiles}
  lastValidFiles={lastValidFiles}
  isGenerating={isGenerating || isBlueprintBusy}
  isEditing={isEditing}
  buildProgress={buildProgress}
  ...
```

**Step 3: Accept `isEditing` prop in PreviewPanel**

In `src/components/PreviewPanel.tsx`, add to the interface (~line 17):

```typescript
interface PreviewPanelProps {
  files: ProjectFiles;
  lastValidFiles: ProjectFiles;
  isGenerating: boolean;
  isEditing?: boolean;
  buildProgress?: BuildProgressState;
  ...
```

And destructure it in the function signature (~line 28):

```typescript
export function PreviewPanel({ files, lastValidFiles, isGenerating, isEditing, buildProgress, blueprintPhase, pageStatuses, blueprintPalette, streamingCode }: PreviewPanelProps) {
```

**Step 4: Add the shimmer overlay**

In `src/components/PreviewPanel.tsx`, find the existing loading overlay (~line 247):

```typescript
{isGenerating && hasContent && <PreviewLoadingOverlay buildProgress={buildProgress} blueprintPhase={blueprintPhase} pageStatuses={pageStatuses} />}
```

Add the edit overlay right after it (or as a sibling inside the same container):

```typescript
{isGenerating && hasContent && <PreviewLoadingOverlay buildProgress={buildProgress} blueprintPhase={blueprintPhase} pageStatuses={pageStatuses} />}

{isEditing && hasContent && (
  <div className="absolute inset-0 pointer-events-none">
    <div className="absolute inset-0 bg-primary/[0.03] animate-pulse" />
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-lg border border-muted-foreground/10 bg-background/90 px-3 py-1.5 shadow-md backdrop-blur-sm pointer-events-auto">
      <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
      <span className="text-xs font-medium text-muted-foreground">Applying edits...</span>
    </div>
  </div>
)}
```

Note: The `isEditing` overlay appears even when `isGenerating` overlay is also shown — that's fine since the existing overlay shows progress % and this adds the "Applying edits..." label at the bottom. If both are visible the edit indicator provides extra context. If you prefer mutual exclusivity, conditionally hide the edit overlay when `isGenerating && buildProgress` are active.

**Step 5: Verify the build passes**

Run: `npm run build`
Expected: No type errors, clean build

**Step 6: Commit**

```bash
git add src/components/Builder.tsx src/components/PreviewPanel.tsx
git commit -m "feat: show shimmer overlay during edit tool execution"
```

---

### Task 5: Manual integration test

**Steps:**

1. Start dev server: `npm run dev`
2. Open the app, create a new conversation
3. Generate a website with writeFiles (e.g. "Create a landing page for a coffee shop")
4. Verify block IDs are present: inspect iframe HTML, look for `data-block` attributes on semantic elements
5. Request an edit (e.g. "Change the hero headline to Welcome to Our Coffee Shop")
6. During edit execution, verify the shimmer overlay with "Applying edits..." appears
7. After edit completes, verify the preview updates with the new content
8. For multi-page: generate a blueprint site, verify `_components/` files persist in the conversation (reload the page, files should still be present)

**Step 1: Commit any final adjustments**

```bash
git add -A
git commit -m "fix: streaming post-processing and edit tool feedback"
```
