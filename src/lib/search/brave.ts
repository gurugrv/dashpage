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
