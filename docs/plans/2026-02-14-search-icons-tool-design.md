# searchIcons Tool — Design Document

**Date:** 2026-02-14
**Status:** Approved

## Problem

The AI model is told to use "inline SVG" and "Lucide/Heroicons-style" icons but has no actual icon data. It generates SVG paths from memory with no guarantee of quality or consistency. We need a `searchIcons` tool (like `searchImages`) that searches real icon libraries by keyword and returns production-quality inline SVG markup.

## Decision Summary

- **Data source:** Local `@iconify-json/*` packages for 4 curated icon sets
- **Search:** In-memory index built from icon names + Lucide tags + categories (lazy singleton)
- **SVG rendering:** `@iconify/utils` (getIconData + iconToSVG + iconToHTML)
- **Deployment:** Self-hosted Linux servers — long-running Node.js process, load once, serve all requests
- **Available in:** Both `/api/chat` (single-page) and `/api/blueprint/pages` (multi-page) generation paths

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/lib/icons/iconify.ts` | Service layer — loads icon sets, builds search index (lazy singleton), keyword search, SVG rendering via `@iconify/utils` |
| `src/lib/chat/tools/icon-tools.ts` | AI SDK `tool()` definition for `searchIcons` — input schema, calls service, returns results |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/chat/tools/index.ts` | Add `...createIconTools()` to `createWebsiteTools()` |
| `src/app/api/blueprint/pages/route.ts` | Add `...createIconTools()` to `blueprintTools` |
| `src/app/api/chat/route.ts` | Add `searchIcons` to `progressLabels` map |
| `src/lib/prompts/sections/tool-output-format.ts` | Document `searchIcons` tool for AI model |
| `src/lib/prompts/sections/base-rules.ts` | Rule 6: reference `searchIcons` tool instead of "use inline SVG" |
| `src/lib/prompts/sections/design-quality.ts` | Anti-patterns: reference `searchIcons` instead of "Lucide/Heroicons-style" |
| `src/lib/prompts/sections/ui-ux-guidelines.ts` | Anti-patterns: reference `searchIcons` instead of manual SVG |
| `src/lib/blueprint/prompts/page-system-prompt.ts` | Same icon guidance updates if icon text appears here |

### New Dependencies

| Package | Size | Icons | License |
|---------|------|-------|---------|
| `@iconify-json/lucide` | ~500KB | 1,400+ | ISC |
| `@iconify-json/heroicons` | ~150KB | 300+ | MIT |
| `@iconify-json/tabler` | ~900KB | 4,800+ | MIT |
| `@iconify-json/ph` | ~800KB | 7,000+ | MIT |
| `@iconify/utils` | small | — | MIT |
| `lucide-static` | ~900KB | — | ISC (only `tags.json` for search enrichment) |

## Search Index & Matching Strategy

### Tiered Search

```
Tier 1 (Lucide only): tags.json synonyms
  "home" → ["house", "living", "building", "residence"]
  "search" → ["find", "scan", "magnifier", "magnifying glass"]

Tier 2 (All sets): Icon name word matching
  "shopping-cart" → searchable as ["shopping", "cart"]
  "arrow-down-left" → ["arrow", "down", "left"]

Tier 3 (All sets): Category matching (from metadata.json where available)
  "Accessibility" → ["accessibility", "accessible-icon"]
  "Communication" → ["mail", "phone", "message-circle"]
```

### Ranking

Results scored by match quality:
1. Exact name match (query "home" → icon "home") — highest
2. Tag/synonym match (query "house" → Lucide tag hits "home") — high
3. Full word match in name (query "arrow" → "arrow-left", "arrow-right") — medium
4. Category match — lower
5. Partial/substring match — lowest

### Deduplication

When the same concept exists across sets, return one per set sorted by priority: Lucide > Heroicons > Tabler > Phosphor. Gives the AI variety without redundancy.

### Index Lifecycle

Built once via lazy singleton on first call (~50ms for ~13,500 icons). Read-only after initialization — no locks needed for concurrent access.

## Tool Interface

### Input Schema

```typescript
{
  query: string,                      // "shopping cart", "arrow", "social media" (2-5 words)
  count: number,                      // 1-5, default 3
  style: "outline" | "solid",        // AI chooses per context
}
```

### Output (Success)

```typescript
{
  success: true,
  icons: [
    {
      name: "shopping-cart",
      set: "lucide",
      svg: '<svg xmlns="..." width="24" height="24" viewBox="0 0 24 24" ...>...</svg>',
      style: "outline",
    }
  ]
}
```

### Output (No Results)

```typescript
{
  success: true,
  icons: [],
  message: "No icons found for \"xyz\". Try a different keyword."
}
```

### Output (Error)

```typescript
{
  success: false,
  error: "Icon search failed: <reason>. Use a simple inline SVG placeholder instead."
}
```

### Style Handling Per Set

- **Lucide** — All outline (stroke-based). Returned for both style values.
- **Heroicons** — Distinct outline/solid variants. Filter by requested style.
- **Tabler** — Outline by default, filled variants have `-filled` suffix. Filter accordingly.
- **Phosphor** — Map `outline` → regular, `solid` → fill.

SVGs use `currentColor` for stroke/fill — inherits parent text color. Default size 24x24, resizable via Tailwind classes.

## Caching & Performance

### In-Memory Result Cache

- **Key:** `"query|style|count"` (normalized lowercase)
- **Value:** Full tool result array
- **Max entries:** 500, LRU eviction
- **TTL:** None needed — icon data is static/deterministic
- **Shared:** Across all users/requests

### Performance Characteristics

- Icon JSON (~2.5MB) loaded once at process startup via module import
- Search index built once (~50ms) on first request, shared across all concurrent requests
- Sub-millisecond per search after initialization — pure in-memory read
- No external network calls, no I/O
- Memory: ~4-5MB total (icon data + index + cache), constant regardless of user count

## System Prompt Updates

### tool-output-format.ts

Add new section:
```
**Icon Tool:**
- **searchIcons** — Search for SVG icons from Lucide, Heroicons, Tabler, and Phosphor.
  Call BEFORE writing HTML that needs icons. Returns inline SVG markup you place directly
  in your HTML. Icons use currentColor so they inherit text color.
```

### base-rules.ts

Rule 6 changes from:
> "Use inline SVG for icons."

To:
> "For icons, use the searchIcons tool to find SVG icons. Call it BEFORE writing HTML that needs icons, then paste the returned SVG directly into your markup."

### design-quality.ts

Line 132 anti-pattern changes from:
> "Use purposeful visual elements — real photos from the searchImages tool, Lucide/Heroicons-style SVG icons"

To:
> "Use purposeful visual elements — real photos from the searchImages tool, icons from the searchIcons tool"

### ui-ux-guidelines.ts

Line 53 changes from:
> "Use emojis as UI icons (use Lucide/Heroicons SVG instead)"

To:
> "Use emojis as UI icons (use searchIcons tool instead)"

### route.ts Progress Labels

Add to `progressLabels` map:
```typescript
searchIcons: 'Searching for icons...',
```

## What Does NOT Change

- Database schema
- Client components
- API route signatures
- Existing tool behavior (searchImages, writeFiles, editFile, etc.)
