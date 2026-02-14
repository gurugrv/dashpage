import { tool } from 'ai';
import { z } from 'zod';
import { searchIcons } from '@/lib/icons/iconify';

export function createIconTools() {
  return {
    searchIcons: tool({
      description:
        'Search for SVG icons from Lucide, Heroicons, Tabler, and Phosphor. Returns { success, icons: [{ name, set, svg, style }] }. Paste the svg string directly into HTML markup. Icons use currentColor so they inherit the parent element\'s text color automatically.',
      inputSchema: z.object({
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
