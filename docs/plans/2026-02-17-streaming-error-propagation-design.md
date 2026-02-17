# Streaming Error Propagation Design

## Problem

Once HTTP 200 is sent and streaming begins, server errors inside `execute()` can only terminate the stream. The client receives a raw error message string with no structure — it cannot distinguish rate limits from auth failures from context-length errors. Post-processing errors are silently swallowed. `onFinish` fires on error and persists broken content.

## Approach

**Approach A: Custom `onError` in `createUIMessageStream`** — serialize a JSON payload (`{ category, message, retryable }`) into the SDK's `errorText` field. Client parses it back out. Minimal code, works within SDK conventions.

## Error Categories

| Category | Detection | Retryable | User Action |
|---|---|---|---|
| `rate_limit` | `APICallError` statusCode 429 | Yes | Retry |
| `auth_error` | statusCode 401/403 or `LoadAPIKeyError` | No | Open Settings |
| `context_length` | Message contains "context length" / "max tokens" | No | New Chat |
| `provider_unavailable` | statusCode 502/503/504 | Yes | Retry |
| `server_error` | Everything else | Yes | Retry |

## Components

### 1. Error Classifier — `src/lib/chat/errors.ts`

New exports alongside existing `ChatRequestError`:

- `StreamErrorCategory` type — union of 5 category strings
- `StreamErrorPayload` interface — `{ category, message, retryable }`
- `classifyStreamError(error: unknown): StreamErrorPayload` — checks `APICallError.isInstance()` for statusCode, message heuristics for context length, `LoadAPIKeyError` for auth

### 2. Server `onError` — `src/app/api/chat/route.ts`

Pass `onError` to `createUIMessageStream` that returns `JSON.stringify(classifyStreamError(error))`. The SDK puts this into the `errorText` SSE chunk automatically.

### 3. Post-processing warnings — `src/app/api/chat/route.ts`

Replace silent `console.warn` with `writer.write({ type: 'data-postProcessWarning', data: { message }, transient: true })` so client can show a toast.

### 4. Client `onError` — `src/components/Builder.tsx`

Add `onError` to `useChat` that parses JSON from `error.message`, attaches structured `streamError` property to the error object.

### 5. `onFinish` guard — `src/components/Builder.tsx`

Check `finishReason === 'error'` and skip persistence of broken content.

### 6. Warning toast — `src/components/Builder.tsx`

Handle `data-postProcessWarning` in `onData`, trigger `toast.warning()` via sonner (already installed in layout).

### 7. Enhanced ErrorBanner — `src/features/prompt/error-banner.tsx`

Read `error.streamError?.category` for category-specific messaging:
- `rate_limit` → "Rate limited. Try again in a moment." + Retry
- `auth_error` → "Invalid API key. Check your settings." + Settings button + Retry
- `context_length` → "Conversation too long." + New Chat button
- `provider_unavailable` → "Provider temporarily unavailable." + Retry
- `server_error` / fallback → raw message + Retry

## Files Changed

| File | Change |
|---|---|
| `src/lib/chat/errors.ts` | Add types + `classifyStreamError()` |
| `src/app/api/chat/route.ts` | `onError` callback + `data-postProcessWarning` emission |
| `src/components/Builder.tsx` | `onError` + `onFinish` guard + warning toast |
| `src/features/prompt/error-banner.tsx` | Category-aware messaging with contextual actions |
