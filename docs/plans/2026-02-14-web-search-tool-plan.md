# WebSearch Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `webSearch` tool to the AI site generation pipeline using Brave Search (primary) with Tavily fallback.

**Architecture:** New `src/lib/search/` module with Brave and Tavily API clients behind a shared interface. A new `search-tools.ts` tool definition calls Brave first, falls back to Tavily on failure/empty results. Integrated into existing tool composition and system prompt.

**Tech Stack:** Vercel AI SDK `tool()`, Zod schemas, native `fetch` for both APIs (no SDK dependencies).

---

### Task 1: Shared Types

**Files:**
- Create: `src/lib/search/types.ts`

**Step 1: Create the shared search result type**

```typescript
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: 'brave' | 'tavily';
}

export interface SearchResponse {
  success: true;
  results: SearchResult[];
  source: 'brave' | 'tavily';
}

export interface SearchError {
  success: false;
  error: string;
}

export type SearchOutcome = SearchResponse | SearchError;
```

**Step 2: Commit**

```bash
git add src/lib/search/types.ts
git commit -m "feat(search): add shared search result types"
```

---

### Task 2: Brave Search Client

**Files:**
- Create: `src/lib/search/brave.ts`

**Step 1: Implement the Brave Search client**

```typescript
import type { SearchResult } from './types';

const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search';
const BRAVE_TIMEOUT_MS = 5_000;
const MAX_SNIPPET_LENGTH = 200;

export async function searchBrave(
  query: string,
  count: number
): Promise<SearchResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) throw new Error('BRAVE_SEARCH_API_KEY not configured');

  const url = new URL(BRAVE_API_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(count));

  const response = await fetch(url, {
    signal: AbortSignal.timeout(BRAVE_TIMEOUT_MS),
    headers: {
      'X-Subscription-Token': apiKey,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Brave Search HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json() as {
    web?: {
      results?: Array<{
        title: string;
        url: string;
        description: string;
      }>;
    };
  };

  const results = data.web?.results ?? [];

  return results.map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.description.length > MAX_SNIPPET_LENGTH
      ? r.description.slice(0, MAX_SNIPPET_LENGTH) + '...'
      : r.description,
    source: 'brave' as const,
  }));
}
```

**Step 2: Commit**

```bash
git add src/lib/search/brave.ts
git commit -m "feat(search): add Brave Search API client"
```

---

### Task 3: Tavily Search Client

**Files:**
- Create: `src/lib/search/tavily.ts`

**Step 1: Implement the Tavily Search client**

```typescript
import type { SearchResult } from './types';

const TAVILY_API_URL = 'https://api.tavily.com/search';
const TAVILY_TIMEOUT_MS = 5_000;
const MAX_SNIPPET_LENGTH = 200;

export async function searchTavily(
  query: string,
  count: number
): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY not configured');

  const response = await fetch(TAVILY_API_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(TAVILY_TIMEOUT_MS),
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      max_results: count,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily Search HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json() as {
    results?: Array<{
      title: string;
      url: string;
      content: string;
    }>;
  };

  const results = data.results ?? [];

  return results.map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content.length > MAX_SNIPPET_LENGTH
      ? r.content.slice(0, MAX_SNIPPET_LENGTH) + '...'
      : r.content,
    source: 'tavily' as const,
  }));
}
```

**Step 2: Commit**

```bash
git add src/lib/search/tavily.ts
git commit -m "feat(search): add Tavily Search API client"
```

---

### Task 4: Search Tool Definition

**Files:**
- Create: `src/lib/chat/tools/search-tools.ts`

**Step 1: Implement the webSearch tool with Brave-primary, Tavily-fallback**

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { searchBrave } from '@/lib/search/brave';
import { searchTavily } from '@/lib/search/tavily';
import type { SearchOutcome } from '@/lib/search/types';

