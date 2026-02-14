import { tool } from 'ai';
import { z } from 'zod';
import { selectPalettes } from '@/lib/colors/select-palette';

export function createColorTools() {
  return {
    selectColorPalette: tool({
      description:
        'Select harmonious color palettes from a curated collection based on mood and industry. Returns up to 3 matching palettes with semantic role mappings (primary, secondary, accent, background, surface, text, textMuted). Pick one and use the hex values directly in your :root CSS custom properties.',
      inputSchema: z.object({
        mood: z
          .array(z.string())
          .describe(
            '1-3 mood tags: warm, cool, earthy, pastel, bold, muted, elegant, playful, minimal, vibrant, dark, luxury',
          ),
        industry: z
          .string()
          .optional()
          .describe(
            'Industry: restaurant, saas, healthcare, fintech, ecommerce, creative, legal, education, beauty, nature, corporate, portfolio',
          ),
        scheme: z
          .enum(['light', 'dark'])
          .default('light')
          .describe('Color scheme. light: light backgrounds + dark text. dark: dark backgrounds + light text.'),
      }),
      execute: async ({ mood, industry, scheme }) => {
        const tags = [...mood];
        if (industry) tags.push(industry);

        const palettes = selectPalettes(tags, scheme, 3);

        if (palettes.length === 0) {
          return {
            success: false as const,
            error: 'No matching palettes found. Pick colors manually using your design system.',
          };
        }

        return {
          success: true as const,
          palettes: palettes.map(p => ({
            name: p.name,
            roles: p.roles,
            scheme: p.scheme,
          })),
        };
      },
    }),
  };
}
