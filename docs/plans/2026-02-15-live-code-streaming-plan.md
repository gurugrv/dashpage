# Live Code Streaming Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show live streaming HTML code in the preview pane background as the LLM generates `writeFiles` tool input, eliminating the dead time during code generation.

**Architecture:** For chat mode, leverage the AI SDK's existing `tool-input-delta` → `parsePartialJson` → `state: "input-streaming"` pipeline — the client already receives partially parsed tool input during streaming. We extract HTML from those streaming tool parts. For blueprint mode, handle `tool-input-delta` in the fullStream loop and forward as custom SSE events. A new `<LiveCodeBackground>` component renders the streaming code behind the existing skeleton wireframe.

**Tech Stack:** AI SDK v6 (existing), React refs for DOM performance, CSS-only syntax highlighting.

---

### Task 1: Extract streaming HTML from tool parts in useHtmlParser

**Files:**
- Modify: `src/hooks/useHtmlParser.ts`

**Context:** The AI SDK already sends tool part updates with `state: "input-streaming"` and partially parsed `input` (via `parsePartialJson` + `fixJson`) to the client during streaming. Currently, `extractFilesFromToolParts` only reads parts with `state: "output-available"`. We need a separate function that reads the partial HTML from `input-streaming` tool parts.

**Step 1: Add streaming code extraction function**

Add a new function `extractStreamingCode` after the existing `extractFilesFromToolParts` function (~line 156). This function scans tool parts for `state: "input-streaming"` with `toolName` containing `writeFiles` and extracts the partial HTML string from `input.files`:

```typescript
/**
 * Extract streaming HTML from in-progress writeFiles tool parts.
 * Returns the accumulated partial HTML string, or null if no streaming tool input.
 */
function extractStreamingCode(parts: UIMessage['parts']): string | null {
  for (const part of parts) {
    if (!isToolPart(part)) continue;
    if (part.state !== 'input-streaming') continue;
    if (part.toolName !== 'writeFiles') continue;

    const input = part.input as Record<string, unknown> | undefined;
    if (!input || !('files' in input) || typeof input.files !== 'object' || input.files === null) continue;

    // Extract the first file's content (partial HTML)
    const files = input.files as Record<string, string>;
    const values = Object.values(files);
    if (values.length > 0 && typeof values[0] === 'string') {
      return values[0];
    }
  }
  return null;
}
```

**Step 2: Add streamingCode to hook state and return value**

Add state for streaming code in `useHtmlParser`:

```typescript
const [streamingCode, setStreamingCode] = useState<string | null>(null);
```

Return it from the hook:

```typescript
return { currentFiles, lastValidFiles, isGenerating, streamingCode, processMessages, setFiles };
```

**Step 3: Call extractStreamingCode in processMessages**

In `processMessages`, after the existing extraction logic, add streaming code extraction. This should run on every call when `isLoading` is true:

```typescript
// Extract streaming code from in-progress writeFiles tool parts
if (isLoading) {
  const code = extractStreamingCode(lastMessage.parts);
  setStreamingCode(code);
} else {
  setStreamingCode(null);
}
```

Place this right after the `setIsGenerating(isLoading)` call at line 191, before the tool parts extraction.

**Step 4: Fix the processMessages caching to not skip streaming updates**

The current caching logic (lines 184-188) skips processing if `messageId`, `partsLength`, and `isLoading` haven't changed. But during streaming, the tool part's `input` content changes without the `parts` array length changing. We need to allow re-processing during loading:

Change the cache check from:
```typescript
if (cached && cached.messageId === lastMessage.id && cached.partsLength === partsLength && cached.isLoading === isLoading) {
  return;
}
```

To:
```typescript
if (cached && cached.messageId === lastMessage.id && cached.partsLength === partsLength && cached.isLoading === isLoading && !isLoading) {
  return;
}
```

This allows re-processing while loading (for streaming code updates) but still caches when loading is false.

**Performance note:** `processMessages` is called on every `messages` change from `useChat`. During `input-streaming`, the AI SDK updates the message's tool part on each delta, triggering re-renders. The streaming code extraction is lightweight (just object property access, no parsing). However, `setStreamingCode` will cause re-renders. To avoid excessive re-renders, we should only call `setStreamingCode` when the value actually changes — use a ref to compare:

```typescript
const streamingCodeRef = useRef<string | null>(null);

// In processMessages:
if (isLoading) {
  const code = extractStreamingCode(lastMessage.parts);
  if (code !== streamingCodeRef.current) {
    streamingCodeRef.current = code;
    setStreamingCode(code);
  }
} else if (streamingCodeRef.current !== null) {
  streamingCodeRef.current = null;
  setStreamingCode(null);
}
```