export function createSearchTools() {
  return {
    webSearch: tool({
      description:
        'Quick web search for reference content, embed codes, design inspiration, or factual data. Returns snippets — use fetchUrl if you need full page content from a result URL. Keep queries short and specific (2-10 words).',
      inputSchema: z.object({
        query: z
          .string()
          .describe('Short, specific search query (2-10 words). E.g. "bakery website menu examples", "google maps embed code 2025", "modern law firm homepage design"'),
        count: z
          .number()
          .int()
          .min(1)
          .max(5)
          .default(3)
          .describe('Number of results to return (1-5). Default 3.'),
      }),
      execute: async ({ query, count }): Promise<SearchOutcome> => {
        // Try Brave first
        try {
          const results = await searchBrave(query, count);
          if (results.length > 0) {
            return { success: true, results, source: 'brave' };
          }
        } catch {
          // Fall through to Tavily
        }

        // Fallback to Tavily
        try {
          const results = await searchTavily(query, count);
          if (results.length > 0) {
            return { success: true, results, source: 'tavily' };
          }
        } catch {
          // Both failed
        }

        return {
          success: false,
          error: 'Web search returned no results. Proceed using your own knowledge instead.',
        };
      },
    }),
  };
}
```

**Step 2: Commit**

```bash
git add src/lib/chat/tools/search-tools.ts
git commit -m "feat(search): add webSearch tool with Brave/Tavily fallback"
```

---

### Task 5: Wire Into Tool Composition

**Files:**
- Modify: `src/lib/chat/tools/index.ts`

**Step 1: Add createSearchTools to the tool composition**

Add import at top:
```typescript
import { createSearchTools } from './search-tools';
```

Add to the return object in `createWebsiteTools()`:
```typescript
...createSearchTools(),
```

The full function becomes:
```typescript
export function createWebsiteTools(currentFiles: ProjectFiles): ToolSet {
  const workingFiles: ProjectFiles = { ...currentFiles };

  return {
    ...createFileTools(workingFiles),
    ...createImageTools(),
    ...createIconTools(),
    ...createColorTools(),
    ...createWebTools(),
    ...createSearchTools(),
    ...createValidationTools(workingFiles),
  };
}
```

**Step 2: Commit**

```bash
git add src/lib/chat/tools/index.ts
git commit -m "feat(search): wire webSearch into tool composition"
```

---

### Task 6: Add Progress Label

**Files:**
- Modify: `src/app/api/chat/route.ts`

**Step 1: Add webSearch to the progressLabels object**

Find the `progressLabels` Record (~line 122-131) and add:

```typescript
webSearch: 'Searching the web...',
```

**Step 2: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat(search): add webSearch progress label"
```

---

### Task 7: Update System Prompt

**Files:**
- Modify: `src/lib/prompts/sections/tool-output-format.ts`

**Step 1: Add Search Tool section to TOOL_OUTPUT_FORMAT_SECTION**

After the existing `**Web Tool:**` section and before `**Validation Tool:**`, add:

```
**Search Tool:**
- **webSearch** — Quick web search for reference content, embed codes, design inspiration, or factual data. Use when the user's request involves real-world information you're not confident about (business types, current embed snippets, industry-specific terms, factual claims). Returns snippets — if you need full page content from a result URL, chain with fetchUrl. Keep queries short and specific (2-10 words).
```

Also add to the Rules section:
```
- For web search: only call webSearch when you genuinely need external information. Do not search for things you already know well (basic HTML, CSS, common design patterns).
```

**Step 2: Commit**

```bash
git add src/lib/prompts/sections/tool-output-format.ts
git commit -m "feat(search): add webSearch to system prompt tool docs"
```

---

### Task 8: Update Environment Config

**Files:**
- Modify: `.env.example`

**Step 1: Add search API key placeholders**

After the `# === Image API ===` section, add:

```bash
# === Search API (optional - enables webSearch tool) ===
BRAVE_SEARCH_API_KEY=""      # Brave Search API key (https://api-dashboard.search.brave.com/)
TAVILY_API_KEY=""             # Tavily Search API key - fallback (https://tavily.com/)
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "feat(search): add search API keys to .env.example"
```

---

### Task 9: Verify Build

**Step 1: Run the build**

```bash
npm run build
```

Expected: Clean build, no type errors.

**Step 2: Run lint**

```bash
npm run lint
```

Expected: No lint errors.

**Step 3: Manual smoke test**

1. Add `BRAVE_SEARCH_API_KEY` and `TAVILY_API_KEY` to `.env.local`
2. Run `npm run dev`
3. Create a new conversation and prompt: "Build a website for a craft coffee shop in Portland"
4. Verify: AI calls `webSearch` and uses results in the generated content
5. Verify: Progress indicator shows "Searching the web..."

---

### Task 10: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the tools list in Architecture section**

In the Source Layout or relevant section, ensure `webSearch` is documented alongside the other tools. Specifically update:
- The tool list description to include `webSearch`
- Add `src/lib/search/` to the source layout

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add webSearch tool to CLAUDE.md"
```
