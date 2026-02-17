import { tool } from 'ai';
import { z } from 'zod';
import { searchPhotos } from '@/lib/images/pexels';
import { generateImages } from '@/lib/images/together';
import { resolveApiKey } from '@/lib/keys/key-manager';

function wordSet(query: string): Set<string> {
  return new Set(query.toLowerCase().trim().split(/\s+/).filter(Boolean));
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = wordSet(a);
  const setB = wordSet(b);
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

const SIMILARITY_THRESHOLD = 0.6;

const imageQuerySchema = z.object({
  query: z
    .string()
    .describe('Descriptive search query, 2-5 words (e.g. "modern office workspace", "fresh pasta dish")'),
  count: z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .catch(2)
    .describe('Number of results for this query (1-5). Default 2.'),
  orientation: z
    .enum(['landscape', 'portrait', 'square'])
    .optional()
    .describe('landscape for heroes/banners, portrait for people/cards, square for avatars/thumbnails.'),
});

interface ImageToolOptions {
  imageProvider?: 'pexels' | 'together';
  imageModel?: string;
}

function orientationToDimensions(orientation?: 'landscape' | 'portrait' | 'square'): { width: number; height: number } {
  switch (orientation) {
    case 'landscape': return { width: 1024, height: 768 };
    case 'portrait': return { width: 768, height: 1024 };
    case 'square':
    default: return { width: 1024, height: 1024 };
  }
}

export function createImageTools(options?: ImageToolOptions) {
  const provider = options?.imageProvider ?? 'pexels';
  const model = options?.imageModel ?? 'black-forest-labs/FLUX.1-dev';

  const usedQueries: string[] = [];
  const usedPhotoIds = new Set<number>();

  function isTooSimilar(query: string): string | null {
    const normalized = query.toLowerCase().trim();
    for (const prev of usedQueries) {
      if (jaccardSimilarity(normalized, prev) >= SIMILARITY_THRESHOLD) return prev;
    }
    return null;
  }

  // ── Pexels fetch (existing) ──────────────────────────────────────────
  async function fetchFromPexels(
    query: string,
    count: number,
    orientation?: 'landscape' | 'portrait' | 'square',
  ) {
    const similar = isTooSimilar(query);
    if (similar) {
      return {
        query,
        success: false as const,
        error: `Too similar to previous search "${similar}". Use a different subject.`,
      };
    }

    try {
      const requestCount = Math.min(count + usedPhotoIds.size, 15);
      const photos = await searchPhotos(query, { orientation, perPage: requestCount });
      const fresh = photos.filter((p) => !usedPhotoIds.has(p.id));
      const selected = fresh.slice(0, count);

      const normalized = query.toLowerCase().trim();
      usedQueries.push(normalized);
      for (const photo of selected) usedPhotoIds.add(photo.id);

      return {
        query,
        success: true as const,
        images: selected.map((photo) => ({
          url: photo.src.large2x,
          alt: photo.alt || query,
          photographer: photo.photographer,
          width: photo.width,
          height: photo.height,
        })),
      };
    } catch (error) {
      return {
        query,
        success: false as const,
        error: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}. Use placeholder.`,
      };
    }
  }

  // ── Together.ai generation ──────────────────────────────────────────
  async function fetchFromTogether(
    query: string,
    count: number,
    orientation?: 'landscape' | 'portrait' | 'square',
  ) {
    const similar = isTooSimilar(query);
    if (similar) {
      return {
        query,
        success: false as const,
        error: `Too similar to previous search "${similar}". Use a different subject.`,
      };
    }

    try {
      const apiKey = await resolveApiKey('Together');
      if (!apiKey) {
        return {
          query,
          success: false as const,
          error: 'Together.ai API key not configured. Use placeholder images.',
        };
      }

      const { width, height } = orientationToDimensions(orientation);

      // Generate `count` images with slightly varied prompts for variety
      const prompts = Array.from({ length: count }, (_, i) => ({
        prompt: count > 1 ? `${query}, variation ${i + 1}` : query,
        width,
        height,
      }));

      const images = await generateImages(apiKey, prompts, model);

      const normalized = query.toLowerCase().trim();
      usedQueries.push(normalized);

      return {
        query,
        success: true as const,
        images: images.map((img) => ({
          url: img.url,
          alt: img.alt,
          width: img.width,
          height: img.height,
        })),
      };
    } catch (error) {
      return {
        query,
        success: false as const,
        error: `Image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}. Use placeholder.`,
      };
    }
  }

  const fetchForQuery = provider === 'together' ? fetchFromTogether : fetchFromPexels;
  const description = provider === 'together'
    ? 'Generate AI images for the website. Pass ALL image needs in one call. Returns { results: [{ query, success, images }] } — one entry per query. Use DIFFERENT queries per image for variety. Call ONCE with all queries before writing HTML.'
    : 'Batch-search stock photos from Pexels. Pass ALL image needs in one call. Returns { results: [{ query, success, images }] } — one entry per query. Use DIFFERENT queries per image for variety. Call ONCE with all queries before writing HTML.';

  return {
    searchImages: tool({
      description,
      inputSchema: z.object({
        queries: z
          .array(imageQuerySchema)
          .min(1)
          .max(12)
          .describe('Array of image searches to run in parallel. Each has query, count, and optional orientation.'),
      }),
      execute: async ({ queries }) => {
        const results = await Promise.all(
          queries.map((q) => fetchForQuery(q.query, q.count, q.orientation)),
        );

        const totalImages = results.reduce(
          (sum, r) => sum + (r.success && r.images ? r.images.length : 0),
          0,
        );

        return {
          success: true as const,
          totalImages,
          results,
        };
      },
    }),
  };
}
