import { tool } from 'ai';
import { z } from 'zod';
import { searchBrave } from '@/lib/search/brave';
import { searchTavily } from '@/lib/search/tavily';
import type { SearchOutcome } from '@/lib/search/types';

export function createSearchTools() {
  return {
    webSearch: tool({
      description:
        'Web search for real-world information. ALWAYS use when the prompt involves a real business, location, industry, or topic — real data makes websites dramatically better. Returns { success, results: [{ title, url, snippet }] }. Chain with fetchUrl if snippets need more detail. Keep queries short and specific (2-10 words).',
      inputSchema: z.object({
        query: z
          .string()
          .describe('Short, specific search query (2-10 words). E.g. "bakery website menu examples", "google maps embed code 2025", "modern law firm homepage design"'),
        count: z.coerce
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
