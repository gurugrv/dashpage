import type { SearchResult } from './types';

const TAVILY_API_URL = 'https://api.tavily.com/search';
const TAVILY_TIMEOUT_MS = 5_000;
const MAX_SNIPPET_LENGTH = 500;

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
