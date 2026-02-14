import { z } from 'zod';

export const designBriefSchema = z.object({
  // Design tokens (same fields as blueprintDesignSystemSchema)
  primaryColor: z.string().min(4).describe('Primary brand color (hex)'),
  secondaryColor: z.string().min(4).describe('Secondary color (hex)'),
  accentColor: z.string().min(4).describe('Accent/highlight color (hex)'),
  backgroundColor: z.string().min(4).describe('Page background color (hex)'),
  surfaceColor: z.string().min(4).describe('Card/surface background color (hex)'),
  textColor: z.string().min(4).describe('Primary text color (hex)'),
  textMutedColor: z.string().min(4).describe('Secondary/muted text color (hex)'),
  headingFont: z.string().min(1).describe('Google Font name for headings'),
  bodyFont: z.string().min(1).describe('Google Font name for body text'),
  borderRadius: z.string().min(1).describe('Border radius token (e.g., "8px", "12px", "0.5rem")'),
  mood: z.string().min(3).describe('Overall design mood (e.g., "warm and inviting", "sleek and modern")'),

  // Content direction
  tone: z.string().min(3).describe('Writing voice/tone (e.g., "professional yet approachable")'),
  primaryCTA: z.string().min(3).describe('Main call-to-action text (e.g., "Start Your Free Trial")'),
});

export type DesignBrief = z.infer<typeof designBriefSchema>;
