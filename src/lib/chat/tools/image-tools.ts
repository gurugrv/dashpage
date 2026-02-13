import { tool } from 'ai';
import { z } from 'zod';
import { searchPhotos } from '@/lib/images/pexels';

export function createImageTools() {
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
          const photos = await searchPhotos(query, {
            orientation,
            perPage: count,
          });

          if (photos.length === 0) {
            return {
              success: true as const,
              images: [],
              message: `No images found for "${query}". Use a placeholder or try a different query.`,
            };
          }

          return {
            success: true as const,
            images: photos.map((photo) => ({
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
