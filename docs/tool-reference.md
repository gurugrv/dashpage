# Tool Reference

Complete reference for all AI tools available during website generation.

---

## Overview

AI generates HTML via tool calls, not raw text output. One unified tool set (`createWebsiteTools()`) serves all modes. Tools are defined in `src/lib/chat/tools/` — each file exports a factory function, combined in `index.ts`.

```typescript
function createWebsiteTools(
  currentFiles: ProjectFiles,
  options?: {
    toolSubset?: Set<string>;         // Restrict to named tools
    imageProvider?: 'pexels' | 'together'; // Default: 'pexels'
    imageModel?: string;              // Default: 'black-forest-labs/FLUX.1-dev'
  }
): { tools: ToolSet; workingFiles: ProjectFiles }
```

All tools share two mutable objects:
- `workingFiles` — accumulates changes across multi-step tool calls within a request
- `fileSnapshots` — parallel copy for rollback on total edit failure

---

## writeFiles

Create or overwrite multiple files at once. Primary tool for first-generation.

**File:** `src/lib/chat/tools/file-tools.ts`

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `files` | `Record<string, string>` | Yes | Map of filename to complete HTML content |
| `summary` | `string` | No | Shown to user |

### Returns

```typescript
// Success
{ success: true, fileNames: string[] }
// Failure
{ success: false, error: string, fatal?: true }
```

### Input Normalization

The `normalizeFilesInput` preprocessor handles common AI hallucination patterns:

- **Array format:** `[{ name, content }]` — extracts using `name`/`filename`/`file`/`path` and `content`/`html`/`body`/`source`/`code` keys
- **Nested objects:** `{ "services.html": { content: "..." } }` — extracts HTML from nested values
- **Directory wrappers:** `{ "_components": { "header": "<header>..." } }` — flattened to individual keys
- **Metadata keys:** Strips `version`, `id`, `type`, `name`, `title`, `description`, `metadata`, `schema` unless value contains `<`

### Key Normalization

- Strips wrapping quotes (`'"index.html"'` → `'index.html'`)
- Lowercases all keys
- Converts underscore paths (`_components_header_html` → `_components/header.html`)
- Adds `.html` extension to keys with no dot
- Converts underscore extensions (`styles_css` → `styles.css`)

### Guards

- Minimum 50 characters per `.html` file — rejects trivially small content
- Empty map on first call returns error; on second consecutive call returns `{ fatal: true }`
- If some files pass and some are too small, only valid files are written

---

## writeFile

Create or overwrite a single file. Flat variant of `writeFiles`, created to avoid `MALFORMED_FUNCTION_CALL` errors on some models (Gemini) with large Record schemas.

**File:** `src/lib/chat/tools/file-tools.ts`

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `filename` | `string` | Yes | File name |
| `content` | `string` | Yes | Complete HTML content |
| `summary` | `string` | No | Shown to user |

### Returns

```typescript
{ success: true, fileName: string }
{ success: false, error: string }
```

Same normalization and guards as `writeFiles`.

---

## editBlock

DOM manipulation via block ID or CSS selector. Primary editing tool for targeted changes. Uses Cheerio for HTML parsing.

**File:** `src/lib/chat/tools/block-tools.ts`

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | `string` | Yes | Target filename |
| `blockId` | `string` | No | `data-block` attribute value. Mutually exclusive with `selector`. |
| `selector` | `string` | No | CSS selector. Mutually exclusive with `blockId`. |
| `action` | `enum` | Yes | See actions table below |
| `content` | `string` | No | HTML content (for replace, replaceInner, insertBefore, insertAfter) |
| `value` | `string` | No | Text/attribute value (for setText, setAttribute) |
| `attr` | `string` | No | Attribute name (for setAttribute) |
| `className` | `string` | No | Class name (for addClass, removeClass) |

### Actions

| Action | Required Params | Behavior |
|--------|----------------|----------|
| `replace` | `content` | Replace entire element(s). For blockId: forces original blockId on first root element of new content. |
| `replaceInner` | `content` | Replace inner HTML of element(s) |
| `setText` | `value` | Set text content of element(s) |
| `setAttribute` | `attr`, `value` | Set attribute on element(s) |
| `addClass` | `className` | Add CSS class to element(s) |
| `removeClass` | `className` | Remove CSS class from element(s) |
| `remove` | *(none)* | Remove element(s) from DOM |
| `insertBefore` | `content` | Insert HTML before element |
| `insertAfter` | `content` | Insert HTML after element |

### Returns

```typescript
{ success: true, file: string, content: string, _fullContent?: string, redirected?: boolean }
{ success: false, error: string }
```

### Key Behavior

- **Component auto-redirect:** If `blockId` targets a block that exists in `_components/`, the edit is silently redirected to the component file. Response includes `{ redirected: true }`.
- **Selector mode guards:** Content-modifying actions with CSS selector require exactly 1 element match.
- **Output truncation:** Content over 20,000 chars is truncated to head + tail (50 lines each). `_fullContent` carries complete HTML for client parser.
- **Cheerio options:** `{ decodeEntities: false }` to preserve HTML entities.

