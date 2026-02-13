# WebSearch Tool Design

## Summary

Add a `webSearch` tool to the AI site generation pipeline so the AI can search the web for reference content, embed codes, design inspiration, and factual data during website generation. Uses Brave Search as the primary provider with Tavily as fallback.

## Motivation

The app builds websites for users. Website building is content-heavy — realistic copy, industry terms, current embed snippets, and factual data make the first generation much closer to "done." Currently the AI generates from training data alone or requires users to provide specific URLs for `fetchUrl`. A search tool bridges this gap.

## Use Cases

1. **Reference content & copy** — Real business info, industry terms, service descriptions
2. **Embed codes & integrations** — Current snippets for Google Maps, Calendly, social widgets
3. **Design inspiration** — Look up competitor/reference sites when user says "make it like X"
4. **Technical/factual data** — Current stats, pricing, specs the user references

## Constraints

- Must be fast — quick searches, not extensive research
- Server-side API keys only (no user configuration needed)
- Returns snippets, not full page content (chain with `fetchUrl` for that)

## Tool Interface

```typescript
webSearch({
  query: string,    // 2-10 word search query
  count?: number,   // 1-5 results, default 3
})
```

Returns:

```typescript
{
  success: true,
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    source: 'brave' | 'tavily';
  }>,
  source: 'brave' | 'tavily'
}
```

## Provider Strategy

1. Call Brave Search first (~200ms, 2000 free queries/mo)
2. If Brave returns 0 results or errors, fall back to Tavily (1000 free queries/mo)
3. If both fail, return graceful error suggesting the AI proceed without search

## Limits

- Timeout: 5s per provider (10s max if fallback triggers)
- Max 5 results returned
- Snippet length capped at ~200 chars each
- No full-page extraction (use `fetchUrl` for that)
- Step limit stays at 5 (typical generation uses 2-3 steps)

## File Structure

```
src/lib/search/
  brave.ts          # Brave Search API client
  tavily.ts         # Tavily Search API client
  types.ts          # Shared SearchResult type
src/lib/chat/tools/
  search-tools.ts   # webSearch tool definition
```

## Environment Variables

```
BRAVE_SEARCH_API_KEY=""
TAVILY_API_KEY=""
```

## System Prompt

Added to `tool-output-format.ts`:

```
**Search Tool:**
- **webSearch** — Quick web search for reference content, embed codes, or facts.
  Use when you need real-world information to make the website more accurate or
  realistic. Returns snippets — use fetchUrl if you need full page content from
  a result URL. Keep queries short and specific.
```

## Progress Label

```typescript
webSearch: 'Searching the web...'
```

## Files Modified

- `src/lib/chat/tools/index.ts` — Add `createSearchTools()` to composition
- `src/lib/prompts/sections/tool-output-format.ts` — Add search tool docs
- `src/app/api/chat/route.ts` — Add progress label for `webSearch`
- `.env.example` — Add `BRAVE_SEARCH_API_KEY` and `TAVILY_API_KEY`
