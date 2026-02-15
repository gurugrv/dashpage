# Live Code Streaming During Generation

## Problem

During `writeFiles` tool calls, the LLM generates HTML token by token but the AI SDK buffers tool inputs and delivers them atomically. Users stare at a static "Writing files..." progress indicator for 30-60 seconds with no visibility into what's being produced.

## Solution

Stream `tool-input-delta` events from the server to the client during `writeFiles` tool calls. Display the incoming HTML as a live scrolling code background behind the existing skeleton wireframe overlay.

## Scope

- Both normal chat generation (`/api/chat`) and blueprint page generation (`/api/blueprint/pages`)
- Live code background in the preview pane, behind existing skeleton animations
- Minimal syntax highlighting (CSS-only, 3 colors: tags, attributes, strings)

## Architecture

### Data Flow

```
LLM generates writeFiles tool input token by token
  → Server captures tool-input-delta events
  → Server parses streaming JSON to extract HTML content
  → Server sends data-codeDelta SSE events { toolCallId, delta, filename }
  → Client Builder.onData accumulates into streamingCode state
  → PreviewPanel renders <LiveCodeBackground> behind skeleton
  → On generation complete, streamingCode resets
```

### Server-Side JSON Parsing

The `writeFiles` tool input arrives as JSON chunks: `{"files":{"index.html":"<!DOCTYPE html>...`

Strategy — lightweight state machine (no full JSON parser):
1. Buffer deltas, scan for prefix `{"files":{"<filename>":"`
2. Once prefix detected, all subsequent deltas are HTML content (with JSON escaping)
3. Unescape `\n`, `\"`, `\\` on the fly before forwarding to client
4. For multi-file writes, detect value end (`"`) and new key start to switch filename
5. `tool-call` event signals completion

### Server Integration

**`/api/chat/route.ts`**: Use `onInputDelta` hook on `writeFiles` tool definition. Writes `data-codeDelta` events to the UIMessageStream writer.

**`/api/blueprint/pages/route.ts`**: Handle `tool-input-delta` case in existing `result.fullStream` loop. Send `data-codeDelta` via existing `sendEvent()`.

Both routes emit identical event shape for unified client handling.

### Client State

**Builder.tsx**:
- New state: `streamingCode: string` — accumulated HTML being generated
- `onData` handles `data-codeDelta`: appends delta to streamingCode
- On generation finish: resets streamingCode to `''`
- Passes streamingCode to PreviewPanel

### UI Component

**`<LiveCodeBackground>`** — `src/features/preview/live-code-background.tsx`:
- Position: Absolutely positioned behind skeleton wireframe (z-0, skeleton at z-1)
- Appearance: Dark semi-transparent background (bg-zinc-950/80), monospace ~11px
- Syntax highlighting: CSS-only, 3 colors — tags (muted blue), attributes (muted green), strings (muted orange)
- Behavior: Auto-scrolls to bottom, fades in on first delta, fades out on completion
- Performance: Uses ref + direct DOM manipulation for appending (not React re-renders per delta)

### Preview Pane Layering

```
z-0: LiveCodeBackground (dark, code streaming)
z-1: PreviewEmptyState skeleton (semi-transparent blocks overlay)
```

Skeleton blocks with semi-transparent fills create a frosted glass effect over the scrolling code.

## Non-Goals

- No rendering of partial HTML in the iframe (would show broken layouts)
- No full syntax highlighting library (Prism/Shiki) — CSS-only for zero dependencies
- No code editing/interaction — read-only display
