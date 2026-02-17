# Streaming & Post-Processing Fixes Design

Date: 2026-02-17

## Problem

Three related issues where server-side mutations and tool execution states don't properly reach the client:

1. **Post-processing mutations lost** — `validateBlocks` and `extractComponents` run after the SSE stream is consumed, mutating `workingFiles` but never sending changes back. Client has stale HTML without block IDs or extracted components.

2. **`_components/` paths rejected** — `validate-artifact.ts` blocks any path containing `/`, so `_components/main-nav.html` fails validation. `lastValidFiles` and DB `htmlArtifact` drop component files.

3. **No edit tool visual feedback** — `editBlock`/`editFiles` show no streaming preview (inputs are operation params, not HTML). Users see a frozen iframe until the tool completes.

## Fix 1: Stream Post-Processed Files

**Server** (`src/app/api/chat/route.ts`):
After `validateBlocks`/`extractComponents` mutate `workingFiles` (~line 592), write a custom data chunk:

```typescript
writer.write({
  type: 'data-postProcessedFiles',
  data: workingFiles,
  transient: true,
});
```

**Client** (`src/components/Builder.tsx`):
In `onData` handler, catch the new chunk type and update parser state:

```typescript
if (part.type === 'data-postProcessedFiles') {
  htmlParser.setFiles(part.data as ProjectFiles);
}
```

`setFiles` updates both `currentFiles` and `lastValidFiles` (plus their refs), so `onFinish` reads post-processed files from `currentFilesRef.current` for DB persistence.

## Fix 2: Allow `_components/` in Artifact Validation

**File** (`src/lib/parser/validate-artifact.ts`):
Whitelist `_components/` as a valid single-level prefix:

```typescript
if (key.includes('/') || key.includes('\\')) {
  const allowed = key.startsWith('_components/')
    && !key.includes('..')
    && key.split('/').length === 2;
  if (!allowed) {
    return { valid: false, reason: `Nested path "${key}" not allowed` };
  }
}
```

Constraints: one level deep only, no traversal.

## Fix 3: Edit Tool Visual Feedback (Lighter UX)

**Detection** (`src/hooks/useHtmlParser.ts`):
Add `detectEditInProgress(parts)` — returns `true` when any `editBlock`/`editFiles` part is in `input-streaming` or `input-available` state without a corresponding `output-available`. Expose as `isEditing` from the hook.

**UI** (`src/components/PreviewPanel.tsx`):
When `isEditing` is true, show a shimmer overlay on the iframe with "Applying edits..." label. CSS-only animation. Clears when edit tool output arrives.

## Files Changed

- `src/app/api/chat/route.ts` — add `data-postProcessedFiles` chunk after post-processing
- `src/lib/parser/validate-artifact.ts` — whitelist `_components/` prefix
- `src/hooks/useHtmlParser.ts` — add `isEditing` detection, expose from hook
- `src/components/Builder.tsx` — handle `data-postProcessedFiles` in `onData`
- `src/components/PreviewPanel.tsx` — shimmer overlay when `isEditing`
