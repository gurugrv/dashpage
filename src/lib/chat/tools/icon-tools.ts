import { tool } from 'ai';
import { z } from 'zod';
import { jsonrepair } from 'jsonrepair';
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
    .catch(3)
    .describe('Number of icon results to return (1-5). Default 3.'),
  style: z
    .enum(['outline', 'solid'])
    .catch('outline')
    .describe('Icon style: "outline" or "solid". outline for stroke-based icons (nav, UI chrome), solid for filled icons (badges, emphasis, active states).'),
});

/**
 * Normalize malformed searchIcons input from models that produce broken JSON.
 * Handles string entries (bare query names), missing count/style fields,
 * and structurally valid but schema-incompatible objects.
 * Returns normalized input or passes through if already valid.
 */
function normalizeIconInput(val: unknown): unknown {
  if (!val || typeof val !== 'object') return val;
  const obj = val as Record<string, unknown>;
  const rawQueries = obj.queries;

  // Already a valid-looking array — let Zod handle detailed validation
  if (Array.isArray(rawQueries) && rawQueries.length > 0 &&
      rawQueries.every(q => q && typeof q === 'object' && 'query' in (q as Record<string, unknown>))) {
    return val;
  }

  // Attempt repair: handle string arrays, malformed objects, etc.
  try {
    const repaired = jsonrepair(JSON.stringify(val));
    const parsed = JSON.parse(repaired) as { queries?: unknown };
    const queries = Array.isArray(parsed?.queries) ? parsed.queries : [];
    if (queries.length === 0) return val;

    const normalized = queries
      .map((entry) => {
        if (typeof entry === 'string') {
          const query = entry.trim();
          return query ? { query, count: 3, style: 'outline' as const } : null;
        }
        if (!entry || typeof entry !== 'object') return null;
        const e = entry as Record<string, unknown>;
        const query = typeof e.query === 'string' ? e.query.trim() : '';
        if (!query) return null;
        const style = e.style === 'solid' ? 'solid' as const : 'outline' as const;
        const count = typeof e.count === 'number' && Number.isFinite(e.count)
          ? Math.min(5, Math.max(1, Math.round(e.count)))
          : typeof e.count === 'string' && Number.isFinite(Number(e.count))
            ? Math.min(5, Math.max(1, Math.round(Number(e.count))))
            : 3;
        return { query, count, style };
      })
      .filter((q): q is { query: string; count: number; style: 'outline' | 'solid' } => q !== null)
      .slice(0, 12);

    if (normalized.length > 0) return { queries: normalized };
  } catch {
    // Repair failed — return original and let Zod produce the validation error
  }
  return val;
}

export function createIconTools() {
  return {
    searchIcons: tool({
      description:
        'Batch-search SVG icons from Lucide, Heroicons, Tabler, and Phosphor. Pass ALL icon needs in one call. Returns { success, totalIcons, results: [{ query, success, icons: [{ name, set, svg, style }] }] }. Paste the svg string directly into HTML markup. Icons use currentColor so they inherit the parent element\'s text color automatically.',
      inputSchema: z.preprocess(
        normalizeIconInput,
        z.object({
          queries: z
            .array(iconQuerySchema)
            .min(1)
            .max(12)
            .describe('Array of icon search queries. Include ALL icon needs in one call.'),
        }),
      ),
      execute: async ({ queries }) => {
        const results = queries.map(({ query, count, style }) => {
          try {
            // Sanitize garbled model output (e.g. "outline旋" -> "outline")
            const cleanedStyle = String(style ?? 'outline').replace(/[^\x20-\x7E]/g, '').trim().toLowerCase();
            const safeStyle = cleanedStyle === 'solid' ? 'solid' as const : 'outline' as const;
            const icons = searchIcons(query, safeStyle, count);

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