---

## editFiles

Search/replace operations with 4-tier progressive matching.

**File:** `src/lib/chat/tools/file-tools.ts`

### Parameters

```typescript
{
  edits: Array<{
    file: string;
    replaceOperations: Array<{
      search: string;              // Exact substring to find
      replace: string;             // Replacement (empty = delete)
      expectedReplacements?: number; // Default 1, min 1
    }>;
  }>;
}
```

### Returns

```typescript
{
  success: true | false | 'partial';
  results: Array<{
    file: string;
    success: true | 'partial' | false;
    content?: string;           // Truncated summary for AI
    _fullContent?: string;      // Complete HTML for client parser
    error?: string;
    appliedCount?: number;
    failedOperations?: Array<{ index, error, bestMatch?, cascade? }>;
    matchTiers?: ('exact' | 'whitespace' | 'token' | 'fuzzy')[];
    bestMatch?: { text, surrounding?, similarity, line };
  }>;
}
```

### 4-Tier Matching Engine

Implemented in `src/lib/parser/edit-operations/apply-edit-operations.ts`.

**Tier 1 — Exact Match**
`source.indexOf(search)`. For multi-replace (`expectedReplacements > 1`), counts occurrences and requires exact count match.

**Tier 2 — Whitespace-Tolerant**
Normalizes whitespace (collapses runs to single space) while preserving `<script>` and `<style>` block whitespace. Maps normalized positions back to original source for correct replacement.

**Tier 3 — Token-Based**
Splits search into non-whitespace tokens, joins with `\s+` regex. Requires at least 3 tokens or search length >= 20 chars to prevent false positives.

