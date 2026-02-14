# Blueprint Tool Unification Design

**Date:** 2026-02-14
**Goal:** Make blueprint routes (pages and components) tool-based to match the single-page chat architecture, enabling consistent create/edit lifecycle across all generation modes.

## Problem

Blueprint page generation outputs raw HTML text; single-page chat uses `writeFiles`/`editFile`/`validateHtml` tools. This creates two architectures to maintain, no validation loop on initial multi-page generation, and fragile text extraction (code fence stripping, comment marker regex with 3 fallback layers).

## Approach: Full Tool Unification

Give blueprint routes the same tool set as the chat route. Models call `writeFiles` to produce output. Server extracts HTML from tool results instead of parsing text streams.

## Design

### 1. `createWebsiteTools` Signature Change

**File:** `src/lib/chat/tools/index.ts`

Change return type from `ToolSet` to `{ tools: ToolSet; workingFiles: ProjectFiles }` so callers can read accumulated file content after tool execution.

Update all callers:
- `src/app/api/chat/route.ts` — destructure `{ tools, workingFiles }`
- Blueprint routes — same destructuring

### 2. Pages Route

**File:** `src/app/api/blueprint/pages/route.ts`

- Replace `blueprintTools` (resource-only) with `createWebsiteTools({})` — full tool set per page
- In `fullStream` loop: track `writeFiles` tool results
- After stream completes: read `workingFiles[page.filename]` for completed HTML
- Send via SSE `page-status` event same as before — payload shape unchanged
- Remove `stripCodeFences()` function
- Pass tools on continuation segments (not just first)
- Expand `TOOL_LABELS` to include: `writeFiles: 'Writing page'`, `editDOM: 'Fixing issues'`, `editFile: 'Fixing issues'`, `validateHtml: 'Validating HTML'`
- Expand `summarizeToolInput` / `summarizeToolOutput` for new tool names

### 3. Components Route

**File:** `src/app/api/blueprint/components/route.ts`

- Replace `{ ...createIconTools() }` with `createWebsiteTools({})`
- After `generateText` completes: read `workingFiles['header.html']` and `workingFiles['footer.html']`
- Return `{ headerHtml, footerHtml }` — same response shape
- Remove `extractBlock()`, `extractTagBlock()`, markdown fence stripping, all fallback parsing (~50 lines)

### 4. Page System Prompt

**File:** `src/lib/blueprint/prompts/page-system-prompt.ts`

- Replace `<tool_workflow>` with writeFiles-based workflow:
  1. `searchImages` + `searchIcons` (parallel)
  2. `writeFiles` → generate complete HTML page
  3. `validateHtml` → check for errors
  4. `editDOM` or `editFile` → fix any errors
- Replace requirement line 171: list all available tools (writeFiles, editDOM, editFile, readFile, searchImages, searchIcons, webSearch, fetchUrl, validateHtml)
- Remove "Output ONLY the HTML" instruction
- Add tool selection guidance (editDOM vs editFile vs writeFiles)

### 5. Components System Prompt

**File:** `src/lib/blueprint/prompts/components-system-prompt.ts`

- Replace `<output_format>` comment marker instructions with: "Call writeFiles with two files: header.html containing the `<header>` element, footer.html containing the `<footer>` element"
- Replace `<available_tools>` with full tool list
- Remove rules about comment markers and markdown fences
- Keep rules about not outputting `<!DOCTYPE>`, `<html>`, `<head>` (still fragments)

### 6. Continuation Handling

`writeFiles` output is atomic — the model generates the entire HTML string as a tool argument before execution. Truncation at `maxOutputTokens` means the tool call was incomplete and never executed.

- After stream completes: check if `workingFiles[page.filename]` exists
- If missing (truncated): continuation prompt asks model to generate the complete page via `writeFiles`
- If present: page is complete, no continuation needed
- Simpler than current text concatenation — no stitching partial HTML

### 7. No Client-Side Changes

- `useBlueprintGeneration.ts` — SSE payload shape unchanged, no modifications needed
- `useHtmlParser.ts` — only used by chat route, unaffected

## Files Changed

| File | Change |
|------|--------|
| `src/lib/chat/tools/index.ts` | Return `{ tools, workingFiles }` |
| `src/app/api/chat/route.ts` | Destructure new return type |
| `src/app/api/blueprint/pages/route.ts` | Full tool set, extract from workingFiles, remove stripCodeFences |
| `src/app/api/blueprint/components/route.ts` | Full tool set, extract from workingFiles, remove extraction helpers |
| `src/lib/blueprint/prompts/page-system-prompt.ts` | Tool-based workflow, full tool list |
| `src/lib/blueprint/prompts/components-system-prompt.ts` | writeFiles instructions, full tool list |

## Dead Code Removed

- `stripCodeFences()` function
- `extractBlock()` / `extractTagBlock()` functions
- Comment marker parsing + 3 fallback layers
- "Unavailable tools" / "Output ONLY the HTML" prompt instructions

## Risk Areas

- **Model reliability with writeFiles for large HTML**: Mitigated by single-page mode already doing this successfully
- **`createWebsiteTools` signature change**: Touches chat route — verify no breakage
- **Continuation edge case**: Truncated `writeFiles` means tool never executed — retry strategy is simpler but must be tested
