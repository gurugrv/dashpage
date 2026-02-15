import { tool } from 'ai';
import { z } from 'zod';
import { searchPhotos } from '@/lib/images/pexels';

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

export function createImageTools() {
  const usedQueries: string[] = [];
  const usedPhotoIds = new Set<number>();

  return {
    searchImages: tool({
      description:
        'Search for stock photos from Pexels. Returns { success, images: [{ url, alt, photographer, width, height }] }. Use url in src, alt in alt attribute. Use DIFFERENT queries per image for variety. Call once per distinct image subject — batch all image searches before writing HTML.',
      inputSchema: z.object({
        query: z
          .string()
          .describe('Descriptive search query, 2-5 words (e.g. "modern office workspace", "fresh pasta dish", "woman professional headshot")'),
        count: z
          .number()
          .int()
          .min(1)
          .max(5)
          .default(3)
          .describe('Number of image results to return (1-5). Default 3.'),
        orientation: z
          .enum(['landscape', 'portrait', 'square'])
          .optional()
          .describe('Image orientation. landscape for heroes/banners, portrait for people/tall cards, square for avatars/thumbnails.'),
      }),
      execute: async ({ query, count, orientation }) => {
        try {
          // Reject queries too similar to previous ones in this session
          const normalized = query.toLowerCase().trim();
          for (const prev of usedQueries) {
            if (jaccardSimilarity(normalized, prev) >= SIMILARITY_THRESHOLD) {
              return {
                success: false as const,
                error: `Query "${query}" is too similar to previous search "${prev}". Use a distinctly different subject or angle.`,
              };
            }
          }

          // Request extra results to compensate for cross-query dedup
          const requestCount = Math.min(count + usedPhotoIds.size, 15);
          const photos = await searchPhotos(query, {
            orientation,
            perPage: requestCount,
          });

          // Filter out photos already returned in this session
          const fresh = photos.filter((p) => !usedPhotoIds.has(p.id));
          const selected = fresh.slice(0, count);

          // Track query and photo IDs for future dedup
          usedQueries.push(normalized);
          for (const photo of selected) {
            usedPhotoIds.add(photo.id);
          }

          if (selected.length === 0) {
            return {
              success: true as const,
              images: [],
              message: `No images found for "${query}". Use a placeholder or try a different query.`,
            };
          }

          return {
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
            success: false as const,
            error: `Image search failed: ${error instanceof Error ? error.message : 'Unknown error'}. Use placeholder images instead.`,
          };
        }
      },
    }),
  };
}
