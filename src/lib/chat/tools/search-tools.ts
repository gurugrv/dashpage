import { tool } from 'ai';
import { z } from 'zod';
import { searchBrave } from '@/lib/search/brave';
import { searchTavily } from '@/lib/search/tavily';
import type { SearchOutcome } from '@/lib/search/types';

export function createSearchTools() {
  return {
    webSearch: tool({
      description:
        'Search for specific real-world information: business/person/place details, addresses, phone numbers, hours, real services/menus, embed codes, or content from a specific URL. Do NOT use for generic design inspiration, layout ideas, or "examples of X websites" — use your own knowledge for those. Returns { success, results: [{ title, url, snippet }] }. Chain with fetchUrl if snippets need more detail.',
      inputSchema: z.object({
        query: z
          .string()
          .describe('Specific factual query. GOOD: "Sunrise Bakery Portland hours menu", "dentists downtown Chicago", "Google Maps embed API", "yoga studios Austin TX". BAD: "bakery website examples", "modern law firm homepage design", "restaurant website layout ideas".'),
        count: z.coerce
          .number()
          .int()
          .min(1)
          .max(5)
          .catch(5)
          .describe('Number of results to return (1-5). Default 5.'),
      }),
      execute: async ({ query, count }): Promise<SearchOutcome> => {
        // Try Brave first
        try {
          const results = await searchBrave(query, count);
          if (results.length > 0) {
            return { success: true, results, source: 'brave' };
          }
        } catch (err) {
          console.warn('[webSearch] Brave search failed:', err instanceof Error ? err.message : err);
        }

        // Fallback to Tavily
        try {
          const results = await searchTavily(query, count);
          if (results.length > 0) {
            return { success: true, results, source: 'tavily' };
          }
        } catch (err) {
          console.warn('[webSearch] Tavily search failed:', err instanceof Error ? err.message : err);
        }

        return {
          success: false,
          error: 'Web search returned no results. Proceed using your own knowledge instead.',
        };
      },
    }),
  };
}
