# searchIcons Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `searchIcons` AI tool that searches curated icon libraries by keyword and returns inline SVG markup for the AI model to use during website generation.

**Architecture:** Local `@iconify-json/*` packages loaded once into memory, searched via an in-memory keyword index (lazy singleton), SVG rendered via `@iconify/utils`. Mirrors the existing `searchImages`/Pexels pattern.

**Tech Stack:** `@iconify-json/lucide`, `@iconify-json/heroicons`, `@iconify-json/tabler`, `@iconify-json/ph`, `@iconify/utils`, `lucide-static` (tags.json only), Vercel AI SDK `tool()`, Zod

**Design doc:** `docs/plans/2026-02-14-search-icons-tool-design.md`

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install all icon packages**

Run:
```bash
npm install @iconify-json/lucide @iconify-json/heroicons @iconify-json/tabler @iconify-json/ph @iconify/utils lucide-static
```

**Step 2: Verify installation**

Run:
```bash
node -e "const l = require('@iconify-json/lucide'); console.log('lucide icons:', Object.keys(l.icons.icons).length)"
node -e "const h = require('@iconify-json/heroicons'); console.log('heroicons icons:', Object.keys(h.icons.icons).length)"
node -e "const t = require('@iconify-json/tabler'); console.log('tabler icons:', Object.keys(t.icons.icons).length)"
node -e "const p = require('@iconify-json/ph'); console.log('phosphor icons:', Object.keys(p.icons.icons).length)"
node -e "const tags = require('lucide-static/tags.json'); console.log('lucide tags:', Object.keys(tags).length)"
```

Expected: Each prints a count > 0 confirming packages are accessible.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add iconify icon packages for searchIcons tool"
```

---

### Task 2: Create Icon Service Layer

**Files:**
- Create: `src/lib/icons/iconify.ts`

**Step 1: Implement the service module**

This file handles: loading icon sets, building the search index, keyword search, and SVG rendering.

```typescript
import { getIconData, iconToSVG, iconToHTML, replaceIDs } from '@iconify/utils';
import type { IconifyJSON, IconifyIcon } from '@iconify/types';

// --- Icon set loading (module-level, loaded once per process) ---

import { icons as lucideIcons } from '@iconify-json/lucide';
import { icons as heroiconsIcons } from '@iconify-json/heroicons';
import { icons as tablerIcons } from '@iconify-json/tabler';
import { icons as phIcons } from '@iconify-json/ph';

// Lucide tags for enriched keyword search
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lucideTags: Record<string, string[]> = require('lucide-static/tags.json');

type IconStyle = 'outline' | 'solid';

interface IconSetConfig {
  data: IconifyJSON;
  priority: number; // lower = higher priority in results
  /** Determine the style of an icon by its name within this set */
  getStyle: (iconName: string) => IconStyle;
  /** Map a requested style to the icon name variant, or null if not available */
  resolveVariant: (iconName: string, style: IconStyle) => string | null;
}

const ICON_SETS: Record<string, IconSetConfig> = {
  lucide: {
    data: lucideIcons,
    priority: 1,
    // Lucide is all outline/stroke-based
    getStyle: () => 'outline',
    resolveVariant: (name) => name, // always available
  },
  heroicons: {
    data: heroiconsIcons,
    priority: 2,
    getStyle: (name) => (name.endsWith('-solid') || name.startsWith('solid-') ? 'solid' : 'outline'),
    resolveVariant: (name, style) => {
      // Heroicons in Iconify use suffixed naming for variants
      const baseName = name.replace(/-solid$/, '').replace(/-20-solid$/, '');
      if (style === 'solid') {
        // Check if a solid variant exists
        const solidName = `${baseName}-solid`;
        if (getIconData(heroiconsIcons, solidName)) return solidName;
        const solid20 = `${baseName}-20-solid`;
        if (getIconData(heroiconsIcons, solid20)) return solid20;
        return null;
      }
      // Outline: try base name
      if (getIconData(heroiconsIcons, baseName)) return baseName;
      return name;
    },
  },
  tabler: {
    data: tablerIcons,
    priority: 3,
    getStyle: (name) => (name.endsWith('-filled') ? 'solid' : 'outline'),
    resolveVariant: (name, style) => {
      const baseName = name.replace(/-filled$/, '');
      if (style === 'solid') {
        const filledName = `${baseName}-filled`;
        if (getIconData(tablerIcons, filledName)) return filledName;
        return null;
      }
      if (getIconData(tablerIcons, baseName)) return baseName;
      return name;
    },
  },
  ph: {
    data: phIcons,
    priority: 4,
    getStyle: (name) => {
      if (name.endsWith('-fill') || name.endsWith('-bold')) return 'solid';
      return 'outline';
    },
    resolveVariant: (name, style) => {
      // Phosphor: strip known suffixes to get base
      const baseName = name
        .replace(/-fill$/, '')
        .replace(/-bold$/, '')
        .replace(/-thin$/, '')
        .replace(/-light$/, '')
        .replace(/-duotone$/, '');
      if (style === 'solid') {
        const fillName = `${baseName}-fill`;
        if (getIconData(phIcons, fillName)) return fillName;
        return null;
      }
      // Outline: try base name (regular weight)
      if (getIconData(phIcons, baseName)) return baseName;
      return name;
    },
  },
};