**Step 5: Verify**

Run: `npm run build`
Expected: Build succeeds with no type errors.

**Step 6: Commit**

```bash
git add src/hooks/useHtmlParser.ts
git commit -m "feat: extract streaming HTML from in-progress writeFiles tool parts"
```

---

### Task 2: Create LiveCodeBackground component

**Files:**
- Create: `src/features/preview/live-code-background.tsx`

**Context:** This component renders streaming HTML code as a dark background layer behind the skeleton wireframe. It uses ref-based DOM manipulation for performance (avoiding React re-renders on every delta).

**Step 1: Create the component**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface LiveCodeBackgroundProps {
  code: string | null;
  visible: boolean;
}

/**
 * Minimal syntax highlighter for HTML.
 * Applies 3 colors: tags (blue), attributes (green), strings (orange).
 * Returns HTML string with <span> wrappers.
 */
function highlightHtml(text: string): string {
  return text.replace(
    /(<\/?[\w-]+)|(\s[\w-]+=)|(\"[^\"]*\")|('([^']*)')/g,
    (match, tag, attr, dblStr, singleStr) => {
      if (tag) return `<span class="text-blue-400/70">${escapeHtml(tag)}</span>`;
      if (attr) return `<span class="text-emerald-400/60">${escapeHtml(attr)}</span>`;
      if (dblStr) return `<span class="text-amber-400/60">${escapeHtml(dblStr)}</span>`;
      if (singleStr) return `<span class="text-amber-400/60">${escapeHtml(singleStr)}</span>`;
      return escapeHtml(match);
    }
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function LiveCodeBackground({ code, visible }: LiveCodeBackgroundProps) {
  const codeRef = useRef<HTMLPreElement>(null);
  const prevLengthRef = useRef(0);

  // Update code content via DOM manipulation (not React re-renders)
  useEffect(() => {
    if (!codeRef.current || !code) return;

    // Only process new content (delta since last update)
    const newContent = code.slice(prevLengthRef.current);
    if (!newContent) return;
    prevLengthRef.current = code.length;

    // Highlight and append the new chunk
    const highlighted = highlightHtml(newContent);
    codeRef.current.insertAdjacentHTML('beforeend', highlighted);

    // Auto-scroll to bottom
    const container = codeRef.current.parentElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [code]);

  // Reset when code clears
  useEffect(() => {
    if (!code && codeRef.current) {
      codeRef.current.innerHTML = '';
      prevLengthRef.current = 0;
    }
  }, [code]);

  return (
    <div
      className={cn(
        'absolute inset-0 overflow-hidden rounded-md transition-opacity duration-500',
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
    >
      <div className="h-full overflow-auto bg-zinc-950/85 p-4">
        <pre
          ref={codeRef}
          className="font-mono text-[11px] leading-relaxed text-zinc-400/80 whitespace-pre-wrap break-all"
        />
      </div>
    </div>
  );
}
```

**Step 2: Verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/features/preview/live-code-background.tsx
git commit -m "feat: add LiveCodeBackground component for streaming code display"
```

---

### Task 3: Wire LiveCodeBackground into PreviewPanel

**Files:**
- Modify: `src/components/PreviewPanel.tsx`

**Context:** Add the `LiveCodeBackground` as a layer behind the skeleton wireframe in the preview pane. It should be visible when streaming code is available and the preview is in its empty/generating state.

**Step 1: Add streamingCode prop to PreviewPanelProps**

```typescript
interface PreviewPanelProps {
  files: ProjectFiles;
  lastValidFiles: ProjectFiles;
  isGenerating: boolean;
  buildProgress?: BuildProgressState;
  blueprintPhase?: BlueprintPhase;
  pageStatuses?: PageGenerationStatus[];
  blueprintPalette?: PaletteColors;
  streamingCode?: string | null;  // NEW
}
```

**Step 2: Import LiveCodeBackground**

```typescript
import { LiveCodeBackground } from '@/features/preview/live-code-background';
```

**Step 3: Add LiveCodeBackground in the render tree**

Inside the `relative flex flex-1` container div (line 197), add the `LiveCodeBackground` as the first child — before the wireframe empty state:

```tsx
{/* Live code background — visible behind skeleton during writeFiles generation */}
<LiveCodeBackground
  code={streamingCode ?? null}
  visible={!hasContent && isGenerating && !!streamingCode}
/>
```

This positions it behind the skeleton wireframe (`PreviewEmptyState`) which sits on top.

**Step 4: Destructure new prop**

Update the component signature to destructure `streamingCode`:

```typescript
export function PreviewPanel({ files, lastValidFiles, isGenerating, buildProgress, blueprintPhase, pageStatuses, blueprintPalette, streamingCode }: PreviewPanelProps) {
```

**Step 5: Verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add src/components/PreviewPanel.tsx
git commit -m "feat: wire LiveCodeBackground into PreviewPanel"
```

---

### Task 4: Pass streamingCode from Builder to PreviewPanel

**Files:**
- Modify: `src/components/Builder.tsx`

**Context:** Connect the `streamingCode` from `useHtmlParser` through to `PreviewPanel`.

**Step 1: Destructure streamingCode from useHtmlParser**

Change line 85 from:
```typescript
const { currentFiles, lastValidFiles, isGenerating, processMessages, setFiles } = useHtmlParser();
```
To:
```typescript
const { currentFiles, lastValidFiles, isGenerating, streamingCode, processMessages, setFiles } = useHtmlParser();
```

**Step 2: Pass to PreviewPanel**

Add `streamingCode` prop to the `<PreviewPanel>` JSX (around line 666-682):

```tsx
<PreviewPanel
  files={currentFiles}
  lastValidFiles={lastValidFiles}
  isGenerating={isGenerating || isBlueprintBusy}
  buildProgress={buildProgress}
  blueprintPhase={blueprintPhase}
  pageStatuses={pageStatuses}
  streamingCode={streamingCode}
  blueprintPalette={blueprint?.designSystem ? {
    ...
  } : undefined}
/>
```

**Step 3: Verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/components/Builder.tsx
git commit -m "feat: pass streamingCode from Builder to PreviewPanel"
```

---

### Task 5: Add streaming code to blueprint page generation

**Files:**
- Modify: `src/app/api/blueprint/pages/route.ts`
- Modify: `src/hooks/useBlueprintGeneration.ts`

**Context:** The blueprint route uses `result.fullStream` with manual SSE. We need to handle `tool-input-delta` events and forward the HTML content to the client. The client accumulates it and exposes it as streaming code.

**Step 1: Add tool-input-delta handling in pages route**

In the `for await (const part of result.fullStream)` loop (line 218), add handling for `tool-input-delta` after the existing `tool-input-start` case. We need a buffer to accumulate the JSON text and a parser to extract HTML:

```typescript
// Before the for-loop, add per-page state:
let writeFilesToolId: string | null = null;
let writeFilesJsonBuffer = '';
let writeFilesContentStarted = false;

// In the loop, add cases:
} else if (part.type === 'tool-input-start' && part.toolName === 'writeFiles') {
  writeFilesToolId = part.id;
  writeFilesJsonBuffer = '';
  writeFilesContentStarted = false;
  // ... existing tool-input-start handling
} else if (part.type === 'tool-input-delta' && part.id === writeFilesToolId) {
  writeFilesJsonBuffer += part.delta;
  // Detect when we've passed the JSON key prefix and are into the HTML content
  if (!writeFilesContentStarted) {
    // Look for the opening of the first string value: {"files":{"filename.html":"
    const match = writeFilesJsonBuffer.match(/"files"\s*:\s*\{\s*"[^"]+"\s*:\s*"/);
    if (match) {
      writeFilesContentStarted = true;
      const contentStart = writeFilesJsonBuffer.indexOf(match[0]) + match[0].length;
      const initialContent = writeFilesJsonBuffer.slice(contentStart);
      if (initialContent) {
        sendEvent({
          type: 'code-delta',
          filename: page.filename,
          delta: unescapeJson(initialContent),
        });
      }
    }
  } else {
    // Stream the raw delta (unescape JSON string escapes)
    sendEvent({
      type: 'code-delta',
      filename: page.filename,
      delta: unescapeJson(part.delta),
    });
  }
}
```

Add the `unescapeJson` helper at the top of the file (or in `stream-utils.ts`):

```typescript
/** Unescape JSON string escape sequences in streaming deltas */
function unescapeJson(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}
```

**Note on the delta unescaping:** Since the content is a JSON string value, the LLM outputs literal `\n` (two chars) which means "newline". We unescape these so the client gets actual newlines. The edge case is when a `\` is at the end of one delta and `n` is at the start of the next — handle by buffering incomplete escape sequences. For a simple first pass, the regex approach is sufficient; most deltas will contain complete escape sequences.

**Step 2: Handle code-delta events in useBlueprintGeneration**

In `useBlueprintGeneration.ts`, the SSE event processing loop, add handling for `code-delta` events. Expose a new `streamingCode` state:

Add state:
```typescript
const [blueprintStreamingCode, setBlueprintStreamingCode] = useState<string | null>(null);
const blueprintStreamingCodeRef = useRef('');
```

Handle the event:
```typescript
if (event.type === 'code-delta') {
  blueprintStreamingCodeRef.current += event.delta;
  setBlueprintStreamingCode(blueprintStreamingCodeRef.current);
}
```

Reset on page completion:
```typescript
if (event.type === 'page-status' && (event.status === 'complete' || event.status === 'error')) {
  blueprintStreamingCodeRef.current = '';
  setBlueprintStreamingCode(null);
}
```

Return `blueprintStreamingCode` from the hook.

**Step 3: Wire blueprint streaming code into Builder**

In `Builder.tsx`, destructure `blueprintStreamingCode` from `useBlueprintGeneration` and merge with chat streaming code:

```typescript
const effectiveStreamingCode = streamingCode ?? blueprintStreamingCode;
```

Pass `effectiveStreamingCode` to `PreviewPanel` as `streamingCode`.

**Step 4: Verify**

Run: `npm run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/app/api/blueprint/pages/route.ts src/hooks/useBlueprintGeneration.ts src/components/Builder.tsx
git commit -m "feat: stream writeFiles code deltas during blueprint page generation"
```

---

### Task 6: Manual testing and polish

**Files:** Various (fixes as needed)

**Step 1: Test normal chat generation**

1. Start dev server: `npm run dev`
2. Enter a prompt to generate a new website (e.g., "Build a landing page for a coffee shop")
3. Watch the preview pane — you should see:
   - Dark code background appears as soon as `writeFiles` input starts streaming
   - Skeleton wireframe overlays the code with frosted glass effect
   - Code auto-scrolls as new content arrives
   - When generation completes, code fades out and rendered preview appears

**Step 2: Test blueprint generation**

1. Enter a prompt that triggers blueprint mode (e.g., "Build a multi-page restaurant website with menu, about, and contact pages")
2. Verify code streams during each page's `writeFiles` call
3. Verify code resets between pages

**Step 3: Test edge cases**

- Interrupt generation mid-stream (click stop) — code should clear
- Edit mode (modify existing site) — code should stream for `writeFiles` but not for `editDOM`/`editFiles`
- Fast completion (small edit) — code should still appear briefly

**Step 4: Performance check**

- Monitor React DevTools for excessive re-renders during streaming
- Check that DOM manipulation approach (ref-based) keeps frame rate smooth
- If needed, throttle `setStreamingCode` updates (e.g., batch every 100ms)

**Step 5: Polish syntax highlighting**

Adjust colors if needed based on visual testing. The regex may need refinement for edge cases (self-closing tags, template literals, etc.).

**Step 6: Final commit**

```bash
git add -A
git commit -m "fix: polish live code streaming UX"
```

---

## Implementation Notes

### Key Discovery: AI SDK Already Streams Tool Input to Client

The AI SDK v6's `toUIMessageStream()` already handles `tool-input-delta` events internally:
1. Accumulates partial JSON text per tool call
2. Runs `parsePartialJson` → `fixJson` to repair incomplete JSON
3. Emits tool part updates with `state: "input-streaming"` and partially parsed `input`
4. Client's `useChat` receives these updates — message parts include the streaming tool part

This means **no server-side changes are needed for the chat route**. The client just needs to read `input.files` from tool parts with `state: "input-streaming"`.

### Performance Considerations

- `processMessages` runs on every `messages` change (frequent during streaming)
- Streaming code extraction is O(n) over parts — lightweight
- Using ref comparison to avoid unnecessary `setStreamingCode` calls
- `LiveCodeBackground` uses ref-based DOM manipulation — no React re-renders per delta
- The `highlightHtml` regex runs on delta chunks only (not full content)

### Blueprint vs Chat Routes

| Aspect | Chat Route | Blueprint Route |
|--------|-----------|-----------------|
| Stream type | UIMessageStream | Manual SSE |
| Tool input streaming | Built-in (AI SDK handles) | Manual (fullStream loop) |
| Client receives | Tool part with `input-streaming` state | Custom `code-delta` SSE event |
| Server changes | None | Add `tool-input-delta` handler |
| Client changes | Extract from tool parts | Accumulate from SSE events |
