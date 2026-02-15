import { tool } from 'ai';
import { z } from 'zod';
import { searchIcons } from '@/lib/icons/iconify';

const iconQuerySchema = z.object({
  query: z
    .string()
    .describe('Descriptive search query, 1-3 words (e.g. "shopping cart", "arrow right", "user profile", "mail")'),
  count: z.coerce
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
});

export function createIconTools() {
  return {
    searchIcons: tool({
      description:
        'Batch-search SVG icons from Lucide, Heroicons, Tabler, and Phosphor. Pass ALL icon needs in one call. Returns { success, totalIcons, results: [{ query, success, icons: [{ name, set, svg, style }] }] }. Paste the svg string directly into HTML markup. Icons use currentColor so they inherit the parent element\'s text color automatically.',
      inputSchema: z.object({
        queries: z
          .array(iconQuerySchema)
          .min(1)
          .max(12)
          .describe('Array of icon search queries. Include ALL icon needs in one call.'),
      }),
      execute: async ({ queries }) => {
        const results = queries.map(({ query, count, style }) => {
          try {
            const icons = searchIcons(query, style, count);

            if (icons.length === 0) {
              return {
                query,
                success: true as const,
                icons: [] as Array<{ name: string; set: string; svg: string; style: string }>,
                message: `No icons found for "${query}". Try a different keyword or use a simple inline SVG.`,
              };
            }

            return {
              query,
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
              query,
              success: false as const,
              icons: [] as Array<{ name: string; set: string; svg: string; style: string }>,
              error: `Icon search failed for "${query}": ${error instanceof Error ? error.message : 'Unknown error'}. Use a simple inline SVG placeholder instead.`,
            };
          }
        });

        const totalIcons = results.reduce((sum, r) => sum + r.icons.length, 0);

        return {
          success: true as const,
          totalIcons,
          results,
        };
      },
    }),
  };
}
