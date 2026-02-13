import { tool } from 'ai';
import { z } from 'zod';
import { generatePalette } from '@/lib/colors/palette';

export function createColorTools() {
  return {
    generateColorPalette: tool({
      description:
        'Generate a harmonious color palette from a base color. Returns { success, primary, secondary, accent, bg, surface, text, textMuted, contrastChecks }. Use the returned hex values directly in your :root CSS custom properties. If any contrastCheck shows FAIL, adjust baseColor slightly and re-call.',
      inputSchema: z.object({
        baseColor: z
          .string()
          .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a valid hex color (e.g. "#1e40af")')
          .describe('Base brand color as hex (e.g. "#1e40af", "#e63946"). This becomes the primary color.'),
        harmony: z
          .enum(['complementary', 'analogous', 'triadic', 'split-complementary', 'tetradic'])
          .describe(
            'Color harmony method. complementary (bold contrast), analogous (subtle, cohesive), triadic (vibrant, balanced), split-complementary (nuanced contrast), tetradic (rich, complex).',
          ),
        scheme: z
          .enum(['light', 'dark'])
          .default('light')
          .describe('Color scheme. light: light backgrounds + dark text. dark: dark backgrounds + light text.'),
      }),
      execute: async ({ baseColor, harmony, scheme }) => {
        try {
          const result = generatePalette(baseColor, harmony, scheme);
          return {
            success: true as const,
            ...result,
          };
        } catch (error) {
          return {
            success: false as const,
            error: `Color palette generation failed: ${error instanceof Error ? error.message : 'Unknown error'}. Pick colors manually using your design system.`,
          };
        }
      },
    }),
  };
}