// --- Search index (lazy singleton) ---

interface IndexEntry {
  setName: string;
  iconName: string;
  /** All searchable terms: name words + tags + categories */
  terms: string[];
}

let searchIndex: IndexEntry[] | null = null;
/** Inverted index: term -> array of indices into searchIndex */
let termIndex: Map<string, number[]> | null = null;

function buildSearchIndex(): void {
  const entries: IndexEntry[] = [];
  const invertedIndex = new Map<string, number[]>();

  function addTerm(term: string, entryIdx: number) {
    const lower = term.toLowerCase();
    if (!invertedIndex.has(lower)) {
      invertedIndex.set(lower, []);
    }
    invertedIndex.get(lower)!.push(entryIdx);
  }

  for (const [setName, config] of Object.entries(ICON_SETS)) {
    const iconNames = Object.keys(config.data.icons);

    // Also include aliases
    const aliasNames = config.data.aliases ? Object.keys(config.data.aliases) : [];
    const allNames = [...iconNames, ...aliasNames];

    for (const iconName of allNames) {
      const terms: string[] = [];

      // Name words (split kebab-case)
      const nameWords = iconName.split('-').filter((w) => w.length > 0);
      terms.push(...nameWords);
      // Full name as a term too
      terms.push(iconName);

      // Lucide tags (synonym enrichment)
      if (setName === 'lucide' && lucideTags[iconName]) {
        for (const tag of lucideTags[iconName]) {
          // Tags can be multi-word like "magnifying glass"
          terms.push(...tag.toLowerCase().split(/\s+/));
          if (tag.includes(' ')) terms.push(tag.toLowerCase());
        }
      }

      const entryIdx = entries.length;
      entries.push({ setName, iconName, terms });

      // Index each unique term
      const uniqueTerms = new Set(terms.map((t) => t.toLowerCase()));
      for (const term of uniqueTerms) {
        addTerm(term, entryIdx);
      }
    }
  }

  // Also build category-based terms if metadata is available
  // Categories are broad — we index them as lower-priority terms
  for (const [setName, config] of Object.entries(ICON_SETS)) {
    try {
      // metadata.json may include categories: { "Category": ["icon1", "icon2"] }
      // @iconify-json packages may or may not include this
      // We'll try to access it but gracefully skip if unavailable
      const metadataPath = `@iconify-json/${setName === 'ph' ? 'ph' : setName}/metadata.json`;
      // Dynamic require for optional metadata
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const metadata = require(metadataPath) as { categories?: Record<string, string[]> };
      if (metadata.categories) {
        for (const [category, icons] of Object.entries(metadata.categories)) {
          const categoryTerms = category.toLowerCase().split(/[\s/&]+/);
          for (const iconName of icons) {
            const idx = entries.findIndex((e) => e.setName === setName && e.iconName === iconName);
            if (idx >= 0) {
              for (const ct of categoryTerms) {
                entries[idx].terms.push(ct);
                addTerm(ct, idx);
              }
            }
          }
        }
      }
    } catch {
      // metadata.json not available for this set — skip silently
    }
  }

  searchIndex = entries;
  termIndex = invertedIndex;
}

function ensureIndex() {
  if (!searchIndex || !termIndex) {
    buildSearchIndex();
  }
}

// --- Search ---

interface SearchResult {
  setName: string;
  iconName: string;
  score: number;
}

