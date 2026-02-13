# Generation Tools Expansion Design

## Summary

Add 4 new tools to the AI generation pipeline: `searchImages`, `readFile`, `fetchUrl`, and `validateHtml`. Replaces the current proxy-based image approach with direct LLM-driven image selection. Modular architecture with separate tool factory files composed into a single `createWebsiteTools()` function.

## Current State

- 2 tools: `writeFiles` and `editFile` in a single `tools.ts` file
- Images: LLM constructs proxy URLs (`/api/images/proxy?q=keyword`), proxy picks a random Pexels result via hash
- No ability for LLM to read files, fetch external content, or validate its output

## New Tools

### 1. `searchImages`

**Purpose**: Replace proxy URL pattern. LLM searches Pexels, gets back image URLs with metadata, uses direct Pexels CDN URLs in generated HTML.

**Schema**:
```typescript
{
  query: z.string()        // "modern office workspace"
  count: z.number(1-5)     // default 3
  orientation: z.enum(["landscape", "portrait", "square"]).optional()
}
```

**Returns**: Array of `{ url, alt, photographer, width, height }`

**Implementation**: Calls existing `searchPhotos()` from `src/lib/images/pexels.ts`. Returns top results, LLM picks the best.

### 2. `readFile`

**Purpose**: Let LLM inspect current file state before editing. Critical for multi-step edits.

**Schema**:
```typescript
{
  file: z.string()  // "index.html"
}
```

**Returns**: `{ content, length }` or error if file not found.

**Implementation**: Reads from shared `workingFiles` closure (same as `editFile`).

### 3. `fetchUrl`

**Purpose**: Fetch external content (APIs, websites) to embed real data in generated sites.

**Schema**:
```typescript
{
  url: z.string().url()  // "https://api.example.com/data.json"
}
```

**Returns**: `{ content, contentType, truncated }` or error.

**Security**:
- Block private IPs: localhost, 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.169.254
- 10s timeout via AbortSignal
- 50KB response size cap
- Text content types only (text/*, application/json, application/xml)

### 4. `validateHtml`

**Purpose**: LLM validates its generated HTML and self-corrects errors.

**Schema**:
```typescript
{
  file: z.string()  // "index.html"
}
```

**Returns**: `{ valid, errorCount, errors: [{message, line, column, severity}] }`

**Implementation**: Uses `html-validate` library with relaxed config (allow CDN scripts, inline styles, Tailwind patterns).

## Architecture

```
src/lib/chat/tools/
  ├── index.ts              # createWebsiteTools() - composes all tool factories
  ├── file-tools.ts         # writeFiles, editFile, readFile (share workingFiles closure)
  ├── image-tools.ts        # searchImages (Pexels API via existing lib)
  ├── web-tools.ts          # fetchUrl (SSRF-protected)
  └── validation-tools.ts   # validateHtml (html-validate library)
```

Old `src/lib/chat/tools.ts` is replaced by the `tools/` directory.

## System Prompt Changes

- `base-rules.ts`: Remove proxy URL pattern (rule #6), replace with instruction to use `searchImages` tool
- `tool-output-format.ts`: Add descriptions for all 4 new tools
- `context-blocks.ts`: Update edit guidance to mention `readFile` for inspecting files before editing

## Route Changes

- `route.ts`: `stepCountIs(3)` → `stepCountIs(5)` (more tool calls needed per turn)
- Add tool-specific progress labels: "Searching images...", "Fetching URL...", "Validating..."

## Client Changes

None required. `useHtmlParser.ts` only extracts files from `writeFiles`/`editFile` tool outputs. Other tool outputs are silently ignored.

## Dependencies

- New: `html-validate` (npm package for offline HTML validation)
- Existing: `src/lib/images/pexels.ts` (reused by searchImages)

## Backward Compatibility

- Keep `/api/images/proxy` route for existing generated sites that use proxy URLs
- New generations will use direct Pexels CDN URLs instead

## Decisions

- **Modular architecture** over monolithic: separate files per tool category
- **Replace proxy** with searchImages tool: LLM picks images contextually
- **Light SSRF protection** for fetchUrl: block private IPs, timeout, size cap
- **Offline validation** via html-validate: no network dependency for validation
