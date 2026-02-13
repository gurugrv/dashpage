import { z } from 'zod';

export const blueprintPageSectionSchema = z.object({
  id: z.string().describe('Unique section identifier (e.g., "hero", "features", "pricing")'),
  name: z.string().describe('Human-readable section name'),
  description: z.string().describe('What this section should contain and accomplish'),
  contentNotes: z.string().optional().describe('Specific content guidance or copy direction'),
});

export const blueprintPageSchema = z.object({
  filename: z.string().describe('HTML filename (e.g., "index.html", "about.html")'),
  title: z.string().describe('Page title for <title> tag and SEO'),
  description: z.string().describe('Meta description for SEO'),
  purpose: z.string().describe('The role this page plays in the site'),
  sections: z.array(blueprintPageSectionSchema).describe('Ordered list of page sections'),
});

export const blueprintDesignSystemSchema = z.object({
  primaryColor: z.string().describe('Primary brand color (hex)'),
  secondaryColor: z.string().describe('Secondary color (hex)'),
  accentColor: z.string().describe('Accent/highlight color (hex)'),
  backgroundColor: z.string().describe('Page background color (hex)'),
  surfaceColor: z.string().describe('Card/surface background color (hex)'),
  textColor: z.string().describe('Primary text color (hex)'),
  textMutedColor: z.string().describe('Secondary/muted text color (hex)'),
  headingFont: z.string().describe('Google Font name for headings'),
  bodyFont: z.string().describe('Google Font name for body text'),
  borderRadius: z.string().describe('Border radius token (e.g., "8px", "12px", "0.5rem")'),
  mood: z.string().describe('Overall design mood (e.g., "warm and inviting", "sleek and modern")'),
});

export const blueprintContentStrategySchema = z.object({
  tone: z.string().describe('Writing tone (e.g., "professional yet approachable")'),
  targetAudience: z.string().describe('Who the site is for'),
  primaryCTA: z.string().describe('Main call-to-action text and goal'),
  brandVoice: z.string().describe('Brand personality in 2-3 words'),
});

export const blueprintNavLinkSchema = z.object({
  label: z.string().describe('Display text for the link'),
  href: z.string().describe('Relative filename (e.g., "about.html")'),
});

export const blueprintSharedComponentsSchema = z.object({
  navLinks: z.array(blueprintNavLinkSchema).describe('Navigation links for header and footer'),
  footerTagline: z.string().describe('Short tagline or description for the footer'),
});

export const blueprintSchema = z.object({
  siteName: z.string().describe('Name of the website'),
  siteDescription: z.string().describe('One-sentence site description'),
  pages: z.array(blueprintPageSchema).describe('Ordered list of all pages to generate'),
  designSystem: blueprintDesignSystemSchema,
  sharedComponents: blueprintSharedComponentsSchema,
  contentStrategy: blueprintContentStrategySchema,
});

export type BlueprintPageSection = z.infer<typeof blueprintPageSectionSchema>;
export type BlueprintPage = z.infer<typeof blueprintPageSchema>;
export type BlueprintDesignSystem = z.infer<typeof blueprintDesignSystemSchema>;
export type BlueprintContentStrategy = z.infer<typeof blueprintContentStrategySchema>;
export type BlueprintSharedComponents = z.infer<typeof blueprintSharedComponentsSchema>;
export type Blueprint = z.infer<typeof blueprintSchema>;