function searchIconIndex(query: string, style: IconStyle, count: number): SearchResult[] {
  ensureIndex();

  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (queryWords.length === 0) return [];

  // Score each entry
  const scores = new Map<number, number>();

  for (const word of queryWords) {
    // Exact term match in inverted index
    const exactMatches = termIndex!.get(word);
    if (exactMatches) {
      for (const idx of exactMatches) {
        const entry = searchIndex![idx];
        const currentScore = scores.get(idx) ?? 0;

        // Exact icon name match: highest score
        if (entry.iconName === word) {
          scores.set(idx, currentScore + 100);
        }
        // Lucide tag match: high score
        else if (entry.setName === 'lucide' && lucideTags[entry.iconName]?.some((t) => t.toLowerCase() === word)) {
          scores.set(idx, currentScore + 60);
        }
        // Full word in name: medium score
        else if (entry.iconName.split('-').includes(word)) {
          scores.set(idx, currentScore + 40);
        }
        // Category or other term match: lower
        else {
          scores.set(idx, currentScore + 20);
        }
      }
    }

    // Partial/prefix match for terms not in the inverted index
    for (let idx = 0; idx < searchIndex!.length; idx++) {
      if (scores.has(idx)) continue; // already scored via exact match
      const entry = searchIndex![idx];
      const hasPartialMatch = entry.terms.some(
        (t) => t.startsWith(word) || word.startsWith(t),
      );
      if (hasPartialMatch) {
        scores.set(idx, (scores.get(idx) ?? 0) + 10);
      }
    }
  }

  // Convert to results, filter by style, apply set priority
  const results: SearchResult[] = [];

  for (const [idx, score] of scores) {
    const entry = searchIndex![idx];
    const config = ICON_SETS[entry.setName];

    // Check if this icon has the requested style variant
    const variantName = config.resolveVariant(entry.iconName, style);
    if (!variantName) continue;

    // Adjust score by set priority (lower priority number = small bonus)
    const priorityBonus = (5 - config.priority) * 2;

    results.push({
      setName: entry.setName,
      iconName: variantName,
      score: score + priorityBonus,
    });
  }

  // Sort by score descending, then by set priority
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return ICON_SETS[a.setName].priority - ICON_SETS[b.setName].priority;
  });

  // Deduplicate: keep best result per concept per set
  // (avoid returning "home" from all 4 sets)
  const seen = new Set<string>();
  const deduped: SearchResult[] = [];
  for (const r of results) {
    // Normalize name for dedup (strip variant suffixes)
    const baseName = r.iconName
      .replace(/-solid$/, '')
      .replace(/-filled$/, '')
      .replace(/-fill$/, '')
      .replace(/-bold$/, '')
      .replace(/-20-solid$/, '');
    const key = `${r.setName}:${baseName}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }

  return deduped.slice(0, count);
}

// --- SVG Rendering ---

function renderIconSVG(setName: string, iconName: string): string | null {
  const config = ICON_SETS[setName];
  if (!config) return null;

  const iconData: IconifyIcon | null = getIconData(config.data, iconName);
  if (!iconData) return null;

  const renderData = iconToSVG(iconData, { height: 24 });
  const body = replaceIDs(renderData.body);
  return iconToHTML(body, renderData.attributes);
}

// --- Result cache (LRU) ---

interface CacheEntry {
  results: IconResult[];
}

const MAX_CACHE_ENTRIES = 500;
const cache = new Map<string, CacheEntry>();

function evictLRU() {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  // Map iteration order is insertion order — delete oldest
  const firstKey = cache.keys().next().value;
  if (firstKey !== undefined) cache.delete(firstKey);
}

function buildCacheKey(query: string, style: IconStyle, count: number): string {
  return `${query.toLowerCase().trim()}|${style}|${count}`;
}

// --- Public API ---

export interface IconResult {
  name: string;
  set: string;
  svg: string;
  style: IconStyle;
}

export function searchIcons(
  query: string,
  style: IconStyle = 'outline',
  count: number = 3,
): IconResult[] {
  const cacheKey = buildCacheKey(query, style, count);
  const cached = cache.get(cacheKey);
  if (cached) {
    // Move to end for LRU (delete + re-insert)
    cache.delete(cacheKey);
    cache.set(cacheKey, cached);
    return cached.results;
  }

  const searchResults = searchIconIndex(query, style, count);
  const results: IconResult[] = [];

  for (const r of searchResults) {
    const svg = renderIconSVG(r.setName, r.iconName);
    if (svg) {
      results.push({
        name: r.iconName,
        set: r.setName,
        svg,
        style,
      });
    }
  }

  cache.set(cacheKey, { results });
  evictLRU();

  return results;
}
```

**Step 2: Verify the module compiles**

Run:
```bash
npx tsc --noEmit src/lib/icons/iconify.ts
```

If there are type issues with the require() calls or iconify types, fix them. The `@iconify/types` package should come as a dependency of `@iconify/utils`, but if not:

```bash
npm install @iconify/types
```

**Step 3: Quick smoke test**

Run:
```bash
node -e "
  // Quick test that the module works
  process.env.NODE_OPTIONS = '--experimental-specifier-resolution=node';
"
```

Note: Full verification will happen after wiring the tool, via the dev server.

**Step 4: Commit**

```bash
git add src/lib/icons/iconify.ts
git commit -m "feat: add icon search service layer with in-memory index"
```

---

### Task 3: Create Icon Tool Definition

**Files:**
- Create: `src/lib/chat/tools/icon-tools.ts`

**Step 1: Implement the tool**

Follow the exact same pattern as `src/lib/chat/tools/image-tools.ts`:

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { searchIcons } from '@/lib/icons/iconify';

export function createIconTools() {
  return {
    searchIcons: tool({
      description:
        'Search for SVG icons from Lucide, Heroicons, Tabler, and Phosphor icon libraries. Returns inline SVG markup you can use directly in HTML. Call this BEFORE writing HTML that needs icons — pick the best result for each placement. Icons use currentColor for stroke/fill so they inherit the parent text color.',
      inputSchema: z.object({
        query: z
          .string()
          .describe('Descriptive search query, 1-3 words (e.g. "shopping cart", "arrow right", "user profile", "mail")'),
        count: z
          .number()
          .int()
          .min(1)
          .max(5)
          .default(3)
          .describe('Number of icon results to return (1-5). Default 3.'),
        style: z
          .enum(['outline', 'solid'])
          .default('outline')
          .describe('Icon style. outline for stroke-based icons (nav, UI chrome), solid for filled icons (badges, emphasis, active states).'),
      }),
      execute: async ({ query, count, style }) => {
        try {
          const icons = searchIcons(query, style, count);

          if (icons.length === 0) {
            return {
              success: true as const,
              icons: [],
              message: `No icons found for "${query}". Try a different keyword or use a simple inline SVG.`,
            };
          }

          return {
            success: true as const,
            icons: icons.map((icon) => ({
              name: icon.name,
              set: icon.set,
              svg: icon.svg,
              style: icon.style,
            })),
          };
        } catch (error) {
          return {
            success: false as const,
            error: `Icon search failed: ${error instanceof Error ? error.message : 'Unknown error'}. Use a simple inline SVG placeholder instead.`,
          };
        }
      },
    }),
  };
}
```

**Step 2: Commit**

```bash
git add src/lib/chat/tools/icon-tools.ts
git commit -m "feat: add searchIcons AI tool definition"
```

---

### Task 4: Wire Icon Tools Into Both Generation Paths

**Files:**
- Modify: `src/lib/chat/tools/index.ts` (line 7, line 14)
- Modify: `src/app/api/blueprint/pages/route.ts` (line 8, line 148)
- Modify: `src/app/api/chat/route.ts` (line 128)

**Step 1: Update tools/index.ts**

Add import at top (after line 4):
```typescript
import { createIconTools } from './icon-tools';
```

Add to the return object (after line 14):
```typescript
    ...createIconTools(),
```

**Step 2: Update blueprint pages route**

In `src/app/api/blueprint/pages/route.ts`, add import (after line 8):
```typescript
import { createIconTools } from '@/lib/chat/tools/icon-tools';
```

Update `blueprintTools` (line 147-150) to include icon tools:
```typescript
      const blueprintTools = {
        ...createImageTools(),
        ...createWebTools(),
        ...createIconTools(),
      };
```

**Step 3: Update chat route progress labels**

In `src/app/api/chat/route.ts`, add to the `progressLabels` map (after line 128):
```typescript
                  searchIcons: 'Searching for icons...',
```

**Step 4: Verify dev server starts**

Run:
```bash
npm run dev
```

Expected: Server starts without errors. Check terminal for any import resolution or type errors.

**Step 5: Commit**

```bash
git add src/lib/chat/tools/index.ts src/app/api/blueprint/pages/route.ts src/app/api/chat/route.ts
git commit -m "feat: wire searchIcons tool into chat and blueprint generation paths"
```

---

### Task 5: Update System Prompts

**Files:**
- Modify: `src/lib/prompts/sections/tool-output-format.ts` (line 9-10)
- Modify: `src/lib/prompts/sections/base-rules.ts` (line 10)
- Modify: `src/lib/prompts/sections/design-quality.ts` (line 132)
- Modify: `src/lib/prompts/sections/ui-ux-guidelines.ts` (line 53)
- Modify: `src/lib/blueprint/prompts/page-system-prompt.ts` (line 160)

**Step 1: Update tool-output-format.ts**

After the `**Image Tool:**` section (line 10), add:

```
**Icon Tool:**
- **searchIcons** — Search for SVG icons from Lucide, Heroicons, Tabler, and Phosphor. Call BEFORE writing HTML that needs icons. Returns inline SVG markup you place directly in your HTML. Icons use currentColor so they inherit text color. Specify style: outline for UI chrome, solid for emphasis.
```

**Step 2: Update base-rules.ts**

Change line 10 from:
```
6. For images, use the searchImages tool to find real photos from Pexels. Call it BEFORE writing HTML that needs images, then use the returned URLs directly in <img> tags. Use inline SVG for icons.
```
To:
```
6. For images, use the searchImages tool to find real photos from Pexels. Call it BEFORE writing HTML that needs images, then use the returned URLs directly in <img> tags. For icons, use the searchIcons tool to find SVG icons. Call it BEFORE writing HTML that needs icons, then paste the returned SVG directly into your markup.
```

**Step 3: Update design-quality.ts**

Change line 132 from:
```
-> INSTEAD: Use purposeful visual elements — real photos from the searchImages tool, Lucide/Heroicons-style SVG icons, meaningful illustrations.
```
To:
```
-> INSTEAD: Use purposeful visual elements — real photos from the searchImages tool, icons from the searchIcons tool, meaningful illustrations.
```

**Step 4: Update ui-ux-guidelines.ts**

Change line 53 from:
```
- Use emojis as UI icons (use Lucide/Heroicons SVG instead)
```
To:
```
- Use emojis as UI icons (use the searchIcons tool instead)
```

**Step 5: Update page-system-prompt.ts**

Change line 160 from:
```
7. For images, use the searchImages tool to find real photos from Pexels. Call it BEFORE writing HTML that needs images, then use the returned URLs directly in <img> tags. Use descriptive 2-5 word queries. Use DIFFERENT queries per image. Inline SVGs for icons.
```
To:
```
7. For images, use the searchImages tool to find real photos from Pexels. Call it BEFORE writing HTML that needs images, then use the returned URLs directly in <img> tags. Use descriptive 2-5 word queries. Use DIFFERENT queries per image. For icons, use the searchIcons tool.
```

**Step 6: Commit**

```bash
git add src/lib/prompts/sections/tool-output-format.ts src/lib/prompts/sections/base-rules.ts src/lib/prompts/sections/design-quality.ts src/lib/prompts/sections/ui-ux-guidelines.ts src/lib/blueprint/prompts/page-system-prompt.ts
git commit -m "feat: update system prompts to reference searchIcons tool"
```

---

### Task 6: End-to-End Verification

**Files:** None (manual testing)

**Step 1: Start dev server**

Run:
```bash
npm run dev
```

**Step 2: Test single-page generation**

Open `http://localhost:3000`. Create a new conversation and prompt:
> "Build a restaurant landing page with a menu section"

Verify in the terminal debug output:
- The AI model calls `searchIcons` before/during HTML generation
- Tool calls appear in the stream (look for `tool-input-start` with `searchIcons`)
- The generated HTML contains inline `<svg>` elements (not emojis or placeholder icons)
- Icons render correctly in the preview iframe

**Step 3: Test blueprint generation (if available)**

If blueprint generation is accessible, test a multi-page site and verify icon tool calls appear during page generation.

**Step 4: Test edge cases**

Prompt for a page that needs many different icons:
> "Build a SaaS dashboard with sidebar navigation, stats cards, and a settings page"

Verify:
- Multiple `searchIcons` calls with different queries
- Icons are varied (not all the same)
- Outline vs solid styles appear appropriately

**Step 5: Verify build succeeds**

Run:
```bash
npm run build
```

Expected: Build completes without errors.

**Step 6: Commit any fixes**

If any issues were found and fixed during testing:
```bash
git add -A
git commit -m "fix: address issues found during searchIcons e2e testing"
```
