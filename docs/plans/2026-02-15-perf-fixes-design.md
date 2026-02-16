# Performance Fixes Design

## Fix 1: Fast Fuzzy Matching in Edit Operations

### Problem
`tryFuzzyMatch()` in `apply-edit-operations.ts` uses a sliding-window Levenshtein approach that makes ~3.7M distance calculations for a 1k search pattern in a 10k file (400 window sizes * ~9,200 positions each). This blocks 200ms-5s during streaming UI updates.

`findBestMatchForError()` has the same issue but with step-based sampling (~500 positions) — still slow for large files.

### Solution
Replace with `approx-string-match-js` — Myers' bit-parallel algorithm for approximate substring search. Single-pass O((k/w)*n) complexity where k=maxErrors, w=32-bit word size, n=text length.

Expected performance: 50k file + 500 char pattern = ~20-50ms (vs seconds currently).

### Changes

**Install**: `npm install approx-string-match`

**Add type declaration** (`src/types/approx-string-match.d.ts`):
```typescript
declare module 'approx-string-match' {
  interface Match { start: number; end: number; errors: number; }
  export default function search(text: string, pattern: string, maxErrors: number): Match[];
}
```

**Rewrite `tryFuzzyMatch()`**:
- Convert threshold to maxErrors: `Math.floor(searchLen * (1 - threshold))`
- Call `search(source, search, maxErrors)` — returns all matches
- Pick best match (lowest errors), convert errors back to similarity score
- Return same `{ index, length, similarity }` interface

**Rewrite `findBestMatchForError()`**:
- Use same `search()` with higher maxErrors (70% threshold = 0.3 min similarity)
- Pick best match, map to `BestMatch` type
- Falls back to null if no matches

**What stays the same**:
- 5-tier cascade (exact -> whitespace -> token -> fuzzy -> auto-correct)
- Thresholds: 0.85 (fuzzy), 0.75 (auto-correct)
- All return types (`ApplyResult`, `BestMatch`, `MatchTier`)
- `applyEditOperations()` main function — only internal helpers change

### Edge Cases
- Short patterns (<10 chars): `maxErrors = Math.max(1, ...)`
- Empty strings: handled by existing guards
- Unicode: Myers works on UTF-16 code units (same as current Levenshtein approach)

---

## Fix 2: Streaming Blueprint Components Route

### Problem
`/api/blueprint/components` uses `generateText()` — blocks 15-30s with zero progress feedback. Users think the app is frozen during component generation.

### Solution
Convert to `streamText()` with custom SSE events, matching the existing `/api/blueprint/pages` pattern.

### Server Changes (`src/app/api/blueprint/components/route.ts`)
- Replace `generateText()` with `streamText()`
- Create `ReadableStream` + SSE `sendEvent()` helper
- Iterate `result.fullStream`, emit events:
  - `tool-activity`: `{ toolCallId, toolName, status, label, detail }` per tool call
  - `component-status`: `{ status: 'generating' | 'complete' | 'error', headerHtml?, footerHtml? }`
- Extract `headerHtml`/`footerHtml` from `workingFiles` after stream ends
- DB update on completion (same as current)

### Client Changes (`src/hooks/useBlueprintGeneration.ts` — `generateComponents()`)
- Replace `await fetch().json()` with SSE stream reading
- Parse events the same way `generatePages()` does
- Surface tool activities for the components phase

### Shared Refactor
Extract from pages route into `src/lib/blueprint/stream-utils.ts`:
- `summarizeToolInput(toolName, input)`
- `summarizeToolOutput(toolName, output)`
- `TOOL_LABELS` constant

Both routes import from shared util. Future blueprint routes can reuse.

### SSE Event Format
```
data: {"type":"component-status","status":"generating"}

data: {"type":"tool-activity","toolCallId":"x","toolName":"writeFiles","status":"running","label":"Writing page"}

data: {"type":"tool-activity","toolCallId":"x","toolName":"writeFiles","status":"done","label":"Writing page","detail":"Wrote header.html, footer.html"}

data: {"type":"component-status","status":"complete","headerHtml":"...","footerHtml":"..."}
```

Error case:
```
data: {"type":"component-status","status":"error","error":"Model did not call writeFiles"}
```
