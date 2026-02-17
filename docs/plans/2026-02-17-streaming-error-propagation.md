# Streaming Error Propagation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Propagate structured error information through the SSE stream so the client can show category-specific error messages with appropriate recovery actions.

**Architecture:** Serialize a `{ category, message, retryable }` JSON payload into the AI SDK's `errorText` field via `onError` callback. Client parses it back, attaches typed data to the error object, and renders category-aware UI. Post-processing warnings emit as custom data parts and display via sonner toasts.

**Tech Stack:** Vercel AI SDK 6 (`createUIMessageStream` onError), React 19, sonner (already installed)

**Design doc:** `docs/plans/2026-02-17-streaming-error-propagation-design.md`

---

### Task 1: Add error types and classifier to `src/lib/chat/errors.ts`

**Files:**
- Modify: `src/lib/chat/errors.ts`

**Step 1: Add types and classifier function**

Add below the existing `ChatRequestError` class:

```ts
import { APICallError, LoadAPIKeyError } from 'ai';

export type StreamErrorCategory =
  | 'rate_limit'
  | 'auth_error'
  | 'context_length'
  | 'provider_unavailable'
  | 'server_error';

export interface StreamErrorPayload {
  category: StreamErrorCategory;
  message: string;
  retryable: boolean;
}

const CONTEXT_LENGTH_PATTERNS = [
  /context.length/i,
  /max.*tokens/i,
  /token.limit/i,
  /too.many.tokens/i,
  /maximum.context/i,
  /input.too.long/i,
];

export function classifyStreamError(error: unknown): StreamErrorPayload {
  const message = error instanceof Error ? error.message : String(error);

  // AI SDK provider errors carry statusCode
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;

    if (status === 429) {
      return { category: 'rate_limit', message: 'Rate limited by the provider. Try again in a moment.', retryable: true };
    }
    if (status === 401 || status === 403) {
      return { category: 'auth_error', message: 'Invalid or expired API key. Check your provider settings.', retryable: false };
    }
    if (status === 502 || status === 503 || status === 504) {
      return { category: 'provider_unavailable', message: 'Provider is temporarily unavailable. Try again shortly.', retryable: true };
    }

    // Check message for context length even with other status codes
    if (CONTEXT_LENGTH_PATTERNS.some(p => p.test(message))) {
      return { category: 'context_length', message: 'Conversation is too long for this model. Start a new chat or switch to a model with a larger context window.', retryable: false };
    }
  }

  // Missing API key
  if (LoadAPIKeyError.isInstance(error)) {
    return { category: 'auth_error', message: 'API key not configured. Add it in settings.', retryable: false };
  }

  // Context length heuristic for non-APICallError errors
  if (CONTEXT_LENGTH_PATTERNS.some(p => p.test(message))) {
    return { category: 'context_length', message: 'Conversation is too long for this model. Start a new chat or switch to a model with a larger context window.', retryable: false };
  }

  // Fallback
  return { category: 'server_error', message: message || 'An unexpected error occurred.', retryable: true };
}
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors in `errors.ts`

**Step 3: Commit**

```bash
git add src/lib/chat/errors.ts
git commit -m "feat: add stream error classifier with 5 categories"
```

---

### Task 2: Wire `onError` into `createUIMessageStream` in `route.ts`

**Files:**
- Modify: `src/app/api/chat/route.ts:1` (import)
- Modify: `src/app/api/chat/route.ts:317` (add onError to createUIMessageStream)

**Step 1: Add import**

At line 3, change:
```ts
import { ChatRequestError } from '@/lib/chat/errors';
```
to:
```ts
import { ChatRequestError, classifyStreamError } from '@/lib/chat/errors';
```

**Step 2: Add `onError` to `createUIMessageStream`**

At line 317, change:
```ts
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
```
to:
```ts
    const stream = createUIMessageStream({
      onError: (error) => {
        console.error('[chat] Stream error:', error);
        return JSON.stringify(classifyStreamError(error));
      },
      execute: async ({ writer }) => {
```

**Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -E "route\.ts|error" | head -10`
Expected: No errors

**Step 4: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: serialize structured errors into SSE error chunks"
```

---

### Task 3: Emit post-processing warnings as data parts in `route.ts`

**Files:**
- Modify: `src/app/api/chat/route.ts:650-657` (post-processing catch block)

**Step 1: Replace silent catch with data part emission**

At lines 655-657, change:
```ts
            } catch (postProcessErr) {
              console.warn('[chat] Post-generation pipeline error (validateBlocks/extractComponents):', postProcessErr);
            }
```
to:
```ts
            } catch (postProcessErr) {
              console.warn('[chat] Post-generation pipeline error (validateBlocks/extractComponents):', postProcessErr);
              writer.write({
                type: 'data-postProcessWarning',
                data: { message: postProcessErr instanceof Error ? postProcessErr.message : 'Post-processing encountered an issue' },
                transient: true,
              });
            }
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | grep "route\.ts" | head -10`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: emit post-processing warnings as stream data parts"
```

---

### Task 4: Add `onError`, `onFinish` guard, and warning toast handler in `Builder.tsx`

**Files:**
- Modify: `src/components/Builder.tsx:1` (import toast)
- Modify: `src/components/Builder.tsx:162-224` (useChat options)

**Step 1: Add sonner import**

Add near the top imports (after line 7):
```ts
import { toast } from 'sonner';
```

**Step 2: Add `onError` callback to `useChat`**

After the `transport` option (line 172), add:
```ts
    onError: (error) => {
      try {
        const payload = JSON.parse(error.message);
        if (payload && typeof payload.category === 'string') {
          Object.assign(error, { streamError: payload });
        }
      } catch {
        // Not structured JSON — leave error.message as-is
      }
    },
```

**Step 3: Add `onData` handler for post-processing warnings**

In the existing `onData` callback (after line 182), add:
```ts
      if (part.type === 'data-postProcessWarning') {
        toast.warning('Post-processing had an issue', {
          description: (part.data as { message: string }).message,
        });
      }
```

**Step 4: Guard `onFinish` against errors**

Change the `onFinish` callback (line 184) from:
```ts
    onFinish: async ({ message }) => {
```
to:
```ts
    onFinish: async ({ message, isError }) => {
      if (isError) {
        streamingTextRef.current = '';
        return;
      }
```

The rest of onFinish remains unchanged. This early return prevents persisting broken content when the stream errored.

**Step 5: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | grep "Builder\.tsx" | head -10`
Expected: No errors

**Step 6: Commit**

```bash
git add src/components/Builder.tsx
git commit -m "feat: parse structured stream errors and guard onFinish"
```

---

### Task 5: Enhance `ErrorBanner` with category-aware messaging

**Files:**
- Modify: `src/features/prompt/error-banner.tsx`

**Step 1: Add `onOpenSettings` prop and category-aware rendering**

Replace the entire file:

```tsx
'use client';

import { AlertCircle, KeyRound, MessageSquarePlus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StreamErrorPayload } from '@/lib/chat/errors';

interface StreamError extends Error {
  streamError?: StreamErrorPayload;
}

interface ErrorBannerProps {
  error?: Error;
  onRetry: () => void;
  onOpenSettings?: () => void;
}

const CATEGORY_CONFIG: Record<string, { message: string; icon?: 'settings' | 'new-chat' }> = {
  rate_limit: { message: 'Rate limited. Try again in a moment.' },
  auth_error: { message: 'Invalid API key. Check your settings.', icon: 'settings' },
  context_length: { message: 'Conversation too long for this model.', icon: 'new-chat' },
  provider_unavailable: { message: 'Provider is temporarily unavailable.' },
};

export function ErrorBanner({ error, onRetry, onOpenSettings }: ErrorBannerProps) {
  if (!error) return null;

  const streamError = (error as StreamError).streamError;
  const config = streamError ? CATEGORY_CONFIG[streamError.category] : undefined;
  const displayMessage = config?.message ?? streamError?.message ?? error.message ?? 'Something went wrong';

  return (
    <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertCircle className="size-4 shrink-0" />
      <span className="flex-1">{displayMessage}</span>
      <div className="flex shrink-0 gap-1.5">
        {config?.icon === 'settings' && onOpenSettings && (
          <Button variant="outline" size="xs" onClick={onOpenSettings} className="gap-1">
            <KeyRound className="size-3" />
            Settings
          </Button>
        )}
        {config?.icon === 'new-chat' && (
          <Button variant="outline" size="xs" onClick={() => window.location.assign('/')} className="gap-1">
            <MessageSquarePlus className="size-3" />
            New Chat
          </Button>
        )}
        {(streamError?.retryable !== false) && (
          <Button variant="outline" size="xs" onClick={onRetry} className="gap-1">
            <RotateCcw className="size-3" />
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Pass `onOpenSettings` to ErrorBanner in `PromptPanel.tsx`**

In `src/components/PromptPanel.tsx`, find the `ErrorBanner` usage (line 193) and change:
```tsx
          <ErrorBanner error={error} onRetry={onRetry} />
```
to:
```tsx
          <ErrorBanner error={error} onRetry={onRetry} onOpenSettings={onOpenSettings} />
```

**Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit --pretty 2>&1 | grep -E "error-banner|PromptPanel" | head -10`
Expected: No errors

**Step 4: Verify build passes**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/features/prompt/error-banner.tsx src/components/PromptPanel.tsx
git commit -m "feat: category-aware error banner with contextual actions"
```

---

### Task 6: Manual smoke test

**No files changed — verification only.**

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test normal generation**

Send a prompt and confirm it generates normally — no regressions.

**Step 3: Test error display**

Temporarily set an invalid API key for a provider and send a prompt. Confirm:
- ErrorBanner shows "Invalid API key" messaging
- Settings button appears
- Retry button is hidden (retryable = false)

**Step 4: Confirm post-processing toast (if triggerable)**

This is hard to trigger manually. Confirm the toast infrastructure works by checking that sonner renders in the layout.

**Step 5: Revert test API key and confirm everything works normally again.**