**Tier 4 — Fuzzy Match (Levenshtein)**
Uses `approx-string-match` (Myers' bit-parallel algorithm). Threshold: 85% similarity. Only attempted when `expectedReplacements === 1`.

### Error Handling

- **Cascade detection:** If an operation's `search` contains text from a previous failed operation's `replace`, it's marked as cascade failure and skipped.
- **Mistake tracking:** After 2 consecutive failures on the same file, hints the AI to use `writeFiles` instead.
- **Best match reporting:** On failure, reports closest match (70% budget), surrounding context (5 lines, 300 chars), similarity %, and line number.
- **Partial success:** Even on partial failure, successfully applied changes are committed.

---

## readFile

Read file contents from the working project.

**File:** `src/lib/chat/tools/file-tools.ts`

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | `string` | Yes | Filename to read |
| `startLine` | `number` | No | 1-based start line |
| `endLine` | `number` | No | 1-based end line (inclusive) |

### Returns

```typescript
// Full read
{ success: true, file, content, length, totalLines }
// Range read
{ success: true, file, content, length, totalLines, readRange: { startLine, endLine } }
// Truncated (>20,000 chars)
{ success: true, file, content, length, totalLines, truncated: true }
// Not found
{ success: false, error: string }
```

Reads from `workingFiles` (live state, including all prior tool call modifications in this request).

---

## deleteFile

Delete a page from the project.

**File:** `src/lib/chat/tools/file-tools.ts`

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | `string` | Yes | Filename to delete |

### Returns

```typescript
{ success: true, file, remainingFiles: string[] }
{ success: false, error: string }
```

### Guards

- `index.html` is permanently protected
- `_components/` files: checks if any page still references the component via `<!-- @component:X -->` placeholder. Blocks deletion if referenced, listing the referencing pages.

---

## searchImages

AI image generation via Together.ai FLUX.1-dev.

**File:** `src/lib/chat/tools/image-tools.ts`

### Parameters

```typescript
{
  queries: Array<{
    query: string;         // 10-30 word detailed prompt
    count: number;         // 1-5, default 1
    orientation?: 'landscape' | 'portrait' | 'square';
  }>; // min 1, max 12
}
```

### Returns

```typescript
{
  success: true;
  totalImages: number;
  results: Array<{
    query: string;
    success: boolean;
    images?: Array<{
      url: string;       // Local /generated/ path
      alt: string;
      width: number;
      height: number;
    }>;
    error?: string;
  }>;
}
```

### Together.ai Implementation (`src/lib/images/together.ts`)

- **API:** `https://api.together.xyz/v1/images/generations`
- **Default model:** `black-forest-labs/FLUX.1-dev`
- **Other models:** `Rundiffusion/Juggernaut-Lightning-Flux`, `FLUX.1-schnell`, `FLUX.1.1-pro`
- **Dimensions:** landscape=1024x768, portrait=768x1024, square=1024x1024
- **Steps:** 4 for schnell/Lightning, 20 for others
- **Prompt enhancement:** Automatically appends `, professional photography, high resolution, sharp detail, beautiful lighting`
- **Multi-image:** When count > 1, each prompt gets `", angle N of M"`
- **Storage:** Images downloaded and saved to `public/generated/{uuid}.jpg`
- **Timeout:** 30 seconds per image
- **Cost:** $0.025/image (FLUX.1-dev), $0.003 (schnell), $0.002 (Juggernaut), $0.04 (1.1-pro)

### Duplicate Query Guard

Jaccard similarity (word-set intersection/union) against all previous queries. If similarity >= 0.6, the query is rejected with a suggestion to use a different subject.

---

## searchIcons

SVG icon search via local Iconify database.

**File:** `src/lib/chat/tools/icon-tools.ts`

### Parameters

```typescript
{
  queries: Array<{
    query: string;         // 1-3 word descriptive query
    count: number;         // 1-5, default 3
    style: 'outline' | 'solid'; // default 'outline'
  }>; // min 1, max 12
}
```

Input is preprocessed with `normalizeIconInput` which uses `jsonrepair` to fix malformed AI JSON.

### Returns

```typescript
{
  success: true;
  totalIcons: number;
  results: Array<{
    query: string;
    success: boolean;
    icons: Array<{
      name: string;    // Icon name within its set
      set: string;     // 'lucide' | 'heroicons' | 'tabler' | 'ph'
      svg: string;     // Complete SVG string, uses currentColor
      style: string;   // 'outline' | 'solid'
    }>;
    message?: string;  // When 0 results found
    error?: string;
  }>;
}
```

### Icon Search Engine (`src/lib/icons/iconify.ts`)

**Icon sets (priority order):**

| Set | Priority | Outline | Solid |
|-----|----------|---------|-------|
| Lucide | 1 | All (stroke-only) | N/A |
| Heroicons | 2 | Base name | `{name}-solid`, `{name}-20-solid` |
| Tabler | 3 | Base name | `{name}-filled` |
| Phosphor | 4 | Base name | `{name}-fill`, `{name}-bold` |

**Search scoring:**

| Match Type | Score |
|-----------|-------|
| Exact icon name | +100 |
| Lucide tag match | +60 |
| Full word in kebab name | +40 |
| Category/term match | +20 |
| Prefix match | +10 |
| Set priority bonus | `(5 - priority) * 2` |

**Deduplication:** Strips variant suffixes to get base name; only highest-scoring entry per `{set}:{baseName}` is kept.

**SVG rendering:** `@iconify/utils` at 24px height. All SVGs use `currentColor`.

**Cache:** LRU, max 500 entries.

---

## fetchUrl

Fetch and parse web content.

**File:** `src/lib/chat/tools/web-tools.ts`

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | `string` (URL) | Yes | Must be http:// or https:// |

### Returns

```typescript
{ success: true, content: string, contentType: string, length: number, truncated: boolean }
{ success: false, error: string }
```

### Security

**Blocked hosts:** `localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`, `metadata.google.internal`, `10.*`, `172.16-31.*`, `192.168.*`, `169.254.*`, `fd00:*`, `fe80:*`

**Allowed content types:** `text/html`, `text/plain`, `text/css`, `text/csv`, `text/xml`, `application/json`, `application/xml`, `application/rss+xml`, `application/atom+xml`

**Limits:** 10-second timeout, 50,000 char max response. User-Agent: `AIBuilder/1.0`.

---

## webSearch

Web research via Brave Search (primary) with Tavily fallback.

**File:** `src/lib/chat/tools/search-tools.ts`

### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | `string` | Yes | Specific factual query |
| `count` | `number` | No | 1-5, default 5 |

### Returns

```typescript
{ success: true, results: Array<{ title, url, snippet }>, source: 'brave' | 'tavily' }
{ success: false, error: string }
```

### Search Providers

**Brave** (`src/lib/search/brave.ts`):
- Endpoint: `https://api.search.brave.com/res/v1/web/search`
- Auth: `BRAVE_SEARCH_API_KEY` via `X-Subscription-Token`
- Timeout: 5 seconds
- Snippet max: 1,500 chars

**Tavily** (`src/lib/search/tavily.ts`):
- Endpoint: `https://api.tavily.com/search`
- Auth: `TAVILY_API_KEY` via `Authorization: Bearer`
- Search depth: `basic`
- Timeout: 5 seconds
- Snippet max: 1,500 chars

Brave is tried first. If it fails or returns 0 results, Tavily is attempted. If both fail, returns an error instructing the AI to use its own knowledge.

---

## Tool Usage in Blueprint Mode

Different pipeline steps have access to different tool subsets:

| Step | Available Tools |
|------|----------------|
| Generate | None (structured output only) |
| Components | `searchIcons`, `searchImages`, `writeFiles` |
| Assets | `writeFiles` (+ full set available but primarily uses writeFiles) |
| Pages | `writeFile`, `writeFiles`, `readFile`, `searchImages`, `searchIcons`, `webSearch`, `fetchUrl` |

---

*Last updated: February 18, 2026*
